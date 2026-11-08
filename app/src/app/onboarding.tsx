import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { SunMark } from '@/components/cs/sun-mark';
import { Button, Card, Chips, Label, LinkText, Muted, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { SkinType } from '@/model';
import { CITIES, locate } from '@/services/location';
import { ensurePermission } from '@/services/notifications';
import { useStore } from '@/state/store';

const SKIN_QUESTIONS: { value: SkinType | 0; label: string }[] = [
  { value: 1, label: 'Always burns, never tans' },
  { value: 2, label: 'Burns easily, tans minimally' },
  { value: 3, label: 'Sometimes burns, tans gradually' },
  { value: 4, label: 'Rarely burns, tans well' },
  { value: 5, label: 'Very rarely burns, tans deeply' },
  { value: 6, label: 'Never burns' },
  { value: 0, label: 'Not sure' },
];

export default function Onboarding() {
  const c = useTheme();
  const setProfile = useStore((s) => s.setProfile);
  const setPlace = useStore((s) => s.setPlace);
  const place = useStore((s) => s.place);
  const [step, setStep] = useState(0);
  const [skin, setSkin] = useState<SkinType | 0 | null>(null);
  const [spf, setSpf] = useState(30);
  const [msg, setMsg] = useState<string | null>(null);

  const finish = async (notifications: boolean) => {
    setProfile({ skinType: skin === 0 || skin === null ? 2 : skin, spf, notifications, onboarded: true });
    if (notifications) await ensurePermission();
    router.replace('/');
  };

  return (
    <Screen tabbed={false}>
      <View style={{ gap: 6, marginTop: 24 }}>
        <SunMark />
        <Label>Welcome to Cloudscreen</Label>
        <ThemedText type="title">Make room for the outdoors.</ThemedText>
        <Muted>Tracks the UV that actually reaches your skin: clouds, shade, posture and sunscreen wearing off. Then learns your skin.</Muted>
      </View>

      {step === 0 ? (
        <Card>
          <Label>Step 1 of 4: your skin</Label>
          <ThemedText type="smallBold">How does your skin react to sun?</ThemedText>
          {SKIN_QUESTIONS.map((q) => (
            <Pressable
              key={q.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: skin === q.value }}
              onPress={() => setSkin(q.value)}
              style={{
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: skin === q.value ? c.tint : c.border,
                backgroundColor: skin === q.value ? c.backgroundSelected : c.backgroundElement,
              }}>
              <ThemedText>{q.label}</ThemedText>
            </Pressable>
          ))}
          <Muted>This is only a starting point. Each morning after time outside, a 2-second check-in (“any redness?”) tunes your personal threshold.</Muted>
          <Button title="Next" disabled={skin === null} onPress={() => setStep(1)} />
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <Label>Step 2 of 4: sunscreen</Label>
          <ThemedText type="smallBold">What do you usually wear?</ThemedText>
          <Chips options={[15, 30, 50, 70, 100].map((v) => ({ value: v, label: `SPF ${v}` }))} value={spf} onChange={setSpf} />
          <Muted>You can change amount, filter type and water resistance later in Profile.</Muted>
          <Button title="Next" onPress={() => setStep(2)} />
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <Label>Step 3 of 4: location</Label>
          <ThemedText type="smallBold">Where are you?</ThemedText>
          <Muted>Used only to fetch the UV forecast. Rounded to about 1 km. Stays on your device otherwise.</Muted>
          <Button
            title={place ? `Location: ${place.name}` : 'Use my location'}
            onPress={async () => {
              setMsg('Locating…');
              const r = await locate();
              if (r.ok) {
                setPlace(r.place);
                setMsg(null);
              } else setMsg(r.reason === 'denied' ? 'Permission denied. Pick a city below.' : 'Location unavailable. Pick a city below.');
            }}
          />
          {msg ? <Muted>{msg}</Muted> : null}
          <Muted>Or pick a city</Muted>
          <Chips options={CITIES.map((x, i) => ({ value: i, label: x.name }))} value={place ? CITIES.findIndex((x) => x.name === place.name) : null} onChange={(i) => setPlace(CITIES[i])} />
          <Button title="Next" disabled={!place} onPress={() => setStep(3)} />
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <Label>Step 4 of 4: alerts</Label>
          <Muted>Get notified at 50%, 80% and 100% of your estimated burn threshold, when it’s time to reapply, and for the morning check-in.</Muted>
          <Button title="Turn on alerts" onPress={() => finish(true)} />
          <Button kind="secondary" title="Not now" onPress={() => finish(false)} />
        </Card>
      ) : null}

      <View style={{ alignItems: 'center' }}>
        <LinkText onPress={() => router.push('/demo')}>Just looking? Try the demo ›</LinkText>
      </View>

      <Muted style={{ textAlign: 'center' }}>Cloudscreen gives estimates for sun-safety education. It isn’t a medical device and can’t diagnose sunburn or skin damage.</Muted>
    </Screen>
  );
}

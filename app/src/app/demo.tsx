/**
 * Demo modal. Not in the demo: an intro to Mackenzie and what to try. In the demo:
 * controls (jump to a moment, sky, restart, exit).
 */
import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';

import { Button, Card, Chips, Label, Muted, Row, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { DEMO_MOMENTS, DEMO_PERSONA, DEMO_START, type DemoMoment } from '@/demo/mackenzie';
import type { CloudLayers } from '@/model';
import { useStore } from '@/state/store';

const CLOUD_LEVELS = [0, 0.25, 0.5, 0.75, 1].map((v) => ({ value: v, label: `${v * 100}%` }));
const MOMENT_OPTIONS = (Object.keys(DEMO_MOMENTS) as DemoMoment[]).map((k) => ({ value: k, label: DEMO_MOMENTS[k].short }));
const LAYERS: { key: keyof CloudLayers; label: string }[] = [
  { key: 'low', label: 'Low cloud' },
  { key: 'mid', label: 'Mid cloud' },
  { key: 'high', label: 'High cloud' },
];

/** Close every modal (this one, and onboarding if we came from there) and show Home. */
function goHome() {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}

export default function Demo() {
  const demo = useStore((s) => s.demo);
  const clouds = useStore((s) => s.profile.demoClouds);
  const enterDemo = useStore((s) => s.enterDemo);
  const jumpDemo = useStore((s) => s.jumpDemo);
  const exitDemo = useStore((s) => s.exitDemo);
  const setProfile = useStore((s) => s.setProfile);

  if (!demo) {
    const start = DEMO_MOMENTS[DEMO_START];
    return (
      <Screen tabbed={false}>
        <ThemedText type="subtitle">You’re entering a demo</ThemedText>
        <Card tone="sky">
          <Label>{DEMO_PERSONA.name}</Label>
          <ThemedText type="small">
            {DEMO_PERSONA.role} · skin type II · SPF 50
          </ThemedText>
          <ThemedText type="small">
            {start.place.name.replace(' (demo)', '')} · Sat 14 Aug 2027 · 5:15 pm
          </ThemedText>
          <Muted>{DEMO_PERSONA.blurb}</Muted>
        </Card>
        <Card>
          <Label>Try</Label>
          <Muted>• Forecast: why the evening is the low-UV window</Muted>
          <Muted>• Track: start the hike, then switch from trees to the open summit</Muted>
          <Muted>• History: two weeks of trends, and how the app learned her skin</Muted>
          <Muted>• Tap the coral strip at the top any time to jump to 12:30 on the dock</Muted>
        </Card>
        <Muted>A made-up person and history, computed by the real model, fully offline. Your own data is set aside, untouched, and comes back when you exit.</Muted>
        <Row style={{ gap: 12 }}>
          <Button
            kind="sun"
            title="Start demo"
            style={{ flex: 1 }}
            onPress={() => {
              enterDemo();
              goHome();
            }}
          />
          <Button kind="secondary" title="Cancel" style={{ flex: 1 }} onPress={() => router.back()} />
        </Row>
      </Screen>
    );
  }

  const confirmExit = () => {
    const go = () => {
      exitDemo();
      goHome();
    };
    const msg = `${DEMO_PERSONA.name.split(' ')[0]}’s data is cleared and yours comes back exactly as it was.`;
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Leave the demo? ${msg}`) ?? true) go();
    } else Alert.alert('Leave the demo?', msg, [{ text: 'Stay', style: 'cancel' }, { text: 'Exit demo', onPress: go }]);
  };

  return (
    <Screen tabbed={false}>
      <ThemedText type="subtitle">Demo controls</ThemedText>
      <Card>
        <Label>Jump to</Label>
        <Chips options={MOMENT_OPTIONS} value={demo.moment} onChange={(m) => jumpDemo(m)} />
        <Muted>{DEMO_MOMENTS[demo.moment].label}. The clock runs from there, so a session you start builds up dose as you show it. Jumping rebuilds her day from scratch.</Muted>
      </Card>
      <Card>
        <Label>Sky</Label>
        {LAYERS.map((l) => (
          <Row key={l.key} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <Muted>{l.label}</Muted>
            <Chips options={CLOUD_LEVELS} value={clouds[l.key]} onChange={(v) => setProfile({ demoClouds: { ...clouds, [l.key]: v } })} />
          </Row>
        ))}
        <Muted>Clouds apply from now on; her history keeps the sky it had.</Muted>
      </Card>
      <Row style={{ gap: 12 }}>
        <Button kind="secondary" title="Restart demo" style={{ flex: 1 }} onPress={() => jumpDemo(DEMO_START)} />
        <Button kind="danger" title="Exit demo" style={{ flex: 1 }} onPress={confirmExit} />
      </Row>
    </Screen>
  );
}

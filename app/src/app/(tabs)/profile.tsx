import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Switch } from 'react-native';

import { Button, Card, Chips, Disclaimer, Label, LinkText, Muted, Row, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { calibrate, MODEL_VERSION } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { CMF_FIT_INFO, DNA_DAMAGE_WARNING_TYPES, MED_SED, PRESETS, type FilterType, type Preset, type SkinType } from '@/model';
import { CITIES, locate } from '@/services/location';
import { ensurePermission } from '@/services/notifications';
import { DEMO_PERSONA } from '@/demo/mackenzie';
import { useStore } from '@/state/store';

const SKIN_OPTIONS: { value: SkinType; label: string; hint: string }[] = [
  { value: 1, label: 'I', hint: 'Always burns, never tans' },
  { value: 2, label: 'II', hint: 'Burns easily, tans minimally' },
  { value: 3, label: 'III', hint: 'Sometimes burns, tans gradually' },
  { value: 4, label: 'IV', hint: 'Rarely burns, tans well' },
  { value: 5, label: 'V', hint: 'Very rarely burns, tans deeply' },
  { value: 6, label: 'VI', hint: 'Never burns' },
];
const SPFS = [15, 30, 50, 70, 100].map((v) => ({ value: v, label: `SPF ${v}` }));
const AMOUNTS = [
  { value: 0.5, label: 'Light' },
  { value: 1, label: 'Typical' },
  { value: 2, label: 'Generous (lab amount)' },
];
const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'photostable', label: 'Mineral / photostable' },
  { value: 'chemical', label: 'Chemical (avobenzone/octinoxate)' },
];
const REMINDERS = [60, 80, 120, 180].map((m) => ({ value: m, label: m < 120 ? `${m} min` : `${m / 60} h` }));
const PRESET_OPTIONS = (Object.keys(PRESETS) as Preset[]).map((k) => ({ value: k, label: PRESETS[k].label }));

export default function Profile() {
  const c = useTheme();
  const s = useStore();
  const p = s.profile;
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [showCities, setShowCities] = useState(false);
  const skin = SKIN_OPTIONS[p.skinType - 1];
  const resetAt = p.calibrationResetAt ?? 0;
  const answered = s.checkIns.filter((x) => x.answeredAt && x.answeredAt > resetAt).sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0));
  const post = calibrate(p.skinType, s.checkIns, resetAt);
  const sed = (x: number) => (x < 10 ? x.toFixed(1) : x.toFixed(0));

  const useGps = async () => {
    setLocMsg('Locating…');
    const r = await locate();
    if (r.ok) {
      s.setPlace(r.place);
      setLocMsg(null);
    } else setLocMsg(r.reason === 'denied' ? 'Location permission denied. Pick a city instead.' : 'Location unavailable. Pick a city instead.');
  };

  const confirmDeleteAll = () => {
    const go = () => {
      s.deleteAll();
      router.replace('/onboarding');
    };
    if (Platform.OS === 'web') go();
    else Alert.alert('Delete all data?', 'Sessions, sunscreen logs and calibration on this device will be erased.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };

  return (
    <Screen>
      <ThemedText type="subtitle">Profile</ThemedText>

      <Card>
        <Label>Skin type</Label>
        <Chips options={SKIN_OPTIONS} value={p.skinType} onChange={(skinType) => s.setProfile({ skinType })} />
        <Muted>
          {skin.hint}. Starting threshold {MED_SED[p.skinType]} SED.
        </Muted>
        {DNA_DAMAGE_WARNING_TYPES.includes(p.skinType) ? <Muted>Even darker skin gets UV DNA damage before any visible burn. No redness doesn’t mean no damage.</Muted> : null}
      </Card>

      <Card tone="tint">
        <Label>Personal calibration</Label>
        <ThemedText>
          Your burn dose: about {sed(post.median)} SED, likely {sed(post.q10)}–{sed(post.q90)} SED.
        </ThemedText>
        <Muted>
          {answered.length === 0
            ? `Starting from skin type ${skin.label} (typical ${MED_SED[p.skinType]} SED). People of the same type differ a lot, so the range is wide and alerts come early. Each morning check-in narrows it.`
            : `Learned from ${answered.length} morning check-in${answered.length === 1 ? '' : 's'}, starting from skin type ${skin.label}. Until the range is narrow, the time-to-burn range and alerts lean early.`}
        </Muted>
        {answered.slice(0, 5).map((x) => (
          <Muted key={x.day}>
            {x.day}: {x.redness}
            {x.medAfter ? ` → about ${sed(x.medAfter.median)} SED (${sed(x.medAfter.q10)}–${sed(x.medAfter.q90)})` : `, calibration ${x.cUserBefore.toFixed(2)} → ${x.cUserAfter?.toFixed(2)}`}
          </Muted>
        ))}
        <Button kind="secondary" title="Reset calibration" onPress={s.resetCalibration} />
      </Card>

      <Card>
        <Label>Location</Label>
        <ThemedText>{s.place ? s.place.name : 'Not set'}</ThemedText>
        {locMsg ? <Muted>{locMsg}</Muted> : null}
        <Row>
          <Button title="Use my location" onPress={useGps} style={{ flex: 1 }} />
          <Button kind="secondary" title="Pick a city" onPress={() => setShowCities((v) => !v)} style={{ flex: 1 }} />
        </Row>
        {showCities ? (
          <Chips
            options={CITIES.map((x, i) => ({ value: i, label: x.name }))}
            value={null}
            onChange={(i) => {
              s.setPlace(CITIES[i]);
              setShowCities(false);
            }}
          />
        ) : null}
        <Muted>Coordinates are rounded to about 1 km and sent only to Open-Meteo to get the forecast.</Muted>
      </Card>

      <Card>
        <Label>Sunscreen defaults</Label>
        <Chips options={SPFS} value={p.spf} onChange={(spf) => s.setProfile({ spf })} />
        <Muted>Amount usually applied</Muted>
        <Chips options={AMOUNTS} value={p.mgPerCm2} onChange={(mgPerCm2) => s.setProfile({ mgPerCm2 })} />
        <Muted>Most people apply about half the lab amount, so “Typical” is the honest default.</Muted>
        <Muted>Filter type</Muted>
        <Chips options={FILTERS} value={p.filter} onChange={(filter) => s.setProfile({ filter })} />
        <Row style={{ justifyContent: 'space-between' }}>
          <ThemedText>Water resistant</ThemedText>
          <Switch value={p.waterResistant} onValueChange={(waterResistant) => s.setProfile({ waterResistant })} />
        </Row>
        <Muted>Reapply reminder after</Muted>
        <Chips options={REMINDERS} value={p.reminderMin} onChange={(reminderMin) => s.setProfile({ reminderMin })} />
      </Card>

      <Card>
        <Label>Default activity</Label>
        <Chips options={PRESET_OPTIONS} value={p.preset} onChange={(preset) => s.setProfile({ preset })} />
      </Card>

      <Card>
        <Label>Notifications</Label>
        <Row style={{ justifyContent: 'space-between' }}>
          <ThemedText>Burn-progress, sunscreen and check-in alerts</ThemedText>
          <Switch
            value={p.notifications}
            onValueChange={async (on) => {
              s.setProfile({ notifications: on });
              if (on) await ensurePermission();
            }}
          />
        </Row>
      </Card>

      <Card tone="sun">
        <Label>UV source</Label>
        <Chips
          options={[
            { value: 'forecast', label: 'Forecast (default)' },
            { value: 'physics', label: 'Our physics model' },
          ]}
          value={p.uvMode === 'demo' ? null : p.uvMode}
          onChange={(uvMode) => s.setProfile({ uvMode })}
        />
        <Muted>Forecast uses Open-Meteo’s cloud-adjusted UV. Physics uses our clear-sky model × our fitted cloud factor (reads low near sunrise and sunset).</Muted>
        {p.uvMode === 'demo' ? <Muted>In demo mode the UV comes from offline physics with the demo sky (Demo controls).</Muted> : null}
      </Card>

      <Card tone="sun">
        <Label>{s.demo ? 'You’re in the demo' : 'Try the demo'}</Label>
        <ThemedText type="smallBold">{DEMO_PERSONA.name}</ThemedText>
        <ThemedText type="small">An evening in the Adirondacks</ThemedText>
        <Muted>
          {s.demo
            ? 'Everything on these screens is her made-up data. Your own data is set aside and comes back when you exit.'
            : 'A made-up person with two weeks of history, so every screen has something to show. Your own data is set aside and comes back when you exit.'}
        </Muted>
        <Button kind="sun" title={s.demo ? 'Demo controls' : '☀ Enter demo'} onPress={() => router.push('/demo')} />
      </Card>

      <Card>
        <Label>How Cloudscreen estimates</Label>
        <Muted>
          UV index (Open-Meteo, or Allaart/TEMIS clear-sky × a 3-layer cloud factor fitted on {CMF_FIT_INFO.points.toLocaleString()} hours in {CMF_FIT_INFO.cities} cities) → × body-site
          geometry and ground reflection → ÷ sunscreen that wears off and breaks down → summed into SED → compared with your skin-type threshold × personal calibration.
        </Muted>
        <Muted>Assumptions: sunscreen wear rate, the effect of applying less than the lab amount, shade strengths, and skin-type thresholds are approximate. Shade, clothing and hats beyond the shade setting aren’t modeled.</Muted>
        <Muted>Model: {MODEL_VERSION}</Muted>
        <LinkText onPress={() => router.push('/why')}>See the breakdown for right now ›</LinkText>
      </Card>

      <Card>
        <Label>Privacy</Label>
        <Muted>Everything stays on this device. No account, no analytics, no ads.</Muted>
        <Button kind="danger" title="Delete all data" onPress={confirmDeleteAll} />
      </Card>
      <Disclaimer />
      <Muted style={{ textAlign: 'center', color: c.textSecondary }}>Cloudscreen, made at HackRPI 2026</Muted>
    </Screen>
  );
}

import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Select, DateSelect } from '@/components/cs/select';
import { Button, Card, Label, Muted, Row, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { PRESETS, SHADES, SURFACES, type Posture, type Shade, type Surface } from '@/model';
import { nowFor, useStore } from '@/state/store';
import { fmtTime } from '@/utils/format';

const INTENSITY = [
  { value: 1, label: '1 · Resting / no sweat' },
  { value: 2, label: '2 · Light movement / no sweat' },
  { value: 3, label: '3 · Moderate / some sweat' },
  { value: 4, label: '4 · Vigorous / sweaty' },
  { value: 5, label: '5 · Very intense / heavy sweat' },
];
const midnight = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export default function AddSession() {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const add = useStore((s) => s.addPastSession);
  const now = nowFor(profile);
  const today = midnight(now);
  const yesterdayDate = new Date(today); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const [date, setDate] = useState(today);
  const [startMinute, setStartMinute] = useState<number | null>(null);
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const initial = PRESETS[profile.preset];
  const [intensity, setIntensity] = useState(initial.activity === 'sweating' ? 3 : 1);
  const [water, setWater] = useState<'no' | 'yes'>(initial.activity === 'swimming' ? 'yes' : 'no');
  const [posture, setPosture] = useState<Posture>(initial.posture);
  const [surface, setSurface] = useState<Surface>(initial.surface);
  const [shade, setShade] = useState<Shade>('none');
  const [sunscreen, setSunscreen] = useState<'none' | 'start'>('none');
  const [error, setError] = useState<string | null>(null);
  const duration = hours * 60 + minutes;
  const startDate = new Date(date);
  if (startMinute !== null) startDate.setHours(Math.floor(startMinute / 60), startMinute % 60, 0, 0);
  const start = startMinute === null ? null : startDate.getTime();
  const end = start === null ? null : start + duration * 60_000;
  const starts = Array.from({ length: 96 }, (_, i) => {
    const d = new Date(date); d.setHours(Math.floor(i / 4), (i % 4) * 15, 0, 0);
    return { value: i * 15, label: fmtTime(d.getTime()), time: d.getTime() };
  }).filter((o) => o.time < now);
  const validation = duration === 0 ? 'Choose a duration greater than zero.' : start !== null && end !== null && end > now ? 'This session ends in the future. Choose an earlier start or a shorter duration.' : null;

  return <Screen tabbed={false}>
    <Row style={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1, gap: 8 }}><ThemedText type="subtitle">A moment outside.</ThemedText></View>
      <Svg width={100} height={84} viewBox="0 0 120 100" aria-hidden>
        <Circle cx={85} cy={30} r={23} fill={c.sun} />
        <Path d="M20 76 C0 76 0 46 23 44 C20 14 66 8 74 39 C105 28 122 74 92 76 Z" fill={c.tint} stroke={c.text} strokeWidth={1.5} />
        <Path d="M25 86 H80 M38 94 H68" stroke={c.coral} strokeWidth={3} />
      </Svg>
    </Row>
    <Card>
      <DateSelect value={date} min={yesterdayDate.getTime()} max={today} onChange={(v) => { setDate(v); setStartMinute(null); setError(null); }} />
      <Select label="Started at" value={startMinute} options={starts} onChange={setStartMinute} />
      <Muted>Start times are in 15-minute steps, in your device’s local time.</Muted>
      <Label>For how long?</Label>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><Select label="Hours" value={hours} options={Array.from({ length: 25 }, (_, value) => ({ value, label: `${value} h` }))} onChange={setHours} /></View>
        <View style={{ flex: 1 }}><Select label="Minutes" value={minutes} options={Array.from({ length: 60 }, (_, value) => ({ value, label: `${value} min` }))} onChange={setMinutes} /></View>
      </Row>
      {start !== null && end !== null ? <Muted>{new Date(start).toLocaleDateString()} · {fmtTime(start)} → {new Date(end).toLocaleDateString()} · {fmtTime(end)}</Muted> : null}
      {validation ? <ThemedText type="small" style={{ color: c.danger }}>{validation}</ThemedText> : null}
    </Card>
    <Card>
      <Label>Tell us about the exposure</Label>
      <Select label="Activity intensity" value={intensity} options={INTENSITY} onChange={setIntensity} />
      <Muted>1 = resting with no sweat. 5 = very intense activity with heavy sweating. Choose the description closest to your outing; heat can cause sweat even with little movement.</Muted>
      <Select label="Were you swimming or underwater?" value={water} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes · swimming or underwater' }]} onChange={setWater} />
      <Muted>The estimate uses dry for levels 1–2, sweating for 3–5, or swimming if you choose Yes. It does not calculate reduced UV at underwater depths.</Muted>
      <Select label="Body position" value={posture} options={[{ value: 'upright', label: 'Upright · standing / sitting / moving' }, { value: 'lying', label: 'Lying down' }, { value: 'shoulders', label: 'Mostly top-facing skin' }]} onChange={setPosture} />
      <Select label="Surrounding surface" value={surface} options={(Object.keys(SURFACES) as Surface[]).map((value) => ({ value, label: SURFACES[value].label }))} onChange={setSurface} />
      <Select label="Shade" value={shade} options={(Object.keys(SHADES) as Shade[]).map((value) => ({ value, label: SHADES[value].label }))} onChange={setShade} />
      <Select label="Sunscreen" value={sunscreen} options={[{ value: 'none', label: 'None' }, { value: 'start', label: `SPF ${profile.spf} at the start` }]} onChange={setSunscreen} />
    </Card>
    {error ? <ThemedText accessibilityRole="alert" style={{ color: c.danger }}>{error}</ThemedText> : null}
    <Button title="Add session" disabled={start === null || !!validation} onPress={() => {
      if (start === null || end === null || validation) return;
      const result = add({ start, end, preset: profile.preset, shade, sunscreenAt: sunscreen === 'start' ? start : null, settings: { posture, surface, shade, activity: water === 'yes' ? 'swimming' : intensity >= 3 ? 'sweating' : 'dry' } });
      if (result.ok) router.back(); else setError(result.reason);
    }} />
    <Muted>Calculated from the available forecast or UV estimate for those hours and labelled “added later · estimated”.</Muted>
  </Screen>;
}

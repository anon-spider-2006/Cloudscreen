import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { ActivityPicker } from '@/components/cs/activity-picker';
import { useSunColor } from '@/components/cs/sun-color';
import { Select, DateSelect } from '@/components/cs/select';
import { Button, Card, Label, Muted, Row, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { presetMatching } from '@/engine';
import type { ExposureSettings } from '@/model';
import { nowFor, settingsFor, useStore } from '@/state/store';
import { fmtTime } from '@/utils/format';

const midnight = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export default function AddSession() {
  const c = useTheme();
  const sunColor = useSunColor();
  const profile = useStore((s) => s.profile);
  const add = useStore((s) => s.addPastSession);
  const now = nowFor(profile);
  const today = midnight(now);
  const yesterdayDate = new Date(today); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const [date, setDate] = useState(today);
  const [startMinute, setStartMinute] = useState<number | null>(null);
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  // same picker and starting point as Track: whatever you last chose
  const storeShade = useStore((s) => s.shade);
  const custom = useStore((s) => s.custom);
  const [activity, setActivity] = useState<ExposureSettings>(() => settingsFor({ profile, shade: storeShade, custom }));
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
        <Circle cx={85} cy={30} r={23} fill={sunColor} />
        <Path d="M20 76 C0 76 0 46 23 44 C20 14 66 8 74 39 C105 28 122 74 92 76 Z" fill={c.skyIcon} stroke={c.text} strokeOpacity={0.35} strokeWidth={1.25} strokeLinejoin="round" />
        <Path d="M25 86 H80 M38 94 H68" stroke={c.coral} strokeOpacity={0.8} strokeWidth={2.5} strokeLinecap="round" />
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
      {start !== null && end !== null ? (
        <Muted>
          {new Date(start).toDateString() === new Date(end).toDateString()
            ? `${fmtTime(start)} to ${fmtTime(end)}`
            : `${fmtTime(start)} to ${fmtTime(end)} the next day`}
        </Muted>
      ) : null}
      {validation ? <ThemedText type="small" style={{ color: c.danger }}>{validation}</ThemedText> : null}
    </Card>
    <Card>
      <ActivityPicker title="What were you doing?" value={activity} onChange={setActivity} preferPreset={profile.preset} />
    </Card>
    <Card>
      <Select label="Sunscreen" value={sunscreen} options={[{ value: 'none', label: 'None' }, { value: 'start', label: `SPF ${profile.spf} at the start` }]} onChange={setSunscreen} />
    </Card>
    {error ? <ThemedText accessibilityRole="alert" style={{ color: c.danger }}>{error}</ThemedText> : null}
    <Button title="Add session" disabled={start === null || !!validation} onPress={() => {
      if (start === null || end === null || validation) return;
      const shade = activity.shade ?? 'none';
      // label it with the matching preset (or keep the default name; History shows "Custom: …" when settings differ)
      const preset = presetMatching(activity, profile.preset) ?? profile.preset;
      const result = add({ start, end, preset, shade, sunscreenAt: sunscreen === 'start' ? start : null, settings: { ...activity, shade } });
      if (result.ok) router.back(); else setError(result.reason);
    }} />
    <Muted>Calculated from the available forecast or UV estimate for those hours and labelled “added later”.</Muted>
  </Screen>;
}

import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { Button, Card, Chips, Label, Muted, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { PRESETS, SHADES, type Preset, type Shade } from '@/model';
import { nowFor, useStore } from '@/state/store';
import { fmtTime } from '@/utils/format';

const PRESET_OPTIONS = (Object.keys(PRESETS) as Preset[]).map((k) => ({ value: k, label: PRESETS[k].label }));
const SHADE_OPTIONS = (Object.keys(SHADES) as Shade[]).map((k) => ({ value: k, label: SHADES[k].label }));
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240].map((m) => ({ value: m, label: m < 60 ? `${m} min` : `${m / 60} h` }));

export default function AddSession() {
  const c = useTheme();
  const profile = useStore((s) => s.profile);
  const add = useStore((s) => s.addPastSession);
  const [day, setDay] = useState<0 | 1>(0);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [duration, setDuration] = useState(60);
  const [preset, setPreset] = useState<Preset>(profile.preset);
  const [shade, setShade] = useState<Shade>('none');
  const [sunscreen, setSunscreen] = useState<'none' | 'start'>('none');
  const [error, setError] = useState<string | null>(null);
  const now = useMemo(() => nowFor(profile), [profile]);

  // half-hour start options from 6:00 to 20:00 that have already ended
  const starts = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const base = d.getTime() - day * 86_400_000;
    const out: { value: number; label: string }[] = [];
    for (let h = 6; h <= 20; h += 0.5) {
      const t = base + h * 3_600_000;
      if (t + 15 * 60_000 <= now) out.push({ value: t, label: fmtTime(t) });
    }
    return out;
  }, [now, day]);

  const start = startHour !== null && starts.some((s) => s.value === startHour) ? startHour : null;
  const end = start !== null ? Math.min(start + duration * 60_000, now) : null;

  return (
    <Screen tabbed={false}>
      <Card>
        <Label>Which day?</Label>
        <Chips
          options={[
            { value: 0 as const, label: 'Today' },
            { value: 1 as const, label: 'Yesterday' },
          ]}
          value={day}
          onChange={setDay}
        />
        <Label>Started at</Label>
        {starts.length ? <Chips options={starts} value={start} onChange={setStartHour} /> : <Muted>No past daylight times yet today.</Muted>}
        <Label>For how long?</Label>
        <Chips options={DURATIONS} value={duration} onChange={setDuration} />
        {start !== null && end !== null ? (
          <Muted>
            {fmtTime(start)}–{fmtTime(end)}
            {end < start + duration * 60_000 ? ' (trimmed to now)' : ''}
          </Muted>
        ) : null}
        <Label>Doing what?</Label>
        <Chips options={PRESET_OPTIONS} value={preset} onChange={setPreset} />
        <Label>Shade</Label>
        <Chips options={SHADE_OPTIONS} value={shade} onChange={setShade} />
        <Label>Sunscreen</Label>
        <Chips
          options={[
            { value: 'none' as const, label: 'None' },
            { value: 'start' as const, label: `SPF ${profile.spf} at the start` },
          ]}
          value={sunscreen}
          onChange={setSunscreen}
        />
      </Card>
      {error ? <ThemedText style={{ color: c.danger }}>{error}</ThemedText> : null}
      <Button
        title="Add session"
        disabled={start === null || end === null}
        onPress={() => {
          if (start === null || end === null) return;
          const r = add({ start, end, preset, shade, sunscreenAt: sunscreen === 'start' ? start : null });
          if (r.ok) router.back();
          else setError(r.reason);
        }}
      />
      <Muted>Calculated from the forecast for those hours, so it’s labelled “added later · estimated”.</Muted>
    </Screen>
  );
}

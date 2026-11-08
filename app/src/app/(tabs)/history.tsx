import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { Bar, Button, Card, Disclaimer, Label, Muted, Row, Screen } from '@/components/cs/ui';
import { TrendsCard } from '@/components/cs/trends';
import { ThemedText } from '@/components/themed-text';
import { fractionColor } from '@/constants/theme';
import { localDayKey, skinDose, summarizeDays } from '@/engine';
import { useNow } from '@/hooks/use-app';
import { useTheme } from '@/hooks/use-theme';
import { PRESETS } from '@/model';
import { skinProfile, useStore } from '@/state/store';
import { fmtDay, fmtPct, fmtSED, fmtShortDuration, fmtTime } from '@/utils/format';

export default function History() {
  const c = useTheme();
  const sessions = useStore((s) => s.sessions);
  const profile = useStore((s) => s.profile);
  const days = useMemo(() => summarizeDays(sessions, skinProfile(profile)), [sessions, profile]);
  // app clock (the demo clock in demo mode), bucketed to the hour
  const hour = Math.floor(useNow() / 3_600_000);

  const last14 = useMemo(() => {
    const out: { key: string; sed: number; frac: number; t: number }[] = [];
    const today = new Date(hour * 3_600_000);
    today.setHours(12, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const t = today.getTime() - i * 86_400_000;
      const key = localDayKey(t);
      const d = days.find((x) => x.day === key);
      out.push({ key, sed: d?.unprotectedSED ?? 0, frac: d?.peakFraction ?? 0, t });
    }
    return out;
  }, [days, hour]);

  const maxSed = Math.max(1, ...last14.map((d) => d.sed));

  return (
    <Screen>
      <ThemedText type="subtitle">History</ThemedText>
      <TrendsCard />
      <Card>
        <Label>Last 14 days · skin dose</Label>
        <Svg width="100%" height={110} viewBox="0 0 320 110" accessibilityLabel="Daily unprotected skin dose for the last 14 days">
          {last14.map((d, i) => {
            const h = (d.sed / maxSed) * 80;
            return <Rect key={d.key} x={4 + i * 22.5} y={88 - h} width={18} height={Math.max(h, 1)} rx={3} fill={fractionColor(d.frac, c)} />;
          })}
          {last14.map((d, i) =>
            i % 3 === 1 ? (
              <SvgText key={`l${d.key}`} x={4 + i * 22.5} y={104} fontSize={10} fill={c.textSecondary}>
                {new Date(d.t).getDate()}
              </SvgText>
            ) : null,
          )}
        </Svg>
        <Muted>Bar colour shows peak estimated burn progress that day.</Muted>
      </Card>

      {days.length === 0 ? (
        <Card>
          <ThemedText>No sessions yet.</ThemedText>
          <Muted>Start one on the Track tab, or add time you already spent outside.</Muted>
          <Button kind="secondary" title="Add time I was outside" onPress={() => router.push('/add-session')} />
        </Card>
      ) : null}

      {days.map((d) => (
        <Card key={d.day}>
          <Row style={{ justifyContent: 'space-between' }}>
            <ThemedText type="smallBold">{fmtDay(Date.parse(`${d.day}T12:00:00`))}</ThemedText>
            <Muted>
              {fmtShortDuration(d.outdoorSeconds)} · {fmtSED(d.unprotectedSED)}
            </Muted>
          </Row>
          <Bar fraction={d.peakFraction} color={fractionColor(d.peakFraction, c)} />
          <Muted>Peak estimated burn progress {fmtPct(d.peakFraction)}</Muted>
          {sessions
            .filter((s) => localDayKey(s.startedAt) === d.day)
            .map((s) => (
              <Pressable key={s.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}>
                <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                  <ThemedText type="small">
                    {fmtTime(s.startedAt)}–{fmtTime(s.endedAt ?? s.lastT)} · {PRESETS[s.preset].label}
                    {s.trackingMode === 'retroactive' ? ' · added later' : ''}
                    {s.demo ? ' · demo' : ''}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: c.text }}>
                    {fmtSED(skinDose(s).protectedSED)} ›
                  </ThemedText>
                </Row>
              </Pressable>
            ))}
        </Card>
      ))}
      <Disclaimer />
    </Screen>
  );
}

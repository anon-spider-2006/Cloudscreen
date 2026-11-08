/**
 * Trends card for the History tab:
 *  1. this week vs last week (time outside, skin dose, near-burn days)
 *  2. sunscreen habit over 30 days (time covered, dose it actually removed)
 *  3. how well the app knows your skin (MED estimate and range by check-in)
 * All computed on device from saved sessions and check-ins (engine trend functions).
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Bar, Card, Label, Muted, Row } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { NEAR_BURN_FRACTION, rangeNarrowing, skinLearning, sunscreenHabit, weekCompare, type SkinLearningPoint } from '@/engine';
import { useNow } from '@/hooks/use-app';
import { useTheme } from '@/hooks/use-theme';
import { skinProfile, useStore } from '@/state/store';
import { fmtSED, fmtShortDuration } from '@/utils/format';

const sed = (x: number) => (x < 10 ? x.toFixed(1) : x.toFixed(0));

/** "▲ 40% vs last week" style comparison; words carry the meaning, the arrow is decoration. */
function change(now: number, before: number, fmt: (x: number) => string): string {
  if (before <= 0 && now <= 0) return 'same as last week';
  if (before <= 0) return 'none last week';
  const r = now / before - 1;
  if (Math.abs(r) < 0.05) return `about the same as last week (${fmt(before)})`;
  return `${r > 0 ? '▲' : '▼'} ${Math.round(Math.abs(r) * 100)}% ${r > 0 ? 'more' : 'less'} than last week (${fmt(before)})`;
}

function StatRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <ThemedText type="small">{label}</ThemedText>
        <ThemedText type="smallBold">{value}</ThemedText>
      </Row>
      <Muted>{note}</Muted>
    </View>
  );
}

/** Log-scale band (10th–90th percentile) and median line, one step per check-in. */
function LearningChart({ points }: { points: SkinLearningPoint[] }) {
  const c = useTheme();
  const W = 320;
  const H = 120;
  const padL = 34;
  const padR = 8;
  const padT = 8;
  const padB = 20;
  const lo = Math.min(...points.map((p) => p.q10));
  const hi = Math.max(...points.map((p) => p.q90));
  const y = (v: number) => padT + (1 - (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) || 1)) * (H - padT - padB);
  const n = Math.max(1, points.length - 1);
  const x = (i: number) => padL + (i / n) * (W - padL - padR);
  const band =
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.q90).toFixed(1)}`).join('') +
    [...points].reverse().map((p, j) => `L${x(points.length - 1 - j).toFixed(1)} ${y(p.q10).toFixed(1)}`).join('') +
    'Z';
  const mid = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.median).toFixed(1)}`).join('');
  const ticks = [lo, Math.sqrt(lo * hi), hi];
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel={`Burn dose estimate over ${points.length - 1} check-ins: range narrowing`}>
      {ticks.map((v) => (
        <SvgText key={v} x={padL - 4} y={y(v) + 3} fontSize={10} textAnchor="end" fill={c.textSecondary}>
          {sed(v)}
        </SvgText>
      ))}
      <Line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke={c.border} strokeWidth={1} />
      <Path d={band} fill={c.skySoft} stroke={c.tint} strokeWidth={1} />
      <Path d={mid} fill="none" stroke={c.text} strokeWidth={2} />
      {points.map((p, i) => (
        <Circle key={i} cx={x(i)} cy={y(p.median)} r={3} fill={c.text} />
      ))}
      <SvgText x={padL} y={H - 6} fontSize={10} fill={c.textSecondary}>
        start
      </SvgText>
      {points.length > 1 ? (
        <SvgText x={W - padR} y={H - 6} fontSize={10} textAnchor="end" fill={c.textSecondary}>
          {`check-in ${points.length - 1}`}
        </SvgText>
      ) : null}
    </Svg>
  );
}

export function TrendsCard() {
  const c = useTheme();
  const sessions = useStore((s) => s.sessions);
  const checkIns = useStore((s) => s.checkIns);
  const profile = useStore((s) => s.profile);
  // app clock (the demo clock while the demo persona is loaded), bucketed to the hour
  const hour = Math.floor(useNow() / 3_600_000);

  const data = useMemo(() => {
    const now = (hour + 1) * 3_600_000;
    return {
      week: weekCompare(sessions, skinProfile(profile), now),
      habit: sunscreenHabit(sessions, now, 30),
      learning: skinLearning(profile.skinType, checkIns, profile.calibrationResetAt ?? 0),
    };
  }, [sessions, checkIns, profile, hour]);

  const { week, habit, learning } = data;
  const tw = week.thisWeek;
  const lw = week.lastWeek;
  const latest = learning[learning.length - 1];
  const checks = learning.length - 1;
  const narrowed = rangeNarrowing(learning);
  const covered = habit.outdoorSeconds > 0 ? habit.coveredSeconds / habit.outdoorSeconds : 0;

  return (
    <Card tone="sky">
      <Label>Trends</Label>

      <ThemedText type="smallBold">Last 7 days</ThemedText>
      {tw.activeDays === 0 && lw.activeDays === 0 ? (
        <Muted>No sessions in the last two weeks yet.</Muted>
      ) : (
        <>
          <StatRow label="Time outside" value={fmtShortDuration(tw.outdoorSeconds)} note={change(tw.outdoorSeconds, lw.outdoorSeconds, fmtShortDuration)} />
          <StatRow label="Dose on your skin" value={fmtSED(tw.protectedSED)} note={change(tw.protectedSED, lw.protectedSED, fmtSED)} />
          <StatRow
            label={`Days near a burn (≥ ${Math.round(NEAR_BURN_FRACTION * 100)}%)`}
            value={String(tw.nearBurnDays)}
            note={`${lw.nearBurnDays} the week before`}
          />
        </>
      )}

      <View style={{ height: 1, backgroundColor: c.border }} />
      <ThemedText type="smallBold">Sunscreen, last {habit.days} days</ThemedText>
      {habit.sessions === 0 ? (
        <Muted>No outings in the last {habit.days} days.</Muted>
      ) : (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <ThemedText type="small">On for {Math.round(covered * 100)}% of your time outside</ThemedText>
            <Muted>
              {habit.sessionsWithSunscreen} of {habit.sessions} outings
            </Muted>
          </Row>
          <Bar fraction={covered} color={c.tint} />
          {habit.doseCut === null ? (
            <Muted>No sunscreen logged on these outings.</Muted>
          ) : (
            <Muted>
              When you wore it, it cut the dose on your skin by {Math.round(habit.doseCut * 100)}%
              {habit.labelSpf ? ` (labels averaged SPF ${Math.round(habit.labelSpf)})` : ''}. That includes time before you put it on and it wearing off, so it’s what your habit
              actually achieved, not the label.
            </Muted>
          )}
        </>
      )}

      <View style={{ height: 1, backgroundColor: c.border }} />
      <ThemedText type="smallBold">How well the app knows your skin</ThemedText>
      <ThemedText type="small">
        Burn dose about {sed(latest.median)} SED, likely {sed(latest.q10)}–{sed(latest.q90)} SED
      </ThemedText>
      {checks === 0 ? (
        <Muted>No morning check-ins yet. Answer one after a day outside and this range will start to narrow.</Muted>
      ) : (
        <>
          <LearningChart points={learning} />
          <Muted>
            {checks} check-in{checks === 1 ? '' : 's'}.{' '}
            {narrowed >= 0.05 ? `The range is ${Math.round(narrowed * 100)}% narrower than when you started.` : 'Not much narrower yet; it tightens with more check-ins.'} Shaded: the
            likely range; line: best estimate.
          </Muted>
        </>
      )}
    </Card>
  );
}

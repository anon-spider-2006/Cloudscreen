import { Pressable, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { fractionColor, uvCategory } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fmtTime } from '@/utils/format';

/** Hourly UV bars, coloured by WHO category, with a "now" marker. */
export function UVChart({ points, now, height = 120 }: { points: { t: number; uvi: number }[]; now: number; height?: number }) {
  const c = useTheme();
  if (points.length === 0) return null;
  const W = 320;
  const pad = 18;
  const max = Math.max(6, ...points.map((p) => p.uvi));
  const bw = (W - 8) / points.length;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t + 3_600_000;
  const nowX = 4 + ((now - t0) / (t1 - t0)) * (W - 8);
  const label = points.length ? `Hourly UV index from ${fmtTime(t0)}; peak ${max.toFixed(1)}` : '';
  return (
    <View accessible accessibilityLabel={label}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`}>
        {points.map((p, i) => {
          const h = (p.uvi / max) * (height - pad - 6);
          return <Rect key={p.t} x={4 + i * bw + 1} y={height - pad - h} width={Math.max(1, bw - 2)} height={h} rx={2} fill={uvCategory(p.uvi).color} />;
        })}
        {nowX > 4 && nowX < W - 4 ? <Line x1={nowX} x2={nowX} y1={0} y2={height - pad} stroke={c.text} strokeWidth={1.5} strokeDasharray="3 3" /> : null}
        {points.map((p, i) =>
          i % 4 === 0 ? (
            <SvgText key={`l${p.t}`} x={4 + i * bw} y={height - 4} fontSize={10} fill={c.textSecondary}>
              {fmtTime(p.t)}
            </SvgText>
          ) : null,
        )}
      </Svg>
    </View>
  );
}

/** Planner strip: peak burn fraction by start time; selected and lowest windows highlighted. */
export function PlanStrip({
  slots,
  selected,
  lowest,
  onSelect,
  height = 110,
}: {
  slots: { start: number; peakFraction: number }[];
  selected: number | null;
  lowest: number[];
  onSelect: (t: number) => void;
  height?: number;
}) {
  const c = useTheme();
  if (slots.length === 0) return null;
  const W = 320;
  const pad = 18;
  const max = Math.max(1, ...slots.map((s) => s.peakFraction));
  const bw = (W - 8) / slots.length;
  const yOne = height - pad - (1 / max) * (height - pad - 6);
  return (
    <View accessible accessibilityLabel="Estimated peak burn progress by start time">
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`}>
        <Line x1={0} x2={W} y1={yOne} y2={yOne} stroke={c.danger} strokeWidth={1} strokeDasharray="4 3" />
        {slots.map((s, i) => {
          const h = Math.max(2, (s.peakFraction / max) * (height - pad - 6));
          const isSel = s.start === selected;
          const isLow = lowest.includes(s.start);
          return (
            <Rect
              key={s.start}
              x={4 + i * bw + 1}
              y={height - pad - h}
              width={Math.max(1, bw - 2)}
              height={h}
              rx={2}
              fill={isLow ? c.success : fractionColor(s.peakFraction, c)}
              stroke={isSel ? c.text : 'none'}
              strokeWidth={isSel ? 2 : 0}
            />
          );
        })}
        {slots.map((s, i) =>
          i % 4 === 0 ? (
            <SvgText key={`l${s.start}`} x={4 + i * bw} y={height - 4} fontSize={10} fill={c.textSecondary}>
              {fmtTime(s.start)}
            </SvgText>
          ) : null,
        )}
      </Svg>
      {/* Touch targets over the bars (SVG press handlers aren't valid DOM props on web). */}
      <View style={{ position: 'absolute', left: `${(4 / W) * 100}%`, right: `${(4 / W) * 100}%`, top: 0, bottom: pad, flexDirection: 'row' }}>
        {slots.map((s) => (
          <Pressable
            key={s.start}
            accessibilityRole="button"
            accessibilityLabel={`Start ${fmtTime(s.start)}, ${Math.round(s.peakFraction * 100)} percent`}
            onPress={() => onSelect(s.start)}
            style={{ flex: 1 }}
          />
        ))}
      </View>
    </View>
  );
}

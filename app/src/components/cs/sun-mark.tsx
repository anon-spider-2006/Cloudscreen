import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useTheme } from '@/hooks/use-theme';

/** A small print-inspired sun, built as vector art for crisp display at any size. */
export function SunMark({ size = 116 }: { size?: number }) {
  const c = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => {
        const angle = i * Math.PI / 6;
        return <Line key={i} x1={60 + Math.cos(angle) * 42} y1={60 + Math.sin(angle) * 42}
          x2={60 + Math.cos(angle) * 53} y2={60 + Math.sin(angle) * 53} stroke={c.text} strokeWidth={1.5} />;
      })}
      <Circle cx={60} cy={60} r={32} fill={c.sun} />
      <Path d="M 28 60 A 32 32 0 0 0 92 60" fill="#BD6951" />
      <Line x1={14} y1={60} x2={106} y2={60} stroke={c.text} strokeWidth={1.5} />
    </Svg>
  );
}

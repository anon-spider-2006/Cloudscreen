/**
 * "CLOUDSCREEN" wordmark with the O set as a small cloud.
 *
 * Typeset to match Label (12 px, bold, uppercase, 1.8 tracking): the cloud is a
 * cap-height glyph sitting on the baseline, outlined at the letters' stem weight
 * (~0.13 em), so it reads as the ring of an O. Outline = three circles on a
 * flat base; joins computed exactly (see git history for the derivation).
 */
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const CLOUD_D = 'M7 20H22.5A5.5 5.5 0 0 0 22.5 9A8 8 0 0 0 6.56 8.02A6 6 0 0 0 7 20Z';
/** Shape bounds in path units: x 1–28, y 1–20 (19 tall = cap height). */
const CAP_RATIO = 0.72; // Geneva cap height / em
const STEM_RATIO = 0.13; // bold stem / em
/** Stroke in path units so the outer edge spans exactly cap height. */
const SW = (STEM_RATIO * 19) / (CAP_RATIO - STEM_RATIO);

export function Wordmark({ fontSize = 12, tracking = 1.8 }: { fontSize?: number; tracking?: number }) {
  const c = useTheme();
  const cap = CAP_RATIO * fontSize;
  const vb = { x: 1 - SW / 2, y: 1 - SW / 2, w: 27 + SW, h: 19 + SW };
  const text = { textTransform: 'uppercase' as const, letterSpacing: tracking, fontSize };
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Cloudscreen" style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={text}>
        Cl
      </ThemedText>
      <Svg width={(cap * vb.w) / vb.h} height={cap} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ marginRight: tracking }}>
        <Path d={CLOUD_D} fill="none" stroke={c.text} strokeWidth={SW} strokeLinejoin="round" />
      </Svg>
      <ThemedText type="smallBold" themeColor="textSecondary" style={text}>
        udscreen
      </ThemedText>
    </View>
  );
}

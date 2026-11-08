/**
 * Glass surface for every control (chips, buttons, selects, banners, tabs): a
 * capsule in one flat, see-through colour with a hairline border. No sheen or
 * gradient: one colour per control.
 *
 * Plain views, so it looks the same on iOS, Android and web and stays cheap with
 * dozens on screen. (Native Liquid Glass via expo-glass-effect is iOS 26+ only and
 * meant for floating chrome; the native tab bar already gets it.)
 */
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type GlassTone = 'clear' | 'sky' | 'sun' | 'danger';

export function GlassSurface({
  tone = 'clear',
  radius = 999,
  pressed = false,
  raised = true,
  fill: fillOverride,
  style,
  children,
}: {
  /** Override the fill (e.g. a mostly opaque frost for a bar floating over content). */
  fill?: string;
  tone?: GlassTone;
  radius?: number;
  pressed?: boolean;
  /** Soft drop shadow (off for dense lists). */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const c = useTheme();
  const fill = fillOverride ?? (tone === 'sky' ? c.glassSky : tone === 'sun' ? c.glassSun : tone === 'danger' ? c.glassDanger : c.glassFill);
  const border = tone === 'sky' ? c.glassSkyBorder : tone === 'sun' ? c.glassSunBorder : tone === 'danger' ? c.glassDangerBorder : c.glassBorder;
  const shadow: ViewStyle =
    raised && Platform.OS !== 'android' // Android elevation shows through translucent fills
      ? { shadowColor: c.glassShadow, shadowOpacity: 1, shadowRadius: pressed ? 4 : 10, shadowOffset: { width: 0, height: pressed ? 1 : 4 } }
      : {};
  return (
    <View style={[{ borderRadius: radius, transform: [{ scale: pressed ? 0.97 : 1 }] }, shadow, style]}>
      <View style={[styles.clip, { borderRadius: radius, backgroundColor: fill, borderColor: border }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', borderWidth: 1, flexGrow: 1, justifyContent: 'center' },
});

/** "#RRGGBB" → "rgba(r,g,b,a)". */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

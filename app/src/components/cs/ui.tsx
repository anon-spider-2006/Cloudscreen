/** Small design-system kit for Cloudscreen screens. */
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DemoStrip, useInDemo } from '@/components/cs/demo-strip';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({ children, tabbed = true }: { children: ReactNode; tabbed?: boolean }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const demo = useInDemo();
  // in demo, a sticky coral strip sits under the status bar and the content starts below it
  const topInset = tabbed ? insets.top : 0;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentInsetAdjustmentBehavior="automatic"
      stickyHeaderIndices={demo ? [0] : undefined}
      contentContainerStyle={{
        paddingTop: demo ? 0 : insets.top + Spacing.four,
        paddingBottom: insets.bottom + (tabbed ? BottomTabInset + 88 : 0) + Spacing.five,
        paddingHorizontal: demo ? 0 : Spacing.four,
        alignItems: demo ? 'stretch' : 'center',
      }}>
      {demo ? <DemoStrip topInset={topInset} /> : null}
      {demo ? (
        // full-width wrapper so the column's width: '100%' resolves against the screen, not its content
        <View style={{ width: '100%', alignItems: 'center', paddingHorizontal: Spacing.four, paddingTop: Spacing.four }}>
          <View style={styles.column}>{children}</View>
        </View>
      ) : (
        <View style={styles.column}>{children}</View>
      )}
    </ScrollView>
  );
}

export function Card({ children, style, tone = 'plain' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'plain' | 'sun' | 'tint' | 'sky' }) {
  const c = useTheme();
  const bg = tone === 'sun' ? c.sunSoft : tone === 'tint' ? c.backgroundSelected : tone === 'sky' ? c.skySoft : c.backgroundElement;
  return <View style={[styles.card, { backgroundColor: bg, borderColor: c.border, ...(tone === 'plain' ? { paddingHorizontal: 0 } : {}) }, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
      {children}
    </ThemedText>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<any> }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={style}>
      {children}
    </ThemedText>
  );
}

export function Big({ children, color }: { children: ReactNode; color?: string }) {
  return <ThemedText style={[styles.big, color ? { color } : null]}>{children}</ThemedText>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  style,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'sun';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const c = useTheme();
  const bg = kind === 'primary' ? c.tint : kind === 'danger' ? c.danger : kind === 'sun' ? c.sun : c.backgroundSelected;
  const fg = kind === 'danger' ? c.background : kind === 'secondary' ? c.text : kind === 'sun' ? '#2A1E00' : c.onTint;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}>
      <ThemedText type="smallBold" style={{ color: fg, fontSize: 16 }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const c = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: on ? c.tint : c.backgroundElement, borderColor: on ? c.tint : c.border, opacity: pressed ? 0.8 : 1 },
            ]}>
            <ThemedText type="small" style={{ color: on ? c.onTint : c.text }}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Bar({ fraction, color }: { fraction: number; color: string }) {
  const c = useTheme();
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={[styles.bar, { backgroundColor: c.track }]}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 999 }} />
    </View>
  );
}

export function Banner({ text, onPress, tone = 'sun' }: { text: string; onPress?: () => void; tone?: 'sun' | 'danger' | 'tint' }) {
  const c = useTheme();
  const bg = tone === 'danger' ? c.danger : tone === 'tint' ? c.tint : c.sun;
  const fg = tone === 'danger' ? c.background : tone === 'sun' ? '#2A1E00' : c.onTint;
  return (
    <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={[styles.banner, { backgroundColor: bg }]}>
      <ThemedText type="smallBold" style={{ color: fg }}>
        {text}
      </ThemedText>
    </Pressable>
  );
}

export function LinkText({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}>
      <ThemedText type="smallBold" style={{ color: c.text, textDecorationLine: 'underline' }}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

export function Disclaimer() {
  return (
    <Muted style={{ textAlign: 'center', marginTop: Spacing.two }}>
      Estimates, not medical measurements. Staying below your estimated threshold doesn’t mean no skin damage.
    </Muted>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  card: { borderRadius: 0, padding: Spacing.four, gap: 12, borderTopWidth: 1 },
  label: { textTransform: 'uppercase', letterSpacing: 1.8, fontSize: 12 },
  big: { fontFamily: Fonts.display, fontSize: 80, lineHeight: 88, fontWeight: 800, letterSpacing: -3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  button: { minHeight: 50, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 4, borderWidth: 1, minHeight: 38, justifyContent: 'center' },
  bar: { height: 12, borderRadius: 999, overflow: 'hidden' },
  banner: { borderRadius: 4, padding: Spacing.three },
});

import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View, StyleSheet, type PressableProps } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';

import { GlassSurface, withAlpha } from '@/components/cs/glass';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="track" href="/track" asChild>
            <TabButton>Track</TabButton>
          </TabTrigger>
          <TabTrigger name="forecast" href="/forecast" asChild>
            <TabButton>Forecast</TabButton>
          </TabTrigger>
          <TabTrigger name="history" href="/history" asChild>
            <TabButton>History</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton>Profile</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...(props as PressableProps)} style={{ flex: 1 }}>
      {({ pressed }) =>
        isFocused ? (
          <GlassSurface tone="sky" pressed={pressed} raised={false} style={styles.tabButton}>
            <TabLabel focused>{children}</TabLabel>
          </GlassSurface>
        ) : (
          <View style={[styles.tabButton, styles.tabButtonPlain, pressed && styles.pressed]}>
            <TabLabel focused={false}>{children}</TabLabel>
          </View>
        )
      }
    </Pressable>
  );
}

function TabLabel({ children, focused }: { children: React.ReactNode; focused: boolean }) {
  return (
    <ThemedText style={{ fontSize: 12, textAlign: 'center' }} numberOfLines={1} type={focused ? 'smallBold' : 'small'} themeColor={focused ? 'text' : 'textSecondary'}>
      {children}
    </ThemedText>
  );
}

export function CustomTabList(props: TabListProps) {
  const c = useTheme();
  return (
    <View {...props} style={styles.tabListContainer}>
      {/* a floating frosted capsule: mostly opaque so labels stay readable over content */}
      <GlassSurface fill={withAlpha(c.background, 0.86)} style={[styles.bar, { backdropFilter: 'blur(18px)' } as object]}>
        <View style={styles.barRow}>{props.children}</View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  bar: { flexGrow: 1, maxWidth: MaxContentWidth },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 6 },
  pressed: {
    opacity: 0.7,
  },
  tabButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 2 }, // tight sides: "Forecast" fits at 320 px
  tabButtonPlain: { alignItems: 'center', borderRadius: 999 },
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
    marginLeft: Spacing.three,
  },
});

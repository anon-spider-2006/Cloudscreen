/**
 * Coral strip shown at the top of every screen while the demo is on, so demo data
 * can't be mistaken for real use (including in screenshots). Tap for controls.
 */
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DEMO_PERSONA } from '@/demo/mackenzie';
import { useNow } from '@/hooks/use-app';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/state/store';

export function DemoStrip({ topInset }: { topInset: number }) {
  const c = useTheme();
  const now = useNow();
  const time = new Date(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  return (
    <Pressable
      onPress={() => router.push('/demo')}
      accessibilityRole="button"
      accessibilityLabel={`Demo mode, ${DEMO_PERSONA.name}, ${time}. Opens demo controls.`}
      style={({ pressed }) => ({
        backgroundColor: c.coral,
        paddingTop: topInset + 8,
        paddingBottom: 8,
        paddingHorizontal: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        opacity: pressed ? 0.85 : 1,
      })}>
      <ThemedText type="smallBold" style={{ color: '#2A1000', letterSpacing: 1 }}>
        DEMO · {DEMO_PERSONA.name} · {time}
      </ThemedText>
      <ThemedText type="smallBold" style={{ color: '#2A1000' }}>
        Controls ›
      </ThemedText>
    </Pressable>
  );
}

/** True while a demo persona is loaded. */
export const useInDemo = () => useStore((s) => s.demo != null);

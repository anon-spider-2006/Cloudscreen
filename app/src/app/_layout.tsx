import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { useHydrated } from '@/hooks/use-app';
import { initNotifications } from '@/services/notifications';
import { useStore } from '@/state/store';

SplashScreen.preventAutoHideAsync();

/** Keeps the active session integrated and the forecast fresh (§14.3: timestamps, not timers, drive the dose). */
function SessionRunner() {
  useEffect(() => {
    initNotifications();
    const run = () => {
      const s = useStore.getState();
      s.tick();
      void s.refreshForecast();
    };
    run();
    const timer = setInterval(run, 15_000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && run());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  if (!hydrated) return null;

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionRunner />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="why" options={{ title: 'Why this number?', presentation: 'modal' }} />
        <Stack.Screen name="sunscreen" options={{ title: 'Log sunscreen', presentation: 'modal' }} />
        <Stack.Screen name="add-session" options={{ title: 'Add time outside', presentation: 'modal' }} />
        <Stack.Screen name="checkin" options={{ title: 'Morning check-in', presentation: 'modal' }} />
        <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
      </Stack>
    </ThemeProvider>
  );
}

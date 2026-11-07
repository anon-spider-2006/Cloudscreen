import { Redirect } from 'expo-router';

import AppTabs from '@/components/app-tabs';
import { useStore } from '@/state/store';

export default function TabsLayout() {
  const onboarded = useStore((s) => s.profile.onboarded);
  if (!onboarded) return <Redirect href="/onboarding" />;
  return <AppTabs />;
}

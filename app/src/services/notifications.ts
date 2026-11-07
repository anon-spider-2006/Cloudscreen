/**
 * Local notifications only (no push). Works in Expo Go. Identifiers are fixed per purpose so
 * rescheduling replaces rather than duplicates (NOTIF-003, NOTIF-007).
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

const supported = Platform.OS !== 'web';
let initialized = false;

export function initNotifications() {
  if (!supported || initialized) return;
  initialized = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Cloudscreen',
      importance: AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
}

/** Ask only when needed (NOTIF-001). */
export async function ensurePermission(): Promise<boolean> {
  if (!supported) return false;
  initNotifications();
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

async function scheduleAt(identifier: string, date: Date, title: string, body: string) {
  if (!supported) return;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  if (seconds < 1) return;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
  }).catch(() => {});
}

export async function cancel(identifier: string) {
  if (!supported) return;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
}

const BURN_TEXT: Record<string, { title: string; body: (min: number | null) => string }> = {
  '0.5': { title: 'Halfway to your estimated burn threshold', body: () => 'Estimated. Consider shade or checking your sunscreen.' },
  '0.8': { title: 'About 80% of your estimated burn threshold', body: () => 'Estimated. Consider shade or reapplying sunscreen soon.' },
  '1': { title: 'Estimated burn threshold reached', body: () => 'This is an estimate, not a diagnosis. Consider getting out of the sun.' },
};

/**
 * Schedule an alert at each not-yet-fired threshold's projected time (NOTIF-006).
 * `minutes` maps threshold → minutes from now (null = not reached in horizon). Relative, so the
 * demo clock offset doesn't matter.
 */
export async function scheduleBurnAlerts(minutes: Record<string, number | null>) {
  for (const th of ['0.5', '0.8', '1']) {
    const id = `burn-${th}`;
    const m = minutes[th];
    if (m === undefined || m === null) {
      await cancel(id);
      continue;
    }
    await scheduleAt(id, new Date(Date.now() + m * 60_000), BURN_TEXT[th].title, BURN_TEXT[th].body(m));
  }
}

export async function cancelBurnAlerts() {
  await Promise.all(['0.5', '0.8', '1'].map((th) => cancel(`burn-${th}`)));
}

export async function scheduleSunscreenReminder(afterMin: number) {
  await scheduleAt(
    'sunscreen',
    new Date(Date.now() + afterMin * 60_000),
    'Time to think about reapplying',
    `It's been ${afterMin >= 60 ? `${Math.round(afterMin / 6) / 10} h` : `${afterMin} min`} since your last sunscreen. Follow your product's directions.`,
  );
}

/** One per day (NOTIF-008). `at` is real wall-clock time. */
export async function scheduleCheckIn(day: string, at: number) {
  await scheduleAt(`checkin-${day}`, new Date(at), 'Any redness today?', 'A 2-second check-in helps Cloudscreen learn your skin.');
}

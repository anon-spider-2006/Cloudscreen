/**
 * Local notifications only (no push). Works in Expo Go. Identifiers are fixed per purpose so
 * rescheduling replaces rather than duplicates (NOTIF-003, NOTIF-007).
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

const supported = Platform.OS !== 'web';
const CHANNEL = 'default';
/** Resolves once setup is done (on Android: the channel exists). */
let ready: Promise<void> | null = null;

/**
 * Show notifications while the app is open, and create the Android channel.
 * Android 13+ won't show the permission prompt until a channel exists, so
 * ensurePermission waits for this before asking.
 */
export function initNotifications(): Promise<void> {
  if (!supported) return Promise.resolve();
  if (ready) return ready;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  ready =
    Platform.OS === 'android'
      ? Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Cloudscreen', importance: AndroidImportance.DEFAULT })
          .then(() => undefined)
          .catch(() => undefined)
      : Promise.resolve();
  return ready;
}

/** Ask only when needed (NOTIF-001). */
export async function ensurePermission(): Promise<boolean> {
  if (!supported) return false;
  await initNotifications(); // the channel must exist before Android 13+ will show the prompt
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

async function scheduleAt(identifier: string, date: Date, title: string, body: string) {
  if (!supported) return;
  await initNotifications();
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  if (seconds < 1) return;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body },
    // name our channel; without it Android files these under a generic "Miscellaneous" channel
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL },
  }).catch(() => {});
}

/** True when a real OS notification can be shown (native + permission). */
export async function canNotify(): Promise<boolean> {
  if (!supported) return false;
  return (await Notifications.getPermissionsAsync().catch(() => null))?.granted ?? false;
}

/** The demo's one scripted notification (fixed id, so restarting the demo replaces it). */
export async function scheduleDemoNudge(afterSec: number, title: string, body: string) {
  await scheduleAt('demo-nudge', new Date(Date.now() + afterSec * 1000), title, body);
}

export async function cancel(identifier: string) {
  if (!supported) return;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
}

const BURN_TEXT: Record<string, { title: string; body: (min: number | null) => string }> = {
  // Alerts fire on the cautious estimate (high end of the measured UV error), hence "may".
  '0.5': { title: 'You may be halfway to your burn threshold', body: () => 'Cautious estimate. Consider shade or checking your sunscreen.' },
  '0.8': { title: 'You may be at 80% of your burn threshold', body: () => 'Cautious estimate. Consider shade or reapplying sunscreen soon.' },
  '1': { title: 'You may have reached your burn threshold', body: () => 'This is a cautious estimate, not a diagnosis. Consider getting out of the sun.' },
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

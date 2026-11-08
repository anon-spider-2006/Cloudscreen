/**
 * Web build: no notifications. Same API as notifications.ts, all no-ops, so
 * expo-notifications is never loaded on web. (Loading it there only logs warnings:
 * push-token listeners aren't supported, and during Node rendering it touches
 * Node 25's built-in localStorage, which throws without --localstorage-file.)
 * Callers already fall back to in-app banners when canNotify() is false.
 */
export async function initNotifications(): Promise<void> {}
export async function ensurePermission(): Promise<boolean> {
  return false;
}
export async function canNotify(): Promise<boolean> {
  return false;
}
export async function scheduleDemoNudge(_afterSec: number, _title: string, _body: string) {}
export async function cancel(_identifier: string) {}
export async function scheduleBurnAlerts(_minutes: Record<string, number | null>) {}
export async function cancelBurnAlerts() {}
export async function scheduleSunscreenReminder(_afterMin: number) {}
export async function scheduleCheckIn(_day: string, _at: number) {}

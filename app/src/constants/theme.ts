/**
 * Cloudscreen design tokens. Blue + sun yellow (§16.1), lighter in light mode, deeper in dark mode.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0E1B2C',
    background: '#F3F7FD',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#DCE8FB',
    textSecondary: '#55657A',
    tint: '#1F6FE0',
    onTint: '#FFFFFF',
    sun: '#FFC23D',
    sunSoft: '#FFF3D1',
    border: '#DDE5F0',
    danger: '#D93B30',
    warning: '#E58A1F',
    success: '#2F9E5B',
    track: '#E4EBF5',
  },
  dark: {
    text: '#EEF3FA',
    background: '#08111D',
    backgroundElement: '#122033',
    backgroundSelected: '#1B3354',
    textSecondary: '#9AAAC0',
    tint: '#5B9DFF',
    onTint: '#04101F',
    sun: '#FFC94D',
    sunSoft: '#3A2F12',
    border: '#22344C',
    danger: '#FF6B5E',
    warning: '#FFA54A',
    success: '#4CC47F',
    track: '#1D2C42',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Palette = (typeof Colors)['light'] | (typeof Colors)['dark'];

/** WHO UV index categories (§16.2). Color never carries meaning alone: always paired with the label. */
export function uvCategory(uvi: number): { label: string; color: string } {
  if (uvi < 3) return { label: 'Low', color: '#3BA55C' };
  if (uvi < 6) return { label: 'Moderate', color: '#E8B923' };
  if (uvi < 8) return { label: 'High', color: '#F07F1F' };
  if (uvi < 11) return { label: 'Very high', color: '#DD3C35' };
  return { label: 'Extreme', color: '#8E44AD' };
}

/** Color for a burn fraction (0–1+). */
export function fractionColor(f: number, c: Palette): string {
  if (f >= 1) return c.danger;
  if (f >= 0.8) return c.warning;
  if (f >= 0.5) return c.sun;
  return c.tint;
}

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 640;

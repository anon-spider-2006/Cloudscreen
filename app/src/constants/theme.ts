/**
 * Cloudscreen design tokens (§16.1). Apothecary palette: honey yellow, warm black, cream and kraft,
 * with a botanical green. Black buttons in light mode, honey buttons in dark mode.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1C1A17',
    background: '#FBF7EE',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F3EAD3',
    textSecondary: '#6E6556',
    tint: '#1C1A17',
    onTint: '#FFF8E6',
    sun: '#FFC72C',
    sunSoft: '#FFF1C2',
    onSun: '#1C1A17',
    border: '#E8DFCB',
    danger: '#C0392B',
    warning: '#E07B1A',
    success: '#5B7F3A',
    calm: '#C9A86A',
    track: '#EFE6D2',
  },
  dark: {
    text: '#F6EFE0',
    background: '#15120E',
    backgroundElement: '#211C16',
    backgroundSelected: '#2E271E',
    textSecondary: '#A99D88',
    tint: '#FFC72C',
    onTint: '#1C1A17',
    sun: '#FFC72C',
    sunSoft: '#3A2E12',
    onSun: '#1C1A17',
    border: '#3A3226',
    danger: '#F26B5B',
    warning: '#F5A04A',
    success: '#8DB36A',
    calm: '#B8955A',
    track: '#2C251C',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Palette = (typeof Colors)['light'] | (typeof Colors)['dark'];

/** WHO UV index categories (§16.2). Color never carries meaning alone: always paired with the label. */
export function uvCategory(uvi: number): { label: string; color: string } {
  if (uvi < 3) return { label: 'Low', color: '#6E9B45' };
  if (uvi < 6) return { label: 'Moderate', color: '#F2B705' };
  if (uvi < 8) return { label: 'High', color: '#E8781C' };
  if (uvi < 11) return { label: 'Very high', color: '#C8372D' };
  return { label: 'Extreme', color: '#7B3F8C' };
}

/** Color for a burn fraction (0–1+). */
export function fractionColor(f: number, c: Palette): string {
  if (f >= 1) return c.danger;
  if (f >= 0.8) return c.warning;
  if (f >= 0.5) return c.sun;
  return c.calm;
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

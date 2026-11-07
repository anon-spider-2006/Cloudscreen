/**
 * Cloudscreen design tokens. Blue + sun yellow (§16.1), lighter in light mode, deeper in dark mode.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#24394B', background: '#F7F3E9', backgroundElement: '#F7F3E9',
    backgroundSelected: '#DCE5EB', textSecondary: '#526878', tint: '#233294',
    onTint: '#FFFFFF', sun: '#EBC56B', sunSoft: '#F2E4BA', border: '#C6CBC6',
    danger: '#AD4036', warning: '#956019', success: '#39715A', track: '#DFE3DF',
  },
  dark: {
    text: '#F4EEE1', background: '#192D3C', backgroundElement: '#192D3C',
    backgroundSelected: '#30495C', textSecondary: '#B3C4CD', tint: '#B4C4FF',
    onTint: '#192D3C', sun: '#EBC56B', sunSoft: '#443D2A', border: '#4C606B',
    danger: '#FF9B8C', warning: '#EBC56B', success: '#9EC9B0', track: '#3B5260',
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

export const Fonts = {
  sans: 'Karla', serif: 'GildaDisplay', rounded: 'Karla',
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

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
export const MaxContentWidth = 840;

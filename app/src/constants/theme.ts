/**
 * Cloudscreen design tokens. Bright sky, lemon and coral accents with calm, readable surfaces.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#152F42', background: '#FFFCF4', backgroundElement: '#FFFCF4',
    backgroundSelected: '#97D7EF', textSecondary: '#415F6D', tint: '#97D7EF', skySoft: '#C6E8F5', skyIcon: '#C6E8F5',
    onTint: '#152F42', sun: '#FFDF38', sunSoft: '#FFEC80', coral: '#FF8669', border: '#CBD7D4',
    danger: '#B82E39', warning: '#926000', success: '#267551', track: '#DBE9E6',
    // glass: one flat see-through fill per control, hairline border (components/cs/glass.tsx)
    glassFill: 'rgba(255,255,255,0.62)', glassBorder: 'rgba(21,47,66,0.14)', glassShadow: 'rgba(21,47,66,0.14)',
    glassSky: 'rgba(151,215,239,0.55)', glassSkyBorder: 'rgba(46,128,166,0.45)',
    glassSun: 'rgba(255,223,56,0.55)', glassSunBorder: 'rgba(146,96,0,0.35)',
    glassDanger: 'rgba(184,46,57,0.14)', glassDangerBorder: 'rgba(184,46,57,0.45)',
  },
  dark: {
    text: '#F7FAEF', background: '#142C3B', backgroundElement: '#142C3B',
    backgroundSelected: '#244D61', textSecondary: '#B8D0D8', tint: '#97D7EF', skySoft: '#2E5D73', skyIcon: '#C6E8F5',
    onTint: '#152F42', sun: '#FFDF38', sunSoft: '#514824', coral: '#FF8669', border: '#476472',
    danger: '#FF8B94', warning: '#FFDF38', success: '#80EAB0', track: '#345361',
    glassFill: 'rgba(255,255,255,0.06)', glassBorder: 'rgba(255,255,255,0.16)', glassShadow: 'rgba(0,0,0,0.35)',
    glassSky: 'rgba(151,215,239,0.34)', glassSkyBorder: 'rgba(198,232,245,0.75)',
    glassSun: 'rgba(255,223,56,0.12)', glassSunBorder: 'rgba(255,223,56,0.75)',
    glassDanger: 'rgba(255,139,148,0.16)', glassDangerBorder: 'rgba(255,139,148,0.55)',
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
  return c.tint;
}

export const Fonts = {
  sans: Platform.select({ web: 'Geneva, Arial, sans-serif', default: 'Geneva' }),
  display: 'BricolageGrotesque', rounded: Platform.select({ web: 'Geneva, Arial, sans-serif', default: 'Geneva' }),
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

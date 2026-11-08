/**
 * The sun icon's colour from the real sun at the current place and app clock
 * (demo clock in demo); yellow when there's no place yet. Colour rules: utils/sun-color.ts.
 */
import { useNow } from '@/hooks/use-app';
import { useTheme } from '@/hooks/use-theme';
import { solarPhase } from '@/model';
import { useStore } from '@/state/store';
import { sunColorFor } from '@/utils/sun-color';

export function useSunColor(): string {
  const c = useTheme();
  const place = useStore((s) => s.place);
  const minute = Math.floor(useNow() / 60_000); // recompute once a minute
  if (!place) return c.sun;
  const { elevationDeg, rising } = solarPhase(new Date(minute * 60_000), place.lat, place.lon);
  return sunColorFor(elevationDeg, rising, c.sun, c.coral);
}

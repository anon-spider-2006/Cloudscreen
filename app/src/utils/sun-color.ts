/**
 * Sun icon colour from the sun's height (pure, so node tests can use it): yellow
 * while it climbs in the morning; after noon it warms as it sinks, yellow → orange
 * (~15°) → coral (~4°) → red at the horizon; dim dusk once it's below.
 */
const ORANGE = '#FFA53D';
const RED = '#E8574A';
const DUSK = '#9C7A80';

/** Evening colour stops by elevation (degrees): from high sun down to the horizon. */
function eveningStops(sun: string, coral: string): [number, string][] {
  return [
    [30, sun],
    [15, ORANGE],
    [4, coral],
    [0, RED],
  ];
}

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hex(a), hex(b)];
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

/** Colour for a sun at `elevationDeg`, morning (`rising`) or evening. Exported for tests. */
export function sunColorFor(elevationDeg: number, rising: boolean, sun: string, coral: string): string {
  if (elevationDeg < -1) return DUSK;
  if (rising) return sun;
  const stops = eveningStops(sun, coral);
  if (elevationDeg >= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [e1, c1] = stops[i - 1];
    const [e2, c2] = stops[i];
    if (elevationDeg >= e2) return mix(c2, c1, (elevationDeg - e2) / (e1 - e2));
  }
  return RED;
}


import { useMemo } from 'react';

import { Card, Disclaimer, Label, Muted, Row, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { explainRate, worstOf } from '@/engine';
import { useConditions } from '@/hooks/use-conditions';
import { MED_SED, PRESETS, SHADES, SURFACES } from '@/model';
import { skinProfile, useStore } from '@/state/store';
import { fmtMinutes, SITE_LABEL } from '@/utils/format';

function Line({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <ThemedText type="small" style={{ flex: 1 }}>
        {label}
        {note ? <Muted>{`\n${note}`}</Muted> : null}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </Row>
  );
}

export default function Why() {
  const cond = useConditions();
  const profile = useStore((s) => s.profile);
  const active = useStore((s) => s.active);

  const data = useMemo(() => {
    if (!cond) return null;
    const { reading, settings, ttb } = cond;
    const sp = skinProfile(profile);
    const site = active ? worstOf(active.sites, sp).worst : ttb.bareWorst.site;
    const film = active ? (active.sites[site]?.film ?? null) : null;
    const r = explainRate(reading, { ...settings, posture: site }, film);
    const sza = reading.szaDeg;
    const minutes = active ? (active.lastSunscreenAt ? ttb.sunscreenWorst?.minutes ?? null : ttb.bareWorst.minutes) : ttb.bareWorst.minutes;
    return { reading, settings, r, site, sza, minutes, film };
  }, [cond, profile, active]);

  if (!cond || !data) {
    return (
      <Screen tabbed={false}>
        <Card>
          <ThemedText>Set a location first.</ThemedText>
        </Card>
      </Screen>
    );
  }

  const { reading, settings, r, site, sza, minutes, film } = data;
  const cloud = reading.mode === 'forecast' ? reading.cmfObserved : reading.cmfLayers;
  const threshold = MED_SED[profile.skinType] * (active ? active.cUserAtSession : profile.cUser);

  return (
    <Screen tabbed={false}>
      <Card>
        <Label>The chain, right now</Label>
        <Line label={`Clear-sky UV (sun ${sza >= 90 ? 'below horizon' : `${Math.round(sza)}° from overhead`})`} value={reading.uviClearAllaart.toFixed(1)} note="Allaart/TEMIS model, 300 DU ozone" />
        <Line
          label="× clouds"
          value={cloud === null ? '—' : cloud.toFixed(2)}
          note={reading.mode === 'forecast' ? 'Implied by the forecast (forecast ÷ clear sky), not re-applied' : 'Our fitted 3-layer cloud factor'}
        />
        <Line label="= UV index" value={reading.uvi.toFixed(1)} note={`Source: ${reading.mode}${reading.clamped ? ' (clamped: forecast looked wrong)' : ''}`} />
        <Line
          label={`× ${SITE_LABEL[site].toLowerCase()} on ${SURFACES[settings.surface].label.toLowerCase()}`}
          value={r.geometry.toFixed(2)}
          note={`${PRESETS[active?.preset ?? profile.preset].label} · ${SHADES[settings.shade ?? 'none'].label}. Upright skin catches less than a flat surface; ground reflection adds back.`}
        />
        <Line
          label="÷ sunscreen, now"
          value={r.spfEff.toFixed(1)}
          note={film ? `SPF ${film.app.spfLabel} label → lower after under-application, UV breakdown and wear` : 'No sunscreen in this session'}
        />
        <Line label="= dose rate on skin" value={`${r.sedPerMin.toFixed(3)} SED/min`} note={`${r.sedPerMinUnprotected.toFixed(3)} SED/min without sunscreen`} />
        <Line label="Your estimated threshold" value={`${threshold.toFixed(1)} SED`} note={`Skin type ${['I', 'II', 'III', 'IV', 'V', 'VI'][profile.skinType - 1]} (${MED_SED[profile.skinType]} SED) × personal calibration ${(active ? active.cUserAtSession : profile.cUser).toFixed(2)}`} />
        <Line label="→ time left at forecast UV" value={minutes === null ? 'not today' : fmtMinutes(minutes)} note="Projected forward with the hourly forecast, including today’s dose so far" />
      </Card>

      <Card>
        <Label>What’s measured vs assumed</Label>
        <Muted>From studies: SED and UV index definitions; Allaart clear-sky model; sunscreen photodegradation (Gonzalez 2007); burn thresholds by skin type (approximate).</Muted>
        <Muted>Fitted by us: the 3-layer cloud factor (to Open-Meteo model output, not ground instruments).</Muted>
        <Muted>Assumed: sunscreen wear rate (halves about every 1.4 h dry), the effect of applying less than the lab amount, shade strengths, the direct/scattered light split.</Muted>
      </Card>
      <Disclaimer />
    </Screen>
  );
}

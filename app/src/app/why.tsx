import { useMemo } from 'react';

import { Card, Disclaimer, Label, Muted, Row, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { bandFor, explainRate, worstOf } from '@/engine';
import { useConditions } from '@/hooks/use-conditions';
import { MED_SED, PRESETS, SHADES, SURFACES } from '@/model';
import { skinProfile, useStore } from '@/state/store';
import { fmtBurnRange, SITE_LABEL } from '@/utils/format';

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
    const proj = active && active.lastSunscreenAt ? ttb.sunscreenWorst : ttb.bareWorst;
    const band = bandFor(cond.ctx, cond.at);
    const hours = ((proj?.minutes ?? proj?.soonest ?? 60) as number) / 60;
    return { reading, settings, r, site, sza, proj, film, b: band ? band(hours) : null };
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

  const { reading, settings, r, site, sza, proj, film, b } = data;
  const cloud = reading.mode === 'forecast' ? reading.cmfObserved : reading.cmfLayers;
  const threshold = MED_SED[profile.skinType] * (active ? active.cUserAtSession : profile.cUser);

  return (
    <Screen tabbed={false}>
      <Card>
        <Label>The chain, right now</Label>
        <Line label={`Clear-sky UV (sun ${sza >= 90 ? 'below horizon' : `${Math.round(sza)}° from overhead`})`} value={reading.uviClearAllaart.toFixed(1)} note={reading.mode === 'forecast' ? 'Reference: Allaart/TEMIS at 300 DU ozone. The UV index itself uses CAMS clear sky (forecast ozone and aerosol), fitted to ground instruments' : 'Allaart/TEMIS model, 300 DU ozone'} />
        <Line
          label="× clouds"
          value={cloud === null ? '—' : cloud.toFixed(2)}
          note={reading.mode === 'forecast' ? `Implied: UV index ÷ the clear sky above (${reading.cloudSource === 'satellite' ? 'clouds from satellite' : 'clouds from the weather model'})` : 'Our fitted 3-layer cloud factor'}
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
        {r.wetSkin > 1 ? (
          <Line
            label="× wet skin"
            value={r.wetSkin.toFixed(2)}
            note={`${settings.activity === 'swimming' ? 'Swimming (sea, lake or pool)' : 'Sweating'} lowers your burn dose by about ${Math.round((1 - 1 / r.wetSkin) * 100)}% while the skin is wet; it fades over ~20 min once dry. From phototests after water baths and exercise.`}
          />
        ) : null}
        <Line label="= dose rate on skin" value={`${r.sedPerMin.toFixed(3)} SED/min`} note={`${r.sedPerMinUnprotected.toFixed(3)} SED/min without sunscreen`} />
        <Line label="Your estimated threshold" value={`${threshold.toFixed(1)} SED`} note={`Skin type ${['I', 'II', 'III', 'IV', 'V', 'VI'][profile.skinType - 1]} (${MED_SED[profile.skinType]} SED) × personal calibration ${(active ? active.cUserAtSession : profile.cUser).toFixed(2)}`} />
        <Line label="→ time left" value={proj ? fmtBurnRange(proj) : 'not today'} note="Projected forward with the forecast (and satellite, where available), including today’s dose so far" />
        {b ? (
          <Line
            label="UV uncertainty over that time"
            value={`${Math.round((b.lo - 1) * 100)}% to +${Math.round((b.hi - 1) * 100)}%`}
            note="80% range of measured vs predicted dose in a ground-instrument test. The earlier time assumes the high end; alerts do too. Covers UV only, not your skin."
          />
        ) : null}
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

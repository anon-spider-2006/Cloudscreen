import { router } from 'expo-router';
import { useMemo } from 'react';

import { ActivityPicker } from '@/components/cs/activity-picker';
import { Banner, Bar, Big, Button, Card, Disclaimer, keep, Label, LinkText, Muted, Row, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { fractionColor, uvCategory } from '@/constants/theme';
import { currentSPF, explainRate, skinDose } from '@/engine';
import { useNow } from '@/hooks/use-app';
import { useConditions } from '@/hooks/use-conditions';
import { useTheme } from '@/hooks/use-theme';
import { burnFraction } from '@/model';
import { skinProfile, useStore } from '@/state/store';
import { fmtBurnRange, fmtDuration, fmtMinutes, fmtPct, fmtSED, SITE_LABEL } from '@/utils/format';


export default function Track() {
  const c = useTheme();
  const now = useNow();
  const cond = useConditions();
  const s = useStore();
  const a = s.active;
  const profile = skinProfile(s.profile);

  const sites = useMemo(() => {
    if (!a) return [];
    return Object.entries(a.sites)
      .map(([site, st]) => ({ site, fraction: burnFraction(st!, { ...profile, cUser: a.cUserAtSession }) }))
      .sort((x, y) => y.fraction - x.fraction);
  }, [a, profile]);

  const settings = a ? a.settings : cond?.settings;

  const rate = useMemo(() => {
    if (!cond || !a) return null;
    const film = a.sites[a.worstSite]?.film ?? null;
    return explainRate(cond.reading, { ...a.settings, posture: a.worstSite }, film);
  }, [cond, a]);

  if (!cond) {
    return (
      <Screen>
        <ThemedText type="subtitle">Track</ThemedText>
        <Card>
          <ThemedText>Set a location in Profile first.</ThemedText>
        </Card>
      </Screen>
    );
  }

  const worst = sites[0];
  const ttbWorst = a?.status === 'active' && a.lastSunscreenAt ? cond.ttb.sunscreenWorst : cond.ttb.bareWorst;
  const cat = uvCategory(cond.reading.uvi);

  return (
    <Screen>
      <ThemedText type="subtitle">{a ? (a.status === 'paused' ? 'Paused' : 'Outside now') : 'Track'}</ThemedText>
      {s.banner ? <Banner text={`${s.banner}. Tap to dismiss.`} tone="danger" onPress={s.clearBanner} /> : null}

      {a ? (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Label>Session</Label>
              <Muted>
                UV {cond.reading.uvi.toFixed(1)} · {cat.label}
              </Muted>
            </Row>
            <Big>{fmtDuration((a.status === 'active' ? now - a.lastT : 0) / 1000 + a.outdoorSeconds)}</Big>
          </Card>

          <Card tone="sun">
            <Label>Estimated burn progress</Label>
            {sites.map((x) => (
              <Row key={x.site} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <ThemedText type={x === worst ? 'smallBold' : 'small'}>{SITE_LABEL[x.site]}</ThemedText>
                  <ThemedText type={x === worst ? 'smallBold' : 'small'} style={keep}>{fmtPct(x.fraction)}</ThemedText>
                </Row>
                <Bar fraction={x.fraction} color={fractionColor(x.fraction, c)} />
              </Row>
            ))}
            {worst && worst.fraction < 1 && ttbWorst ? (
              <ThemedText type="smallBold">
                {ttbWorst.soonest === null
                  ? 'Not expected to reach your estimated threshold before sunset.'
                  : `${SITE_LABEL[ttbWorst.site]} burn first · ${fmtBurnRange(ttbWorst)} more`}
              </ThemedText>
            ) : worst && worst.fraction >= 1 ? (
              <ThemedText type="smallBold" style={{ color: c.danger }}>
                Estimated threshold reached. Consider getting out of the sun.
              </ThemedText>
            ) : null}
            <LinkText onPress={() => router.push('/why')}>Why this number? ›</LinkText>
          </Card>

          <Card>
            <Label>Dose this session</Label>
            <Row style={{ justifyContent: 'space-between' }}>
              <ThemedText>On skin (with sunscreen)</ThemedText>
              <ThemedText type="smallBold" style={keep}>{fmtSED(skinDose(a).protectedSED)}</ThemedText>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted>Unprotected skin dose</Muted>
              <Muted style={keep}>{fmtSED(skinDose(a).unprotectedSED)}</Muted>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted>Ambient (flat surface)</Muted>
              <Muted style={keep}>{fmtSED(a.ambientSED)}</Muted>
            </Row>
            {rate ? (
              <Muted>
                Now: {rate.sedPerMin.toFixed(3)} SED/min on skin · sunscreen ≈ SPF {currentSPF(a).toFixed(1)}
                {a.lastSunscreenAt ? ` (applied ${fmtMinutes((now - a.lastSunscreenAt) / 60_000)} ago)` : ' (none)'}
              </Muted>
            ) : null}
            <Button kind="sun" title="Log sunscreen" onPress={() => router.push('/sunscreen')} />
          </Card>
        </>
      ) : (
        <Card tone="sun">
          <Label>If you go out now (est.)</Label>
          <ThemedText type="smallBold" style={{ fontSize: 20 }}>
            {cond.ttb.bareWorst.soonest === null ? 'Not expected to reach your threshold today' : `${SITE_LABEL[cond.ttb.bareWorst.site]}: ${fmtBurnRange(cond.ttb.bareWorst)} bare skin`}
          </ThemedText>
          <Muted>
            With SPF {s.profile.spf}: {cond.ttb.sunscreenWorst ? fmtBurnRange(cond.ttb.sunscreenWorst).replace(/^Not/, 'not') : 'not expected today'}
          </Muted>
        </Card>
      )}

      {settings ? (
        <Card>
          <ActivityPicker value={settings} onChange={s.setActivity} preferPreset={a ? a.preset : s.profile.preset} />
          {a ? <Muted>Changes apply from now on; the dose so far is kept.</Muted> : null}
        </Card>
      ) : null}

      {a ? (
        <Row>
          {a.status === 'active' ? (
            <Button kind="secondary" title="Pause" onPress={s.pause} style={{ flex: 1 }} />
          ) : (
            <Button title="Resume" onPress={s.resume} style={{ flex: 1 }} />
          )}
          <Button
            kind="danger"
            title="End"
            onPress={() => {
              const id = a.id;
              s.end();
              router.push({ pathname: '/session/[id]', params: { id } });
            }}
            style={{ flex: 1 }}
          />
        </Row>
      ) : (
        <Button title="Start outdoor session" onPress={s.start} accessibilityHint="Starts tracking your UV dose from now" />
      )}
      <Disclaimer />
    </Screen>
  );
}

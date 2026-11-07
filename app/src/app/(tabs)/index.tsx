import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { UVChart } from '@/components/cs/charts';
import { Banner, Bar, Big, Button, Card, Disclaimer, Label, LinkText, Muted, Row, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { fractionColor, uvCategory } from '@/constants/theme';
import { currentSPF, localDayKey, readAt, summarizeDays } from '@/engine';
import { useNow } from '@/hooks/use-app';
import { useConditions } from '@/hooks/use-conditions';
import { useTheme } from '@/hooks/use-theme';
import { PRESETS } from '@/model';
import { pendingCheckIn, skinProfile, useStore } from '@/state/store';
import { fmtMinutes, fmtPct, fmtSED, fmtShortDuration, fmtTime, SITE_LABEL } from '@/utils/format';

export default function Home() {
  const c = useTheme();
  const now = useNow();
  const cond = useConditions();
  const place = useStore((s) => s.place);
  const profile = useStore((s) => s.profile);
  const forecast = useStore((s) => s.forecast);
  const forecastError = useStore((s) => s.forecastError);
  const active = useStore((s) => s.active);
  const sessions = useStore((s) => s.sessions);
  const sunscreen = useStore((s) => s.sunscreen);
  const banner = useStore((s) => s.banner);
  const clearBanner = useStore((s) => s.clearBanner);
  const checkIns = useStore((s) => s.checkIns);
  const pending = pendingCheckIn({ checkIns, sessions });

  const today = useMemo(() => {
    const key = localDayKey(now);
    const list = [...sessions, ...(active ? [active] : [])].filter((s) => localDayKey(s.startedAt) === key);
    const [sum] = summarizeDays(list, skinProfile(profile));
    return sum ?? null;
  }, [sessions, active, now, profile]);

  const lastSunscreen = sunscreen.length ? sunscreen[sunscreen.length - 1] : null;

  const hourly = useMemo(() => {
    if (!cond) return [];
    const d = new Date(cond.at);
    d.setHours(6, 0, 0, 0);
    const pts = [];
    for (let h = 0; h < 15; h++) {
      const t = d.getTime() + h * 3_600_000;
      pts.push({ t, uvi: readAt(cond.ctx, t + 1_800_000).uvi });
    }
    return pts;
  }, [cond]);

  if (!place || !cond) {
    return (
      <Screen>
        <ThemedText type="subtitle">Cloudscreen</ThemedText>
        <Card>
          <ThemedText>Set a location to see UV and your time to burn.</ThemedText>
          <Button title="Choose location" onPress={() => router.push('/profile')} />
        </Card>
      </Screen>
    );
  }

  const { reading, ttb } = cond;
  const cat = uvCategory(reading.uvi);
  const mode = reading.mode;
  const stale = mode === 'forecast' && forecast ? now - forecast.fetchedAt > 3 * 3_600_000 && profile.uvMode === 'forecast' : false;
  const preset = PRESETS[profile.preset];
  const todayFraction = today?.peakFraction ?? 0;

  return (
    <Screen>
      <View>
        <ThemedText type="subtitle">Cloudscreen</ThemedText>
        <Muted>
          {place.name} · {mode === 'forecast' ? 'forecast' : mode === 'demo' ? 'demo (offline physics)' : 'physics fallback'}
          {forecast && mode === 'forecast' ? ` · updated ${fmtTime(forecast.fetchedAt)}` : ''}
        </Muted>
      </View>

      {banner ? <Banner text={`${banner}. Tap to dismiss.`} tone="danger" onPress={clearBanner} /> : null}
      {pending ? <Banner text="Morning check-in: any redness after yesterday? Tap to answer." onPress={() => router.push({ pathname: '/checkin', params: { day: pending.day } })} /> : null}
      {profile.uvMode === 'forecast' && mode === 'physics' ? (
        <Banner tone="tint" text={forecastError ? `Forecast unavailable (${forecastError}). Showing our physics estimate.` : 'No forecast for this time. Showing our physics estimate.'} />
      ) : null}
      {reading.clamped ? <Banner tone="tint" text="The forecast value looked wrong and was limited to a physically plausible range." /> : null}
      {stale ? <Banner tone="tint" text="Forecast data is more than 3 hours old." /> : null}

      <Card>
        <Label>Current UV index</Label>
        <Row style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Big color={cat.color}>{reading.uvi.toFixed(1)}</Big>
          <ThemedText type="smallBold" style={{ color: cat.color, fontSize: 18 }}>
            {cat.label}
          </ThemedText>
        </Row>
        <UVChart points={hourly} now={now} />
      </Card>

      <Card tone="sun">
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>Time to burn now (est.)</Label>
          <Muted>{preset.label}</Muted>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <ThemedText>Bare skin</ThemedText>
          <ThemedText type="smallBold" style={{ fontSize: 20 }}>
            {ttb.bareWorst.minutes === null ? 'Not expected today' : fmtMinutes(ttb.bareWorst.minutes)}
          </ThemedText>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <ThemedText>With SPF {profile.spf}</ThemedText>
          <ThemedText type="smallBold" style={{ fontSize: 20 }}>
            {ttb.sunscreenWorst?.minutes == null ? 'Not expected today' : fmtMinutes(ttb.sunscreenWorst.minutes)}
          </ThemedText>
        </Row>
        {ttb.bareWorst.minutes !== null ? <Muted>{SITE_LABEL[ttb.bareWorst.site]} burn first.</Muted> : <Muted>Not expected to reach your estimated threshold before sunset. That’s not a guarantee of no damage.</Muted>}
        <LinkText onPress={() => router.push('/why')}>Why this number? ›</LinkText>
      </Card>

      <Card>
        <Label>Today</Label>
        <Row style={{ justifyContent: 'space-between' }}>
          <ThemedText>Estimated burn progress</ThemedText>
          <ThemedText type="smallBold">{fmtPct(todayFraction)}</ThemedText>
        </Row>
        <Bar fraction={todayFraction} color={fractionColor(todayFraction, c)} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Skin dose (unprotected)</Muted>
          <Muted>{fmtSED(today?.unprotectedSED ?? 0)}</Muted>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Ambient dose (flat surface)</Muted>
          <Muted>{fmtSED(today?.ambientSED ?? 0)}</Muted>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Time outside</Muted>
          <Muted>{fmtShortDuration(today?.outdoorSeconds ?? 0)}</Muted>
        </Row>
        <Muted>1 SED (standard erythema dose) = 100 J/m² of sunburn-weighted UV. Fair skin typically reddens around 2.5–3 SED.</Muted>
      </Card>

      <Card>
        <Label>Sunscreen</Label>
        <ThemedText>
          {lastSunscreen ? `SPF ${lastSunscreen.spfLabel} · applied ${fmtTime(lastSunscreen.appliedAt)} (${fmtMinutes((now - lastSunscreen.appliedAt) / 60_000)} ago)` : 'None logged today'}
        </ThemedText>
        {active && active.lastSunscreenAt ? <Muted>Protection now about SPF {currentSPF(active).toFixed(1)}</Muted> : null}
        <Button kind="sun" title="Log sunscreen" onPress={() => router.push('/sunscreen')} />
      </Card>

      {active ? (
        <Button title={active.status === 'paused' ? 'Session paused · open' : 'Session running · open'} onPress={() => router.push('/track')} />
      ) : (
        <Button title="Start outdoor session" onPress={() => router.push('/track')} />
      )}
      <Button kind="secondary" title="Add time I was outside" onPress={() => router.push('/add-session')} />
      <Disclaimer />
    </Screen>
  );
}

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { SunMark } from '@/components/cs/sun-mark';
import { UVChart } from '@/components/cs/charts';
import { Banner, Bar, Big, Button, Card, Disclaimer, keep, Label, LinkText, Muted, Row, Screen, wrapRight } from '@/components/cs/ui';
import { Wordmark } from '@/components/cs/wordmark';
import { ThemedText } from '@/components/themed-text';
import { fractionColor, uvCategory } from '@/constants/theme';
import { activityLabel, currentSPF, localDayKey, readAt, summarizeDays } from '@/engine';
import { useNow } from '@/hooks/use-app';
import { useConditions } from '@/hooks/use-conditions';
import { useTheme } from '@/hooks/use-theme';
import { appTimeZone, atHour } from '@/utils/time';
import { pendingCheckIn, skinProfile, useStore } from '@/state/store';
import { fmtBurnRange, fmtDay, fmtMinutes, fmtPct, fmtSED, fmtShortDuration, fmtTime, SITE_LABEL } from '@/utils/format';

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
    const six = atHour(cond.at, 6);
    const pts = [];
    for (let h = 0; h < 15; h++) {
      const t = six + h * 3_600_000;
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
  const todayFraction = today?.peakFraction ?? 0;

  return (
    <Screen>
      <View style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', borderBottomWidth: 1, borderColor: c.border, paddingBottom: 16 }}>
          <Wordmark />
          <ThemedText type="small">{new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: appTimeZone() })}</ThemedText>
        </Row>
        <ThemedText type="title">Making your day a little brighter</ThemedText>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityHint="Change your location in Profile" style={{ gap: 2 }}>
          <ThemedText type="smallBold">{place.name.replace(' (demo)', '')}</ThemedText>
          <Muted>
            {mode === 'demo'
              ? 'Demo sky, offline'
              : mode === 'forecast' && forecast
                ? `${reading.cloudSource === 'satellite' ? 'Forecast with live satellite clouds' : 'Forecast'}, updated ${fmtTime(forecast.fetchedAt)}`
                : profile.uvMode === 'physics'
                  ? 'Cloudscreen’s own sky model'
                  : 'Offline estimate until the forecast loads'}
          </Muted>
        </Pressable>
      </View>

      {banner ? <Banner text={`${banner}. Tap to dismiss.`} tone="danger" onPress={clearBanner} /> : null}
      {pending ? <Banner text="Morning check-in: any redness after yesterday? Tap to answer." onPress={() => router.push({ pathname: '/checkin', params: { day: pending.day } })} /> : null}
      {profile.uvMode === 'forecast' && mode === 'physics' ? (
        <Banner tone="tint" text={forecastError ? `Couldn’t load the forecast (${forecastError}). Showing an offline estimate from Cloudscreen’s own model.` : 'No forecast for this time yet. Showing an offline estimate from Cloudscreen’s own model.'} />
      ) : null}
      {reading.clamped ? <Banner tone="tint" text="The forecast value looked wrong and was limited to a physically plausible range." /> : null}
      {stale ? <Banner tone="tint" text="Forecast data is more than 3 hours old." /> : null}

      <Card tone="sky">
        <Label>Under this sky</Label>
        <Muted>Current UV index</Muted>
        <Row style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Row style={{ flexWrap: 'wrap', flex: 1 }}><Big>{reading.uvi.toFixed(1)}</Big><SunMark size={96} /></Row>
          <ThemedText type="smallBold" style={{ color: c.text, fontSize: 18 }}>
            {cat.label}
          </ThemedText>
        </Row>
        <UVChart points={hourly} now={now} />
      </Card>

      <Card tone="sun">
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>Time to burn (est.)</Label>
          <Muted style={wrapRight}>{activityLabel(profile.preset, cond.settings)}</Muted>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <ThemedText style={keep}>Bare skin</ThemedText>
          <ThemedText type="smallBold" style={[wrapRight, { fontSize: 20 }]}>
            {fmtBurnRange(ttb.bareWorst)}
          </ThemedText>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <ThemedText style={keep}>With SPF {profile.spf}</ThemedText>
          <ThemedText type="smallBold" style={[wrapRight, { fontSize: 20 }]}>
            {ttb.sunscreenWorst ? fmtBurnRange(ttb.sunscreenWorst) : 'Not expected today'}
          </ThemedText>
        </Row>
        {ttb.bareWorst.soonest !== null ? (
          <Muted>
            {SITE_LABEL[ttb.bareWorst.site]} burn first.
            {ttb.bareWorst.minutes !== null && ttb.bareWorst.soonest !== ttb.bareWorst.minutes
              ? ` Most likely ${fmtMinutes(ttb.bareWorst.minutes)}; plan on the earlier time.`
              : ''}
          </Muted>
        ) : (
          <Muted>Not expected to reach your estimated threshold before sunset. That’s not a guarantee of no damage.</Muted>
        )}
        <LinkText onPress={() => router.push('/why')}>Why this number? ›</LinkText>
      </Card>

      <Card>
        <Label>Your day outside</Label>
        <Row style={{ justifyContent: 'space-between' }}>
          <ThemedText>Estimated burn progress</ThemedText>
          <ThemedText type="smallBold" style={keep}>{fmtPct(todayFraction)}</ThemedText>
        </Row>
        <Bar fraction={todayFraction} color={fractionColor(todayFraction, c)} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Skin dose (unprotected)</Muted>
          <Muted style={keep}>{fmtSED(today?.unprotectedSED ?? 0)}</Muted>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Ambient dose (flat surface)</Muted>
          <Muted style={keep}>{fmtSED(today?.ambientSED ?? 0)}</Muted>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Time outside</Muted>
          <Muted>{fmtShortDuration(today?.outdoorSeconds ?? 0)}</Muted>
        </Row>
        <Muted>1 SED (standard erythema dose) = 100 J/m² of sunburn-weighted UV.</Muted>
      </Card>

      <Card>
        <Label>A layer of care</Label>
        <ThemedText>
          {!lastSunscreen
            ? 'None logged today'
            : now - lastSunscreen.appliedAt < 12 * 3_600_000
              ? `SPF ${lastSunscreen.spfLabel}, put on at ${fmtTime(lastSunscreen.appliedAt)} (${fmtMinutes((now - lastSunscreen.appliedAt) / 60_000).replace('~', '')} ago)`
              : `None today. Last time: SPF ${lastSunscreen.spfLabel} on ${fmtDay(lastSunscreen.appliedAt)}`}
        </ThemedText>
        {active && active.lastSunscreenAt ? <Muted>Protection now about SPF {currentSPF(active).toFixed(1)}</Muted> : null}
        <Button kind="sun" title="Log sunscreen" onPress={() => router.push('/sunscreen')} />
      </Card>

      {active ? (
        <Button title={active.status === 'paused' ? 'Open your paused session' : 'Open your running session'} onPress={() => router.push('/track')} />
      ) : (
        <Button title="Start outdoor session" onPress={() => router.push('/track')} />
      )}
      <Button kind="secondary" title="Add time I was outside" onPress={() => router.push('/add-session')} />
      <Disclaimer />
    </Screen>
  );
}

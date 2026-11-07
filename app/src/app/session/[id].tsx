import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Platform } from 'react-native';

import { Bar, Button, Card, Disclaimer, Label, Muted, Row, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { fractionColor } from '@/constants/theme';
import { currentFraction, describeSettings, localDayKey, skinDose } from '@/engine';
import { useTheme } from '@/hooks/use-theme';
import { PRESETS } from '@/model';
import { skinProfile, useStore } from '@/state/store';
import { fmtDay, fmtPct, fmtSED, fmtShortDuration, fmtTime, SITE_LABEL } from '@/utils/format';

export default function SessionDetail() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useStore((s) => s.sessions.find((x) => x.id === id) ?? (s.active?.id === id ? s.active : null));
  const profile = useStore((s) => s.profile);
  const checkIn = useStore((s) => (session ? s.checkIns.find((x) => x.day === localDayKey(session.startedAt)) : undefined));
  const del = useStore((s) => s.deleteSession);

  if (!session) {
    return (
      <Screen tabbed={false}>
        <Card>
          <ThemedText>Session not found.</ThemedText>
        </Card>
      </Screen>
    );
  }

  const dose = skinDose(session);
  const { fraction, worst } = currentFraction(session, skinProfile(profile));
  const avgUVI = session.outdoorSeconds > 0 ? session.uviSeconds / session.outdoorSeconds : 0;

  const confirmDelete = () => {
    const go = () => {
      del(session.id);
      router.back();
    };
    if (Platform.OS === 'web') go();
    else Alert.alert('Delete session?', 'Daily totals will be recalculated.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };

  return (
    <Screen tabbed={false}>
      <Card>
        <Label>{fmtDay(session.startedAt)}</Label>
        <ThemedText type="smallBold" style={{ fontSize: 20 }}>
          {fmtTime(session.startedAt)}–{fmtTime(session.endedAt ?? session.lastT)} · {PRESETS[session.preset].label}
        </ThemedText>
        <Muted>
          {fmtShortDuration(session.outdoorSeconds)} outside · avg UV {avgUVI.toFixed(1)} · max UV {session.maxUVI.toFixed(1)}
        </Muted>
        {session.trackingMode === 'retroactive' ? <Muted>Added later · from forecast data (estimated)</Muted> : null}
        {session.usedFallback ? <Muted>Some intervals used the physics fallback (no forecast).</Muted> : null}
        {session.demo ? <Muted>Recorded in demo mode; not used for calibration.</Muted> : null}
      </Card>

      <Card tone="sun">
        <Label>Peak estimated burn progress</Label>
        <ThemedText type="smallBold" style={{ fontSize: 24 }}>
          {fmtPct(Math.max(fraction, session.peakFraction))} · {SITE_LABEL[worst]}
        </ThemedText>
        <Bar fraction={Math.max(fraction, session.peakFraction)} color={fractionColor(fraction, c)} />
        <Muted>Threshold used: skin type {['I', 'II', 'III', 'IV', 'V', 'VI'][profile.skinType - 1]} × {session.cUserAtSession.toFixed(2)} personal calibration</Muted>
      </Card>

      <Card>
        <Label>Dose</Label>
        <Row style={{ justifyContent: 'space-between' }}>
          <ThemedText>On skin, with sunscreen</ThemedText>
          <ThemedText type="smallBold">{fmtSED(dose.protectedSED)}</ThemedText>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Unprotected skin dose</Muted>
          <Muted>{fmtSED(dose.unprotectedSED)}</Muted>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Ambient (flat surface)</Muted>
          <Muted>{fmtSED(session.ambientSED)}</Muted>
        </Row>
      </Card>

      <Card>
        <Label>Timeline</Label>
        {session.events.map((e, i) => (
          <Row key={`${e.t}-${i}`} style={{ justifyContent: 'space-between' }}>
            <Muted>{fmtTime(e.t)}</Muted>
            <ThemedText type="small">
              {e.kind === 'settings' ? `Changed to ${e.detail}` : e.kind === 'sunscreen' ? `Sunscreen ${e.detail}` : `${e.kind[0].toUpperCase()}${e.kind.slice(1)}${e.detail ? ` · ${e.detail}` : ''}`}
            </ThemedText>
          </Row>
        ))}
        <Muted>Settings at end: {describeSettings(session.settings)}</Muted>
      </Card>

      {checkIn?.redness ? (
        <Card>
          <Label>Morning check-in</Label>
          <ThemedText>
            You said: {checkIn.redness === 'none' ? 'no redness' : checkIn.redness === 'pink' ? 'a little pink' : 'burned'} · calibration {checkIn.cUserBefore.toFixed(2)} → {checkIn.cUserAfter?.toFixed(2)}
          </ThemedText>
        </Card>
      ) : null}

      {session.status === 'completed' ? <Button kind="secondary" title="Delete session" onPress={confirmDelete} /> : null}
      <Muted>Model: {session.modelVersion}</Muted>
      <Disclaimer />
    </Screen>
  );
}

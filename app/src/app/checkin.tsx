import { router, useLocalSearchParams } from 'expo-router';

import { Button, Card, Label, Muted, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import type { Redness } from '@/model';
import { pendingCheckIn, useStore } from '@/state/store';
import { fmtDay, fmtPct } from '@/utils/format';

export default function CheckIn() {
  const params = useLocalSearchParams<{ day?: string }>();
  const checkIns = useStore((s) => s.checkIns);
  const sessions = useStore((s) => s.sessions);
  const answer = useStore((s) => s.answerCheckIn);
  const c = (params.day ? checkIns.find((x) => x.day === params.day && !x.answeredAt) : null) ?? pendingCheckIn({ checkIns, sessions });

  if (!c) {
    return (
      <Screen tabbed={false}>
        <Card>
          <ThemedText>No check-in waiting.</ThemedText>
          <Muted>After a day outside, Cloudscreen asks the next morning, when redness is easiest to judge.</Muted>
        </Card>
      </Screen>
    );
  }

  const go = (r: Redness) => {
    answer(c.day, r);
    router.back();
  };

  return (
    <Screen tabbed={false}>
      <Card tone="sun">
        <Label>{fmtDay(Date.parse(`${c.day}T12:00:00`))}</Label>
        <ThemedText type="smallBold" style={{ fontSize: 22 }}>
          Any redness from your time outside?
        </ThemedText>
        <Muted>We estimated you reached about {fmtPct(c.predictedFraction)} of your burn threshold. Your answer tunes future estimates.</Muted>
      </Card>
      <Button kind="secondary" title="No redness" onPress={() => go('none')} />
      <Button kind="sun" title="A little pink" onPress={() => go('pink')} />
      <Button kind="danger" title="Burned (sore or very red)" onPress={() => go('burned')} />
      <Muted>Redness from UV peaks 8–24 h after exposure, which is why we ask in the morning. Not a medical assessment.</Muted>
    </Screen>
  );
}

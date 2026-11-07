import { router } from 'expo-router';
import { useState } from 'react';
import { Switch } from 'react-native';

import { Button, Card, Chips, Label, Muted, Row, Screen } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import type { FilterType } from '@/model';
import { nowFor, useStore } from '@/state/store';

const WHEN = [
  { value: 0, label: 'Now' },
  { value: 15, label: '15 min ago' },
  { value: 30, label: '30 min ago' },
  { value: 60, label: '1 h ago' },
];

export default function LogSunscreen() {
  const profile = useStore((s) => s.profile);
  const log = useStore((s) => s.logSunscreen);
  const [spf, setSpf] = useState(profile.spf);
  const [filter, setFilter] = useState<FilterType>(profile.filter);
  const [amount, setAmount] = useState(profile.mgPerCm2);
  const [wr, setWr] = useState(profile.waterResistant);
  const [ago, setAgo] = useState(0);

  return (
    <Screen tabbed={false}>
      <Card>
        <Label>SPF on the label</Label>
        <Chips options={[15, 30, 50, 70, 100].map((v) => ({ value: v, label: `SPF ${v}` }))} value={spf} onChange={setSpf} />
        <Label>How much?</Label>
        <Chips
          options={[
            { value: 0.5, label: 'Light' },
            { value: 1, label: 'Typical' },
            { value: 2, label: 'Generous' },
          ]}
          value={amount}
          onChange={setAmount}
        />
        <Muted>SPF is tested at 2 mg/cm², about a shot glass for the whole body. Most people use half that.</Muted>
        <Label>Type</Label>
        <Chips
          options={[
            { value: 'photostable' as const, label: 'Mineral / photostable' },
            { value: 'chemical' as const, label: 'Chemical' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <Row style={{ justifyContent: 'space-between' }}>
          <ThemedText>Water resistant</ThemedText>
          <Switch value={wr} onValueChange={setWr} />
        </Row>
        <Label>When?</Label>
        <Chips options={WHEN} value={ago} onChange={setAgo} />
      </Card>
      <Button
        kind="sun"
        title="Save"
        onPress={() => {
          log({ spfLabel: spf, filter, mgPerCm2: amount, waterResistant: wr, appliedAt: nowFor(profile) - ago * 60_000 });
          router.back();
        }}
      />
      <Muted>Reapplying starts a fresh layer. It never lowers the dose you’ve already had.</Muted>
    </Screen>
  );
}

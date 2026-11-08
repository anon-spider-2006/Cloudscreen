import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { GlassSurface } from './glass';
import { Button, Row } from './ui';

export function PickerSheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const c = useTheme();
  return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 }}>
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: c.background, padding: 20, maxHeight: '85%', width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16,
          borderRadius: 24, borderWidth: 1, borderColor: c.glassBorder,
          shadowColor: c.glassShadow, shadowOpacity: 1, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
        }}>
        <ThemedText type="subtitle">{title}</ThemedText>
        {children}
        <Button title="Close" kind="secondary" onPress={onClose} />
      </View>
    </View>
  </Modal>;
}

export function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T | null; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return <View style={{ gap: 8 }}>
    <ThemedText type="smallBold">{label}</ThemedText>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label ?? 'Choose'}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)}>
      {({ pressed }) => (
        <GlassSurface radius={14} pressed={pressed} raised={false} style={{ minHeight: 48 }}>
          <Row style={{ justifyContent: 'space-between', padding: 14 }}>
            <ThemedText style={{ flexShrink: 1 }}>{selected?.label ?? 'Choose…'}</ThemedText>
            <ThemedText themeColor="textSecondary">⌄</ThemedText>
          </Row>
        </GlassSurface>
      )}
    </Pressable>
    <PickerSheet title={label} open={open} onClose={() => setOpen(false)}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {options.map((o) => <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: o.value === value }} onPress={() => { onChange(o.value); setOpen(false); }} style={{ marginBottom: 4 }}>
          {o.value === value
            ? <GlassSurface tone="sky" radius={12} raised={false}><ThemedText type="smallBold" style={{ padding: 14, fontSize: 16 }}>{o.label}</ThemedText></GlassSurface>
            : <ThemedText style={{ padding: 14, minHeight: 48 }}>{o.label}</ThemedText>}
        </Pressable>)}
      </ScrollView>
    </PickerSheet>
  </View>;
}

export function DateSelect({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(value).getMonth());
  const [year, setYear] = useState(() => new Date(value).getFullYear());
  const first = new Date(year, month, 1);
  const count = new Date(year, month + 1, 0).getDate();
  const move = (delta: number) => { const d = new Date(year, month + delta, 1); setMonth(d.getMonth()); setYear(d.getFullYear()); };
  return <View style={{ gap: 8 }}>
    <ThemedText type="smallBold">Date</ThemedText>
    <Button kind="secondary" title={new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })} onPress={() => { setMonth(new Date(value).getMonth()); setYear(new Date(value).getFullYear()); setOpen(true); }} />
    <PickerSheet title="Choose a date" open={open} onClose={() => setOpen(false)}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button title="‹" accessibilityHint="Previous month" kind="secondary" disabled={new Date(year, month, 1).getTime() <= new Date(new Date(min).getFullYear(), new Date(min).getMonth(), 1).getTime()} onPress={() => move(-1)} />
        <ThemedText>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</ThemedText>
        <Button title="›" accessibilityHint="Next month" kind="secondary" disabled={new Date(year, month + 1, 1).getTime() > max} onPress={() => move(1)} />
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <View key={i} style={{ width: '14.2857%', alignItems: 'center', paddingVertical: 8 }}><ThemedText type="small">{d}</ThemedText></View>)}
        {Array.from({ length: first.getDay() + count }, (_, i) => {
          const day = i - first.getDay() + 1;
          if (day < 1) return <View key={i} style={{ width: '14.2857%' }} />;
          const t = new Date(year, month, day).getTime();
          const disabled = t < min || t > max;
          return <Pressable key={i} disabled={disabled} accessibilityRole="button" accessibilityLabel={new Date(t).toDateString()} accessibilityState={{ disabled, selected: t === value }} onPress={() => { onChange(t); setOpen(false); }} style={{ width: '14.2857%', minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.25 : 1 }}>
            {t === value
              ? <GlassSurface tone="sky" radius={20} raised={false} style={{ width: 40, height: 40 }}><ThemedText type="smallBold" style={{ textAlign: 'center' }}>{day}</ThemedText></GlassSurface>
              : <ThemedText>{day}</ThemedText>}
          </Pressable>;
        })}
      </View>
      <ThemedText type="small">Added sessions currently support today and yesterday.</ThemedText>
    </PickerSheet>
  </View>;
}

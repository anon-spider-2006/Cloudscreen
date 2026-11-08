/**
 * One activity picker for every screen (Track, Add time outside, Forecast planner),
 * offering exactly the inputs the model distinguishes:
 *   preset (a bundle of the three below) · shade
 *   details: position (upright / lying) · ground (5 surfaces) · skin (dry / sweating / swimming)
 * Picking a preset sets the details; changing a detail turns it into "Custom".
 */
import { useState } from 'react';
import { View } from 'react-native';

import { Chips, Label, LinkText, Muted } from '@/components/cs/ui';
import { ThemedText } from '@/components/themed-text';
import { POSITION_CHOICES, POSITION_LABEL, presetMatching, SKIN_CHOICES, SKIN_HELP, SKIN_LABEL, describeSettings } from '@/engine';
import { PRESETS, SHADES, SURFACES, type ExposureSettings, type Preset, type Shade, type Surface } from '@/model';

const PRESET_OPTIONS = (Object.keys(PRESETS) as Preset[]).map((k) => ({ value: k, label: PRESETS[k].label }));
const SHADE_OPTIONS = (Object.keys(SHADES) as Shade[]).map((k) => ({ value: k, label: SHADES[k].label }));
const POSITION_OPTIONS = POSITION_CHOICES.map((k) => ({ value: k, label: POSITION_LABEL[k] }));
const SURFACE_OPTIONS = (Object.keys(SURFACES) as Surface[]).map((k) => ({ value: k, label: SURFACES[k].label }));
const SKIN_OPTIONS = SKIN_CHOICES.map((k) => ({ value: k, label: SKIN_LABEL[k] }));

export function ActivityPicker({
  value,
  onChange,
  title = 'What are you doing?',
  preferPreset,
}: {
  value: ExposureSettings;
  onChange: (x: ExposureSettings) => void;
  title?: string;
  /** When two presets match the same details, show this one as selected. */
  preferPreset?: Preset;
}) {
  const match = presetMatching(value, preferPreset);
  const [open, setOpen] = useState(match === null);
  const shade = value.shade ?? 'none';
  const set = (patch: Partial<ExposureSettings>) => onChange({ ...value, ...patch, shade: patch.shade ?? shade });
  const position = value.posture === 'shoulders' ? 'upright' : value.posture;
  const reflective = shade !== 'none' && ['sand', 'water', 'snow'].includes(value.surface);

  return (
    <View style={{ gap: 8 }}>
      <Label>{title}</Label>
      <Chips
        options={PRESET_OPTIONS}
        value={match}
        onChange={(p) => {
          const { posture, surface, activity } = PRESETS[p];
          onChange({ posture, surface, activity, shade });
        }}
      />
      {match === null ? <Muted>Custom: {describeSettings({ ...value, shade: 'none' })}</Muted> : null}
      <Label>Shade</Label>
      <Chips options={SHADE_OPTIONS} value={shade} onChange={(s) => set({ shade: s })} />
      {reflective ? <Muted>Shade on {SURFACES[value.surface].label.toLowerCase()} protects less: UV reflects up from the ground.</Muted> : null}
      <LinkText onPress={() => setOpen((o) => !o)}>{open ? 'Hide details' : 'Adjust details ›'}</LinkText>
      {open ? (
        <View style={{ gap: 8 }}>
          <Muted>Position</Muted>
          <Chips options={POSITION_OPTIONS} value={position} onChange={(posture) => set({ posture })} />
          <Muted>{position === 'lying' ? 'Facing up: the whole front gets the sky.' : 'Face, arms and shoulders are all tracked; shoulders usually burn first.'}</Muted>
          <Muted>Ground</Muted>
          <Chips options={SURFACE_OPTIONS} value={value.surface} onChange={(surface) => set({ surface })} />
          <Muted>Sweat or water</Muted>
          <Chips options={SKIN_OPTIONS} value={value.activity} onChange={(activity) => set({ activity })} />
          <ThemedText type="small">{SKIN_HELP[value.activity]}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

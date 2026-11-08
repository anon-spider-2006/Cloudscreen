import { useMemo, useState } from "react";
import { Pressable } from "react-native";

import { ActivityPicker } from "@/components/cs/activity-picker";
import { PlanStrip, UVChart } from "@/components/cs/charts";
import {
  Card,
  Chips,
  Disclaimer,
  Label,
  Muted,
  Row,
  Screen,
} from "@/components/cs/ui";
import { ThemedText } from "@/components/themed-text";
import { uvCategory } from "@/constants/theme";
import { planDay, readAt } from "@/engine";
import { useNow } from "@/hooks/use-app";
import { useTheme } from "@/hooks/use-theme";
import type { ExposureSettings } from "@/model";
import {
  defaultSunscreen,
  settingsFor,
  skinProfile,
  uvContext,
  useStore,
} from "@/state/store";
import {
  fmtDay,
  fmtMinutes,
  fmtPct,
  fmtSED,
  fmtTime,
  SITE_LABEL,
} from "@/utils/format";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180].map((m) => ({
  value: m,
  label: m < 60 ? `${m} min` : `${m / 60} h`,
}));

export default function Forecast() {
  const c = useTheme();
  const now = useNow();
  const place = useStore((s) => s.place);
  const forecast = useStore((s) => s.forecast);
  const profile = useStore((s) => s.profile);
  const shade = useStore((s) => s.shade);
  const custom = useStore((s) => s.custom);
  const satellite = useStore((s) => s.satellite);
  const [dayIdx, setDayIdx] = useState(1);
  const [duration, setDuration] = useState(45);
  // the planner's own copy, starting from what you last chose on Track
  const [activity, setActivity] = useState<ExposureSettings>(() =>
    settingsFor({ profile, shade, custom }),
  );
  const [withSunscreen, setWithSunscreen] = useState<"none" | "spf">("none");
  const [selected, setSelected] = useState<number | null>(null);
  const hourKey = Math.floor(now / 3_600_000);

  const ctx = useMemo(
    () => uvContext({ place, forecast, profile, satellite }),
    [place, forecast, profile, satellite],
  );

  const days = useMemo(() => {
    const out = [];
    const base = new Date(hourKey * 3_600_000);
    base.setHours(12, 0, 0, 0);
    for (let i = 0; i < 7; i++) out.push(base.getTime() + i * 86_400_000);
    return out;
  }, [hourKey]);

  const outlook = useMemo(() => {
    if (!ctx) return [];
    return days.map((noon) => {
      let peak = 0;
      let above3 = 0;
      const d0 = new Date(noon);
      d0.setHours(0, 0, 0, 0);
      for (let h = 5; h < 21; h++) {
        const u = readAt(ctx, d0.getTime() + h * 3_600_000 + 1_800_000).uvi;
        peak = Math.max(peak, u);
        if (u >= 3) above3 += 1;
      }
      return { noon, peak, above3 };
    });
  }, [ctx, days]);

  const hourly = useMemo(() => {
    if (!ctx) return [];
    const d = new Date(days[Math.min(dayIdx, 1)]);
    d.setHours(6, 0, 0, 0);
    return Array.from({ length: 15 }, (_, h) => {
      const t = d.getTime() + h * 3_600_000;
      return { t, uvi: readAt(ctx, t + 1_800_000).uvi };
    });
  }, [ctx, days, dayIdx]);

  const plan = useMemo(() => {
    if (!ctx) return null;
    return planDay({
      day: days[dayIdx],
      durationMin: duration,
      ctx,
      profile: skinProfile(profile),
      settings: activity,
      sunscreen:
        withSunscreen === "spf"
          ? defaultSunscreen(profile, days[dayIdx])
          : null,
    });
  }, [ctx, days, dayIdx, duration, activity, withSunscreen, profile]);

  if (!ctx) {
    return (
      <Screen>
        <ThemedText type="subtitle">Forecast</ThemedText>
        <Card>
          <ThemedText>Set a location in Profile first.</ThemedText>
        </Card>
      </Screen>
    );
  }

  const selectedSlot = plan?.slots.find((s) => s.start === selected) ?? null;
  const usingForecast = ctx.mode === "forecast" && !!ctx.forecast;

  return (
    <Screen>
      <ThemedText type="subtitle">Forecast</ThemedText>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Label>{dayIdx === 0 ? "Today" : "Tomorrow"} by hour</Label>
          <Chips
            options={[
              { value: 0, label: "Today" },
              { value: 1, label: "Tomorrow" },
            ]}
            value={Math.min(dayIdx, 1)}
            onChange={setDayIdx}
          />
        </Row>
        <UVChart points={hourly} now={now} />
        <Muted>
          {usingForecast
            ? "Open-Meteo forecast, cloud-adjusted."
            : ctx.mode === "demo"
              ? "Demo: our clear-sky model with your chosen clouds."
              : "No forecast: physics estimate."}
        </Muted>
      </Card>

      <Card>
        <Label>7-day outlook</Label>
        {outlook.map((d, i) => {
          const cat = uvCategory(d.peak);
          return (
            <Pressable
              key={d.noon}
              accessibilityRole="button"
              onPress={() => setDayIdx(i)}
            >
              <Row
                style={{ justifyContent: "space-between", paddingVertical: 4 }}
              >
                <ThemedText type={i === dayIdx ? "smallBold" : "small"}>
                  {i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmtDay(d.noon)}
                  {i >= 3 ? " · outlook" : ""}
                </ThemedText>
                <ThemedText type="small" style={{ color: cat.color }}>
                  peak {d.peak.toFixed(1)} {cat.label.toLowerCase()} ·{" "}
                  {d.above3} h ≥ 3
                </ThemedText>
              </Row>
            </Pressable>
          );
        })}
        <Muted>Days 3–7 are less reliable. Tap a day to plan it.</Muted>
      </Card>

      <Card tone="sun">
        <Label>
          Planner ·{" "}
          {dayIdx === 0
            ? "today"
            : dayIdx === 1
              ? "tomorrow"
              : fmtDay(days[dayIdx])}
        </Label>
        <Muted>How long?</Muted>
        <Chips options={DURATIONS} value={duration} onChange={setDuration} />
        <ActivityPicker
          title="Doing what?"
          value={activity}
          onChange={setActivity}
          preferPreset={profile.preset}
        />
        <Chips
          options={[
            { value: "none", label: "No sunscreen" },
            { value: "spf", label: `SPF ${profile.spf}` },
          ]}
          value={withSunscreen}
          onChange={setWithSunscreen}
        />
        {plan && plan.slots.length ? (
          <>
            <PlanStrip
              slots={plan.slots}
              selected={selected}
              lowest={plan.lowest}
              onSelect={setSelected}
            />
            <Muted>
              Bars: peak estimated burn progress by start time. Green =
              lowest-UV windows. Dashed line = your estimated threshold. Tap a
              bar.
            </Muted>
            <ThemedText type="smallBold">
              Lowest-UV windows: {windowsText(plan.lowest)}
            </ThemedText>
            {selectedSlot ? (
              <Card>
                <ThemedText type="smallBold">
                  Start {fmtTime(selectedSlot.start)} ·{" "}
                  {fmtPct(selectedSlot.peakFraction)} of your estimated
                  threshold
                </ThemedText>
                <Muted>
                  {SITE_LABEL[selectedSlot.worstSite]}:{" "}
                  {fmtSED(selectedSlot.skinSED)} on skin ·{" "}
                  {fmtSED(selectedSlot.ambientSED)} ambient
                  {selectedSlot.minutesToBurn !== null
                    ? ` · reaches threshold after ${fmtMinutes(selectedSlot.minutesToBurn)}`
                    : ""}
                </Muted>
              </Card>
            ) : null}
          </>
        ) : (
          <Muted>No daylight window long enough for that duration.</Muted>
        )}
        <Muted style={{ color: c.textSecondary }}>
          Lower estimated exposure is not a guarantee that sun protection is
          unnecessary.
        </Muted>
      </Card>
      <Disclaimer />
    </Screen>
  );
}

function windowsText(starts: number[]): string {
  if (starts.length === 0) return "—";
  const sorted = [...starts].sort((a, b) => a - b);
  const groups: [number, number][] = [];
  for (const t of sorted) {
    const g = groups[groups.length - 1];
    if (g && t - g[1] <= 30 * 60_000) g[1] = t;
    else groups.push([t, t]);
  }
  return (
    groups
      .map(([a, b]) => (a === b ? fmtTime(a) : `${fmtTime(a)}–${fmtTime(b)}`))
      .join(", ") + " starts"
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Activity = {
  id: number;
  activity_type: string;
  start_time: string;
  duration_seconds: number | null;
  distance_meters: number | null;
  elevation_gain_meters: number | null;
  elevation_loss_meters: number | null;
  notes: string | null;
};

type TrainingWeek = {
  start_date: string;
  planned_run_miles: number | null;
};

type Category = "run" | "rehab" | "foot" | "bike" | "other" | "strength";
type WeekSummary = {
  start: string;
  runMiles: number;
  rehabMiles: number;
  footMiles: number;
  bikeMiles: number;
  runVertFt: number;
  footVertFt: number;
  bikeVertFt: number;
  aerobicSeconds: number;
  runningSeconds: number;
  footSeconds: number;
  bikeSeconds: number;
  longestRun: number;
  longestRehab: number;
  plannedMiles: number | null;
  sessionCount: number;
  recordedVertCount: number;
};

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.280839895;
const TZ = "America/Los_Angeles";

function pacificDate(isoDate: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoDate));
  const get = (kind: string) => parts.find((part) => part.type === kind)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function mondayOf(dateText: string): string {
  const date = new Date(`${dateText}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function addDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shortDate(dateText: string): string {
  return new Date(`${dateText}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", day: "numeric",
  });
}

function distanceMiles(meters: number | null): number {
  return Math.max(0, (meters ?? 0) / METERS_PER_MILE);
}

function categoryFor(activity: Activity): Category {
  const type = activity.activity_type.toLowerCase();
  const notes = (activity.notes ?? "").toLowerCase();
  if (["strength", "core", "strength_conditioning"].includes(type)) return "strength";
  if (["cycling", "indoor_cycling", "outdoor_cycling", "bike"].includes(type)) return "bike";
  if (["walking", "hiking", "hike", "treadmill_walking"].includes(type)) return "foot";
  if (["rehab_run", "run_walk"].includes(type)) return "rehab";
  if (["running", "run", "trail_running"].includes(type)) return "run";
  if (type === "aerobic") {
    if (notes.includes("actual activity: indoor cycling") || notes.includes("actual activity: outdoor cycling")) return "bike";
    if (notes.includes("actual activity: walking") || notes.includes("actual activity: incline treadmill walking")) return "foot";
    // Generic "other aerobic" is not presumed to be running.
    if (notes.includes("actual activity: other_aerobic")) return "other";
    return "run"; // Legacy easy/long aerobic run entries.
  }
  return "other";
}

function emptyWeek(start: string, plannedMiles: number | null): WeekSummary {
  return {
    start, runMiles: 0, rehabMiles: 0, footMiles: 0, bikeMiles: 0,
    runVertFt: 0, footVertFt: 0, bikeVertFt: 0,
    aerobicSeconds: 0, runningSeconds: 0, footSeconds: 0, bikeSeconds: 0,
    longestRun: 0, longestRehab: 0, plannedMiles, sessionCount: 0,
    recordedVertCount: 0,
  };
}

function asHoursMinutes(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function fmt(value: number, decimals = 1): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
      {note && <p className="mt-1 text-[11px] leading-4 text-zinc-500">{note}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [weeks, setWeeks] = useState<TrainingWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weekCount, setWeekCount] = useState(8);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      const athlete = await supabase.from("athletes").select("id").eq("name", "Mike").single();
      if (!active) return;
      if (athlete.error || !athlete.data) {
        setError(athlete.error?.message ?? "Athlete not found.");
        setLoading(false);
        return;
      }

      // Paginate so older workouts are not silently lost at the 1,000-row limit.
      const loaded: Activity[] = [];
      for (let from = 0; ; from += 500) {
        const result = await supabase
          .from("activities")
          .select("id, activity_type, start_time, duration_seconds, distance_meters, elevation_gain_meters, elevation_loss_meters, notes")
          .eq("athlete_id", athlete.data.id)
          .eq("is_test", false)
          .order("start_time", { ascending: false })
          .range(from, from + 499);
        if (!active) return;
        if (result.error) {
          setError(result.error.message);
          setLoading(false);
          return;
        }
        const batch = (result.data ?? []) as Activity[];
        loaded.push(...batch);
        if (batch.length < 500) break;
      }

      const blockResult = await supabase
        .from("training_blocks")
        .select("id")
        .eq("athlete_id", athlete.data.id)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (blockResult.error) {
        setError(blockResult.error.message);
        setLoading(false);
        return;
      }
      let planned: TrainingWeek[] = [];
      if (blockResult.data) {
        const plannedResult = await supabase
          .from("training_weeks")
          .select("start_date, planned_run_miles")
          .eq("training_block_id", blockResult.data.id)
          .order("start_date", { ascending: true });
        if (!active) return;
        if (plannedResult.error) {
          setError(plannedResult.error.message);
          setLoading(false);
          return;
        }
        planned = (plannedResult.data ?? []) as TrainingWeek[];
      }
      setActivities(loaded);
      setWeeks(planned);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const allWeeks = useMemo(() => {
    const today = pacificDate(new Date().toISOString());
    const lastMonday = mondayOf(today);
    const oldestActivity = activities.length
      ? mondayOf(pacificDate(activities[activities.length - 1].start_time))
      : lastMonday;
    const first = oldestActivity < addDays(lastMonday, -77)
      ? oldestActivity : addDays(lastMonday, -77);
    const plans = new Map(weeks.map((week) => [week.start_date, week.planned_run_miles]));
    const map = new Map<string, WeekSummary>();
    for (let date = first; date <= lastMonday; date = addDays(date, 7)) {
      map.set(date, emptyWeek(date, plans.get(date) ?? null));
    }
    for (const activity of activities) {
      const weekStart = mondayOf(pacificDate(activity.start_time));
      const summary = map.get(weekStart) ?? emptyWeek(weekStart, plans.get(weekStart) ?? null);
      const category = categoryFor(activity);
      const miles = distanceMiles(activity.distance_meters);
      const duration = Math.max(0, activity.duration_seconds ?? 0);
      const vert = Math.max(0, activity.elevation_gain_meters ?? 0) * FEET_PER_METER;
      if (category !== "strength") {
        summary.sessionCount += 1;
        summary.aerobicSeconds += duration;
        if (activity.elevation_gain_meters !== null) summary.recordedVertCount += 1;
      }
      switch (category) {
        case "run":
          summary.runMiles += miles;
          summary.runningSeconds += duration;
          summary.runVertFt += vert;
          summary.longestRun = Math.max(summary.longestRun, miles);
          break;
        case "rehab":
          summary.rehabMiles += miles;
          summary.runningSeconds += duration;
          summary.runVertFt += vert;
          summary.longestRehab = Math.max(summary.longestRehab, miles);
          break;
        case "foot":
          summary.footMiles += miles;
          summary.footSeconds += duration;
          summary.footVertFt += vert;
          break;
        case "bike":
          summary.bikeMiles += miles;
          summary.bikeSeconds += duration;
          summary.bikeVertFt += vert;
          break;
      }
      map.set(weekStart, summary);
    }
    return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
  }, [activities, weeks]);

  const visibleWeeks = useMemo(() => allWeeks.slice(-weekCount), [allWeeks, weekCount]);
  const selected = useMemo(() => {
    return visibleWeeks.find((week) => week.start === selectedStart)
      ?? visibleWeeks[visibleWeeks.length - 1] ?? null;
  }, [selectedStart, visibleWeeks]);
  const fourWeeks = useMemo(() => {
    const selectionIndex = allWeeks.findIndex((week) => week.start === selected?.start);
    return selectionIndex < 0 ? [] : allWeeks.slice(Math.max(0, selectionIndex - 3), selectionIndex + 1);
  }, [allWeeks, selected]);
  const maxMiles = Math.max(1, ...visibleWeeks.map((week) => week.runMiles + week.rehabMiles));
  const maxVert = Math.max(1, ...visibleWeeks.map((week) => week.runVertFt + week.footVertFt));
  const selectedFootVert = (selected?.runVertFt ?? 0) + (selected?.footVertFt ?? 0);
  const fourWeekBikeVert = fourWeeks.reduce((sum, week) => sum + week.bikeVertFt, 0);
  const fourWeekMiles = fourWeeks.reduce((sum, week) => sum + week.runMiles, 0);
  const fourWeekRehab = fourWeeks.reduce((sum, week) => sum + week.rehabMiles, 0);
  const fourWeekVert = fourWeeks.reduce((sum, week) => sum + week.runVertFt + week.footVertFt, 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-8">
        <Link href="/history" className="text-sm font-medium text-emerald-400">← History</Link>
        <header className="mt-6 mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Ultra training</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Training Analytics</h1>
          <p className="mt-2 text-sm leading-5 text-zinc-500">Running, climbing, and aerobic volume. Weeks run Monday through Sunday, Pacific time.</p>
        </header>

        {error && <div className="mb-5 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-400">{error}</div>}
        {loading && <div className="rounded-xl bg-zinc-900 p-4 text-sm text-zinc-400">Loading training analytics...</div>}
        {!loading && !error && selected && (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <label className="text-xs font-semibold text-zinc-400" htmlFor="selected-week">Selected week</label>
              <select id="selected-week" value={selected.start} onChange={(event) => setSelectedStart(event.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
                {[...visibleWeeks].reverse().map((week) => <option key={week.start} value={week.start}>{shortDate(week.start)} – {shortDate(addDays(week.start, 6))}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Running miles" value={`${fmt(selected.runMiles)} mi`} note={selected.plannedMiles != null ? `${fmt(selected.plannedMiles)} mi planned` : "Continuous running"} />
              <Stat label="Climbing on foot" value={`${fmt(selectedFootVert, 0)} ft`} note="Running + rehab + hiking/walking" />
              <Stat label="Aerobic time" value={asHoursMinutes(selected.aerobicSeconds)} note="Running + walking + cycling + other" />
              <Stat label="Longest run" value={`${fmt(selected.longestRun)} mi`} note={selected.longestRehab > 0 ? `Longest rehab run/walk: ${fmt(selected.longestRehab)} mi` : "Longest continuous run"} />
            </div>

            <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="text-sm font-semibold">Weekly activity breakdown</h2>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-400"><span>Rehab run/walk</span><span>{fmt(selected.rehabMiles)} mi</span></div>
                <div className="flex justify-between text-zinc-400"><span>Walking / hiking</span><span>{fmt(selected.footMiles)} mi · {fmt(selected.footVertFt, 0)} ft climbed</span></div>
                <div className="flex justify-between text-zinc-400"><span>Cycling</span><span>{fmt(selected.bikeMiles)} mi · {asHoursMinutes(selected.bikeSeconds)} · {fmt(selected.bikeVertFt, 0)} ft vert</span></div>
                <div className="flex justify-between text-zinc-400"><span>Running + run/walk time</span><span>{asHoursMinutes(selected.runningSeconds)}</span></div>
              </div>
              {selected.recordedVertCount === 0 && <p className="mt-3 text-xs leading-5 text-amber-400">No elevation measurements recorded for this week. Vertical totals show zero recorded, not necessarily zero climbed.</p>}
            </section>

            <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Running mileage by week</h2>
                <select aria-label="Weeks shown" value={weekCount} onChange={(event) => setWeekCount(Number(event.target.value))} className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs">
                  <option value={8}>8 weeks</option><option value={12}>12 weeks</option>
                </select>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">Green: continuous running. Gray: rehab run/walk. Cycling and hiking excluded.</p>
              <div className="mt-5 space-y-3">
                {visibleWeeks.map((week) => (
                  <button key={week.start} type="button" onClick={() => setSelectedStart(week.start)} className={`grid w-full grid-cols-[50px_1fr_56px] items-center gap-2 rounded-lg p-1 text-left ${selected.start === week.start ? "bg-zinc-800" : ""}`}>
                    <span className="text-[11px] text-zinc-400">{shortDate(week.start)}</span>
                    <div className="flex h-3 overflow-hidden rounded-sm bg-zinc-950">
                      <div className="bg-emerald-500" style={{ width: `${(week.runMiles / maxMiles) * 100}%` }} />
                      <div className="bg-zinc-500" style={{ width: `${(week.rehabMiles / maxMiles) * 100}%` }} />
                    </div>
                    <span className="text-right text-xs tabular-nums text-zinc-300">{fmt(week.runMiles + week.rehabMiles)}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="text-sm font-semibold">Vertical gain by week</h2>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">Green: running and rehab. Gray: walking and hiking. Cycling climbing is reported separately and is not included in the bars.</p>
              <div className="mt-5 space-y-3">
                {visibleWeeks.map((week) => {
                  const onFoot = week.runVertFt + week.footVertFt;
                  return (
                    <button
                      key={week.start}
                      type="button"
                      onClick={() => setSelectedStart(week.start)}
                      aria-label={`${shortDate(week.start)}: ${Math.round(onFoot)} feet of recorded climbing on foot`}
                      className={`grid w-full grid-cols-[50px_1fr_64px] items-center gap-2 rounded-lg p-1 text-left ${selected.start === week.start ? "bg-zinc-800" : ""}`}
                    >
                      <span className="text-[11px] text-zinc-400">{shortDate(week.start)}</span>
                      <div className="flex h-3 overflow-hidden rounded-sm bg-zinc-950">
                        <div className="bg-emerald-500" style={{ width: `${week.runVertFt / maxVert * 100}%` }} />
                        <div className="bg-zinc-500" style={{ width: `${week.footVertFt / maxVert * 100}%` }} />
                      </div>
                      <span className="text-right text-xs tabular-nums text-zinc-300">{week.recordedVertCount === 0 ? "—" : fmt(onFoot, 0)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-[11px] text-zinc-500">A dash means elevation is unrecorded for the entire week; it does not mean zero climbing. Recorded totals may be incomplete when only some workouts have elevation.</p>
            </section>

            <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Four weeks ending {shortDate(addDays(selected.start, 6))}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><p className="text-xl font-semibold">{fmt(fourWeekMiles)} mi</p><p className="mt-1 text-xs text-zinc-500">Continuous running</p></div>
                <div><p className="text-xl font-semibold">{fmt(fourWeekRehab)} mi</p><p className="mt-1 text-xs text-zinc-500">Rehab run/walk</p></div>
                <div><p className="text-xl font-semibold">{fmt(fourWeekVert, 0)} ft</p><p className="mt-1 text-xs text-zinc-500">Climbing on foot</p></div>
                <div><p className="text-xl font-semibold">{asHoursMinutes(fourWeeks.reduce((sum, week) => sum + week.aerobicSeconds, 0))}</p><p className="mt-1 text-xs text-zinc-500">Total aerobic time</p></div>
              </div>
              <p className="mt-4 text-xs text-zinc-500">Cycling vertical (separate): {fmt(fourWeekBikeVert, 0)} ft</p>
            </section>
            <p className="mt-5 text-[11px] leading-5 text-zinc-500">Only non-test activities are included. Legacy “aerobic” sessions are treated as runs unless their notes identify a different activity. Rehab run/walk stays separate. Unknown elevation is not estimated. If a history entry is misclassified, correct its activity type rather than its planned workout.</p>
          </>
        )}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 py-2">
          <Link href="/" className="flex flex-col items-center gap-1 py-2 text-xs text-zinc-500"><span>●</span><span>Today</span></Link>
          <Link href="/week" className="flex flex-col items-center gap-1 py-2 text-xs text-zinc-500"><span>□</span><span>Week</span></Link>
          <Link href="/history" className="flex flex-col items-center gap-1 py-2 text-xs text-zinc-500"><span>◉</span><span>History</span></Link>
          <Link href="/analytics" className="flex flex-col items-center gap-1 py-2 text-xs text-emerald-400"><span>▥</span><span>Analytics</span></Link>
        </div>
      </nav>
    </div>
  );
}


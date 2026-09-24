"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  createDayAdaptation,
  type DayAdaptation,
} from "@/lib/dayAdaptation";

type Workout = {
  id: number;
  planned_date: string;
  name: string;
  workout_type: string;
  requirement_level: string;
  priority_level: string;
  estimated_duration_min: number | null;
  status: string;
};

type ReadinessCheckin = {
  available_minutes: number | null;
};

function getPacificDateString() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
}

function isStrengthWorkout(workoutType: string) {
  return workoutType.toLowerCase().includes("strength");
}

export default function ModifyDayPage() {
  const [adaptation, setAdaptation] =
    useState<DayAdaptation | null>(null);

  const [workoutsById, setWorkoutsById] =
    useState<Map<number, Workout>>(new Map());

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMessage("");

      const todayDate = getPacificDateString();

      const { data: workoutData, error: workoutError } =
        await supabase
          .from("planned_workouts")
          .select(
            `
            id,
            planned_date,
            name,
            workout_type,
            requirement_level,
            priority_level,
            estimated_duration_min,
            status
          `
          )
          .eq("planned_date", todayDate)
          .neq("status", "completed")
          .order("id", { ascending: true });

      if (workoutError) {
        setErrorMessage(workoutError.message);
        setLoading(false);
        return;
      }

      const workouts =
        (workoutData as Workout[] | null) ?? [];

      if (workouts.length === 0) {
        setErrorMessage(
          "There are no unfinished workouts scheduled for today."
        );
        setLoading(false);
        return;
      }

      const workoutMap = new Map<number, Workout>();

      workouts.forEach((workout) => {
        workoutMap.set(workout.id, workout);
      });

      setWorkoutsById(workoutMap);

      const { data: readinessData, error: readinessError } =
        await supabase
          .from("readiness_checkins")
          .select("available_minutes")
          .eq("athlete_id", 1)
          .eq("checkin_date", todayDate)
          .maybeSingle();

      if (readinessError) {
        setErrorMessage(readinessError.message);
        setLoading(false);
        return;
      }

      const readiness =
        readinessData as ReadinessCheckin | null;

      if (readiness?.available_minutes == null) {
        setErrorMessage(
          "No time limit is set in today's readiness check-in."
        );
        setLoading(false);
        return;
      }

      const result = createDayAdaptation(
        workouts.map((workout) => ({
          id: workout.id,
          name: workout.name,
          requirementLevel:
            workout.requirement_level,
          priorityLevel:
            workout.priority_level,
          estimatedDurationMin:
            workout.estimated_duration_min,
        })),
        readiness.available_minutes
      );

      setAdaptation(result);
      setLoading(false);
    }

    loadData();
  }, []);

  const keptCount = useMemo(() => {
    if (!adaptation) return 0;

    return adaptation.workouts.filter(
      (workout) => workout.status === "keep"
    ).length;
  }, [adaptation]);

  const shortenedCount = useMemo(() => {
    if (!adaptation) return 0;

    return adaptation.workouts.filter(
      (workout) => workout.status === "shorten"
    ).length;
  }, [adaptation]);

  const skippedCount = useMemo(() => {
    if (!adaptation) return 0;

    return adaptation.workouts.filter(
      (workout) => workout.status === "skip"
    ).length;
  }, [adaptation]);

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto w-full max-w-md">
          <p className="text-sm text-zinc-500">
            Building today&apos;s modified plan...
          </p>
        </div>
      </main>
    );
  }

  if (errorMessage || !adaptation) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto w-full max-w-md">
          <Link
            href="/"
            className="text-sm font-medium text-emerald-400"
          >
            ← Back to Today
          </Link>

          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/30 p-4">
            <p className="text-sm text-red-400">
              {errorMessage ||
                "Could not build today's modified plan."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-12 pt-8 text-zinc-100">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="text-sm font-medium text-emerald-400"
        >
          ← Back to Today
        </Link>

        <header className="mt-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-400">
            Modified day preview
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Today&apos;s training
          </h1>

          <p className="mt-2 text-sm leading-6 text-zinc-500">
            This version prioritizes the most important
            training within the time you have available.
          </p>
        </header>

        <section className="mt-6 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-center">
            <p className="text-[9px] uppercase tracking-wide text-zinc-600">
              Original
            </p>

            <p className="mt-1 text-lg font-semibold">
              {adaptation.originalPlannedMinutes}
              {adaptation.hasUnknownDuration ? "+" : ""}
            </p>

            <p className="text-[10px] text-zinc-500">
              min
            </p>
          </div>

          <div className="rounded-xl border border-orange-900 bg-orange-950/20 p-3 text-center">
            <p className="text-[9px] uppercase tracking-wide text-orange-500">
              Available
            </p>

            <p className="mt-1 text-lg font-semibold text-orange-300">
              {adaptation.availableMinutes}
            </p>

            <p className="text-[10px] text-orange-700">
              min
            </p>
          </div>

          <div className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-3 text-center">
            <p className="text-[9px] uppercase tracking-wide text-emerald-500">
              Modified
            </p>

            <p className="mt-1 text-lg font-semibold text-emerald-300">
              {adaptation.adaptedPlannedMinutes}
            </p>

            <p className="text-[10px] text-emerald-700">
              min
            </p>
          </div>
        </section>

        {adaptation.hasUnknownDuration && (
          <p className="mt-2 text-[10px] leading-4 text-zinc-600">
            + At least one scheduled session does not have
            a defined planned duration.
          </p>
        )}

        <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600">
            Changes
          </p>

          <div className="mt-3 flex gap-4 text-xs">
            <span className="text-emerald-400">
              {keptCount} kept
            </span>

            <span className="text-orange-400">
              {shortenedCount} shortened
            </span>

            <span className="text-zinc-500">
              {skippedCount} skipped
            </span>
          </div>
        </section>

        <section className="mt-6 space-y-3">
          {adaptation.workouts.map((workout) => {
            const sourceWorkout =
              workoutsById.get(workout.id);

            const workoutType =
              sourceWorkout?.workout_type ?? "";

            const canShowDetailedShortenedVersion =
              workout.status === "shorten" &&
              isStrengthWorkout(workoutType);

            return (
              <div
                key={workout.id}
                className={`rounded-xl border p-4 ${
                  workout.status === "keep"
                    ? "border-emerald-900 bg-emerald-950/20"
                    : workout.status === "shorten"
                    ? "border-orange-900 bg-orange-950/20"
                    : "border-zinc-800 bg-zinc-900 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[9px] uppercase tracking-wide text-zinc-600">
                        {workout.requirementLevel}
                      </span>

                      <span className="text-[9px] text-zinc-600">
                        {workout.priorityLevel} priority
                      </span>
                    </div>

                    <h2 className="mt-1 text-base font-semibold">
                      {workout.name}
                    </h2>
                  </div>

                  <span
                    className={`rounded px-2 py-1 text-[9px] font-semibold uppercase ${
                      workout.status === "keep"
                        ? "bg-emerald-900/60 text-emerald-400"
                        : workout.status === "shorten"
                        ? "bg-orange-900/60 text-orange-400"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {workout.status}
                  </span>
                </div>

                <div className="mt-3">
                  {workout.status === "skip" ? (
                    <p className="text-sm text-zinc-500">
                      Skip today
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-300">
                      {workout.adaptedMinutes} min
                      {workout.originalMinutes !== null &&
                      workout.adaptedMinutes !==
                        workout.originalMinutes
                        ? ` · reduced from ${workout.originalMinutes} min`
                        : ""}
                    </p>
                  )}

                  {workout.originalMinutes === null &&
                    workout.status !== "skip" && (
                      <p className="mt-1 text-[10px] text-zinc-600">
                        Planned duration not defined
                      </p>
                    )}

                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {workout.reason}
                  </p>
                </div>

                {canShowDetailedShortenedVersion && (
                  <Link
                    href={`/workout/${workout.id}/modify`}
                    className="mt-4 block w-full rounded-lg border border-orange-900 py-3 text-center text-xs font-semibold text-orange-400 transition hover:bg-orange-950/30"
                  >
                    View shortened workout
                  </Link>
                )}

                {workout.status === "shorten" &&
                  !canShowDetailedShortenedVersion && (
                    <Link
                      href={`/workout/${workout.id}`}
                      className="mt-4 block w-full rounded-lg border border-orange-900 py-3 text-center text-xs font-semibold text-orange-400 transition hover:bg-orange-950/30"
                    >
                      View required session
                    </Link>
                  )}

                {workout.status === "keep" && (
                  <Link
                    href={`/workout/${workout.id}`}
                    className="mt-4 block w-full rounded-lg border border-emerald-900 py-3 text-center text-xs font-semibold text-emerald-400 transition hover:bg-emerald-950/30"
                  >
                    View workout
                  </Link>
                )}
              </div>
            );
          })}
        </section>

        <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs leading-5 text-zinc-500">
            This is a preview only. Your scheduled workouts
            have not been changed.
          </p>
        </section>
      </div>
    </main>
  );
}
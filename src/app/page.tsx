"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getTrainingRecommendation,
  type TrainingRecommendation,
} from "@/lib/trainingRecommendation";

type Workout = {
  id: number;
  training_week_id: number | null;
  planned_date: string;
  name: string;
  workout_type: string;
  requirement_level: string;
  priority_level: string;
  estimated_duration_min: number | null;
  status: string;
};

type TrainingBlock = {
  id: number;
  name: string;
  phase: string | null;
};

type TrainingWeek = {
  id: number;
  training_block_id: number;
  week_number: number;
  start_date: string;
};

type WorkoutActivityMatch = {
  planned_workout_id: number;
  activity_id: number;
};

type CompletedSet = {
  activity_id: number;
};

type ReadinessCheckin = {
  id: number;
  athlete_id: number;
  checkin_date: string;
  sleep_quality: number | null;
  energy: number | null;
  soreness: number | null;
  injury_status: number | null;
  motivation: number | null;
  available_minutes: number | null;
  notes: string | null;
};

function averageReadiness(checkin: ReadinessCheckin) {
  const scores = [
    checkin.sleep_quality,
    checkin.energy,
    checkin.soreness,
    checkin.injury_status,
    checkin.motivation,
  ].filter((value): value is number => value != null);

  if (scores.length === 0) return null;

  return (
    scores.reduce((sum, value) => sum + value, 0) /
    scores.length
  );
}

function readinessLabel(score: number | null) {
  if (score == null) return "No score";
  if (score >= 4.2) return "Feeling strong";
  if (score >= 3.4) return "Ready to train";
  if (score >= 2.6) return "Some caution";
  return "Recovery may need attention";
}

function recommendationStyles(
  level: TrainingRecommendation["level"]
) {
  switch (level) {
    case "proceed":
      return {
        border: "border-emerald-900",
        background: "bg-emerald-950/30",
        label: "text-emerald-400",
        badge: "bg-emerald-900/60 text-emerald-400",
      };

    case "caution":
      return {
        border: "border-amber-900",
        background: "bg-amber-950/20",
        label: "text-amber-400",
        badge: "bg-amber-900/50 text-amber-400",
      };

    case "modify":
      return {
        border: "border-orange-900",
        background: "bg-orange-950/20",
        label: "text-orange-400",
        badge: "bg-orange-900/50 text-orange-400",
      };

    case "recover":
      return {
        border: "border-red-900",
        background: "bg-red-950/20",
        label: "text-red-400",
        badge: "bg-red-900/50 text-red-400",
      };
  }
}

export default function Home() {
  const pathname = usePathname();

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [matches, setMatches] =
    useState<WorkoutActivityMatch[]>([]);
  const [completedSets, setCompletedSets] =
    useState<CompletedSet[]>([]);
  const [readiness, setReadiness] =
    useState<ReadinessCheckin | null>(null);

  const [trainingBlock, setTrainingBlock] =
    useState<TrainingBlock | null>(null);

  const [trainingWeeks, setTrainingWeeks] =
    useState<TrainingWeek[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setErrorMessage("");

      const todayDate = new Date().toLocaleDateString(
        "en-CA",
        {
          timeZone: "America/Los_Angeles",
        }
      );

      const {
        data: blockData,
        error: blockError,
      } = await supabase
        .from("training_blocks")
        .select("id, name, phase")
        .eq("athlete_id", 1)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (blockError) {
        setErrorMessage(blockError.message);
        setLoading(false);
        return;
      }

      const loadedBlock =
        (blockData as TrainingBlock | null) ?? null;

      setTrainingBlock(loadedBlock);

      if (loadedBlock) {
        const {
          data: weekData,
          error: weekError,
        } = await supabase
          .from("training_weeks")
          .select(
            `
            id,
            training_block_id,
            week_number,
            start_date
          `
          )
          .eq("training_block_id", loadedBlock.id)
          .order("week_number", { ascending: true });

        if (weekError) {
          setErrorMessage(weekError.message);
          setLoading(false);
          return;
        }

        setTrainingWeeks(
          (weekData as TrainingWeek[] | null) ?? []
        );
      } else {
        setTrainingWeeks([]);
      }

      const { data: workoutData, error: workoutError } =
        await supabase
          .from("planned_workouts")
          .select(
            `
            id,
            training_week_id,
            planned_date,
            name,
            workout_type,
            requirement_level,
            priority_level,
            estimated_duration_min,
            status
          `
          )
          .order("planned_date", { ascending: true })
          .order("id", { ascending: true });

      if (workoutError) {
        setErrorMessage(workoutError.message);
        setLoading(false);
        return;
      }

      const loadedWorkouts =
        (workoutData as Workout[] | null) ?? [];

      setWorkouts(loadedWorkouts);

      const workoutIds = loadedWorkouts.map(
        (workout) => workout.id
      );

      if (workoutIds.length > 0) {
        const { data: matchData, error: matchError } =
          await supabase
            .from("workout_activity_matches")
            .select("planned_workout_id, activity_id")
            .in("planned_workout_id", workoutIds);

        if (matchError) {
          setErrorMessage(matchError.message);
          setLoading(false);
          return;
        }

        const loadedMatches =
          (matchData as WorkoutActivityMatch[] | null) ?? [];

        setMatches(loadedMatches);

        const activityIds = loadedMatches.map(
          (match) => match.activity_id
        );

        if (activityIds.length > 0) {
          const { data: setData, error: setError } =
            await supabase
              .from("completed_sets")
              .select("activity_id")
              .in("activity_id", activityIds);

          if (setError) {
            setErrorMessage(setError.message);
            setLoading(false);
            return;
          }

          setCompletedSets(
            (setData as CompletedSet[] | null) ?? []
          );
        } else {
          setCompletedSets([]);
        }
      } else {
        setMatches([]);
        setCompletedSets([]);
      }

      const { data: readinessData, error: readinessError } =
        await supabase
          .from("readiness_checkins")
          .select(
            `
            id,
            athlete_id,
            checkin_date,
            sleep_quality,
            energy,
            soreness,
            injury_status,
            motivation,
            available_minutes,
            notes
          `
          )
          .eq("athlete_id", 1)
          .eq("checkin_date", todayDate)
          .maybeSingle();

      if (readinessError) {
        setErrorMessage(readinessError.message);
        setLoading(false);
        return;
      }

      const loadedReadiness =
        (readinessData as ReadinessCheckin | null) ?? null;

      setReadiness(loadedReadiness);

      if (
        loadedReadiness &&
        loadedReadiness.sleep_quality !== null &&
        loadedReadiness.energy !== null &&
        loadedReadiness.soreness !== null &&
        loadedReadiness.injury_status !== null &&
        loadedReadiness.motivation !== null
      ) {
        const activeWorkouts = loadedWorkouts.filter(
          (workout) =>
            workout.planned_date === todayDate &&
            workout.status !== "completed"
        );

        if (activeWorkouts.length > 0) {
          const generatedRecommendation =
            getTrainingRecommendation(
              {
                sleepQuality:
                  loadedReadiness.sleep_quality,
                energy: loadedReadiness.energy,
                soreness: loadedReadiness.soreness,
                injuryStatus:
                  loadedReadiness.injury_status,
                motivation:
                  loadedReadiness.motivation,
                availableMinutes:
                  loadedReadiness.available_minutes,
              },
              activeWorkouts.map((workout) => ({
                name: workout.name,
                requirementLevel:
                  workout.requirement_level,
                priorityLevel:
                  workout.priority_level,
                estimatedDurationMin:
                  workout.estimated_duration_min,
              }))
            );

          const { error: recommendationError } =
            await supabase
              .from("training_recommendations")
              .upsert(
                {
                  athlete_id: 1,
                  recommendation_date: todayDate,
                  readiness_checkin_id:
                    loadedReadiness.id,
                  recommendation_level:
                    generatedRecommendation.level,
                  headline:
                    generatedRecommendation.headline,
                  reasoning:
                    generatedRecommendation.reasoning,
                  readiness_score:
                    Number(
                      generatedRecommendation.readinessScore.toFixed(
                        2
                      )
                    ),
                  injury_score:
                    loadedReadiness.injury_status,
                  available_minutes:
                    loadedReadiness.available_minutes,
                  updated_at: new Date().toISOString(),
                },
                {
                  onConflict:
                    "athlete_id,recommendation_date",
                }
              );

          if (recommendationError) {
            console.error(
              "Recommendation save error:",
              recommendationError
            );
          }
        }
      }

      setLoading(false);
    }

    loadDashboard();
  }, [pathname]);

  const todayDate = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });

  const todayLabel = new Date().toLocaleDateString(
    "en-US",
    {
      timeZone: "America/Los_Angeles",
      weekday: "long",
      month: "short",
      day: "numeric",
    }
  );

  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );

  let greeting = "Good evening";

  if (hour < 12) {
    greeting = "Good morning";
  } else if (hour < 17) {
    greeting = "Good afternoon";
  }

  const todayWorkouts = workouts.filter(
    (workout) => workout.planned_date === todayDate
  );

  const activeTodayWorkouts = todayWorkouts
    .filter(
      (workout) =>
        workout.status !== "completed"
    )
    .sort((a, b) => {
      const requirementRank = {
        required: 0,
        target: 1,
        optional: 2,
      } as Record<string, number>;

      const priorityRank = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      } as Record<string, number>;

      return (
        (requirementRank[a.requirement_level] ?? 9) -
          (requirementRank[b.requirement_level] ?? 9) ||
        (priorityRank[a.priority_level] ?? 9) -
          (priorityRank[b.priority_level] ?? 9) ||
        a.id - b.id
      );
    });

  const currentTrainingWeek =
    trainingWeeks.find((week) => {
      const start = week.start_date;
      const startDate = new Date(
        `${start}T12:00:00`
      );

      startDate.setDate(
        startDate.getDate() + 6
      );

      const end = startDate.toLocaleDateString(
        "en-CA",
        {
          timeZone:
            "America/Los_Angeles",
        }
      );

      return (
        todayDate >= start &&
        todayDate <= end
      );
    }) ?? null;

  const thisWeekWorkouts =
    currentTrainingWeek
      ? workouts.filter(
          (workout) =>
            workout.training_week_id ===
            currentTrainingWeek.id
        )
      : [];

  const thisWeekCompleted =
    thisWeekWorkouts.filter(
      (workout) =>
        workout.status === "completed"
    ).length;

  const nextWorkout =
    activeTodayWorkouts[0] ?? null;

  const activityIdsByWorkout = useMemo(() => {
    const map = new Map<number, number[]>();

    matches.forEach((match) => {
      const existing =
        map.get(match.planned_workout_id) ?? [];

      existing.push(match.activity_id);

      map.set(match.planned_workout_id, existing);
    });

    return map;
  }, [matches]);

  function getCompletedSetCount(workoutId: number) {
    const activityIds =
      activityIdsByWorkout.get(workoutId) ?? [];

    return completedSets.filter((set) =>
      activityIds.includes(set.activity_id)
    ).length;
  }

  function formatDay(dateString: string) {
    const date = new Date(`${dateString}T12:00:00`);

    return date.toLocaleDateString("en-US", {
      weekday: "short",
    });
  }

  function formatWorkoutType(value: string) {
    return value.replaceAll("_", " ");
  }

  const readinessScore = readiness
    ? averageReadiness(readiness)
    : null;

  let recommendation: TrainingRecommendation | null = null;

  if (
    readiness &&
    readiness.sleep_quality !== null &&
    readiness.energy !== null &&
    readiness.soreness !== null &&
    readiness.injury_status !== null &&
    readiness.motivation !== null &&
    activeTodayWorkouts.length > 0
  ) {
    recommendation = getTrainingRecommendation(
      {
        sleepQuality: readiness.sleep_quality,
        energy: readiness.energy,
        soreness: readiness.soreness,
        injuryStatus: readiness.injury_status,
        motivation: readiness.motivation,
        availableMinutes: readiness.available_minutes,
      },
      activeTodayWorkouts.map((workout) => ({
        name: workout.name,
        requirementLevel: workout.requirement_level,
        priorityLevel: workout.priority_level,
        estimatedDurationMin:
          workout.estimated_duration_min,
      }))
    );
  }

  const recommendationStyle = recommendation
    ? recommendationStyles(recommendation.level)
    : null;

  const singleModifiedWorkout =
    recommendation?.level === "modify" &&
    activeTodayWorkouts.length === 1
      ? activeTodayWorkouts[0]
      : null;

  const showDayModification =
    recommendation?.level === "modify" &&
    activeTodayWorkouts.length > 1;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-8">
        <header className="mb-5">
          <p className="text-xs text-zinc-500">
            {todayLabel}
          </p>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {greeting}, Mike
          </h1>

          <p className="mt-1 text-xs text-zinc-500">
            {trainingBlock?.name ?? "Training plan"}
            {currentTrainingWeek
              ? ` · Week ${currentTrainingWeek.week_number}`
              : ""}
          </p>

          {trainingBlock?.phase && (
            <p className="mt-2 text-[10px] uppercase tracking-widest text-zinc-600">
              {trainingBlock.phase}
            </p>
          )}
        </header>

        {!loading && nextWorkout && (
          <section
            className={`mb-4 rounded-2xl border p-4 ${
              nextWorkout.requirement_level === "required"
                ? "border-emerald-900 bg-emerald-950/30"
                : "border-zinc-800 bg-zinc-900"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-widest text-emerald-400">
                  Next up
                </p>

                <h2 className="mt-2 text-xl font-semibold">
                  {nextWorkout.name}
                </h2>

                <p className="mt-1 text-xs capitalize text-zinc-500">
                  {formatWorkoutType(
                    nextWorkout.workout_type
                  )}
                  {nextWorkout.estimated_duration_min
                    ? ` · ${nextWorkout.estimated_duration_min} min`
                    : ""}
                </p>
              </div>

              <span
                className={`rounded px-2 py-1 text-[9px] font-semibold uppercase ${
                  nextWorkout.requirement_level === "required"
                    ? "bg-emerald-900/60 text-emerald-400"
                    : "bg-sky-950 text-sky-400"
                }`}
              >
                {nextWorkout.requirement_level}
              </span>
            </div>

            <Link
              href={`/workout/${nextWorkout.id}`}
              className="mt-4 block w-full rounded-xl bg-emerald-500 py-3 text-center text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Open workout
            </Link>
          </section>
        )}

        <section className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Readiness
              </p>

              {readiness ? (
                <>
                  <p className="mt-1 text-sm font-medium text-zinc-200">
                    {readinessLabel(readinessScore)}
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    Avg {readinessScore?.toFixed(1)} / 5
                    {readiness.available_minutes != null
                      ? ` · ${readiness.available_minutes} min available`
                      : ""}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-zinc-300">
                  Not checked in
                </p>
              )}
            </div>

            <Link
              href="/checkin"
              className="rounded-lg bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-900"
            >
              {readiness ? "Update" : "Check in"}
            </Link>
          </div>

          {readiness && (
            <div className="mt-4 grid grid-cols-5 gap-2">
              {[
                ["Sleep", readiness.sleep_quality],
                ["Energy", readiness.energy],
                ["Sore", readiness.soreness],
                ["Knee", readiness.injury_status],
                ["Motiv.", readiness.motivation],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg bg-zinc-950 px-2 py-2 text-center"
                >
                  <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                    {label}
                  </p>

                  <p className="mt-1 text-sm font-semibold text-zinc-300">
                    {value ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-5 grid grid-cols-3 gap-2">
          <Link
            href="/checkin"
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-center"
          >
            <p className="text-xs font-semibold text-zinc-200">
              Check-in
            </p>
            <p className="mt-1 text-[9px] text-zinc-600">
              Readiness
            </p>
          </Link>

          <Link
            href="/week"
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-center"
          >
            <p className="text-xs font-semibold text-zinc-200">
              Week
            </p>
            <p className="mt-1 text-[9px] text-zinc-600">
              Plan
            </p>
          </Link>

          <Link
            href="/history"
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-center"
          >
            <p className="text-xs font-semibold text-zinc-200">
              History
            </p>
            <p className="mt-1 text-[9px] text-zinc-600">
              Recent work
            </p>
          </Link>
        </section>

        {recommendation && recommendationStyle && (
          <section
            className={`mb-6 rounded-xl border p-4 ${recommendationStyle.border} ${recommendationStyle.background}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p
                className={`text-[10px] font-semibold uppercase tracking-wide ${recommendationStyle.label}`}
              >
                Today&apos;s recommendation
              </p>

              <span
                className={`rounded px-2 py-1 text-[9px] font-semibold uppercase ${recommendationStyle.badge}`}
              >
                {recommendation.level}
              </span>
            </div>

            <h2 className="mt-3 text-base font-semibold text-zinc-100">
              {recommendation.headline}
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {recommendation.reasoning}
            </p>

            {singleModifiedWorkout && (
              <Link
                href={`/workout/${singleModifiedWorkout.id}/modify`}
                className="mt-4 block w-full rounded-lg bg-orange-500 py-3 text-center text-sm font-semibold text-zinc-950 transition hover:bg-orange-400"
              >
                View modified workout
              </Link>
            )}

            {showDayModification && (
              <Link
                href="/day/modify"
                className="mt-4 block w-full rounded-lg bg-orange-500 py-3 text-center text-sm font-semibold text-zinc-950 transition hover:bg-orange-400"
              >
                View today&apos;s modified plan
              </Link>
            )}
          </section>
        )}

        {!readiness && !loading && (
          <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Today&apos;s recommendation
            </p>

            <p className="mt-2 text-sm font-medium text-zinc-200">
              Check in to get today&apos;s recommendation
            </p>

            <p className="mt-1 text-xs leading-5 text-zinc-500">
              We&apos;ll use your recovery, knee status,
              available time, and today&apos;s training plan.
            </p>

            <Link
              href="/checkin"
              className="mt-3 inline-block text-xs font-semibold text-emerald-400"
            >
              Complete check-in →
            </Link>
          </section>
        )}

        {readiness &&
          activeTodayWorkouts.length === 0 &&
          !loading && (
            <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Today&apos;s recommendation
              </p>

              <p className="mt-2 text-sm font-medium text-zinc-200">
                No remaining training today
              </p>

              <p className="mt-1 text-xs leading-5 text-zinc-500">
                There are no unfinished sessions scheduled
                for today.
              </p>
            </section>
          )}

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <p className="text-sm text-red-400">
              Supabase error: {errorMessage}
            </p>
          </div>
        )}

        <section className="mb-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">
              Today
            </h2>

            <span className="text-xs text-zinc-500">
              {loading
                ? "Loading..."
                : `${todayWorkouts.length} session${
                    todayWorkouts.length === 1 ? "" : "s"
                  }`}
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            {todayWorkouts.map((workout, index) => {
              const isCompleted =
                workout.status === "completed";

              const isNext =
                nextWorkout?.id === workout.id;

              const setCount =
                getCompletedSetCount(workout.id);

              return (
                <Link
                  key={workout.id}
                  href={`/workout/${workout.id}`}
                  className={`flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-800/50 ${
                    index !== todayWorkouts.length - 1
                      ? "border-b border-zinc-800"
                      : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isCompleted ? (
                        <span className="rounded bg-emerald-900/60 px-2 py-1 text-[9px] font-semibold uppercase text-emerald-400">
                          ✓ Completed
                        </span>
                      ) : isNext ? (
                        <span className="rounded bg-emerald-950 px-2 py-1 text-[9px] font-semibold uppercase text-emerald-400">
                          Next
                        </span>
                      ) : (
                        <span
                          className={`rounded px-2 py-1 text-[9px] font-medium uppercase ${
                            workout.requirement_level ===
                            "required"
                              ? "bg-emerald-900/60 text-emerald-400"
                              : "bg-sky-950 text-sky-400"
                          }`}
                        >
                          {workout.requirement_level}
                        </span>
                      )}

                      <span className="text-[9px] text-zinc-600">
                        {workout.priority_level}
                      </span>

                      {workout.estimated_duration_min != null && (
                        <span className="text-[9px] text-zinc-600">
                          {workout.estimated_duration_min} min
                        </span>
                      )}
                    </div>

                    <p
                      className={`mt-2 text-sm font-medium ${
                        isCompleted
                          ? "text-zinc-500"
                          : "text-zinc-200"
                      }`}
                    >
                      {workout.name}
                    </p>

                    <p className="mt-1 text-[10px] capitalize text-zinc-600">
                      {formatWorkoutType(
                        workout.workout_type
                      )}
                      {isCompleted && setCount > 0
                        ? ` · ${setCount} set${
                            setCount === 1 ? "" : "s"
                          } logged`
                        : ""}
                    </p>
                  </div>

                  <span className="text-lg text-zinc-600">
                    ›
                  </span>
                </Link>
              );
            })}

            {!loading && todayWorkouts.length === 0 && (
              <div className="px-4 py-4 text-sm text-zinc-500">
                No workouts scheduled today.
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">
                This week
              </h2>

              {currentTrainingWeek && (
                <p className="mt-1 text-[10px] text-zinc-600">
                  {thisWeekCompleted} / {thisWeekWorkouts.length} complete
                </p>
              )}
            </div>

            <Link
              href="/week"
              className="text-xs font-medium text-emerald-400"
            >
              View week
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            {thisWeekWorkouts.map((workout, index) => {
              const isCompleted =
                workout.status === "completed";

              return (
                <Link
                  key={workout.id}
                  href={`/workout/${workout.id}`}
                  className={`flex items-center gap-3 px-4 py-3 transition hover:bg-zinc-800/50 ${
                    index !== thisWeekWorkouts.length - 1
                      ? "border-b border-zinc-800"
                      : ""
                  }`}
                >
                  <div className="w-8 text-xs text-zinc-500">
                    {formatDay(workout.planned_date)}
                  </div>

                  <div className="flex-1">
                    <p
                      className={`text-sm ${
                        isCompleted
                          ? "text-zinc-400"
                          : "text-zinc-200"
                      }`}
                    >
                      {workout.name}
                    </p>

                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {isCompleted
                        ? "completed"
                        : `${workout.requirement_level} · ${workout.priority_level}${
                            workout.estimated_duration_min
                              ? ` · ${workout.estimated_duration_min} min`
                              : ""
                          }`}
                    </p>
                  </div>

                  {isCompleted ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-zinc-950">
                      ✓
                    </div>
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-zinc-600" />
                  )}
                </Link>
              );
            })}

            {!loading &&
              thisWeekWorkouts.length === 0 && (
                <div className="px-4 py-4 text-sm text-zinc-500">
                  No workouts are currently attached to this training week.
                </div>
              )}
          </div>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 py-2">
          <Link
            href="/"
            className="flex flex-col items-center gap-1 py-2 text-xs text-emerald-400"
          >
            <span>●</span>
            <span>Today</span>
          </Link>

          <Link
            href="/week"
            className="flex flex-col items-center gap-1 py-2 text-xs text-zinc-500"
          >
            <span>□</span>
            <span>Week</span>
          </Link>

          <Link
            href="/history"
            className="flex flex-col items-center gap-1 py-2 text-xs text-zinc-500"
          >
            <span>◉</span>
            <span>History</span>
          </Link>

          <button className="flex flex-col items-center gap-1 py-2 text-xs text-zinc-500">
            <span>•••</span>
            <span>More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
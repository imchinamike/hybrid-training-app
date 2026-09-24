"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type TrainingBlock = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  phase: string | null;
};

type TrainingWeek = {
  id: number;
  training_block_id: number;
  week_number: number;
  start_date: string;
  planned_run_minutes: number | null;
  planned_run_miles: number | null;
  planned_vertical_ft: number | null;
  planned_training_minutes: number | null;
  week_emphasis: string | null;
  notes: string | null;
};

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

const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatWorkoutType(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(dateString: string) {
  return new Date(
    `${dateString}T12:00:00`
  ).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
    }
  );
}

function formatLongDate(dateString: string) {
  return new Date(
    `${dateString}T12:00:00`
  ).toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
    }
  );
}

function addDays(
  dateString: string,
  days: number
) {
  const date = new Date(
    `${dateString}T12:00:00`
  );

  date.setDate(
    date.getDate() + days
  );

  const year =
    date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getPacificDateString() {
  return new Date().toLocaleDateString(
    "en-CA",
    {
      timeZone:
        "America/Los_Angeles",
    }
  );
}

export default function WeekPage() {
  const [
    trainingBlock,
    setTrainingBlock,
  ] =
    useState<TrainingBlock | null>(
      null
    );

  const [
    trainingWeeks,
    setTrainingWeeks,
  ] =
    useState<TrainingWeek[]>([]);

  const [
    selectedWeekId,
    setSelectedWeekId,
  ] =
    useState<number | null>(
      null
    );

  const [
    workouts,
    setWorkouts,
  ] =
    useState<Workout[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    generatingWeek,
    setGeneratingWeek,
  ] =
    useState(false);


  useEffect(() => {
    async function loadProgram() {
      setLoading(true);
      setErrorMessage("");

      /*
       * Athlete
       */
      const {
        data: athleteData,
        error: athleteError,
      } = await supabase
        .from("athletes")
        .select("id")
        .eq("name", "Mike")
        .single();

      if (
        athleteError ||
        !athleteData
      ) {
        setErrorMessage(
          athleteError?.message ??
            "Could not find athlete."
        );

        setLoading(false);
        return;
      }

      /*
       * Active training block
       */
      const {
        data: blockData,
        error: blockError,
      } = await supabase
        .from("training_blocks")
        .select(
          `
          id,
          name,
          start_date,
          end_date,
          status,
          phase
        `
        )
        .eq(
          "athlete_id",
          athleteData.id
        )
        .eq("status", "active")
        .order(
          "start_date",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();

      if (blockError) {
        setErrorMessage(
          blockError.message
        );

        setLoading(false);
        return;
      }

      if (!blockData) {
        setErrorMessage(
          "No active training block was found."
        );

        setLoading(false);
        return;
      }

      const loadedBlock =
        blockData as TrainingBlock;

      setTrainingBlock(
        loadedBlock
      );

      /*
       * Training weeks
       */
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
          start_date,
          planned_run_minutes,
          planned_run_miles,
          planned_vertical_ft,
          planned_training_minutes,
          week_emphasis,
          notes
        `
        )
        .eq(
          "training_block_id",
          loadedBlock.id
        )
        .order(
          "week_number",
          {
            ascending: true,
          }
        );

      if (weekError) {
        setErrorMessage(
          weekError.message
        );

        setLoading(false);
        return;
      }

      const loadedWeeks =
        (weekData as
          | TrainingWeek[]
          | null) ?? [];

      setTrainingWeeks(
        loadedWeeks
      );

      if (
        loadedWeeks.length === 0
      ) {
        setLoading(false);
        return;
      }

      /*
       * Workouts for all currently-created weeks
       */
      const weekIds =
        loadedWeeks.map(
          (week) => week.id
        );

      const {
        data: workoutData,
        error: workoutError,
      } = await supabase
        .from(
          "planned_workouts"
        )
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
        .in(
          "training_week_id",
          weekIds
        )
        .order(
          "planned_date",
          {
            ascending: true,
          }
        )
        .order(
          "id",
          {
            ascending: true,
          }
        );

      if (workoutError) {
        setErrorMessage(
          workoutError.message
        );

        setLoading(false);
        return;
      }

      setWorkouts(
        (workoutData as
          | Workout[]
          | null) ?? []
      );

      /*
       * Choose the most relevant week.
       *
       * 1. Current calendar week if it exists.
       * 2. Otherwise latest created week whose start date
       *    has already passed.
       * 3. Otherwise the first week.
       */
      const today =
        getPacificDateString();

      const currentWeek =
        loadedWeeks.find(
          (week) => {
            const weekEnd =
              addDays(
                week.start_date,
                6
              );

            return (
              today >=
                week.start_date &&
              today <=
                weekEnd
            );
          }
        );

      if (currentWeek) {
        setSelectedWeekId(
          currentWeek.id
        );
      } else {
        const pastWeeks =
          loadedWeeks.filter(
            (week) =>
              week.start_date <=
              today
          );

        const mostRecent =
          pastWeeks.length > 0
            ? pastWeeks[
                pastWeeks.length -
                  1
              ]
            : loadedWeeks[0];

        setSelectedWeekId(
          mostRecent.id
        );
      }

      setLoading(false);
    }

    loadProgram();
  }, []);

  const selectedWeek =
    useMemo(() => {
      if (
        selectedWeekId == null
      ) {
        return null;
      }

      return (
        trainingWeeks.find(
          (week) =>
            week.id ===
            selectedWeekId
        ) ?? null
      );
    }, [
      selectedWeekId,
      trainingWeeks,
    ]);

  const selectedWeekIndex =
    useMemo(() => {
      if (!selectedWeek) {
        return -1;
      }

      return trainingWeeks.findIndex(
        (week) =>
          week.id ===
          selectedWeek.id
      );
    }, [
      selectedWeek,
      trainingWeeks,
    ]);

  const selectedWeekWorkouts =
    useMemo(() => {
      if (!selectedWeek) {
        return [];
      }

      return workouts.filter(
        (workout) =>
          workout.training_week_id ===
          selectedWeek.id
      );
    }, [
      workouts,
      selectedWeek,
    ]);

  const weekDays =
    useMemo(() => {
      if (!selectedWeek) {
        return [];
      }

      return Array.from(
        {
          length: 7,
        },
        (_, index) => {
          const dateString =
            addDays(
              selectedWeek.start_date,
              index
            );

          const date =
            new Date(
              `${dateString}T12:00:00`
            );

          return {
            dateString,

            name:
              WEEK_DAYS[
                date.getDay()
              ],

            workouts:
              selectedWeekWorkouts.filter(
                (workout) =>
                  workout.planned_date ===
                  dateString
              ),
          };
        }
      );
    }, [
      selectedWeek,
      selectedWeekWorkouts,
    ]);

  const todayDate =
    getPacificDateString();

  const completedCount =
    selectedWeekWorkouts.filter(
      (workout) =>
        workout.status ===
        "completed"
    ).length;

  const weekEndDate =
    selectedWeek
      ? addDays(
          selectedWeek.start_date,
          6
        )
      : null;

  const canGoPrevious =
    selectedWeekIndex > 0;

  const canGoNext =
    selectedWeekIndex >= 0 &&
    selectedWeekIndex <
      trainingWeeks.length - 1;

  const existingNextWeek =
    selectedWeek
      ? trainingWeeks.find(
          (week) =>
            week.week_number ===
            selectedWeek.week_number + 1
        ) ?? null
      : null;

  function goPreviousWeek() {
    if (!canGoPrevious) {
      return;
    }

    setSelectedWeekId(
      trainingWeeks[
        selectedWeekIndex - 1
      ].id
    );
  }

  function goNextWeek() {
    if (!canGoNext) {
      return;
    }

    setSelectedWeekId(
      trainingWeeks[
        selectedWeekIndex + 1
      ].id
    );
  }

  async function generateNextWeek() {
    if (
      !selectedWeek ||
      generatingWeek
    ) {
      return;
    }

    setGeneratingWeek(true);
    setErrorMessage("");

    const {
      data,
      error,
    } = await supabase.rpc(
      "generate_next_training_week",
      {
        p_source_week_id:
          selectedWeek.id,
      }
    );

    if (error) {
      setErrorMessage(
        error.message
      );
      setGeneratingWeek(false);
      return;
    }

    const generatedWeekId =
      Number(data);

    const {
      data: generatedWeekData,
      error: generatedWeekError,
    } = await supabase
      .from("training_weeks")
      .select(
        `
        id,
        training_block_id,
        week_number,
        start_date,
        planned_run_minutes,
        planned_run_miles,
        planned_vertical_ft,
        planned_training_minutes,
        week_emphasis,
        notes
      `
      )
      .eq(
        "id",
        generatedWeekId
      )
      .single();

    if (
      generatedWeekError ||
      !generatedWeekData
    ) {
      setErrorMessage(
        generatedWeekError?.message ??
          "The new week was created, but could not be loaded."
      );
      setGeneratingWeek(false);
      return;
    }

    const nextWeek =
      generatedWeekData as TrainingWeek;

    const {
      data: generatedWorkoutData,
      error: generatedWorkoutError,
    } = await supabase
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
      .eq(
        "training_week_id",
        generatedWeekId
      )
      .order(
        "planned_date",
        {
          ascending: true,
        }
      )
      .order(
        "id",
        {
          ascending: true,
        }
      );

    if (generatedWorkoutError) {
      setErrorMessage(
        generatedWorkoutError.message
      );
      setGeneratingWeek(false);
      return;
    }

    setTrainingWeeks(
      (currentWeeks) => {
        const exists =
          currentWeeks.some(
            (week) =>
              week.id ===
              nextWeek.id
          );

        const updated =
          exists
            ? currentWeeks.map(
                (week) =>
                  week.id ===
                  nextWeek.id
                    ? nextWeek
                    : week
              )
            : [
                ...currentWeeks,
                nextWeek,
              ];

        return updated.sort(
          (a, b) =>
            a.week_number -
            b.week_number
        );
      }
    );

    setWorkouts(
      (currentWorkouts) => [
        ...currentWorkouts.filter(
          (workout) =>
            workout.training_week_id !==
            generatedWeekId
        ),
        ...(((generatedWorkoutData as
          | Workout[]
          | null) ?? [])),
      ]
    );

    setSelectedWeekId(
      generatedWeekId
    );

    setGeneratingWeek(false);
  }

  function handleNextWeekAction() {
    if (existingNextWeek) {
      setSelectedWeekId(
        existingNextWeek.id
      );
      return;
    }

    generateNextWeek();
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-8">
        {/* Header */}
        <header className="mb-6">
          <p className="text-[10px] font-medium uppercase tracking-widest text-emerald-400">
            Training plan
          </p>

          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {selectedWeek
                  ? `Week ${selectedWeek.week_number}`
                  : "Week"}
              </h1>

              {trainingBlock && (
                <p className="mt-2 text-sm text-zinc-500">
                  {
                    trainingBlock.name
                  }
                </p>
              )}
            </div>

            {trainingBlock?.phase && (
              <span className="max-w-[150px] rounded-lg bg-zinc-900 px-2 py-1 text-right text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                {
                  trainingBlock.phase
                }
              </span>
            )}
          </div>

          {selectedWeek &&
            weekEndDate && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-zinc-500">
                  {formatDate(
                    selectedWeek.start_date
                  )}{" "}
                  –{" "}
                  {formatDate(
                    weekEndDate
                  )}
                </p>

                {!loading && (
                  <p className="text-xs text-zinc-500">
                    {
                      completedCount
                    }{" "}
                    /{" "}
                    {
                      selectedWeekWorkouts.length
                    }{" "}
                    complete
                  </p>
                )}
              </div>
            )}
        </header>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <p className="text-sm text-red-400">
              {errorMessage}
            </p>
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
            Loading training plan...
          </div>
        )}

        {!loading &&
          trainingWeeks.length ===
            0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">
                No training weeks
              </h2>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                This training block
                does not have any
                weeks yet.
              </p>
            </div>
          )}

        {!loading &&
          selectedWeek && (
            <>
              {/* Week selector */}
              <section className="mb-5">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {trainingWeeks.map(
                    (week) => {
                      const isSelected =
                        week.id ===
                        selectedWeek.id;

                      return (
                        <button
                          key={
                            week.id
                          }
                          type="button"
                          onClick={() =>
                            setSelectedWeekId(
                              week.id
                            )
                          }
                          className={`shrink-0 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                            isSelected
                              ? "border-emerald-800 bg-emerald-950/40 text-emerald-400"
                              : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
                          }`}
                        >
                          Week{" "}
                          {
                            week.week_number
                          }
                        </button>
                      );
                    }
                  )}
                </div>
              </section>

              {/* Week navigation */}
              <section className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <button
                  type="button"
                  onClick={
                    goPreviousWeek
                  }
                  disabled={
                    !canGoPrevious
                  }
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-30"
                >
                  ← Previous
                </button>

                <div className="text-center">
                  <p className="text-[9px] uppercase tracking-widest text-zinc-600">
                    Week
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    {
                      selectedWeek.week_number
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    goNextWeek
                  }
                  disabled={
                    !canGoNext
                  }
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-30"
                >
                  Next →
                </button>
              </section>

              {/* Progression review */}
              {selectedWeek.week_number >= 2 && (
                <section className="mb-5">
                  <Link
                    href={`/week/progression?week=${selectedWeek.week_number}`}
                    className="flex items-center justify-between rounded-2xl border border-emerald-900/70 bg-emerald-950/25 p-4 transition hover:bg-emerald-950/40"
                  >
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-emerald-400">
                        Strength progression
                      </p>

                      <h2 className="mt-1 text-sm font-semibold text-zinc-100">
                        Review progression
                      </h2>

                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Compare the prior week&apos;s real training with this week&apos;s strength prescriptions.
                      </p>
                    </div>

                    <span className="ml-4 text-xl text-emerald-500">
                      ›
                    </span>
                  </Link>
                </section>
              )}

              {/* Next week planning */}
              <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                  Weekly planning
                </p>

                <div className="mt-2">
                  <h2 className="text-sm font-semibold text-zinc-100">
                    {existingNextWeek
                      ? `Week ${existingNextWeek.week_number} is already planned`
                      : `Generate Week ${
                          selectedWeek.week_number +
                          1
                        }`}
                  </h2>

                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    {existingNextWeek
                      ? "The next week already exists. Open it to review the schedule and strength progression."
                      : "Copy this week forward, keep PT/cardio unchanged, and prepare the next week for progression review."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    handleNextWeekAction
                  }
                  disabled={
                    generatingWeek
                  }
                  className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                    existingNextWeek
                      ? "border border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-800"
                      : "bg-zinc-100 text-zinc-950 hover:bg-white"
                  }`}
                >
                  {generatingWeek
                    ? "Generating..."
                    : existingNextWeek
                    ? `Open Week ${existingNextWeek.week_number}`
                    : `Generate Week ${
                        selectedWeek.week_number +
                        1
                      }`}
                </button>
              </section>

              {/* Week emphasis */}
              {(selectedWeek.week_emphasis ||
                selectedWeek.notes) && (
                <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-emerald-400">
                    Week emphasis
                  </p>

                  {selectedWeek.week_emphasis && (
                    <h2 className="mt-2 text-base font-semibold">
                      {
                        selectedWeek.week_emphasis
                      }
                    </h2>
                  )}

                  {selectedWeek.notes && (
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      {
                        selectedWeek.notes
                      }
                    </p>
                  )}

                  {(selectedWeek.planned_training_minutes !=
                    null ||
                    selectedWeek.planned_run_miles !=
                      null ||
                    selectedWeek.planned_vertical_ft !=
                      null) && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {selectedWeek.planned_training_minutes !=
                        null && (
                        <div className="rounded-lg bg-zinc-950 px-3 py-2">
                          <p className="text-[8px] uppercase tracking-wide text-zinc-600">
                            Training
                          </p>

                          <p className="mt-1 text-xs font-medium">
                            {
                              selectedWeek.planned_training_minutes
                            }{" "}
                            min
                          </p>
                        </div>
                      )}

                      {selectedWeek.planned_run_miles !=
                        null && (
                        <div className="rounded-lg bg-zinc-950 px-3 py-2">
                          <p className="text-[8px] uppercase tracking-wide text-zinc-600">
                            Running
                          </p>

                          <p className="mt-1 text-xs font-medium">
                            {
                              selectedWeek.planned_run_miles
                            }{" "}
                            mi
                          </p>
                        </div>
                      )}

                      {selectedWeek.planned_vertical_ft !=
                        null && (
                        <div className="rounded-lg bg-zinc-950 px-3 py-2">
                          <p className="text-[8px] uppercase tracking-wide text-zinc-600">
                            Vertical
                          </p>

                          <p className="mt-1 text-xs font-medium">
                            {
                              selectedWeek.planned_vertical_ft
                            }{" "}
                            ft
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Empty programming week */}
              {selectedWeekWorkouts.length ===
                0 && (
                <section className="mb-6 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 p-5">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                    Programming week
                  </p>

                  <h2 className="mt-2 text-lg font-semibold">
                    No workouts planned yet
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    Week{" "}
                    {
                      selectedWeek.week_number
                    }{" "}
                    exists in your
                    training block, but
                    its sessions have
                    not been programmed
                    yet.
                  </p>

                  <p className="mt-3 text-xs text-zinc-600">
                    {formatLongDate(
                      selectedWeek.start_date
                    )}{" "}
                    –{" "}
                    {formatLongDate(
                      addDays(
                        selectedWeek.start_date,
                        6
                      )
                    )}
                  </p>
                </section>
              )}

              {/* Days */}
              <div className="space-y-5">
                {weekDays.map(
                  (day) => {
                    const isToday =
                      day.dateString ===
                      todayDate;

                    return (
                      <section
                        key={
                          day.dateString
                        }
                      >
                        {/* Day heading */}
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h2
                              className={`text-sm font-semibold ${
                                isToday
                                  ? "text-emerald-400"
                                  : "text-zinc-300"
                              }`}
                            >
                              {
                                day.name
                              }
                            </h2>

                            {isToday && (
                              <span className="rounded bg-emerald-950 px-2 py-0.5 text-[9px] font-medium uppercase text-emerald-400">
                                Today
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-zinc-600">
                            {formatDate(
                              day.dateString
                            )}
                          </p>
                        </div>

                        {/* Empty day */}
                        {day.workouts
                          .length ===
                          0 && (
                          <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-4">
                            <p className="text-sm text-zinc-600">
                              Rest / no
                              planned session
                            </p>
                          </div>
                        )}

                        {/* Workout cards */}
                        <div className="space-y-2">
                          {day.workouts.map(
                            (
                              workout
                            ) => {
                              const isCompleted =
                                workout.status ===
                                "completed";

                              return (
                                <Link
                                  key={
                                    workout.id
                                  }
                                  href={`/workout/${workout.id}`}
                                  className={`block rounded-xl border p-4 transition ${
                                    isCompleted
                                      ? "border-emerald-900 bg-emerald-950/30 hover:bg-emerald-950/50"
                                      : isToday
                                      ? "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                                      : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        {isCompleted ? (
                                          <span className="rounded bg-emerald-900/60 px-2 py-1 text-[9px] font-semibold uppercase text-emerald-400">
                                            ✓
                                            Completed
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
                                            {
                                              workout.requirement_level
                                            }
                                          </span>
                                        )}

                                        <span className="text-[10px] text-zinc-500">
                                          {
                                            workout.priority_level
                                          }{" "}
                                          priority
                                        </span>

                                        {workout.estimated_duration_min !=
                                          null && (
                                          <span className="text-[10px] text-zinc-500">
                                            {
                                              workout.estimated_duration_min
                                            }{" "}
                                            min
                                          </span>
                                        )}
                                      </div>

                                      <h3
                                        className={`mt-3 text-base font-semibold ${
                                          isCompleted
                                            ? "text-zinc-400"
                                            : "text-zinc-100"
                                        }`}
                                      >
                                        {
                                          workout.name
                                        }
                                      </h3>

                                      <p className="mt-1 text-xs capitalize text-zinc-500">
                                        {formatWorkoutType(
                                          workout.workout_type
                                        )}
                                      </p>
                                    </div>

                                    <div className="pt-1">
                                      {isCompleted ? (
                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-zinc-950">
                                          ✓
                                        </div>
                                      ) : (
                                        <span className="text-lg text-zinc-600">
                                          ›
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </Link>
                              );
                            }
                          )}
                        </div>
                      </section>
                    );
                  }
                )}
              </div>
            </>
          )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 py-2">
          <Link
            href="/"
            className="flex flex-col items-center gap-1 py-2 text-xs text-zinc-500"
          >
            <span>●</span>
            <span>
              Today
            </span>
          </Link>

          <Link
            href="/week"
            className="flex flex-col items-center gap-1 py-2 text-xs text-emerald-400"
          >
            <span>□</span>
            <span>
              Week
            </span>
          </Link>

          <Link
            href="/history"
            className="flex flex-col items-center gap-1 py-2 text-xs text-zinc-500"
          >
            <span>◉</span>
            <span>
              History
            </span>
          </Link>

          <button className="flex flex-col items-center gap-1 py-2 text-xs text-zinc-500">
            <span>•••</span>
            <span>
              More
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
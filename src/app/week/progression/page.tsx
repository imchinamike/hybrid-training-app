"use client";

import Link from "next/link";
import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useSearchParams,
} from "next/navigation";

import { supabase } from "@/lib/supabase";

import {
  getStrengthProgressionRecommendation,
  type StrengthProgressionRecommendation,
} from "@/lib/strengthProgression";

type TrainingWeek = {
  id: number;
  training_block_id: number;
  week_number: number;
  start_date: string;
};

type PlannedWorkout = {
  id: number;
  training_week_id: number | null;
  planned_date: string;
  name: string;
  workout_type: string;
};

type WorkoutComponent = {
  id: number;
  planned_workout_id: number;
  component_order: number;
  title: string | null;
};

type ExercisePrescription = {
  id: number;
  workout_component_id: number;
  exercise_id: number;
  exercise_order: number;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  target_weight: number | null;
  target_rpe_min: number | null;
  target_rpe_max: number | null;
};

type Exercise = {
  id: number;
  name: string;
};

type WorkoutMatch = {
  planned_workout_id: number;
  activity_id: number;
};

type Activity = {
  id: number;
  is_test: boolean;
};

type CompletedSet = {
  activity_id: number;
  exercise_id: number;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
};

type AppliedProgression = {
  id: number;
  target_week_id: number;
  exercise_prescription_id: number;
  exercise_id: number;
  action: string;
  reason: string | null;
  applied_at: string;
  previous_prescription: {
    targetWeight?: number | null;
  } | null;
  proposed_prescription: {
    targetWeight?: number | null;
  } | null;
};

type PreviewRow = {
  targetWorkoutId: number;
  targetWorkoutName: string;
  targetWorkoutDate: string;

  exerciseId: number;
  exerciseName: string;

  sourcePrescription:
    | ExercisePrescription
    | null;

  targetPrescription:
    ExercisePrescription;

  recommendation:
    StrengthProgressionRecommendation;
};

function formatDate(
  dateString: string
) {
  return new Date(
    `${dateString}T12:00:00`
  ).toLocaleDateString(
    "en-US",
    {
      weekday: "short",
      month: "short",
      day: "numeric",
    }
  );
}

function addDays(
  dateString: string,
  days: number
) {
  const date =
    new Date(
      `${dateString}T12:00:00`
    );

  date.setDate(
    date.getDate() + days
  );

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

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

function formatRepRange(
  repsMin: number | null,
  repsMax: number | null
) {
  if (
    repsMin == null &&
    repsMax == null
  ) {
    return "—";
  }

  if (
    repsMin === repsMax
  ) {
    return `${repsMin}`;
  }

  return `${repsMin ?? "?"}–${
    repsMax ?? "?"
  }`;
}

function formatRpeRange(
  rpeMin: number | null,
  rpeMax: number | null
) {
  if (
    rpeMin == null &&
    rpeMax == null
  ) {
    return "—";
  }

  if (
    rpeMin === rpeMax
  ) {
    return `${rpeMin}`;
  }

  return `${rpeMin ?? "?"}–${
    rpeMax ?? "?"
  }`;
}

function getActionLabel(
  action:
    StrengthProgressionRecommendation["action"]
) {
  switch (action) {
    case "insufficient_data":
      return "Insufficient data";

    case "hold":
      return "Hold";

    case "increase_load":
      return "Increase load";

    case "increase_reps":
      return "Increase reps";

    case "reduce_load":
      return "Reduce load";

    default:
      return action;
  }
}

function getActionClasses(
  action:
    StrengthProgressionRecommendation["action"]
) {
  switch (action) {
    case "increase_load":
    case "increase_reps":
      return "bg-emerald-950 text-emerald-400";

    case "reduce_load":
      return "bg-red-950 text-red-400";

    case "hold":
      return "bg-sky-950 text-sky-400";

    case "insufficient_data":
    default:
      return "bg-zinc-800 text-zinc-400";
  }
}

function ProgressionPreviewContent() {
  const searchParams =
    useSearchParams();

  const requestedWeekNumber =
    Number(
      searchParams.get("week")
    );

  const [
    sourceWeek,
    setSourceWeek,
  ] =
    useState<TrainingWeek | null>(
      null
    );

  const [
    targetWeek,
    setTargetWeek,
  ] =
    useState<TrainingWeek | null>(
      null
    );

  const [
    rows,
    setRows,
  ] =
    useState<PreviewRow[]>([]);

  const [
    appliedProgressions,
    setAppliedProgressions,
  ] =
    useState<AppliedProgression[]>([]);

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
    applying,
    setApplying,
  ] =
    useState(false);

  const [
    applyMessage,
    setApplyMessage,
  ] =
    useState("");

  const [
    showApplyConfirm,
    setShowApplyConfirm,
  ] =
    useState(false);

  useEffect(() => {
    async function loadPreview() {
      setLoading(true);
      setErrorMessage("");
      setRows([]);
      setAppliedProgressions([]);

      /*
       * -----------------------------------------------------
       * Load all weeks in the active training block.
       *
       * We currently have one active block, ID 1.
       * -----------------------------------------------------
       */

      const {
        data: weekData,
        error: weekError,
      } =
        await supabase
          .from(
            "training_weeks"
          )
          .select(
            `
            id,
            training_block_id,
            week_number,
            start_date
          `
          )
          .eq(
            "training_block_id",
            1
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

      const weeks =
        (weekData as
          | TrainingWeek[]
          | null) ?? [];

      if (
        weeks.length < 2
      ) {
        setErrorMessage(
          "At least two training weeks are required to review progression."
        );

        setLoading(false);
        return;
      }

      /*
       * -----------------------------------------------------
       * Choose the target week.
       *
       * Priority:
       *
       * 1. ?week=3 in URL
       * 2. Current calendar training week
       * 3. Most recent created week
       * -----------------------------------------------------
       */

      let selectedTargetWeek:
        TrainingWeek | null =
          null;

      if (
        Number.isFinite(
          requestedWeekNumber
        ) &&
        requestedWeekNumber > 0
      ) {
        selectedTargetWeek =
          weeks.find(
            (week) =>
              week.week_number ===
              requestedWeekNumber
          ) ?? null;
      }

      if (
        !selectedTargetWeek
      ) {
        const today =
          getPacificDateString();

        selectedTargetWeek =
          weeks.find(
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
          ) ?? null;
      }

      if (
        !selectedTargetWeek
      ) {
        selectedTargetWeek =
          weeks[
            weeks.length - 1
          ];
      }

      /*
       * The source week is always
       * immediately before target.
       */

      const selectedSourceWeek =
        weeks.find(
          (week) =>
            week.week_number ===
            selectedTargetWeek!.week_number -
              1
        ) ?? null;

      if (
        !selectedSourceWeek
      ) {
        setErrorMessage(
          `Week ${selectedTargetWeek.week_number} does not have a previous week available for comparison.`
        );

        setLoading(false);
        return;
      }

      setSourceWeek(
        selectedSourceWeek
      );

      setTargetWeek(
        selectedTargetWeek
      );

      const {
        data: appliedData,
        error: appliedError,
      } = await supabase
        .from("strength_progression_applications")
        .select(
          `
          id,
          target_week_id,
          exercise_prescription_id,
          exercise_id,
          action,
          reason,
          applied_at,
          previous_prescription,
          proposed_prescription
        `
        )
        .eq(
          "target_week_id",
          selectedTargetWeek.id
        )
        .order(
          "applied_at",
          { ascending: false }
        );

      if (appliedError) {
        setErrorMessage(
          appliedError.message
        );
        setLoading(false);
        return;
      }

      setAppliedProgressions(
        (appliedData as
          | AppliedProgression[]
          | null) ?? []
      );

      /*
       * -----------------------------------------------------
       * Load strength-style workouts
       * for source + target weeks.
       * -----------------------------------------------------
       */

      const {
        data: workoutData,
        error: workoutError,
      } =
        await supabase
          .from(
            "planned_workouts"
          )
          .select(
            `
            id,
            training_week_id,
            planned_date,
            name,
            workout_type
          `
          )
          .in(
            "training_week_id",
            [
              selectedSourceWeek.id,
              selectedTargetWeek.id,
            ]
          )
          .in(
            "workout_type",
            [
              "strength",
              "core",
              "strength_conditioning",
            ]
          )
          .order(
            "planned_date",
            {
              ascending: true,
            }
          );

      if (
        workoutError
      ) {
        setErrorMessage(
          workoutError.message
        );

        setLoading(false);
        return;
      }

      const workouts =
        (workoutData as
          | PlannedWorkout[]
          | null) ?? [];

      const sourceWorkouts =
        workouts.filter(
          (workout) =>
            workout.training_week_id ===
            selectedSourceWeek.id
        );

      const targetWorkouts =
        workouts.filter(
          (workout) =>
            workout.training_week_id ===
            selectedTargetWeek.id
        );

      const workoutIds =
        workouts.map(
          (workout) =>
            workout.id
        );

      if (
        workoutIds.length === 0
      ) {
        setLoading(false);
        return;
      }

      /*
       * -----------------------------------------------------
       * Components
       * -----------------------------------------------------
       */

      const {
        data: componentData,
        error: componentError,
      } =
        await supabase
          .from(
            "workout_components"
          )
          .select(
            `
            id,
            planned_workout_id,
            component_order,
            title
          `
          )
          .in(
            "planned_workout_id",
            workoutIds
          );

      if (
        componentError
      ) {
        setErrorMessage(
          componentError.message
        );

        setLoading(false);
        return;
      }

      const components =
        (componentData as
          | WorkoutComponent[]
          | null) ?? [];

      const componentIds =
        components.map(
          (component) =>
            component.id
        );

      if (
        componentIds.length ===
        0
      ) {
        setLoading(false);
        return;
      }

      /*
       * -----------------------------------------------------
       * Exercise prescriptions
       * -----------------------------------------------------
       */

      const {
        data:
          prescriptionData,
        error:
          prescriptionError,
      } =
        await supabase
          .from(
            "exercise_prescriptions"
          )
          .select(
            `
            id,
            workout_component_id,
            exercise_id,
            exercise_order,
            sets,
            reps_min,
            reps_max,
            target_weight,
            target_rpe_min,
            target_rpe_max
          `
          )
          .in(
            "workout_component_id",
            componentIds
          );

      if (
        prescriptionError
      ) {
        setErrorMessage(
          prescriptionError.message
        );

        setLoading(false);
        return;
      }

      const prescriptions =
        (prescriptionData as
          | ExercisePrescription[]
          | null) ?? [];

      const exerciseIds = [
        ...new Set(
          prescriptions.map(
            (prescription) =>
              prescription.exercise_id
          )
        ),
      ];

      /*
       * -----------------------------------------------------
       * Exercise names
       * -----------------------------------------------------
       */

      const {
        data: exerciseData,
        error: exerciseError,
      } =
        await supabase
          .from("exercises")
          .select(
            "id, name"
          )
          .in(
            "id",
            exerciseIds
          );

      if (
        exerciseError
      ) {
        setErrorMessage(
          exerciseError.message
        );

        setLoading(false);
        return;
      }

      const exercises =
        (exerciseData as
          | Exercise[]
          | null) ?? [];

      const exerciseMap =
        new Map(
          exercises.map(
            (exercise) => [
              exercise.id,
              exercise.name,
            ]
          )
        );

      /*
       * -----------------------------------------------------
       * Activity matches from SOURCE week only.
       * -----------------------------------------------------
       */

      const sourceWorkoutIds =
        sourceWorkouts.map(
          (workout) =>
            workout.id
        );

      const {
        data: matchData,
        error: matchError,
      } =
        await supabase
          .from(
            "workout_activity_matches"
          )
          .select(
            `
            planned_workout_id,
            activity_id
          `
          )
          .in(
            "planned_workout_id",
            sourceWorkoutIds
          );

      if (
        matchError
      ) {
        setErrorMessage(
          matchError.message
        );

        setLoading(false);
        return;
      }

      const matches =
        (matchData as
          | WorkoutMatch[]
          | null) ?? [];

      const activityIds =
        matches.map(
          (match) =>
            match.activity_id
        );

      /*
       * -----------------------------------------------------
       * Remove development/test activities.
       * -----------------------------------------------------
       */

      let realActivities:
        Activity[] = [];

      if (
        activityIds.length >
        0
      ) {
        const {
          data: activityData,
          error: activityError,
        } =
          await supabase
            .from(
              "activities"
            )
            .select(
              `
              id,
              is_test
            `
            )
            .in(
              "id",
              activityIds
            )
            .eq(
              "is_test",
              false
            );

        if (
          activityError
        ) {
          setErrorMessage(
            activityError.message
          );

          setLoading(false);
          return;
        }

        realActivities =
          (activityData as
            | Activity[]
            | null) ?? [];
      }

      const realActivityIds =
        realActivities.map(
          (activity) =>
            activity.id
        );

      /*
       * -----------------------------------------------------
       * Completed sets from real
       * source-week activities only.
       * -----------------------------------------------------
       */

      let completedSets:
        CompletedSet[] = [];

      if (
        realActivityIds.length >
        0
      ) {
        const {
          data: setData,
          error: setError,
        } =
          await supabase
            .from(
              "completed_sets"
            )
            .select(
              `
              activity_id,
              exercise_id,
              set_number,
              weight,
              reps,
              rpe
            `
            )
            .in(
              "activity_id",
              realActivityIds
            );

        if (
          setError
        ) {
          setErrorMessage(
            setError.message
          );

          setLoading(false);
          return;
        }

        completedSets =
          (setData as
            | CompletedSet[]
            | null) ?? [];
      }

      /*
       * -----------------------------------------------------
       * Build preview.
       *
       * Each target workout is matched
       * to the same workout name in the
       * previous week.
       * -----------------------------------------------------
       */

      const previewRows:
        PreviewRow[] = [];

      for (
        const targetWorkout
        of targetWorkouts
      ) {
        const matchingSourceWorkout =
          sourceWorkouts.find(
            (workout) =>
              workout.name ===
              targetWorkout.name
          );

        if (
          !matchingSourceWorkout
        ) {
          continue;
        }

        const targetComponentIds =
          components
            .filter(
              (component) =>
                component.planned_workout_id ===
                targetWorkout.id
            )
            .map(
              (component) =>
                component.id
            );

        const sourceComponentIds =
          components
            .filter(
              (component) =>
                component.planned_workout_id ===
                matchingSourceWorkout.id
            )
            .map(
              (component) =>
                component.id
            );

        const targetComponentOrder =
          new Map(
            components
              .filter(
                (component) =>
                  component.planned_workout_id ===
                  targetWorkout.id
              )
              .map(
                (component) => [
                  component.id,
                  component.component_order,
                ]
              )
          );

        const targetPrescriptions =
          prescriptions
            .filter(
              (prescription) =>
                targetComponentIds.includes(
                  prescription.workout_component_id
                )
            )
            .sort(
              (a, b) => {
                const componentOrderA =
                  targetComponentOrder.get(
                    a.workout_component_id
                  ) ?? 0;

                const componentOrderB =
                  targetComponentOrder.get(
                    b.workout_component_id
                  ) ?? 0;

                if (
                  componentOrderA !==
                  componentOrderB
                ) {
                  return (
                    componentOrderA -
                    componentOrderB
                  );
                }

                return (
                  a.exercise_order -
                  b.exercise_order
                );
              }
            );

        const sourcePrescriptions =
          prescriptions.filter(
            (prescription) =>
              sourceComponentIds.includes(
                prescription.workout_component_id
              )
          );

        const matchingActivityId =
          matches.find(
            (match) =>
              match.planned_workout_id ===
                matchingSourceWorkout.id &&
              realActivityIds.includes(
                match.activity_id
              )
          )?.activity_id ??
          null;

        for (
          const targetPrescription
          of targetPrescriptions
        ) {
          const sourcePrescription =
            sourcePrescriptions.find(
              (prescription) =>
                prescription.exercise_id ===
                targetPrescription.exercise_id
            ) ?? null;

          const exerciseCompletedSets =
            matchingActivityId ==
            null
              ? []
              : completedSets
                  .filter(
                    (set) =>
                      set.activity_id ===
                        matchingActivityId &&
                      set.exercise_id ===
                        targetPrescription.exercise_id
                  )
                  .sort(
                    (a, b) =>
                      a.set_number -
                      b.set_number
                  );

          const recommendation =
            getStrengthProgressionRecommendation(
              {
                prescribedSets:
                  sourcePrescription?.sets ??
                  targetPrescription.sets ??
                  0,

                repsMin:
                  sourcePrescription?.reps_min ??
                  targetPrescription.reps_min,

                repsMax:
                  sourcePrescription?.reps_max ??
                  targetPrescription.reps_max,

                targetRpeMin:
                  sourcePrescription?.target_rpe_min ??
                  targetPrescription.target_rpe_min,

                targetRpeMax:
                  sourcePrescription?.target_rpe_max ??
                  targetPrescription.target_rpe_max,

                targetWeight:
                  sourcePrescription?.target_weight ??
                  targetPrescription.target_weight,
              },

              exerciseCompletedSets.map(
                (set) => ({
                  setNumber:
                    set.set_number,

                  weight:
                    set.weight,

                  reps:
                    set.reps,

                  rpe:
                    set.rpe,
                })
              )
            );

          previewRows.push(
            {
              targetWorkoutId:
                targetWorkout.id,

              targetWorkoutName:
                targetWorkout.name,

              targetWorkoutDate:
                targetWorkout.planned_date,

              exerciseId:
                targetPrescription.exercise_id,

              exerciseName:
                exerciseMap.get(
                  targetPrescription.exercise_id
                ) ??
                "Exercise",

              sourcePrescription,

              targetPrescription,

              recommendation,
            }
          );
        }
      }

      setRows(
        previewRows
      );

      setLoading(false);
    }

    loadPreview();
  }, [
    requestedWeekNumber,
  ]);

  const groupedByWorkout =
    useMemo(() => {
      const groups =
        new Map<
          string,
          PreviewRow[]
        >();

      rows.forEach(
        (row) => {
          const key =
            `${row.targetWorkoutId}`;

          const existing =
            groups.get(key) ??
            [];

          existing.push(
            row
          );

          groups.set(
            key,
            existing
          );
        }
      );

      return Array.from(
        groups.values()
      );
    }, [rows]);

  const applicableRows =
    useMemo(
      () =>
        rows.filter(
          (row) => {
            const rec =
              row.recommendation;

            if (
              rec.action !==
                "increase_load" &&
              rec.action !==
                "reduce_load"
            ) {
              return false;
            }

            const proposedWeight =
              rec.proposedPrescription
                .targetWeight;

            if (
              proposedWeight == null
            ) {
              return false;
            }

            return (
              row.targetPrescription
                .target_weight !==
              proposedWeight
            );
          }
        ),
      [rows]
    );

  async function applyProposedChanges() {
    if (
      !sourceWeek ||
      !targetWeek ||
      applicableRows.length === 0
    ) {
      return;
    }

    setApplying(true);
    setApplyMessage("");
    setErrorMessage("");

    try {
      for (
        const row of applicableRows
      ) {
        const rec =
          row.recommendation;

        const proposedWeight =
          rec.proposedPrescription
            .targetWeight;

        if (
          proposedWeight == null ||
          (
            rec.action !==
              "increase_load" &&
            rec.action !==
              "reduce_load"
          )
        ) {
          continue;
        }

        const {
          error,
        } = await supabase.rpc(
          "apply_strength_progression",
          {
            p_athlete_id: 1,
            p_source_week_id:
              sourceWeek.id,
            p_target_week_id:
              targetWeek.id,
            p_exercise_prescription_id:
              row.targetPrescription.id,
            p_exercise_id:
              row.exerciseId,
            p_action:
              rec.action,
            p_previous_prescription:
              {
                sets:
                  row.targetPrescription
                    .sets,
                repsMin:
                  row.targetPrescription
                    .reps_min,
                repsMax:
                  row.targetPrescription
                    .reps_max,
                targetWeight:
                  row.targetPrescription
                    .target_weight,
                targetRpeMin:
                  row.targetPrescription
                    .target_rpe_min,
                targetRpeMax:
                  row.targetPrescription
                    .target_rpe_max,
              },
            p_proposed_prescription:
              rec.proposedPrescription,
            p_reason:
              rec.reason,
            p_target_weight:
              proposedWeight,
          }
        );

        if (error) {
          throw error;
        }
      }

      setApplyMessage(
        `${applicableRows.length} progression ${
          applicableRows.length === 1
            ? "change"
            : "changes"
        } applied successfully.`
      );

      setShowApplyConfirm(false);

      window.location.reload();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not apply progression changes."
      );
    } finally {
      setApplying(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-20 pt-8 text-zinc-100">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/week"
          className="text-sm font-medium text-emerald-400"
        >
          ← Week
        </Link>

        <header className="mt-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
            Strength progression
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {targetWeek
              ? `Week ${targetWeek.week_number} Preview`
              : "Progression Preview"}
          </h1>

          {sourceWeek &&
            targetWeek && (
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Comparing Week{" "}
                {
                  sourceWeek.week_number
                }{" "}
                performance with Week{" "}
                {
                  targetWeek.week_number
                }{" "}
                prescriptions.
              </p>
            )}

          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs leading-5 text-zinc-500">
              This page is read-only.
              Test activities are ignored,
              and no prescriptions are
              changed automatically.
            </p>
          </div>
        </header>

        {!loading &&
          !errorMessage &&
          targetWeek && (
            <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-emerald-400">
                    Apply progression
                  </p>

                  <h2 className="mt-1 text-base font-semibold">
                    {applicableRows.length ===
                    0
                      ? "No load changes ready"
                      : `${applicableRows.length} load ${
                          applicableRows.length ===
                          1
                            ? "change"
                            : "changes"
                        } ready`}
                  </h2>

                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    Only increase-load and
                    reduce-load recommendations
                    are written to the target
                    week. Holds, insufficient
                    data, rep goals, PT, and
                    cardio are left unchanged.
                  </p>
                </div>
              </div>

              {applyMessage && (
                <div className="mt-3 rounded-xl border border-emerald-900 bg-emerald-950/30 p-3">
                  <p className="text-xs text-emerald-400">
                    {applyMessage}
                  </p>
                </div>
              )}

              {applicableRows.length >
                0 &&
                !showApplyConfirm && (
                  <button
                    type="button"
                    onClick={() =>
                      setShowApplyConfirm(
                        true
                      )
                    }
                    className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                  >
                    Review apply
                  </button>
                )}

              {applicableRows.length >
                0 &&
                showApplyConfirm && (
                  <div className="mt-4 rounded-xl border border-amber-900/70 bg-amber-950/20 p-4">
                    <p className="text-sm font-semibold text-amber-300">
                      Apply these proposed load
                      changes to Week{" "}
                      {
                        targetWeek.week_number
                      }?
                    </p>

                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      This will update the target
                      exercise prescriptions and
                      record each change in the
                      progression audit history.
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setShowApplyConfirm(
                            false
                          )
                        }
                        disabled={applying}
                        className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm font-medium text-zinc-300 disabled:opacity-50"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={
                          applyProposedChanges
                        }
                        disabled={applying}
                        className="rounded-xl bg-emerald-500 px-3 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                      >
                        {applying
                          ? "Applying..."
                          : `Apply ${applicableRows.length}`}
                      </button>
                    </div>
                  </div>
                )}
            </section>
          )}

        {errorMessage && (
          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <p className="text-sm text-red-400">
              {errorMessage}
            </p>
          </div>
        )}

        {loading && (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
            Reviewing strength
            progression...
          </div>
        )}

        {!loading &&
          rows.length === 0 &&
          !errorMessage && (
            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-lg font-semibold">
                No strength
                prescriptions found
              </h2>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                There are no matching
                strength exercises
                available for this
                progression review.
              </p>
            </div>
          )}

        <div className="mt-7 space-y-8">
          {groupedByWorkout.map(
            (workoutRows) => {
              const first =
                workoutRows[0];

              return (
                <section
                  key={
                    first.targetWorkoutId
                  }
                >
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                      {formatDate(
                        first.targetWorkoutDate
                      )}
                    </p>

                    <h2 className="mt-1 text-xl font-semibold">
                      {
                        first.targetWorkoutName
                      }
                    </h2>
                  </div>

                  <div className="space-y-3">
                    {workoutRows.map(
                      (row) => {
                        const rec =
                          row.recommendation;

                        const appliedRecord =
                          appliedProgressions.find(
                            (record) =>
                              record.exercise_prescription_id ===
                              row.targetPrescription.id
                          ) ?? null;

                        return (
                          <article
                            key={`${row.targetWorkoutId}-${row.targetPrescription.id}`}
                            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="text-base font-semibold">
                                  {
                                    row.exerciseName
                                  }
                                </h3>

                                <p className="mt-1 text-xs text-zinc-500">
                                  {
                                    row.targetPrescription.sets ??
                                    0
                                  }{" "}
                                  ×{" "}
                                  {formatRepRange(
                                    row.targetPrescription.reps_min,
                                    row.targetPrescription.reps_max
                                  )}
                                </p>
                              </div>

                              <span
                                className={`shrink-0 rounded px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${
                                  appliedRecord
                                    ? "bg-emerald-950 text-emerald-400"
                                    : getActionClasses(
                                        rec.action
                                      )
                                }`}
                              >
                                {appliedRecord
                                  ? "Applied"
                                  : getActionLabel(
                                      rec.action
                                    )}
                              </span>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2">
                              <div className="rounded-xl bg-zinc-950 p-3">
                                <p className="text-[8px] font-semibold uppercase tracking-widest text-zinc-600">
                                  Current
                                </p>

                                <p className="mt-2 text-sm font-semibold text-zinc-200">
                                  {
                                    row.targetPrescription.sets ??
                                    0
                                  }{" "}
                                  ×{" "}
                                  {formatRepRange(
                                    row.targetPrescription.reps_min,
                                    row.targetPrescription.reps_max
                                  )}
                                </p>

                                <p className="mt-1 text-xs text-zinc-500">
                                  {row.targetPrescription.target_weight !=
                                  null
                                    ? `${row.targetPrescription.target_weight} lb`
                                    : "No target load"}
                                </p>
                              </div>

                              <div className="rounded-xl border border-emerald-950 bg-emerald-950/20 p-3">
                                <p className="text-[8px] font-semibold uppercase tracking-widest text-emerald-500">
                                  Proposed
                                </p>

                                <p className="mt-2 text-sm font-semibold text-emerald-400">
                                  {
                                    rec.proposedPrescription.sets
                                  }{" "}
                                  ×{" "}
                                  {formatRepRange(
                                    rec.proposedPrescription.repsMin,
                                    rec.proposedPrescription.repsMax
                                  )}
                                </p>

                                <p className="mt-1 text-xs text-emerald-500/80">
                                  {rec.proposedPrescription.targetWeight !=
                                  null
                                    ? `${rec.proposedPrescription.targetWeight} lb`
                                    : "No target load"}
                                </p>

                                {rec.proposedPrescription.suggestedRepTarget !=
                                  null && (
                                  <p className="mt-2 text-[10px] font-medium text-emerald-400">
                                    Next goal:{" "}
                                    {
                                      rec.proposedPrescription
                                        .suggestedRepTarget
                                    }
                                    + reps / set
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2">
                              <div className="rounded-lg bg-zinc-950 px-3 py-2">
                                <p className="text-[8px] uppercase tracking-wide text-zinc-600">
                                  Sets
                                </p>

                                <p className="mt-1 text-xs font-medium">
                                  {
                                    rec.completedSetCount
                                  }{" "}
                                  /{" "}
                                  {
                                    rec.prescribedSetCount
                                  }
                                </p>
                              </div>

                              <div className="rounded-lg bg-zinc-950 px-3 py-2">
                                <p className="text-[8px] uppercase tracking-wide text-zinc-600">
                                  Avg RPE
                                </p>

                                <p className="mt-1 text-xs font-medium">
                                  {rec.averageRpe ==
                                  null
                                    ? "—"
                                    : rec.averageRpe.toFixed(
                                        1
                                      )}
                                </p>
                              </div>

                              <div className="rounded-lg bg-zinc-950 px-3 py-2">
                                <p className="text-[8px] uppercase tracking-wide text-zinc-600">
                                  Target
                                </p>

                                <p className="mt-1 text-xs font-medium">
                                  {formatRpeRange(
                                    rec.proposedPrescription.targetRpeMin,
                                    rec.proposedPrescription.targetRpeMax
                                  )}
                                </p>
                              </div>
                            </div>

                            {rec.suggestedWeightChange !=
                              null && (
                              <div className="mt-3 rounded-lg bg-emerald-950/30 px-3 py-2">
                                <p className="text-[9px] uppercase tracking-wide text-emerald-500">
                                  Suggested load
                                </p>

                                <p className="mt-1 text-sm font-semibold text-emerald-400">
                                  {rec.suggestedWeightChange >
                                  0
                                    ? "+"
                                    : ""}
                                  {
                                    rec.suggestedWeightChange
                                  }{" "}
                                  lb
                                </p>
                              </div>
                            )}

                            {appliedRecord && (
                              <div className="mt-3 rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-3">
                                <p className="text-[9px] font-semibold uppercase tracking-widest text-emerald-500">
                                  Applied progression
                                </p>

                                <p className="mt-1 text-xs text-emerald-300">
                                  {new Date(
                                    appliedRecord.applied_at
                                  ).toLocaleString(
                                    "en-US",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      hour: "numeric",
                                      minute: "2-digit",
                                    }
                                  )}
                                </p>

                                {appliedRecord.previous_prescription?.targetWeight !==
                                  appliedRecord.proposed_prescription?.targetWeight && (
                                  <p className="mt-2 text-xs text-zinc-400">
                                    Load:{" "}
                                    {appliedRecord.previous_prescription?.targetWeight ??
                                      "none"}{" "}
                                    →{" "}
                                    {appliedRecord.proposed_prescription?.targetWeight ??
                                      "none"}{" "}
                                    lb
                                  </p>
                                )}
                              </div>
                            )}

                            <p className="mt-4 text-sm leading-6 text-zinc-400">
                              {
                                rec.reason
                              }
                            </p>
                          </article>
                        );
                      }
                    )}
                  </div>
                </section>
              );
            }
          )}
        </div>
      </div>
    </main>
  );
}

export default function ProgressionPreviewPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 px-4 pb-20 pt-8 text-zinc-100">
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
              Loading progression preview...
            </div>
          </div>
        </main>
      }
    >
      <ProgressionPreviewContent />
    </Suspense>
  );
}


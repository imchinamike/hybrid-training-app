"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  createWorkoutAdaptation,
  type ExercisePrescriptionInput,
  type WorkoutAdaptation,
} from "@/lib/workoutAdaptation";

type PlannedWorkout = {
  id: number;
  name: string;
  planned_date: string;
  estimated_duration_min: number | null;
};

type RawPrescription = {
  id: number;
  sets: number;
  reps_min: number | null;
  reps_max: number | null;
  target_rpe_min: number | null;
  target_rpe_max: number | null;
  rest_seconds: number | null;
  exercise_order: number | null;

  workout_components:
    | {
        title: string;
        component_order: number | null;
        planned_workout_id: number;
      }
    | {
        title: string;
        component_order: number | null;
        planned_workout_id: number;
      }[]
    | null;

  exercises:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

type ReadinessCheckin = {
  available_minutes: number | null;
};

type RecommendationRecord = {
  id: number;
};

function formatReps(
  repsMin: number | null,
  repsMax: number | null
) {
  if (repsMin == null && repsMax == null) {
    return "Reps not specified";
  }

  if (repsMin != null && repsMax != null) {
    if (repsMin === repsMax) {
      return `${repsMin} reps`;
    }

    return `${repsMin}-${repsMax} reps`;
  }

  return `${repsMin ?? repsMax} reps`;
}

function formatRpe(
  rpeMin: number | null,
  rpeMax: number | null
) {
  if (rpeMin == null && rpeMax == null) {
    return null;
  }

  if (rpeMin != null && rpeMax != null) {
    if (rpeMin === rpeMax) {
      return `RPE ${rpeMin}`;
    }

    return `RPE ${rpeMin}-${rpeMax}`;
  }

  return `RPE ${rpeMin ?? rpeMax}`;
}

export default function ModifyWorkoutPage() {
  const params = useParams();
  const router = useRouter();

  const workoutId = Number(params.id);

  const [workout, setWorkout] =
    useState<PlannedWorkout | null>(null);

  const [adaptation, setAdaptation] =
    useState<WorkoutAdaptation | null>(null);

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMessage("");

      if (!Number.isFinite(workoutId)) {
        setErrorMessage("Invalid workout ID.");
        setLoading(false);
        return;
      }

      const { data: workoutData, error: workoutError } =
        await supabase
          .from("planned_workouts")
          .select(
            `
            id,
            name,
            planned_date,
            estimated_duration_min
          `
          )
          .eq("id", workoutId)
          .single();

      if (workoutError) {
        setErrorMessage(workoutError.message);
        setLoading(false);
        return;
      }

      const loadedWorkout =
        workoutData as PlannedWorkout;

      setWorkout(loadedWorkout);

      const { data: readinessData, error: readinessError } =
        await supabase
          .from("readiness_checkins")
          .select("available_minutes")
          .eq("athlete_id", 1)
          .eq(
            "checkin_date",
            loadedWorkout.planned_date
          )
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
          `No time limit is set for the readiness check-in on ${loadedWorkout.planned_date}.`
        );
        setLoading(false);
        return;
      }

      const {
        data: prescriptionData,
        error: prescriptionError,
      } = await supabase
        .from("exercise_prescriptions")
        .select(
          `
          id,
          sets,
          reps_min,
          reps_max,
          target_rpe_min,
          target_rpe_max,
          rest_seconds,
          exercise_order,
          workout_components!inner (
            title,
            component_order,
            planned_workout_id
          ),
          exercises (
            name
          )
        `
        )
        .eq(
          "workout_components.planned_workout_id",
          workoutId
        );

      if (prescriptionError) {
        setErrorMessage(prescriptionError.message);
        setLoading(false);
        return;
      }

      const rawPrescriptions =
        (prescriptionData as unknown as
          | RawPrescription[]
          | null) ?? [];

      const mappedPrescriptions: ExercisePrescriptionInput[] =
        rawPrescriptions.map((item) => {
          const component = Array.isArray(
            item.workout_components
          )
            ? item.workout_components[0] ?? null
            : item.workout_components;

          const exercise = Array.isArray(
            item.exercises
          )
            ? item.exercises[0] ?? null
            : item.exercises;

          return {
            id: item.id,
            exerciseName:
              exercise?.name ?? "Exercise",
            componentName:
              component?.title ?? "Workout",
            componentOrder:
              component?.component_order ?? 0,
            exerciseOrder:
              item.exercise_order ?? 0,
            sets: item.sets,
            repsMin: item.reps_min,
            repsMax: item.reps_max,
            targetRpeMin: item.target_rpe_min,
            targetRpeMax: item.target_rpe_max,
            restSeconds: item.rest_seconds,
          };
        });

      if (mappedPrescriptions.length === 0) {
        setErrorMessage(
          "No exercise prescriptions were found for this workout."
        );
        setLoading(false);
        return;
      }

      const result = createWorkoutAdaptation(
        mappedPrescriptions,
        readiness.available_minutes,
        loadedWorkout.estimated_duration_min
      );

      setAdaptation(result);
      setLoading(false);
    }

    loadData();
  }, [workoutId]);

  const keptCount = useMemo(() => {
    if (!adaptation) return 0;

    return adaptation.exercises.filter(
      (exercise) => exercise.status === "keep"
    ).length;
  }, [adaptation]);

  const reducedCount = useMemo(() => {
    if (!adaptation) return 0;

    return adaptation.exercises.filter(
      (exercise) => exercise.status === "reduce"
    ).length;
  }, [adaptation]);

  const skippedCount = useMemo(() => {
    if (!adaptation) return 0;

    return adaptation.exercises.filter(
      (exercise) => exercise.status === "skip"
    ).length;
  }, [adaptation]);

  const adaptedSetMap = useMemo(() => {
    if (!adaptation) {
      return {};
    }

    return adaptation.exercises.reduce<
      Record<string, number>
    >((result, exercise) => {
      result[String(exercise.prescriptionId)] =
        exercise.adaptedSets;

      return result;
    }, {});
  }, [adaptation]);

  async function handleUseThisVersion() {
    if (!workout || !adaptation) {
      return;
    }

    setAccepting(true);
    setErrorMessage("");

    const {
      data: recommendationData,
      error: recommendationError,
    } = await supabase
      .from("training_recommendations")
      .select("id")
      .eq("athlete_id", 1)
      .eq(
        "recommendation_date",
        workout.planned_date
      )
      .maybeSingle();

    if (recommendationError) {
      setErrorMessage(
        recommendationError.message
      );
      setAccepting(false);
      return;
    }

    const recommendation =
      recommendationData as RecommendationRecord | null;

    const recommendationId =
      recommendation?.id ?? null;

    const {
      data: existingAdaptation,
      error: existingError,
    } = await supabase
      .from("workout_adaptations")
      .select("id")
      .eq("athlete_id", 1)
      .eq("planned_workout_id", workout.id)
      .eq("adaptation_date", workout.planned_date)
      .maybeSingle();

    if (existingError) {
      setErrorMessage(existingError.message);
      setAccepting(false);
      return;
    }

    let adaptationId: number | null = null;

    if (existingAdaptation) {
      const { data: updated, error: updateError } =
        await supabase
          .from("workout_adaptations")
          .update({
            recommendation_id: recommendationId,
            adaptation_type: "reduced_volume",
            available_minutes: adaptation.availableMinutes,
            original_duration_min: Math.round(
              adaptation.estimatedOriginalMinutes
            ),
            adapted_duration_min: Math.round(
              adaptation.estimatedAdaptedMinutes
            ),
            adaptation_payload: adaptedSetMap,
            accepted: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingAdaptation.id)
          .select("id")
          .single();

      if (updateError || !updated) {
        setErrorMessage(
          updateError?.message ??
            "Could not update workout adaptation."
        );
        setAccepting(false);
        return;
      }

      adaptationId = updated.id;
    } else {
      const { data: inserted, error: insertError } =
        await supabase
          .from("workout_adaptations")
          .insert({
            athlete_id: 1,
            planned_workout_id: workout.id,
            recommendation_id: recommendationId,
            adaptation_date: workout.planned_date,
            adaptation_type: "reduced_volume",
            available_minutes: adaptation.availableMinutes,
            original_duration_min: Math.round(
              adaptation.estimatedOriginalMinutes
            ),
            adapted_duration_min: Math.round(
              adaptation.estimatedAdaptedMinutes
            ),
            adaptation_payload: adaptedSetMap,
            accepted: true,
          })
          .select("id")
          .single();

      if (insertError || !inserted) {
        setErrorMessage(
          insertError?.message ??
            "Could not save workout adaptation."
        );
        setAccepting(false);
        return;
      }

      adaptationId = inserted.id;
    }

    router.push(
      `/workout/${workout.id}/log?mode=adapted&adaptationId=${adaptationId}`
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto w-full max-w-md">
          <p className="text-sm text-zinc-500">
            Building modified workout...
          </p>
        </div>
      </main>
    );
  }

  if (errorMessage || !workout || !adaptation) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto w-full max-w-md">
          <Link
            href={`/workout/${workoutId}`}
            className="text-sm font-medium text-emerald-400"
          >
            ← Back to workout
          </Link>

          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/30 p-4">
            <p className="text-sm text-red-400">
              {errorMessage ||
                "Could not build workout adaptation."}
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
          href={`/workout/${workout.id}`}
          className="text-sm font-medium text-emerald-400"
        >
          ← Back to workout
        </Link>

        <header className="mt-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-400">
            Modified workout preview
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {workout.name}
          </h1>

          <p className="mt-2 text-sm leading-6 text-zinc-500">
            This version is designed to fit your available
            time without changing the original workout.
          </p>
        </header>

        <section className="mt-6 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-center">
            <p className="text-[9px] uppercase tracking-wide text-zinc-600">
              Original
            </p>

            <p className="mt-1 text-lg font-semibold">
              {Math.round(
                adaptation.estimatedOriginalMinutes
              )}
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
              {Math.round(
                adaptation.estimatedAdaptedMinutes
              )}
            </p>

            <p className="text-[10px] text-emerald-700">
              min
            </p>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-[10px] uppercase tracking-wide text-zinc-600">
            Changes
          </p>

          <div className="mt-3 flex gap-4 text-xs">
            <span className="text-emerald-400">
              {keptCount} kept
            </span>

            <span className="text-orange-400">
              {reducedCount} reduced
            </span>

            <span className="text-zinc-500">
              {skippedCount} skipped
            </span>
          </div>
        </section>

        <section className="mt-6 space-y-3">
          {adaptation.exercises.map((exercise) => {
            const rpe = formatRpe(
              exercise.targetRpeMin,
              exercise.targetRpeMax
            );

            return (
              <div
                key={exercise.prescriptionId}
                className={`rounded-xl border p-4 ${
                  exercise.status === "keep"
                    ? "border-emerald-900 bg-emerald-950/20"
                    : exercise.status === "reduce"
                    ? "border-orange-900 bg-orange-950/20"
                    : "border-zinc-800 bg-zinc-900 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                      {exercise.componentName}
                    </p>

                    <h2 className="mt-1 text-base font-semibold">
                      {exercise.exerciseName}
                    </h2>
                  </div>

                  <span
                    className={`rounded px-2 py-1 text-[9px] font-semibold uppercase ${
                      exercise.status === "keep"
                        ? "bg-emerald-900/60 text-emerald-400"
                        : exercise.status === "reduce"
                        ? "bg-orange-900/60 text-orange-400"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {exercise.status}
                  </span>
                </div>

                {exercise.status !== "skip" ? (
                  <div className="mt-3">
                    <p className="text-sm text-zinc-300">
                      {exercise.adaptedSets} ×{" "}
                      {formatReps(
                        exercise.repsMin,
                        exercise.repsMax
                      )}
                    </p>

                    {exercise.status === "reduce" && (
                      <p className="mt-1 text-xs text-orange-400">
                        Reduced from{" "}
                        {exercise.originalSets} sets
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-zinc-500">
                      {rpe && <span>{rpe}</span>}

                      {exercise.restSeconds != null && (
                        <span>
                          {exercise.restSeconds}s rest
                        </span>
                      )}

                      <span>
                        ~
                        {Math.round(
                          exercise.estimatedMinutes
                        )}{" "}
                        min
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-zinc-500">
                    Skip this exercise in the shortened
                    version.
                  </p>
                )}
              </div>
            );
          })}
        </section>

        <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs leading-5 text-zinc-500">
            Accepting this version will save the adaptation,
            link it to the recommendation for this date when
            one exists, and leave the original prescription
            unchanged.
          </p>
        </section>

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-4">
            <p className="text-sm text-red-400">
              {errorMessage}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={handleUseThisVersion}
          disabled={accepting}
          className="mt-4 w-full rounded-xl bg-orange-500 py-4 text-center text-sm font-semibold text-zinc-950 transition hover:bg-orange-400 disabled:opacity-50"
        >
          {accepting
            ? "Saving adaptation..."
            : "Use this version"}
        </button>

        <Link
          href={`/workout/${workout.id}`}
          className="mt-3 block w-full rounded-xl border border-zinc-800 py-4 text-center text-sm font-semibold text-zinc-400 transition hover:bg-zinc-900"
        >
          Keep original workout
        </Link>
      </div>
    </main>
  );
}
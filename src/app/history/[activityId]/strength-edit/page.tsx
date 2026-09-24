"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Activity = {
  id: number;
  activity_type: string;
  start_time: string;
};

type WorkoutMatch = {
  planned_workout_id: number;
};

type PlannedWorkout = {
  id: number;
  name: string;
};

type WorkoutComponent = {
  id: number;
  component_order: number;
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

type CompletedSet = {
  activity_id: number;
  exercise_id: number;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
};

type Exercise = {
  id: number;
  name: string;
};

type EditableSet = {
  activity_id: number;
  exercise_id: number;
  set_number: number;

  weightInput: string;
  repsInput: string;
  rpeInput: string;

  existsInDatabase: boolean;
};

type ExerciseGroup = {
  exerciseId: number;
  exerciseName: string;
  prescription: ExercisePrescription | null;
  sets: EditableSet[];
};

export default function StrengthEditPage() {
  const params =
    useParams<{ activityId: string }>();

  const router = useRouter();

  const activityId =
    Number(params.activityId);

  const [activity, setActivity] =
    useState<Activity | null>(null);

  const [workout, setWorkout] =
    useState<PlannedWorkout | null>(null);

  const [sets, setSets] =
    useState<EditableSet[]>([]);

  const [prescriptions, setPrescriptions] =
    useState<ExercisePrescription[]>([]);

  const [exercises, setExercises] =
    useState<Exercise[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  useEffect(() => {
    async function loadStrengthActivity() {
      setLoading(true);
      setErrorMessage("");

      if (!Number.isFinite(activityId)) {
        setErrorMessage(
          "Invalid activity ID."
        );
        setLoading(false);
        return;
      }

      /*
       * Load completed activity
       */
      const {
        data: activityData,
        error: activityError,
      } = await supabase
        .from("activities")
        .select(
          `
          id,
          activity_type,
          start_time
        `
        )
        .eq("id", activityId)
        .single();

      if (
        activityError ||
        !activityData
      ) {
        setErrorMessage(
          activityError?.message ??
            "Activity not found."
        );

        setLoading(false);
        return;
      }

      const loadedActivity =
        activityData as Activity;

      setActivity(loadedActivity);

      /*
       * Match activity back to planned workout
       */
      const {
        data: matchData,
        error: matchError,
      } = await supabase
        .from("workout_activity_matches")
        .select("planned_workout_id")
        .eq("activity_id", activityId)
        .maybeSingle();

      if (matchError) {
        setErrorMessage(
          matchError.message
        );

        setLoading(false);
        return;
      }

      if (!matchData) {
        setErrorMessage(
          "This strength activity is not linked to a planned workout."
        );

        setLoading(false);
        return;
      }

      const loadedMatch =
        matchData as WorkoutMatch;

      /*
       * Load planned workout
       */
      const {
        data: workoutData,
        error: workoutError,
      } = await supabase
        .from("planned_workouts")
        .select("id, name")
        .eq(
          "id",
          loadedMatch.planned_workout_id
        )
        .single();

      if (
        workoutError ||
        !workoutData
      ) {
        setErrorMessage(
          workoutError?.message ??
            "Planned workout not found."
        );

        setLoading(false);
        return;
      }

      const loadedWorkout =
        workoutData as PlannedWorkout;

      setWorkout(loadedWorkout);

      /*
       * Load workout components
       */
      const {
        data: componentData,
        error: componentError,
      } = await supabase
        .from("workout_components")
        .select(
          `
          id,
          component_order
        `
        )
        .eq(
          "planned_workout_id",
          loadedWorkout.id
        )
        .order(
          "component_order",
          { ascending: true }
        );

      if (componentError) {
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

      /*
       * Load original exercise prescriptions
       */
      let loadedPrescriptions:
        ExercisePrescription[] = [];

      if (
        componentIds.length > 0
      ) {
        const {
          data: prescriptionData,
          error: prescriptionError,
        } = await supabase
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
          )
          .order(
            "exercise_order",
            { ascending: true }
          );

        if (prescriptionError) {
          setErrorMessage(
            prescriptionError.message
          );

          setLoading(false);
          return;
        }

        loadedPrescriptions =
          (prescriptionData as
            | ExercisePrescription[]
            | null) ?? [];

        setPrescriptions(
          loadedPrescriptions
        );
      }

      /*
       * Load sets that were actually saved
       */
      const {
        data: setData,
        error: setError,
      } = await supabase
        .from("completed_sets")
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
        .eq(
          "activity_id",
          activityId
        );

      if (setError) {
        setErrorMessage(
          setError.message
        );

        setLoading(false);
        return;
      }

      const loadedSets =
        (setData as
          | CompletedSet[]
          | null) ?? [];

      /*
       * Build exercise list using both the original
       * prescription and any saved sets.
       */
      const exerciseIds = [
        ...new Set([
          ...loadedPrescriptions.map(
            (prescription) =>
              prescription.exercise_id
          ),
          ...loadedSets.map(
            (set) =>
              set.exercise_id
          ),
        ]),
      ];

      if (
        exerciseIds.length > 0
      ) {
        const {
          data: exerciseData,
          error: exerciseError,
        } = await supabase
          .from("exercises")
          .select("id, name")
          .in(
            "id",
            exerciseIds
          );

        if (exerciseError) {
          setErrorMessage(
            exerciseError.message
          );

          setLoading(false);
          return;
        }

        setExercises(
          (exerciseData as
            | Exercise[]
            | null) ?? []
        );
      }

      /*
       * Create editable rows.
       *
       * For prescribed sets that were never completed,
       * create placeholder rows with existsInDatabase=false.
       */
      const editableSets:
        EditableSet[] = [];

      for (
        const prescription
        of loadedPrescriptions
      ) {
        const prescribedSetCount =
          prescription.sets ?? 0;

        for (
          let setNumber = 1;
          setNumber <=
          prescribedSetCount;
          setNumber++
        ) {
          const existingSet =
            loadedSets.find(
              (set) =>
                set.exercise_id ===
                  prescription.exercise_id &&
                set.set_number ===
                  setNumber
            );

          editableSets.push({
            activity_id:
              activityId,

            exercise_id:
              prescription.exercise_id,

            set_number:
              setNumber,

            weightInput:
              existingSet?.weight ==
              null
                ? ""
                : String(
                    existingSet.weight
                  ),

            repsInput:
              existingSet?.reps ==
              null
                ? ""
                : String(
                    existingSet.reps
                  ),

            rpeInput:
              existingSet?.rpe ==
              null
                ? ""
                : String(
                    existingSet.rpe
                  ),

            existsInDatabase:
              Boolean(existingSet),
          });
        }
      }

      /*
       * Preserve any completed sets that aren't represented
       * by the original prescription.
       */
      for (
        const completedSet
        of loadedSets
      ) {
        const alreadyIncluded =
          editableSets.some(
            (set) =>
              set.exercise_id ===
                completedSet.exercise_id &&
              set.set_number ===
                completedSet.set_number
          );

        if (!alreadyIncluded) {
          editableSets.push({
            activity_id:
              activityId,

            exercise_id:
              completedSet.exercise_id,

            set_number:
              completedSet.set_number,

            weightInput:
              completedSet.weight ==
              null
                ? ""
                : String(
                    completedSet.weight
                  ),

            repsInput:
              completedSet.reps ==
              null
                ? ""
                : String(
                    completedSet.reps
                  ),

            rpeInput:
              completedSet.rpe ==
              null
                ? ""
                : String(
                    completedSet.rpe
                  ),

            existsInDatabase:
              true,
          });
        }
      }

      setSets(editableSets);

      setLoading(false);
    }

    loadStrengthActivity();
  }, [activityId]);

  const exerciseMap =
    useMemo(
      () =>
        new Map(
          exercises.map(
            (exercise) => [
              exercise.id,
              exercise.name,
            ]
          )
        ),
      [exercises]
    );

  const groupedExercises =
    useMemo(() => {
      const exerciseIds = [
        ...new Set(
          sets.map(
            (set) =>
              set.exercise_id
          )
        ),
      ];

      const groups:
        ExerciseGroup[] = [];

      exerciseIds.forEach(
        (exerciseId) => {
          const exerciseSets =
            sets
              .filter(
                (set) =>
                  set.exercise_id ===
                  exerciseId
              )
              .sort(
                (a, b) =>
                  a.set_number -
                  b.set_number
              );

          const prescription =
            prescriptions.find(
              (item) =>
                item.exercise_id ===
                exerciseId
            ) ?? null;

          groups.push({
            exerciseId,

            exerciseName:
              exerciseMap.get(
                exerciseId
              ) ?? "Exercise",

            prescription,

            sets:
              exerciseSets,
          });
        }
      );

      return groups;
    }, [
      sets,
      prescriptions,
      exerciseMap,
    ]);

  function updateSetField(
    exerciseId: number,
    setNumber: number,
    field:
      | "weightInput"
      | "repsInput"
      | "rpeInput",
    value: string
  ) {
    setSets(
      (currentSets) =>
        currentSets.map(
          (set) =>
            set.exercise_id ===
              exerciseId &&
            set.set_number ===
              setNumber
              ? {
                  ...set,
                  [field]: value,
                }
              : set
        )
    );
  }

  async function addMissingSet(
    exerciseId: number,
    setNumber: number
  ) {
    if (!activity) return;

    const set =
      sets.find(
        (item) =>
          item.exercise_id ===
            exerciseId &&
          item.set_number ===
            setNumber
      );

    if (!set) return;

    const weight =
      set.weightInput.trim() === ""
        ? null
        : Number(
            set.weightInput
          );

    const reps =
      set.repsInput.trim() === ""
        ? null
        : Number(
            set.repsInput
          );

    const rpe =
      set.rpeInput.trim() === ""
        ? null
        : Number(
            set.rpeInput
          );

    if (
      weight != null &&
      (
        !Number.isFinite(weight) ||
        weight < 0
      )
    ) {
      setErrorMessage(
        "Enter a valid weight."
      );
      return;
    }

    if (
      reps != null &&
      (
        !Number.isFinite(reps) ||
        reps < 0
      )
    ) {
      setErrorMessage(
        "Enter valid reps."
      );
      return;
    }

    if (
      rpe != null &&
      (
        !Number.isFinite(rpe) ||
        rpe < 1 ||
        rpe > 10
      )
    ) {
      setErrorMessage(
        "Enter an RPE from 1 to 10."
      );
      return;
    }

    /*
     * Require at least one meaningful value so an accidental
     * click doesn't create a completely empty completed set.
     */
    if (
      weight == null &&
      reps == null &&
      rpe == null
    ) {
      setErrorMessage(
        "Enter the set details before adding it."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    const { error } =
      await supabase
        .from(
          "completed_sets"
        )
        .insert({
          activity_id:
            activity.id,

          exercise_id:
            exerciseId,

          set_number:
            setNumber,

          weight,
          reps,
          rpe,
        });

    if (error) {
      setErrorMessage(
        error.message
      );
      setSaving(false);
      return;
    }

    setSets(
      (currentSets) =>
        currentSets.map(
          (item) =>
            item.exercise_id ===
              exerciseId &&
            item.set_number ===
              setNumber
              ? {
                  ...item,
                  existsInDatabase:
                    true,
                }
              : item
        )
    );

    setSaving(false);
  }

  async function saveChanges() {
    if (!activity) return;

    /*
     * Only update sets that already exist.
     * Missing prescribed sets stay missing unless the user
     * explicitly taps Add set.
     */
    const existingSets =
      sets.filter(
        (set) =>
          set.existsInDatabase
      );

    for (
      const set
      of existingSets
    ) {
      if (
        set.weightInput.trim() !==
          "" &&
        (
          !Number.isFinite(
            Number(
              set.weightInput
            )
          ) ||
          Number(
            set.weightInput
          ) < 0
        )
      ) {
        setErrorMessage(
          `Enter a valid weight for ${
            exerciseMap.get(
              set.exercise_id
            ) ?? "exercise"
          } set ${
            set.set_number
          }.`
        );

        return;
      }

      if (
        set.repsInput.trim() !==
          "" &&
        (
          !Number.isFinite(
            Number(
              set.repsInput
            )
          ) ||
          Number(
            set.repsInput
          ) < 0
        )
      ) {
        setErrorMessage(
          `Enter valid reps for ${
            exerciseMap.get(
              set.exercise_id
            ) ?? "exercise"
          } set ${
            set.set_number
          }.`
        );

        return;
      }

      if (
        set.rpeInput.trim() !==
          "" &&
        (
          !Number.isFinite(
            Number(
              set.rpeInput
            )
          ) ||
          Number(
            set.rpeInput
          ) < 1 ||
          Number(
            set.rpeInput
          ) > 10
        )
      ) {
        setErrorMessage(
          `Enter an RPE from 1 to 10 for ${
            exerciseMap.get(
              set.exercise_id
            ) ?? "exercise"
          } set ${
            set.set_number
          }.`
        );

        return;
      }
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    for (
      const set
      of existingSets
    ) {
      const weight =
        set.weightInput.trim() ===
        ""
          ? null
          : Number(
              set.weightInput
            );

      const reps =
        set.repsInput.trim() ===
        ""
          ? null
          : Number(
              set.repsInput
            );

      const rpe =
        set.rpeInput.trim() ===
        ""
          ? null
          : Number(
              set.rpeInput
            );

      const { error } =
        await supabase
          .from(
            "completed_sets"
          )
          .update({
            weight,
            reps,
            rpe,
          })
          .eq(
            "activity_id",
            activity.id
          )
          .eq(
            "exercise_id",
            set.exercise_id
          )
          .eq(
            "set_number",
            set.set_number
          );

      if (error) {
        setErrorMessage(
          error.message
        );

        setSaving(false);
        return;
      }
    }

    setSuccessMessage(
      "Changes saved ✓"
    );

    setSaving(false);

    window.setTimeout(
      () => {
        router.push(
          "/history"
        );

        router.refresh();
      },
      700
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto max-w-md">
          <p className="text-sm text-zinc-500">
            Loading strength session...
          </p>
        </div>
      </main>
    );
  }

  if (
    !activity ||
    errorMessage &&
      sets.length === 0
  ) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto max-w-md">
          <Link
            href="/history"
            className="text-sm font-medium text-emerald-400"
          >
            ← History
          </Link>

          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <p className="text-sm text-red-400">
              {errorMessage ||
                "Unable to load strength session."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-20 pt-8 text-zinc-100">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/history"
          className="text-sm font-medium text-emerald-400"
        >
          ← History
        </Link>

        <header className="mt-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
            Edit completed workout
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {workout?.name ??
              activity.activity_type.replaceAll(
                "_",
                " "
              )}
          </h1>

          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Correct completed sets or add a prescribed set
            that was missed when the workout was saved.
          </p>
        </header>

        <div className="mt-6 space-y-6">
          {groupedExercises.map(
            (group) => (
              <section
                key={
                  group.exerciseId
                }
              >
                <div className="mb-3">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                    Exercise
                  </p>

                  <h2 className="mt-1 text-lg font-semibold">
                    {
                      group.exerciseName
                    }
                  </h2>

                  {group.prescription &&
                    group.prescription.sets !=
                      null && (
                      <p className="mt-1 text-xs text-zinc-500">
                        Prescribed:{" "}
                        {
                          group.prescription.sets
                        }{" "}
                        sets
                      </p>
                    )}
                </div>

                <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                  {group.sets.map(
                    (
                      set,
                      index
                    ) => (
                      <div
                        key={`${set.exercise_id}-${set.set_number}`}
                        className={`p-4 ${
                          index !==
                          group.sets
                            .length -
                            1
                            ? "border-b border-zinc-800"
                            : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-xs font-medium text-zinc-500">
                            Set{" "}
                            {
                              set.set_number
                            }
                          </p>

                          {!set.existsInDatabase && (
                            <span className="rounded-full bg-orange-950 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-orange-400">
                              Missing
                            </span>
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <label>
                            <span className="text-[9px] uppercase tracking-wide text-zinc-600">
                              Weight
                            </span>

                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.5"
                              min="0"
                              value={
                                set.weightInput
                              }
                              onChange={(
                                event
                              ) =>
                                updateSetField(
                                  set.exercise_id,
                                  set.set_number,
                                  "weightInput",
                                  event
                                    .target
                                    .value
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm outline-none focus:border-emerald-500"
                              placeholder="—"
                            />
                          </label>

                          <label>
                            <span className="text-[9px] uppercase tracking-wide text-zinc-600">
                              Reps
                            </span>

                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              value={
                                set.repsInput
                              }
                              onChange={(
                                event
                              ) =>
                                updateSetField(
                                  set.exercise_id,
                                  set.set_number,
                                  "repsInput",
                                  event
                                    .target
                                    .value
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm outline-none focus:border-emerald-500"
                              placeholder="—"
                            />
                          </label>

                          <label>
                            <span className="text-[9px] uppercase tracking-wide text-zinc-600">
                              RPE
                            </span>

                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.5"
                              min="1"
                              max="10"
                              value={
                                set.rpeInput
                              }
                              onChange={(
                                event
                              ) =>
                                updateSetField(
                                  set.exercise_id,
                                  set.set_number,
                                  "rpeInput",
                                  event
                                    .target
                                    .value
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm outline-none focus:border-emerald-500"
                              placeholder="—"
                            />
                          </label>
                        </div>

                        {!set.existsInDatabase && (
                          <button
                            type="button"
                            onClick={() =>
                              addMissingSet(
                                set.exercise_id,
                                set.set_number
                              )
                            }
                            disabled={
                              saving
                            }
                            className="mt-3 w-full rounded-lg border border-emerald-800 bg-emerald-950/30 py-2.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-950/60 disabled:opacity-50"
                          >
                            Add set
                          </button>
                        )}
                      </div>
                    )
                  )}
                </div>
              </section>
            )
          )}
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-4">
            <p className="text-sm text-red-400">
              {errorMessage}
            </p>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 rounded-xl border border-emerald-900 bg-emerald-950/30 p-4">
            <p className="text-sm text-emerald-400">
              {successMessage}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={saveChanges}
          disabled={
            saving ||
            successMessage !== ""
          }
          className="mt-6 w-full rounded-xl bg-emerald-500 py-4 text-base font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : successMessage
            ? "Changes saved ✓"
            : "Save changes"}
        </button>
      </div>
    </main>
  );
}
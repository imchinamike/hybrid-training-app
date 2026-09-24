"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Activity = {
  id: number;
  athlete_id: number;
  activity_type: string;
  source: string | null;
  start_time: string;
  duration_seconds: number | null;
  distance_meters: number | null;
  average_heart_rate: number | null;
  session_rpe: number | null;
  notes: string | null;
};

type WorkoutMatch = {
  activity_id: number;
  planned_workout_id: number;
};

type PlannedWorkout = {
  id: number;
  name: string;
  planned_date: string;
};

type WorkoutComponent = {
  id: number;
  planned_workout_id: number;
};

type ExercisePrescription = {
  id: number;
  workout_component_id: number;
  exercise_id: number;
  sets: number | null;
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

type WorkoutAdaptation = {
  id: number;
  planned_workout_id: number;
  adaptation_date: string;
  adaptation_type: string;
  available_minutes: number | null;
  original_duration_min: number | null;
  adapted_duration_min: number | null;
  accepted: boolean;
  adaptation_payload: Record<string, number> | null;
};

function formatDuration(seconds: number | null) {
  if (!seconds) return null;

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

function formatDistance(meters: number | null) {
  if (meters == null) return null;

  const miles = meters / 1609.344;

  return `${miles.toFixed(2)} mi`;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAdaptationType(value: string) {
  switch (value) {
    case "reduced_volume":
      return "Reduced volume";

    case "shortened":
      return "Shortened";

    case "skipped":
      return "Skipped";

    case "moved":
      return "Moved";

    default:
      return value.replaceAll("_", " ");
  }
}

function getAdaptationIdFromNotes(notes: string | null) {
  if (!notes) return null;

  const match = notes.match(/\(adaptation\s+(\d+)\)/i);

  if (!match) return null;

  return Number(match[1]);
}

export default function HistoryPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [matches, setMatches] = useState<WorkoutMatch[]>([]);

  const [plannedWorkouts, setPlannedWorkouts] = useState<
    PlannedWorkout[]
  >([]);

  const [workoutComponents, setWorkoutComponents] = useState<
    WorkoutComponent[]
  >([]);

  const [exercisePrescriptions, setExercisePrescriptions] =
    useState<ExercisePrescription[]>([]);

  const [completedSets, setCompletedSets] = useState<
    CompletedSet[]
  >([]);

  const [exercises, setExercises] = useState<Exercise[]>([]);

  const [adaptations, setAdaptations] = useState<
    WorkoutAdaptation[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadHistory() {
      setLoading(true);
      setErrorMessage("");

      const { data: athleteData, error: athleteError } =
        await supabase
          .from("athletes")
          .select("id")
          .eq("name", "Mike")
          .single();

      if (athleteError || !athleteData) {
        setErrorMessage(
          athleteError?.message ?? "Could not find athlete."
        );
        setLoading(false);
        return;
      }

      const { data: activityData, error: activityError } =
        await supabase
          .from("activities")
          .select(
            `
            id,
            athlete_id,
            activity_type,
            source,
            start_time,
            duration_seconds,
            distance_meters,
            average_heart_rate,
            session_rpe,
            notes
          `
          )
          .eq("athlete_id", athleteData.id)
          .order("start_time", { ascending: false });

      if (activityError) {
        setErrorMessage(activityError.message);
        setLoading(false);
        return;
      }

      const loadedActivities =
        (activityData as Activity[] | null) ?? [];

      setActivities(loadedActivities);

      const activityIds = loadedActivities.map(
        (activity) => activity.id
      );

      if (activityIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: matchData, error: matchError } =
        await supabase
          .from("workout_activity_matches")
          .select("activity_id, planned_workout_id")
          .in("activity_id", activityIds);

      if (matchError) {
        setErrorMessage(matchError.message);
        setLoading(false);
        return;
      }

      const loadedMatches =
        (matchData as WorkoutMatch[] | null) ?? [];

      setMatches(loadedMatches);

      const workoutIds = [
        ...new Set(
          loadedMatches.map(
            (match) => match.planned_workout_id
          )
        ),
      ];

      if (workoutIds.length > 0) {
        /*
         * Planned workout names
         */
        const { data: workoutData, error: workoutError } =
          await supabase
            .from("planned_workouts")
            .select("id, name, planned_date")
            .in("id", workoutIds);

        if (workoutError) {
          setErrorMessage(workoutError.message);
          setLoading(false);
          return;
        }

        setPlannedWorkouts(
          (workoutData as PlannedWorkout[] | null) ?? []
        );

        /*
         * Accepted workout adaptations
         */
        const {
          data: adaptationData,
          error: adaptationError,
        } = await supabase
          .from("workout_adaptations")
          .select(
            `
            id,
            planned_workout_id,
            adaptation_date,
            adaptation_type,
            available_minutes,
            original_duration_min,
            adapted_duration_min,
            accepted,
            adaptation_payload
          `
          )
          .eq("athlete_id", athleteData.id)
          .eq("accepted", true)
          .in("planned_workout_id", workoutIds);

        if (adaptationError) {
          setErrorMessage(adaptationError.message);
          setLoading(false);
          return;
        }

        setAdaptations(
          (adaptationData as WorkoutAdaptation[] | null) ?? []
        );

        /*
         * Strength workout components
         */
        const {
          data: componentData,
          error: componentError,
        } = await supabase
          .from("workout_components")
          .select(
            `
            id,
            planned_workout_id
          `
          )
          .in("planned_workout_id", workoutIds);

        if (componentError) {
          setErrorMessage(componentError.message);
          setLoading(false);
          return;
        }

        const loadedComponents =
          (componentData as WorkoutComponent[] | null) ?? [];

        setWorkoutComponents(loadedComponents);

        const componentIds = loadedComponents.map(
          (component) => component.id
        );

        /*
         * Original strength prescriptions.
         * We use these to calculate how many sets were planned.
         */
        if (componentIds.length > 0) {
          const {
            data: prescriptionData,
            error: prescriptionError,
          } = await supabase
            .from("exercise_prescriptions")
            .select(
              `
              id,
              workout_component_id,
              exercise_id,
              sets
            `
            )
            .in("workout_component_id", componentIds);

          if (prescriptionError) {
            setErrorMessage(prescriptionError.message);
            setLoading(false);
            return;
          }

          setExercisePrescriptions(
            (prescriptionData as
              | ExercisePrescription[]
              | null) ?? []
          );
        }
      }

      /*
       * Completed strength sets
       */
      const { data: setData, error: setError } =
        await supabase
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
          .in("activity_id", activityIds)
          .order("set_number", { ascending: true });

      if (setError) {
        setErrorMessage(setError.message);
        setLoading(false);
        return;
      }

      const loadedSets =
        (setData as CompletedSet[] | null) ?? [];

      setCompletedSets(loadedSets);

      const exerciseIds = [
        ...new Set(
          loadedSets.map((set) => set.exercise_id)
        ),
      ];

      if (exerciseIds.length > 0) {
        const { data: exerciseData, error: exerciseError } =
          await supabase
            .from("exercises")
            .select("id, name")
            .in("id", exerciseIds);

        if (exerciseError) {
          setErrorMessage(exerciseError.message);
          setLoading(false);
          return;
        }

        setExercises(
          (exerciseData as Exercise[] | null) ?? []
        );
      }

      setLoading(false);
    }

    loadHistory();
  }, []);

  const workoutMap = useMemo(
    () =>
      new Map(
        plannedWorkouts.map((workout) => [
          workout.id,
          workout,
        ])
      ),
    [plannedWorkouts]
  );

  const exerciseMap = useMemo(
    () =>
      new Map(
        exercises.map((exercise) => [
          exercise.id,
          exercise.name,
        ])
      ),
    [exercises]
  );

  const adaptationMap = useMemo(
    () =>
      new Map(
        adaptations.map((adaptation) => [
          adaptation.id,
          adaptation,
        ])
      ),
    [adaptations]
  );

  function getWorkoutMatch(activityId: number) {
    return (
      matches.find(
        (item) => item.activity_id === activityId
      ) ?? null
    );
  }

  function getWorkout(activityId: number) {
    const match = getWorkoutMatch(activityId);

    if (!match) return null;

    return (
      workoutMap.get(match.planned_workout_id) ?? null
    );
  }

  function getSetsForActivity(activityId: number) {
    return completedSets.filter(
      (set) => set.activity_id === activityId
    );
  }

  function getAdaptation(activity: Activity) {
    const adaptationId =
      getAdaptationIdFromNotes(activity.notes);

    if (adaptationId != null) {
      return adaptationMap.get(adaptationId) ?? null;
    }

    if (
      activity.notes
        ?.toLowerCase()
        .includes("completed adapted version")
    ) {
      const match = getWorkoutMatch(activity.id);

      if (!match) return null;

      return (
        adaptations.find(
          (adaptation) =>
            adaptation.planned_workout_id ===
            match.planned_workout_id
        ) ?? null
      );
    }

    return null;
  }

  function getPrescriptionsForWorkout(workoutId: number) {
    const componentIds = workoutComponents
      .filter(
        (component) =>
          component.planned_workout_id === workoutId
      )
      .map((component) => component.id);

    return exercisePrescriptions.filter(
      (prescription) =>
        componentIds.includes(
          prescription.workout_component_id
        )
    );
  }

  function getPrescribedSetCount(
    activity: Activity,
    adaptation: WorkoutAdaptation | null
  ) {
    const match = getWorkoutMatch(activity.id);

    if (!match) {
      return null;
    }

    const workoutPrescriptions =
      getPrescriptionsForWorkout(
        match.planned_workout_id
      );

    if (workoutPrescriptions.length === 0) {
      return null;
    }

    /*
     * If this was an adapted workout, its saved adaptation
     * payload is the prescription that the athlete actually
     * intended to perform.
     *
     * Example:
     * Original = 16 sets
     * Adapted = 8 sets
     *
     * Completing 8 of 8 should be Completed, not Partial.
     */
    if (
      adaptation?.adaptation_payload
    ) {
      return workoutPrescriptions.reduce(
        (total, prescription) => {
          const adaptedSetCount =
            adaptation.adaptation_payload?.[
              String(prescription.id)
            ];

          if (adaptedSetCount === undefined) {
            return (
              total +
              (prescription.sets ?? 0)
            );
          }

          return (
            total +
            Math.max(
              0,
              Number(adaptedSetCount)
            )
          );
        },
        0
      );
    }

    /*
     * Normal workout: use the original prescribed sets.
     */
    return workoutPrescriptions.reduce(
      (total, prescription) =>
        total + (prescription.sets ?? 0),
      0
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-8">
        <header className="mb-6">
          <p className="text-[10px] font-medium uppercase tracking-widest text-emerald-400">
            Training log
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            History
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            Completed training sessions will appear here.
          </p>
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
            Loading history...
          </div>
        )}

        {!loading && activities.length === 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">
              No completed workouts yet
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Once you finish a workout, it will show up here
              with your training details.
            </p>

            <Link
              href="/"
              className="mt-5 block w-full rounded-xl bg-emerald-500 py-3 text-center text-sm font-semibold text-zinc-950"
            >
              Back to Today
            </Link>
          </div>
        )}

        <div className="space-y-5">
          {activities.map((activity) => {
            const workout = getWorkout(activity.id);

            const activitySets =
              getSetsForActivity(activity.id);

            const adaptation =
              getAdaptation(activity);

            const isAdapted =
              adaptation !== null;

            const duration =
              formatDuration(
                activity.duration_seconds
              );

            const distance =
              formatDistance(
                activity.distance_meters
              );

            const hasCardioMetrics =
              distance != null ||
              activity.average_heart_rate != null;

            const isStrengthActivity =
              activitySets.length > 0;

            const isEditableCardio =
              activitySets.length === 0;

            const prescribedSetCount =
              isStrengthActivity
                ? getPrescribedSetCount(
                    activity,
                    adaptation
                  )
                : null;

            const isPartialStrength =
              isStrengthActivity &&
              prescribedSetCount != null &&
              prescribedSetCount > 0 &&
              activitySets.length <
                prescribedSetCount;

            return (
              <article
                key={activity.id}
                className={`overflow-hidden rounded-2xl border bg-zinc-900 ${
                  isPartialStrength || isAdapted
                    ? "border-orange-900"
                    : "border-zinc-800"
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-zinc-500">
                        {formatDate(activity.start_time)}
                      </p>

                      <h2 className="mt-1 text-lg font-semibold">
                        {workout?.name ??
                          activity.activity_type}
                      </h2>

                      <p className="mt-1 text-xs capitalize text-zinc-500">
                        {activity.activity_type.replaceAll(
                          "_",
                          " "
                        )}

                        {duration
                          ? ` · ${duration}`
                          : ""}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {isPartialStrength ? (
                        <span className="rounded-full bg-orange-900/50 px-2 py-1 text-[10px] font-semibold uppercase text-orange-400">
                          Partial
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-900/50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-400">
                          Completed
                        </span>
                      )}

                      {isAdapted && (
                        <span className="rounded-full bg-orange-900/50 px-2 py-1 text-[10px] font-semibold uppercase text-orange-400">
                          Adapted
                        </span>
                      )}
                    </div>
                  </div>

                  {isStrengthActivity &&
                    prescribedSetCount != null &&
                    prescribedSetCount > 0 && (
                      <div
                        className={`mt-4 rounded-xl border p-3 ${
                          isPartialStrength
                            ? "border-orange-900/60 bg-orange-950/20"
                            : "border-zinc-800 bg-zinc-950"
                        }`}
                      >
                        <p
                          className={`text-[9px] font-semibold uppercase tracking-wide ${
                            isPartialStrength
                              ? "text-orange-400"
                              : "text-zinc-500"
                          }`}
                        >
                          Set completion
                        </p>

                        <p className="mt-1 text-sm font-medium text-zinc-200">
                          {activitySets.length} of{" "}
                          {prescribedSetCount} prescribed sets
                          completed
                        </p>

                        {isPartialStrength && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {prescribedSetCount -
                              activitySets.length}{" "}
                            {prescribedSetCount -
                              activitySets.length ===
                            1
                              ? "set was"
                              : "sets were"}{" "}
                            not logged.
                          </p>
                        )}
                      </div>
                    )}

                  {adaptation && (
                    <div className="mt-4 rounded-xl border border-orange-900/60 bg-orange-950/20 p-3">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-orange-400">
                        Adapted session
                      </p>

                      <p className="mt-2 text-sm font-medium text-zinc-200">
                        {formatAdaptationType(
                          adaptation.adaptation_type
                        )}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-zinc-500">
                        {adaptation.adapted_duration_min != null && (
                          <span>
                            {adaptation.adapted_duration_min} min plan
                          </span>
                        )}

                        {adaptation.original_duration_min != null &&
                          adaptation.adapted_duration_min != null && (
                            <span>
                              Reduced from{" "}
                              {adaptation.original_duration_min} min
                            </span>
                          )}

                        {adaptation.available_minutes != null && (
                          <span>
                            {adaptation.available_minutes} min available
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {hasCardioMetrics && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {distance && (
                        <div className="rounded-lg bg-zinc-950 px-3 py-3">
                          <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                            Distance
                          </p>

                          <p className="mt-1 text-sm font-medium text-zinc-200">
                            {distance}
                          </p>
                        </div>
                      )}

                      {activity.average_heart_rate != null && (
                        <div className="rounded-lg bg-zinc-950 px-3 py-3">
                          <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                            Avg HR
                          </p>

                          <p className="mt-1 text-sm font-medium text-zinc-200">
                            {activity.average_heart_rate} bpm
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {activity.session_rpe != null && (
                    <div className="mt-3 rounded-lg bg-zinc-950 px-3 py-2">
                      <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                        Session RPE
                      </p>

                      <p className="mt-1 text-sm font-medium">
                        {activity.session_rpe}
                      </p>
                    </div>
                  )}

                  {isEditableCardio && (
                    <Link
                      href={`/history/${activity.id}/edit`}
                      className="mt-4 flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-medium text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900"
                    >
                      <span>Edit session</span>
                      <span className="text-zinc-600">→</span>
                    </Link>
                  )}

                  {isStrengthActivity && (
                    <Link
                      href={`/history/${activity.id}/strength-edit`}
                      className="mt-4 flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-medium text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900"
                    >
                      <span>
                        {isPartialStrength
                          ? "Complete or edit workout"
                          : "Edit workout"}
                      </span>

                      <span className="text-zinc-600">
                        →
                      </span>
                    </Link>
                  )}
                </div>

                {activitySets.length > 0 && (
                  <div className="border-t border-zinc-800">
                    <div className="px-4 py-3">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                        {activitySets.length} working set
                        {activitySets.length === 1 ? "" : "s"} performed
                      </p>
                    </div>

                    {activitySets.map((set, index) => (
                      <div
                        key={`${activity.id}-${set.exercise_id}-${set.set_number}`}
                        className={`flex items-center justify-between gap-4 px-4 py-3 ${
                          index !== activitySets.length - 1
                            ? "border-t border-zinc-800"
                            : ""
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {exerciseMap.get(
                              set.exercise_id
                            ) ?? "Exercise"}
                          </p>

                          <p className="mt-1 text-[10px] text-zinc-500">
                            Set {set.set_number}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {set.weight != null
                              ? `${set.weight} lb`
                              : "—"}

                            {set.reps != null
                              ? ` × ${set.reps}`
                              : ""}
                          </p>

                          {set.rpe != null && (
                            <p className="mt-1 text-[10px] text-zinc-500">
                              RPE {set.rpe}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 py-2">
          <Link
            href="/"
            className="flex flex-col items-center gap-1 py-2 text-xs text-zinc-500"
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
            className="flex flex-col items-center gap-1 py-2 text-xs text-emerald-400"
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
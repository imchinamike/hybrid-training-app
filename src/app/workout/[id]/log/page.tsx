"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Workout = {
  id: number;
  name: string;
  planned_date: string;
  workout_type: string;
  status: string;
};

type Component = {
  id: number;
  component_order: number;
  title: string | null;
};

type Prescription = {
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
  target_rir_min: number | null;
  target_rir_max: number | null;
  rest_seconds: number | null;
};

type Exercise = {
  id: number;
  name: string;
};

type LoggedSet = {
  prescriptionId: number;
  exerciseId: number;
  setNumber: number;
  weight: string;
  reps: string;
  rpe: string;
  completed: boolean;
};

type PreviousSet = {
  exercise_id: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed_at: string;
};

type AdaptedSetPlan = Record<string, number>;

type WorkoutAdaptationRecord = {
  id: number;
  planned_workout_id: number;
  adaptation_type: string;
  available_minutes: number | null;
  original_duration_min: number | null;
  adapted_duration_min: number | null;
  adaptation_payload: AdaptedSetPlan | null;
  accepted: boolean;
};

function formatReps(
  repsMin: number | null,
  repsMax: number | null
) {
  if (repsMin == null && repsMax == null) {
    return "";
  }

  if (repsMin === repsMax) {
    return `${repsMin}`;
  }

  return `${repsMin}–${repsMax}`;
}

function formatPrescription(
  prescription: Prescription,
  setCount: number
) {
  const pieces: string[] = [];

  const reps = formatReps(
    prescription.reps_min,
    prescription.reps_max
  );

  if (setCount > 0 && reps) {
    pieces.push(`${setCount} × ${reps}`);
  }

  if (
    prescription.target_rpe_min != null &&
    prescription.target_rpe_max != null
  ) {
    if (
      prescription.target_rpe_min ===
      prescription.target_rpe_max
    ) {
      pieces.push(
        `RPE ${prescription.target_rpe_min}`
      );
    } else {
      pieces.push(
        `RPE ${prescription.target_rpe_min}–${prescription.target_rpe_max}`
      );
    }
  }

  if (
    prescription.target_rir_min != null &&
    prescription.target_rir_max != null
  ) {
    if (
      prescription.target_rir_min ===
      prescription.target_rir_max
    ) {
      pieces.push(
        `${prescription.target_rir_min} RIR`
      );
    } else {
      pieces.push(
        `${prescription.target_rir_min}–${prescription.target_rir_max} RIR`
      );
    }
  }

  if (prescription.target_weight != null) {
    pieces.push(
      `${prescription.target_weight} lb`
    );
  }

  return pieces.join(" · ");
}

function formatRestLabel(
  seconds: number | null
) {
  if (!seconds) {
    return "No timer";
  }

  const minutes = Math.floor(
    seconds / 60
  );

  const remaining =
    seconds % 60;

  if (minutes === 0) {
    return `${remaining} sec rest`;
  }

  if (remaining === 0) {
    return `${minutes}:00 rest`;
  }

  return `${minutes}:${remaining
    .toString()
    .padStart(2, "0")} rest`;
}

function formatCountdown(
  seconds: number
) {
  const minutes = Math.floor(
    seconds / 60
  );

  const remaining =
    seconds % 60;

  return `${minutes}:${remaining
    .toString()
    .padStart(2, "0")}`;
}

function formatPreviousSet(
  previous: PreviousSet | undefined
) {
  if (!previous) {
    return null;
  }

  const pieces: string[] = [];

  if (previous.weight != null) {
    pieces.push(
      `${previous.weight} lb`
    );
  }

  if (previous.reps != null) {
    pieces.push(
      `× ${previous.reps}`
    );
  }

  if (previous.rpe != null) {
    pieces.push(
      `@ RPE ${previous.rpe}`
    );
  }

  return pieces.join(" ");
}

function getUrlSettings() {
  if (
    typeof window === "undefined"
  ) {
    return {
      mode: null,
      adaptationId: null,
      legacyPlan: null,
    };
  }

  const searchParams =
    new URLSearchParams(
      window.location.search
    );

  return {
    mode:
      searchParams.get("mode"),

    adaptationId:
      searchParams.get(
        "adaptationId"
      ),

    legacyPlan:
      searchParams.get("plan"),
  };
}

function parseLegacyPlan(
  rawPlan: string | null
): AdaptedSetPlan | null {
  if (!rawPlan) {
    return null;
  }

  try {
    return JSON.parse(
      rawPlan
    ) as AdaptedSetPlan;
  } catch {
    try {
      return JSON.parse(
        decodeURIComponent(
          rawPlan
        )
      ) as AdaptedSetPlan;
    } catch {
      return null;
    }
  }
}

export default function WorkoutLogPage() {
  const params =
    useParams<{ id: string }>();

  const router = useRouter();

  const workoutId =
    params.id;

  const [workout, setWorkout] =
    useState<Workout | null>(
      null
    );

  const [
    components,
    setComponents,
  ] = useState<Component[]>([]);

  const [
    prescriptions,
    setPrescriptions,
  ] = useState<Prescription[]>([]);

  const [
    exercises,
    setExercises,
  ] = useState<Exercise[]>([]);

  const [
    loggedSets,
    setLoggedSets,
  ] = useState<LoggedSet[]>([]);

  const [
    previousSets,
    setPreviousSets,
  ] = useState<PreviousSet[]>([]);

  const [
    isAdaptedWorkout,
    setIsAdaptedWorkout,
  ] = useState(false);

  const [
    adaptedPlan,
    setAdaptedPlan,
  ] = useState<AdaptedSetPlan>(
    {}
  );

  const [
    adaptationRecord,
    setAdaptationRecord,
  ] =
    useState<WorkoutAdaptationRecord | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    showPartialFinish,
    setShowPartialFinish,
  ] = useState(false);

  const [
    showFinishSummary,
    setShowFinishSummary,
  ] = useState(false);

  const [
    durationInput,
    setDurationInput,
  ] = useState("");

  const [
    sessionRpeInput,
    setSessionRpeInput,
  ] = useState("");

  const [
    restSeconds,
    setRestSeconds,
  ] = useState(0);

  const [
    restRunning,
    setRestRunning,
  ] = useState(false);

  useEffect(() => {
    async function loadWorkout() {
      setLoading(true);
      setErrorMessage("");

      const urlSettings =
        getUrlSettings();

      let loadedAdaptedPlan:
        | AdaptedSetPlan
        | null = null;

      let loadedAdaptation:
        | WorkoutAdaptationRecord
        | null = null;

      if (
        urlSettings.mode ===
          "adapted" &&
        urlSettings.adaptationId
      ) {
        const adaptationId =
          Number(
            urlSettings.adaptationId
          );

        if (
          !Number.isFinite(
            adaptationId
          )
        ) {
          setErrorMessage(
            "Invalid adaptation ID."
          );
          setLoading(false);
          return;
        }

        const {
          data:
            adaptationData,
          error:
            adaptationError,
        } = await supabase
          .from(
            "workout_adaptations"
          )
          .select(
            `
            id,
            planned_workout_id,
            adaptation_type,
            available_minutes,
            original_duration_min,
            adapted_duration_min,
            adaptation_payload,
            accepted
          `
          )
          .eq(
            "id",
            adaptationId
          )
          .maybeSingle();

        if (
          adaptationError
        ) {
          setErrorMessage(
            adaptationError.message
          );
          setLoading(false);
          return;
        }

        if (!adaptationData) {
          setErrorMessage(
            "The saved workout adaptation could not be found."
          );
          setLoading(false);
          return;
        }

        loadedAdaptation =
          adaptationData as WorkoutAdaptationRecord;

        if (
          Number(
            loadedAdaptation.planned_workout_id
          ) !==
          Number(workoutId)
        ) {
          setErrorMessage(
            "This adaptation does not belong to this workout."
          );
          setLoading(false);
          return;
        }

        if (
          !loadedAdaptation.accepted
        ) {
          setErrorMessage(
            "This workout adaptation has not been accepted."
          );
          setLoading(false);
          return;
        }

        if (
          !loadedAdaptation.adaptation_payload
        ) {
          setErrorMessage(
            "This workout adaptation does not contain a saved prescription."
          );
          setLoading(false);
          return;
        }

        loadedAdaptedPlan =
          loadedAdaptation.adaptation_payload;

        setAdaptationRecord(
          loadedAdaptation
        );

        setIsAdaptedWorkout(
          true
        );

        setAdaptedPlan(
          loadedAdaptedPlan
        );
      }

      if (
        !loadedAdaptedPlan &&
        urlSettings.mode ===
          "adapted" &&
        urlSettings.legacyPlan
      ) {
        const legacyPlan =
          parseLegacyPlan(
            urlSettings.legacyPlan
          );

        if (legacyPlan) {
          loadedAdaptedPlan =
            legacyPlan;

          setIsAdaptedWorkout(
            true
          );

          setAdaptedPlan(
            legacyPlan
          );
        }
      }

      const {
        data: workoutData,
        error: workoutError,
      } = await supabase
        .from(
          "planned_workouts"
        )
        .select(
          "id, name, planned_date, workout_type, status"
        )
        .eq("id", workoutId)
        .single();

      if (
        workoutError ||
        !workoutData
      ) {
        setErrorMessage(
          workoutError?.message ??
            "Workout not found."
        );
        setLoading(false);
        return;
      }

      setWorkout(
        workoutData
      );

      const {
        data: componentData,
        error: componentError,
      } = await supabase
        .from(
          "workout_components"
        )
        .select(
          "id, component_order, title"
        )
        .eq(
          "planned_workout_id",
          workoutId
        )
        .order(
          "component_order",
          {
            ascending: true,
          }
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

      const loadedComponents =
        componentData ?? [];

      setComponents(
        loadedComponents
      );

      const componentIds =
        loadedComponents.map(
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

      const {
        data:
          prescriptionData,
        error:
          prescriptionError,
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
          target_rpe_max,
          target_rir_min,
          target_rir_max,
          rest_seconds
        `
        )
        .in(
          "workout_component_id",
          componentIds
        )
        .order(
          "exercise_order",
          {
            ascending: true,
          }
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

      const loadedPrescriptions =
        (prescriptionData as
          | Prescription[]
          | null) ?? [];

      setPrescriptions(
        loadedPrescriptions
      );

      const exerciseIds = [
        ...new Set(
          loadedPrescriptions.map(
            (prescription) =>
              prescription.exercise_id
          )
        ),
      ];

      if (
        exerciseIds.length === 0
      ) {
        setLoading(false);
        return;
      }

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

      if (
        exerciseError
      ) {
        setErrorMessage(
          exerciseError.message
        );
        setLoading(false);
        return;
      }

      setExercises(
        exerciseData ?? []
      );

      const {
        data: historyData,
        error: historyError,
      } = await supabase
        .from(
          "completed_sets"
        )
        .select(
          `
          exercise_id,
          weight,
          reps,
          rpe,
          completed_at
        `
        )
        .in(
          "exercise_id",
          exerciseIds
        )
        .order(
          "completed_at",
          {
            ascending: false,
          }
        );

      if (
        historyError
      ) {
        setErrorMessage(
          historyError.message
        );
        setLoading(false);
        return;
      }

      const latestByExercise =
        new Map<
          number,
          PreviousSet
        >();

      (
        historyData ?? []
      ).forEach((row) => {
        if (
          !latestByExercise.has(
            row.exercise_id
          )
        ) {
          latestByExercise.set(
            row.exercise_id,
            row
          );
        }
      });

      setPreviousSets(
        Array.from(
          latestByExercise.values()
        )
      );

      const initialSets:
        LoggedSet[] = [];

      loadedPrescriptions.forEach(
        (prescription) => {
          const originalSetCount =
            prescription.sets ??
            0;

          const adaptedSetCount =
            loadedAdaptedPlan?.[
              String(
                prescription.id
              )
            ];

          const setCount =
            loadedAdaptedPlan &&
            adaptedSetCount !==
              undefined
              ? Math.max(
                  0,
                  Number(
                    adaptedSetCount
                  )
                )
              : originalSetCount;

          const previous =
            latestByExercise.get(
              prescription.exercise_id
            );

          for (
            let setNumber = 1;
            setNumber <=
            setCount;
            setNumber++
          ) {
            initialSets.push({
              prescriptionId:
                prescription.id,

              exerciseId:
                prescription.exercise_id,

              setNumber,

              weight:
                setNumber ===
                  1 &&
                previous?.weight !=
                  null
                  ? String(
                      previous.weight
                    )
                  : prescription.target_weight !=
                    null
                  ? String(
                      prescription.target_weight
                    )
                  : "",

              reps:
                prescription.reps_min ===
                  prescription.reps_max &&
                prescription.reps_min !=
                  null
                  ? String(
                      prescription.reps_min
                    )
                  : "",

              rpe: "",
              completed:
                false,
            });
          }
        }
      );

      setLoggedSets(
        initialSets
      );

      setLoading(false);
    }

    loadWorkout();
  }, [workoutId]);

  useEffect(() => {
    if (
      !restRunning ||
      restSeconds <= 0
    ) {
      return;
    }

    const timer =
      window.setInterval(() => {
        setRestSeconds(
          (current) => {
            if (
              current <= 1
            ) {
              window.clearInterval(
                timer
              );

              setRestRunning(
                false
              );

              return 0;
            }

            return (
              current - 1
            );
          }
        );
      }, 1000);

    return () =>
      window.clearInterval(
        timer
      );
  }, [
    restRunning,
    restSeconds,
  ]);

  const exerciseMap =
    useMemo(
      () =>
        new Map(
          exercises.map(
            (exercise) => [
              exercise.id,
              exercise,
            ]
          )
        ),
      [exercises]
    );

  const previousSetMap =
    useMemo(
      () =>
        new Map(
          previousSets.map(
            (previous) => [
              previous.exercise_id,
              previous,
            ]
          )
        ),
      [previousSets]
    );

  function getEffectiveSetCount(
    prescription: Prescription
  ) {
    if (
      !isAdaptedWorkout
    ) {
      return (
        prescription.sets ??
        0
      );
    }

    const adaptedSetCount =
      adaptedPlan[
        String(
          prescription.id
        )
      ];

    if (
      adaptedSetCount ===
      undefined
    ) {
      return (
        prescription.sets ??
        0
      );
    }

    return Math.max(
      0,
      Number(
        adaptedSetCount
      )
    );
  }

  const totalSets =
    loggedSets.length;

  const completedSets =
    loggedSets.filter(
      (set) =>
        set.completed
    ).length;

  const progressPercent =
    totalSets === 0
      ? 0
      : Math.round(
          (completedSets /
            totalSets) *
            100
        );

  const originalTotalSets =
    prescriptions.reduce(
      (
        total,
        prescription
      ) =>
        total +
        (prescription.sets ??
          0),
      0
    );

  const removedSetCount =
    Math.max(
      0,
      originalTotalSets -
        totalSets
    );

  function updateSet(
    prescriptionId: number,
    setNumber: number,
    field:
      | "weight"
      | "reps"
      | "rpe",
    value: string
  ) {
    setLoggedSets(
      (current) =>
        current.map(
          (set) =>
            set.prescriptionId ===
              prescriptionId &&
            set.setNumber ===
              setNumber
              ? {
                  ...set,
                  [field]:
                    value,
                }
              : set
        )
    );
  }

  function toggleSetComplete(
    prescription: Prescription,
    setNumber: number
  ) {
    const currentSet =
      loggedSets.find(
        (set) =>
          set.prescriptionId ===
            prescription.id &&
          set.setNumber ===
            setNumber
      );

    if (!currentSet) {
      return;
    }

    const willComplete =
      !currentSet.completed;

    setLoggedSets(
      (current) => {
        let updated =
          current.map(
            (set) =>
              set.prescriptionId ===
                prescription.id &&
              set.setNumber ===
                setNumber
                ? {
                    ...set,
                    completed:
                      willComplete,
                  }
                : set
          );

        if (
          willComplete
        ) {
          const nextSetNumber =
            setNumber + 1;

          updated =
            updated.map(
              (set) => {
                if (
                  set.prescriptionId ===
                    prescription.id &&
                  set.setNumber ===
                    nextSetNumber
                ) {
                  return {
                    ...set,

                    weight:
                      set.weight ||
                      currentSet.weight,

                    reps:
                      set.reps ||
                      currentSet.reps,
                  };
                }

                return set;
              }
            );
        }

        return updated;
      }
    );

    if (
      willComplete &&
      prescription.rest_seconds
    ) {
      setRestSeconds(
        prescription.rest_seconds
      );

      setRestRunning(
        true
      );
    }
  }

  function addThirtySeconds() {
    setRestSeconds(
      (current) =>
        current + 30
    );
  }

  function stopRestTimer() {
    setRestRunning(false);
    setRestSeconds(0);
  }

  function openFinishSummary() {
    setErrorMessage("");
    setShowPartialFinish(false);
    setShowFinishSummary(true);

    setRestRunning(false);
    setRestSeconds(0);
  }

  function handleFinishWorkout() {
    setErrorMessage("");

    if (completedSets === 0) {
      setErrorMessage(
        "Complete at least one set before finishing the workout."
      );
      return;
    }

    if (
      completedSets <
      totalSets
    ) {
      setShowPartialFinish(
        true
      );
      return;
    }

    openFinishSummary();
  }

  async function saveWorkout() {
    if (!workout) {
      return;
    }

    const durationMinutes =
      Number(
        durationInput
      );

    const sessionRpe =
      Number(
        sessionRpeInput
      );

    if (
      durationInput.trim() === "" ||
      !Number.isFinite(
        durationMinutes
      ) ||
      durationMinutes <= 0
    ) {
      setErrorMessage(
        "Enter a valid workout duration."
      );
      return;
    }

    if (
      sessionRpeInput.trim() === "" ||
      !Number.isFinite(
        sessionRpe
      ) ||
      sessionRpe < 1 ||
      sessionRpe > 10
    ) {
      setErrorMessage(
        "Enter a session RPE from 1 to 10."
      );
      return;
    }

    const setsToSave =
      loggedSets.filter(
        (set) =>
          set.completed
      );

    if (
      setsToSave.length === 0
    ) {
      setErrorMessage(
        "Complete at least one set before finishing the workout."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const {
      data:
        existingMatch,
      error:
        existingMatchError,
    } = await supabase
      .from(
        "workout_activity_matches"
      )
      .select("id")
      .eq(
        "planned_workout_id",
        workout.id
      )
      .limit(1);

    if (
      existingMatchError
    ) {
      setErrorMessage(
        existingMatchError.message
      );
      setSaving(false);
      return;
    }

    if (
      existingMatch &&
      existingMatch.length >
        0
    ) {
      setErrorMessage(
        "This workout has already been saved as completed."
      );
      setSaving(false);
      return;
    }

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
      setSaving(false);
      return;
    }

    const {
      data: activity,
      error:
        activityError,
    } = await supabase
      .from("activities")
      .insert({
        athlete_id:
          athleteData.id,

        activity_type:
          "strength",

        source: "app",

        start_time:
          new Date().toISOString(),

        duration_seconds:
          Math.round(
            durationMinutes *
              60
          ),

        session_rpe:
          sessionRpe,

        notes:
          isAdaptedWorkout &&
          adaptationRecord
            ? `Completed adapted version of planned workout: ${workout.name} (adaptation ${adaptationRecord.id})`
            : isAdaptedWorkout
            ? `Completed adapted version of planned workout: ${workout.name}`
            : `Completed from planned workout: ${workout.name}`,
      })
      .select("id")
      .single();

    if (
      activityError ||
      !activity
    ) {
      setErrorMessage(
        activityError?.message ??
          "Could not create activity."
      );
      setSaving(false);
      return;
    }

    const completedSetRows =
      setsToSave.map(
        (set) => ({
          activity_id:
            activity.id,

          exercise_id:
            set.exerciseId,

          set_number:
            set.setNumber,

          weight:
            set.weight === ""
              ? null
              : Number(
                  set.weight
                ),

          reps:
            set.reps === ""
              ? null
              : Number(
                  set.reps
                ),

          rpe:
            set.rpe === ""
              ? null
              : Number(
                  set.rpe
                ),
        })
      );

    const {
      error: setsError,
    } = await supabase
      .from(
        "completed_sets"
      )
      .insert(
        completedSetRows
      );

    if (setsError) {
      setErrorMessage(
        setsError.message
      );
      setSaving(false);
      return;
    }

    const {
      error: matchError,
    } = await supabase
      .from(
        "workout_activity_matches"
      )
      .insert({
        planned_workout_id:
          workout.id,

        activity_id:
          activity.id,

        match_type:
          "manual",

        confirmed_by_user:
          true,
      });

    if (matchError) {
      setErrorMessage(
        matchError.message
      );
      setSaving(false);
      return;
    }

    const {
      error: statusError,
    } = await supabase
      .from(
        "planned_workouts"
      )
      .update({
        status:
          "completed",

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        workout.id
      );

    if (statusError) {
      setErrorMessage(
        statusError.message
      );
      setSaving(false);
      return;
    }

    setSuccessMessage(
      `Workout saved — ${setsToSave.length} sets recorded.`
    );

    setSaving(false);

    window.setTimeout(
      () => {
        router.push("/");
        router.refresh();
      },
      1200
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto max-w-md text-sm text-zinc-500">
          Loading workout...
        </div>
      </main>
    );
  }

  if (!workout) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto max-w-md">
          <p className="text-red-400">
            {errorMessage ||
              "Workout not found."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-32 pt-6 text-zinc-100">
      <div className="mx-auto w-full max-w-md">
        <Link
          href={
            isAdaptedWorkout
              ? `/workout/${workout.id}/modify`
              : `/workout/${workout.id}`
          }
          className="text-sm font-medium text-emerald-400"
        >
          ←{" "}
          {isAdaptedWorkout
            ? "Modified workout"
            : "Workout"}
        </Link>

        <header className="mt-5">
          <p
            className={`text-[10px] font-medium uppercase tracking-widest ${
              isAdaptedWorkout
                ? "text-orange-400"
                : "text-emerald-400"
            }`}
          >
            {isAdaptedWorkout
              ? "Adapted live workout"
              : "Live workout"}
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {workout.name}
          </h1>

          {isAdaptedWorkout && (
            <div className="mt-4 rounded-xl border border-orange-900 bg-orange-950/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                    Adapted version
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    This logger is using
                    your saved shortened
                    prescription.
                  </p>
                </div>

                <span className="rounded bg-orange-900/60 px-2 py-1 text-[9px] font-semibold uppercase text-orange-400">
                  Modified
                </span>
              </div>

              {adaptationRecord && (
                <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-zinc-500">
                  {adaptationRecord.available_minutes !=
                    null && (
                    <span>
                      {
                        adaptationRecord.available_minutes
                      }{" "}
                      min available
                    </span>
                  )}

                  {adaptationRecord.adapted_duration_min !=
                    null && (
                    <span>
                      {
                        adaptationRecord.adapted_duration_min
                      }{" "}
                      min plan
                    </span>
                  )}

                  <span>
                    Adaptation #
                    {
                      adaptationRecord.id
                    }
                  </span>
                </div>
              )}

              <p className="mt-3 text-xs text-zinc-500">
                {totalSets} working
                sets
                {removedSetCount > 0
                  ? ` · ${removedSetCount} sets removed from the original`
                  : ""}
              </p>
            </div>
          )}

          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-sm font-medium">
                {completedSets} /{" "}
                {totalSets} sets
              </p>

              <p className="mt-1 text-xs text-zinc-500">
                {progressPercent}%
                complete
              </p>
            </div>

            <p className="text-xs text-zinc-500">
              Log each working
              set
            </p>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isAdaptedWorkout
                  ? "bg-orange-500"
                  : "bg-emerald-500"
              }`}
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>
        </header>

        {(restRunning ||
          restSeconds > 0) && (
          <section className="sticky top-3 z-20 mt-5 rounded-2xl border border-emerald-900 bg-emerald-950/95 p-4 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-emerald-400">
                  Rest
                </p>

                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {formatCountdown(
                    restSeconds
                  )}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={
                    addThirtySeconds
                  }
                  className="rounded-lg border border-emerald-800 px-3 py-2 text-xs font-medium text-emerald-300"
                >
                  +30 sec
                </button>

                <button
                  onClick={
                    stopRestTimer
                  }
                  className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950"
                >
                  Skip
                </button>
              </div>
            </div>
          </section>
        )}

        {errorMessage && (
          <div className="mt-5 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <p className="text-sm text-red-400">
              {errorMessage}
            </p>
          </div>
        )}

        {successMessage && (
          <div className="mt-5 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4">
            <p className="text-sm text-emerald-400">
              {successMessage}
            </p>
          </div>
        )}

        <div className="mt-7 space-y-8">
          {components.map(
            (component) => {
              const componentPrescriptions =
                prescriptions
                  .filter(
                    (prescription) =>
                      prescription.workout_component_id ===
                        component.id &&
                      getEffectiveSetCount(
                        prescription
                      ) > 0
                  )
                  .sort(
                    (a, b) =>
                      a.exercise_order -
                      b.exercise_order
                  );

              if (
                componentPrescriptions.length ===
                0
              ) {
                return null;
              }

              return (
                <section
                  key={component.id}
                >
                  <h2 className="mb-3 text-lg font-semibold">
                    {component.title}
                  </h2>

                  <div className="space-y-4">
                    {componentPrescriptions.map(
                      (
                        prescription
                      ) => {
                        const exercise =
                          exerciseMap.get(
                            prescription.exercise_id
                          );

                        const previous =
                          previousSetMap.get(
                            prescription.exercise_id
                          );

                        const previousLabel =
                          formatPreviousSet(
                            previous
                          );

                        const effectiveSetCount =
                          getEffectiveSetCount(
                            prescription
                          );

                        const originalSetCount =
                          prescription.sets ??
                          0;

                        const wasReduced =
                          isAdaptedWorkout &&
                          effectiveSetCount <
                            originalSetCount;

                        const setsForExercise =
                          loggedSets.filter(
                            (set) =>
                              set.prescriptionId ===
                              prescription.id
                          );

                        return (
                          <div
                            key={
                              prescription.id
                            }
                            className={`overflow-hidden rounded-2xl border bg-zinc-900 ${
                              wasReduced
                                ? "border-orange-900"
                                : "border-zinc-800"
                            }`}
                          >
                            <div className="border-b border-zinc-800 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h3 className="text-base font-semibold">
                                    {exercise?.name ??
                                      "Exercise"}
                                  </h3>

                                  <p
                                    className={`mt-1 text-sm font-medium ${
                                      wasReduced
                                        ? "text-orange-400"
                                        : "text-emerald-400"
                                    }`}
                                  >
                                    {formatPrescription(
                                      prescription,
                                      effectiveSetCount
                                    )}
                                  </p>
                                </div>

                                {wasReduced && (
                                  <span className="rounded bg-orange-900/60 px-2 py-1 text-[9px] font-semibold uppercase text-orange-400">
                                    Reduced
                                  </span>
                                )}
                              </div>

                              {wasReduced && (
                                <p className="mt-1 text-[10px] text-orange-500">
                                  Reduced
                                  from{" "}
                                  {
                                    originalSetCount
                                  }{" "}
                                  sets
                                </p>
                              )}

                              <p className="mt-1 text-xs text-zinc-500">
                                {formatRestLabel(
                                  prescription.rest_seconds
                                )}
                              </p>

                              {previousLabel && (
                                <div className="mt-3 rounded-lg bg-zinc-950 px-3 py-2">
                                  <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                                    Last
                                  </p>

                                  <p className="mt-1 text-xs font-medium text-zinc-300">
                                    {
                                      previousLabel
                                    }
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-[30px_1fr_1fr_1fr_48px] gap-2 px-3 pb-1 pt-3">
                              <div />

                              <p className="text-center text-[9px] uppercase tracking-wide text-zinc-600">
                                Weight
                              </p>

                              <p className="text-center text-[9px] uppercase tracking-wide text-zinc-600">
                                Reps
                              </p>

                              <p className="text-center text-[9px] uppercase tracking-wide text-zinc-600">
                                RPE
                              </p>

                              <div />
                            </div>

                            <div className="space-y-2 p-3 pt-1">
                              {setsForExercise.map(
                                (set) => (
                                  <div
                                    key={`${set.prescriptionId}-${set.setNumber}`}
                                    className={`grid grid-cols-[30px_1fr_1fr_1fr_48px] items-center gap-2 rounded-xl p-1 transition ${
                                      set.completed
                                        ? "bg-emerald-950/40"
                                        : ""
                                    }`}
                                  >
                                    <div className="text-center text-sm font-medium text-zinc-500">
                                      {
                                        set.setNumber
                                      }
                                    </div>

                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      value={
                                        set.weight
                                      }
                                      disabled={
                                        set.completed
                                      }
                                      onChange={(
                                        event
                                      ) =>
                                        updateSet(
                                          set.prescriptionId,
                                          set.setNumber,
                                          "weight",
                                          event.target.value
                                        )
                                      }
                                      className="min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-3 text-center text-base outline-none focus:border-emerald-500 disabled:border-emerald-900 disabled:text-zinc-400"
                                      placeholder="—"
                                    />

                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      value={
                                        set.reps
                                      }
                                      disabled={
                                        set.completed
                                      }
                                      onChange={(
                                        event
                                      ) =>
                                        updateSet(
                                          set.prescriptionId,
                                          set.setNumber,
                                          "reps",
                                          event.target.value
                                        )
                                      }
                                      className="min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-3 text-center text-base outline-none focus:border-emerald-500 disabled:border-emerald-900 disabled:text-zinc-400"
                                      placeholder="—"
                                    />

                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      step="0.5"
                                      min="1"
                                      max="10"
                                      value={
                                        set.rpe
                                      }
                                      disabled={
                                        set.completed
                                      }
                                      onChange={(
                                        event
                                      ) =>
                                        updateSet(
                                          set.prescriptionId,
                                          set.setNumber,
                                          "rpe",
                                          event.target.value
                                        )
                                      }
                                      className="min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-3 text-center text-base outline-none focus:border-emerald-500 disabled:border-emerald-900 disabled:text-zinc-400"
                                      placeholder="—"
                                    />

                                    <button
                                      onClick={() =>
                                        toggleSetComplete(
                                          prescription,
                                          set.setNumber
                                        )
                                      }
                                      className={`flex h-12 w-12 items-center justify-center rounded-lg text-lg font-bold transition ${
                                        set.completed
                                          ? "bg-emerald-500 text-zinc-950"
                                          : "border border-zinc-700 bg-zinc-950 text-zinc-500 hover:border-emerald-700 hover:text-emerald-400"
                                      }`}
                                    >
                                      ✓
                                    </button>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </section>
              );
            }
          )}
        </div>

        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
            <span>
              {completedSets} of{" "}
              {totalSets} sets
              complete
            </span>

            <span>
              {progressPercent}%
            </span>
          </div>

          {showPartialFinish && (
            <div className="mb-4 rounded-2xl border border-orange-900 bg-orange-950/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-400">
                Incomplete workout
              </p>

              <h3 className="mt-2 text-lg font-semibold text-zinc-100">
                Finish this workout anyway?
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                You&apos;ve logged{" "}
                {completedSets} of{" "}
                {totalSets} prescribed
                sets.
              </p>

              <p className="mt-1 text-sm leading-6 text-zinc-500">
                {totalSets -
                  completedSets}{" "}
                {totalSets -
                  completedSets ===
                1
                  ? "set is"
                  : "sets are"}{" "}
                still incomplete.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setShowPartialFinish(
                      false
                    )
                  }
                  disabled={
                    saving
                  }
                  className="rounded-xl border border-zinc-700 bg-zinc-900 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  Keep logging
                </button>

                <button
                  type="button"
                  onClick={
                    openFinishSummary
                  }
                  disabled={
                    saving
                  }
                  className="rounded-xl border border-orange-800 bg-orange-950/40 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-950/70 disabled:opacity-50"
                >
                  Finish partial
                </button>
              </div>
            </div>
          )}

          {showFinishSummary && (
            <div className="mb-4 rounded-2xl border border-emerald-900 bg-emerald-950/20 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                Finish workout
              </p>

              <h3 className="mt-2 text-lg font-semibold">
                Session summary
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Add the final session details before saving this workout.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <label>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Duration
                  </span>

                  <div className="relative mt-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={
                        durationInput
                      }
                      onChange={(
                        event
                      ) =>
                        setDurationInput(
                          event.target.value
                        )
                      }
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 pr-12 text-base outline-none focus:border-emerald-500"
                      placeholder="60"
                    />

                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-600">
                      min
                    </span>
                  </div>
                </label>

                <label>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Session RPE
                  </span>

                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="1"
                    max="10"
                    value={
                      sessionRpeInput
                    }
                    onChange={(
                      event
                    ) =>
                      setSessionRpeInput(
                        event.target.value
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-base outline-none focus:border-emerald-500"
                    placeholder="1–10"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-xl bg-zinc-950 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">
                    Sets completed
                  </span>

                  <span className="font-medium">
                    {completedSets} /{" "}
                    {totalSets}
                  </span>
                </div>

                {isAdaptedWorkout && (
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-500">
                      Workout
                    </span>

                    <span className="font-medium text-orange-400">
                      Adapted
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    void saveWorkout()
                  }
                  disabled={
                    saving
                  }
                  className="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : "Save workout"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowFinishSummary(
                      false
                    );
                    setErrorMessage("");
                  }}
                  disabled={
                    saving
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  Back to workout
                </button>
              </div>
            </div>
          )}

          {!showFinishSummary && (
            <button
              type="button"
              onClick={
                handleFinishWorkout
              }
              disabled={
                saving ||
                completedSets === 0 ||
                successMessage !==
                  ""
              }
              className="w-full rounded-xl bg-emerald-500 py-4 text-base font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-40"
            >
              {saving
                ? "Saving..."
                : successMessage
                ? "Workout saved ✓"
                : "Finish workout"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
export type ExercisePrescriptionInput = {
  id: number;
  exerciseName: string;
  componentName: string;
  componentOrder: number;
  exerciseOrder: number;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  targetRpeMin: number | null;
  targetRpeMax: number | null;
  restSeconds: number | null;
};

export type AdaptedExercise = {
  prescriptionId: number;
  exerciseName: string;
  componentName: string;

  originalSets: number;
  adaptedSets: number;

  repsMin: number | null;
  repsMax: number | null;

  targetRpeMin: number | null;
  targetRpeMax: number | null;

  restSeconds: number | null;

  status: "keep" | "reduce" | "skip";

  estimatedMinutes: number;
};

export type WorkoutAdaptation = {
  availableMinutes: number;
  estimatedOriginalMinutes: number;
  estimatedAdaptedMinutes: number;
  exercises: AdaptedExercise[];
};

function estimateSetMinutes(restSeconds: number | null) {
  const workingSetSeconds = 45;
  const rest = restSeconds ?? 90;

  return (workingSetSeconds + rest) / 60;
}

export function createWorkoutAdaptation(
  prescriptions: ExercisePrescriptionInput[],
  availableMinutes: number,
  estimatedWorkoutMinutes: number | null
): WorkoutAdaptation {
  const sorted = [...prescriptions].sort((a, b) => {
    if (a.componentOrder !== b.componentOrder) {
      return a.componentOrder - b.componentOrder;
    }

    return a.exerciseOrder - b.exerciseOrder;
  });

  const originalEstimated =
    estimatedWorkoutMinutes ??
    sorted.reduce((total, exercise) => {
      return (
        total +
        exercise.sets *
          estimateSetMinutes(exercise.restSeconds)
      );
    }, 0);

  let minutesRemaining = availableMinutes;

  const adaptedExercises: AdaptedExercise[] = [];

  for (const exercise of sorted) {
    const minutesPerSet = estimateSetMinutes(
      exercise.restSeconds
    );

    const fullExerciseMinutes =
      exercise.sets * minutesPerSet;

    if (minutesRemaining >= fullExerciseMinutes) {
      adaptedExercises.push({
        prescriptionId: exercise.id,
        exerciseName: exercise.exerciseName,
        componentName: exercise.componentName,
        originalSets: exercise.sets,
        adaptedSets: exercise.sets,
        repsMin: exercise.repsMin,
        repsMax: exercise.repsMax,
        targetRpeMin: exercise.targetRpeMin,
        targetRpeMax: exercise.targetRpeMax,
        restSeconds: exercise.restSeconds,
        status: "keep",
        estimatedMinutes: fullExerciseMinutes,
      });

      minutesRemaining -= fullExerciseMinutes;
      continue;
    }

    const setsThatFit = Math.floor(
      minutesRemaining / minutesPerSet
    );

    if (setsThatFit > 0) {
      adaptedExercises.push({
        prescriptionId: exercise.id,
        exerciseName: exercise.exerciseName,
        componentName: exercise.componentName,
        originalSets: exercise.sets,
        adaptedSets: setsThatFit,
        repsMin: exercise.repsMin,
        repsMax: exercise.repsMax,
        targetRpeMin: exercise.targetRpeMin,
        targetRpeMax: exercise.targetRpeMax,
        restSeconds: exercise.restSeconds,
        status:
          setsThatFit < exercise.sets
            ? "reduce"
            : "keep",
        estimatedMinutes:
          setsThatFit * minutesPerSet,
      });

      minutesRemaining -=
        setsThatFit * minutesPerSet;
    } else {
      adaptedExercises.push({
        prescriptionId: exercise.id,
        exerciseName: exercise.exerciseName,
        componentName: exercise.componentName,
        originalSets: exercise.sets,
        adaptedSets: 0,
        repsMin: exercise.repsMin,
        repsMax: exercise.repsMax,
        targetRpeMin: exercise.targetRpeMin,
        targetRpeMax: exercise.targetRpeMax,
        restSeconds: exercise.restSeconds,
        status: "skip",
        estimatedMinutes: 0,
      });
    }
  }

  const adaptedEstimated =
    adaptedExercises.reduce(
      (total, exercise) =>
        total + exercise.estimatedMinutes,
      0
    );

  return {
    availableMinutes,
    estimatedOriginalMinutes: originalEstimated,
    estimatedAdaptedMinutes: adaptedEstimated,
    exercises: adaptedExercises,
  };
}
export type DayWorkoutInput = {
  id: number;
  name: string;
  requirementLevel: string;
  priorityLevel: string;
  estimatedDurationMin: number | null;
};

export type AdaptedDayWorkout = {
  id: number;
  name: string;

  requirementLevel: string;
  priorityLevel: string;

  originalMinutes: number | null;
  adaptedMinutes: number;

  status: "keep" | "shorten" | "skip";

  reason: string;
};

export type DayAdaptation = {
  availableMinutes: number;
  originalPlannedMinutes: number;
  hasUnknownDuration: boolean;
  adaptedPlannedMinutes: number;
  workouts: AdaptedDayWorkout[];
};

function requirementRank(level: string) {
  switch (level) {
    case "required":
      return 0;
    case "target":
      return 1;
    case "optional":
      return 2;
    default:
      return 3;
  }
}

function priorityRank(level: string) {
  switch (level) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
    default:
      return 4;
  }
}

export function createDayAdaptation(
  workouts: DayWorkoutInput[],
  availableMinutes: number
): DayAdaptation {
  const sorted = [...workouts].sort((a, b) => {
    const requirementDifference =
      requirementRank(a.requirementLevel) -
      requirementRank(b.requirementLevel);

    if (requirementDifference !== 0) {
      return requirementDifference;
    }

    return (
      priorityRank(a.priorityLevel) -
      priorityRank(b.priorityLevel)
    );
  });

  const originalPlannedMinutes = sorted.reduce(
    (total, workout) =>
      total + (workout.estimatedDurationMin ?? 0),
    0
  );

  const hasUnknownDuration = sorted.some(
    (workout) =>
      workout.estimatedDurationMin == null ||
      workout.estimatedDurationMin <= 0
  );

  let minutesRemaining = Math.max(0, availableMinutes);

  const adaptedWorkouts: AdaptedDayWorkout[] = [];

  for (const workout of sorted) {
    const originalMinutes =
      workout.estimatedDurationMin != null &&
      workout.estimatedDurationMin > 0
        ? workout.estimatedDurationMin
        : null;

    if (minutesRemaining <= 0) {
      adaptedWorkouts.push({
        id: workout.id,
        name: workout.name,
        requirementLevel: workout.requirementLevel,
        priorityLevel: workout.priorityLevel,
        originalMinutes,
        adaptedMinutes: 0,
        status: "skip",
        reason:
          workout.requirementLevel === "required"
            ? "No available time remains. This is required work, so it should be prioritized if your schedule changes."
            : "No available time remains after higher-priority training.",
      });

      continue;
    }

    /*
     * Unknown duration.
     *
     * Required work gets first use of the available time.
     */
    if (originalMinutes === null) {
      if (workout.requirementLevel === "required") {
        adaptedWorkouts.push({
          id: workout.id,
          name: workout.name,
          requirementLevel: workout.requirementLevel,
          priorityLevel: workout.priorityLevel,
          originalMinutes: null,
          adaptedMinutes: minutesRemaining,
          status: "shorten",
          reason:
            "This required session does not have a planned duration. Use today's available time for the required work and stay within the prescribed rehab guidance.",
        });

        minutesRemaining = 0;
        continue;
      }

      if (
        workout.requirementLevel === "target" &&
        minutesRemaining >= 10
      ) {
        adaptedWorkouts.push({
          id: workout.id,
          name: workout.name,
          requirementLevel: workout.requirementLevel,
          priorityLevel: workout.priorityLevel,
          originalMinutes: null,
          adaptedMinutes: minutesRemaining,
          status: "shorten",
          reason:
            "This session does not have a planned duration. Use the remaining available time for a shortened version.",
        });

        minutesRemaining = 0;
        continue;
      }

      adaptedWorkouts.push({
        id: workout.id,
        name: workout.name,
        requirementLevel: workout.requirementLevel,
        priorityLevel: workout.priorityLevel,
        originalMinutes: null,
        adaptedMinutes: 0,
        status: "skip",
        reason:
          "This session does not have a planned duration and lower-priority work does not fit within today's remaining time.",
      });

      continue;
    }

    /*
     * Entire workout fits.
     */
    if (minutesRemaining >= originalMinutes) {
      adaptedWorkouts.push({
        id: workout.id,
        name: workout.name,
        requirementLevel: workout.requirementLevel,
        priorityLevel: workout.priorityLevel,
        originalMinutes,
        adaptedMinutes: originalMinutes,
        status: "keep",
        reason:
          workout.requirementLevel === "required"
            ? "Required work fits within today's available time."
            : "This session fits after higher-priority work.",
      });

      minutesRemaining -= originalMinutes;
      continue;
    }

    /*
     * Required session only partially fits.
     */
    if (workout.requirementLevel === "required") {
      adaptedWorkouts.push({
        id: workout.id,
        name: workout.name,
        requirementLevel: workout.requirementLevel,
        priorityLevel: workout.priorityLevel,
        originalMinutes,
        adaptedMinutes: minutesRemaining,
        status: "shorten",
        reason:
          "This required session does not fully fit today. Use the available time for the required work and stay within the prescribed rehab guidance.",
      });

      minutesRemaining = 0;
      continue;
    }

    /*
     * Target session can be shortened if at least
     * 10 useful minutes remain.
     */
    if (
      workout.requirementLevel === "target" &&
      minutesRemaining >= 10
    ) {
      adaptedWorkouts.push({
        id: workout.id,
        name: workout.name,
        requirementLevel: workout.requirementLevel,
        priorityLevel: workout.priorityLevel,
        originalMinutes,
        adaptedMinutes: minutesRemaining,
        status: "shorten",
        reason:
          "Use the remaining time for a shortened version of this target session.",
      });

      minutesRemaining = 0;
      continue;
    }

    adaptedWorkouts.push({
      id: workout.id,
      name: workout.name,
      requirementLevel: workout.requirementLevel,
      priorityLevel: workout.priorityLevel,
      originalMinutes,
      adaptedMinutes: 0,
      status: "skip",
      reason:
        workout.requirementLevel === "optional"
          ? "Optional work is removed when time is limited."
          : "There is not enough remaining time for a useful shortened session.",
    });
  }

  const adaptedPlannedMinutes =
    adaptedWorkouts.reduce(
      (total, workout) =>
        total + workout.adaptedMinutes,
      0
    );

  return {
    availableMinutes,
    originalPlannedMinutes,
    hasUnknownDuration,
    adaptedPlannedMinutes,
    workouts: adaptedWorkouts,
  };
}
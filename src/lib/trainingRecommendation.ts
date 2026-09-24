export type ReadinessInput = {
  sleepQuality: number;
  energy: number;
  soreness: number;
  injuryStatus: number;
  motivation: number;
  availableMinutes: number | null;
};

export type PlannedWorkoutInput = {
  name: string;
  requirementLevel: string;
  priorityLevel: string;
  estimatedDurationMin: number | null;
};

export type RecommendationLevel =
  | "proceed"
  | "caution"
  | "modify"
  | "recover";

export type TrainingRecommendation = {
  level: RecommendationLevel;
  headline: string;
  reasoning: string;
  readinessScore: number;
};

export function getTrainingRecommendation(
  readiness: ReadinessInput,
  workouts: PlannedWorkoutInput[]
): TrainingRecommendation {
  const scores = [
    readiness.sleepQuality,
    readiness.energy,
    readiness.soreness,
    readiness.injuryStatus,
    readiness.motivation,
  ];

  const readinessScore =
    scores.reduce((sum, score) => sum + score, 0) /
    scores.length;

  const requiredWorkouts = workouts.filter(
    (workout) =>
      workout.requirementLevel === "required"
  );

  const nonRequiredWorkouts = workouts.filter(
    (workout) =>
      workout.requirementLevel !== "required"
  );

  const totalPlannedMinutes = workouts.reduce(
    (total, workout) =>
      total + (workout.estimatedDurationMin ?? 0),
    0
  );

  const hasTimeConstraint =
    readiness.availableMinutes !== null &&
    totalPlannedMinutes > 0 &&
    readiness.availableMinutes < totalPlannedMinutes;

  /*
   * Injury / knee guardrail
   *
   * A very low injury score should override an otherwise
   * strong readiness average.
   */
  if (readiness.injuryStatus <= 1) {
    return {
      level: "recover",
      headline: "Recovery takes priority",
      reasoning:
        requiredWorkouts.length > 0
          ? "Your knee / injury check-in is significantly below normal. Avoid adding non-required training today. Keep required rehab work within your PT guidance and adjust or stop if symptoms warrant."
          : "Your knee / injury check-in is significantly below normal. Recovery should take priority over normal training today.",
      readinessScore,
    };
  }

  if (readiness.injuryStatus === 2) {
    return {
      level: "modify",
      headline: "Modify today's training",
      reasoning:
        requiredWorkouts.length > 0
          ? "Your knee / injury status calls for extra caution today. Protect required rehab work within your PT guidance and reduce or remove non-required training."
          : "Your knee / injury status calls for extra caution today. Reduce training stress and avoid pushing through worsening symptoms.",
      readinessScore,
    };
  }

  /*
   * Low overall readiness
   */
  if (readinessScore < 2.5) {
    return {
      level: "recover",
      headline: "Favor recovery today",
      reasoning:
        requiredWorkouts.length > 0
          ? "Your overall readiness is low. Keep required rehab work within your PT guidance, but consider removing non-required training and prioritizing recovery."
          : "Your overall readiness is low today. Consider replacing normal training with recovery or very easy activity.",
      readinessScore,
    };
  }

  /*
   * Time constraint
   */
  if (hasTimeConstraint) {
    if (
      readiness.availableMinutes !== null &&
      readiness.availableMinutes <= 0
    ) {
      return {
        level: "modify",
        headline: "Training doesn't fit today",
        reasoning:
          requiredWorkouts.length > 0
            ? "You reported no training time available. Required rehab work should remain the priority if you can fit it in; move or skip non-required work."
            : "You reported no training time available today. Move or skip today's non-required training rather than forcing it into the day.",
        readinessScore,
      };
    }

    if (
      requiredWorkouts.length > 0 &&
      nonRequiredWorkouts.length > 0
    ) {
      return {
        level: "modify",
        headline: "Prioritize required work",
        reasoning: `You have ${readiness.availableMinutes} minutes available for about ${totalPlannedMinutes} minutes of planned training. Complete required rehab work first, then use any remaining time for the highest-priority non-required work.`,
        readinessScore,
      };
    }

    if (requiredWorkouts.length > 0) {
      return {
        level: "caution",
        headline: "Fit the required work first",
        reasoning: `You have ${readiness.availableMinutes} minutes available for about ${totalPlannedMinutes} minutes of planned training. Keep the required session as the priority and stay within your PT guidance.`,
        readinessScore,
      };
    }

    return {
      level: "modify",
      headline: "Shorten today's training",
      reasoning: `Your readiness is ${
        readinessScore >= 4 ? "good" : "moderate"
      }, but you have ${
        readiness.availableMinutes
      } minutes available for about ${totalPlannedMinutes} minutes of planned training. Prioritize the highest-value work and trim lower-priority volume.`,
      readinessScore,
    };
  }

  /*
   * Moderate readiness
   */
  if (readinessScore < 3.25) {
    return {
      level: "caution",
      headline: "Keep today's effort controlled",
      reasoning:
        "Your readiness is somewhat below normal. Training can still make sense, but keep the effort controlled and avoid forcing intensity or extra volume.",
      readinessScore,
    };
  }

  /*
   * One weak recovery signal despite acceptable average
   */
  if (
    readiness.sleepQuality <= 2 ||
    readiness.energy <= 2 ||
    readiness.soreness <= 2
  ) {
    return {
      level: "caution",
      headline: "Train, but stay flexible",
      reasoning:
        "Your overall readiness is solid, but at least one recovery signal is below normal. Start as planned and be willing to reduce intensity or volume if the session feels harder than expected.",
      readinessScore,
    };
  }

  /*
   * Good readiness
   */
  return {
    level: "proceed",
    headline: "Proceed as planned",
    reasoning:
      "Your readiness and injury check-in support today's planned training. Follow the session as prescribed and adjust if anything changes during the workout.",
    readinessScore,
  };
}
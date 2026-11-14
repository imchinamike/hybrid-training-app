export type StrengthPrescription = {
  prescribedSets: number;

  repsMin: number | null;
  repsMax: number | null;

  targetRpeMin: number | null;
  targetRpeMax: number | null;

  targetWeight: number | null;
};

export type CompletedStrengthSet = {
  setNumber: number;

  weight: number | null;
  reps: number | null;
  rpe: number | null;
};

export type StrengthProgressionAction =
  | "insufficient_data"
  | "hold"
  | "increase_load"
  | "increase_reps"
  | "reduce_load";

export type ProposedStrengthPrescription = {
  sets: number;

  repsMin: number | null;
  repsMax: number | null;

  targetRpeMin: number | null;
  targetRpeMax: number | null;

  targetWeight: number | null;

  /*
   * Optional working rep goal.
   *
   * For double-progression exercises we keep the
   * programmed rep range intact but can provide
   * a more specific next-session target.
   *
   * Example:
   * Prescription = 3 x 8-12
   * Next goal = at least 10 reps per set
   */
  suggestedRepTarget: number | null;
};

export type StrengthProgressionRecommendation = {
  action: StrengthProgressionAction;

  reason: string;

  completedSetCount: number;
  prescribedSetCount: number;

  averageRpe: number | null;

  suggestedWeightChange: number | null;

  proposedPrescription:
    ProposedStrengthPrescription;
};

function average(
  values: number[]
) {
  if (values.length === 0) {
    return null;
  }

  return (
    values.reduce(
      (total, value) =>
        total + value,
      0
    ) / values.length
  );
}

function getBaseProposedPrescription(
  prescription: StrengthPrescription
): ProposedStrengthPrescription {
  return {
    sets:
      prescription.prescribedSets,

    repsMin:
      prescription.repsMin,

    repsMax:
      prescription.repsMax,

    targetRpeMin:
      prescription.targetRpeMin,

    targetRpeMax:
      prescription.targetRpeMax,

    targetWeight:
      prescription.targetWeight,

    suggestedRepTarget:
      null,
  };
}

function getRepresentativeWeight(
  completedWeights: number[]
) {
  if (
    completedWeights.length ===
    0
  ) {
    return null;
  }

  /*
   * For the MVP, use the highest working weight
   * recorded in the completed sets.
   */
  return Math.max(
    ...completedWeights
  );
}

function getSuggestedLoadChange(
  completedWeights: number[],
  direction:
    | "increase"
    | "decrease"
) {
  const representativeWeight =
    getRepresentativeWeight(
      completedWeights
    );

  if (
    representativeWeight ==
    null
  ) {
    return null;
  }

  // Barbell adjustments are made in five-pound steps. The actual
  // proposed load is also rounded to an attainable 5 lb plate increment.
  const change = 5;
  return direction === "increase" ? change : -change;
}

function getProposedWeight(
  prescription: StrengthPrescription,
  completedWeights: number[],
  weightChange: number | null
) {
  /*
   * Prefer the weight actually used in training.
   *
   * This matters because many of our current
   * prescriptions do not yet contain target_weight.
   */
  const representativeWeight =
    getRepresentativeWeight(
      completedWeights
    );

  const baseWeight =
    representativeWeight ??
    prescription.targetWeight;

  if (
    baseWeight == null
  ) {
    return null;
  }

  if (weightChange == null || weightChange === 0) {
    return baseWeight;
  }

  // Barbell loads must be achievable in 5 lb increments. For example,
  // 155 -> 160; and a legacy 42.5 -> 50 (not 47.5).
  if (weightChange > 0) {
    return Math.ceil((baseWeight + weightChange) / 5) * 5;
  }
  return Math.max(0, Math.floor((baseWeight + weightChange) / 5) * 5);
}

function calculateStrengthProgressionRecommendation(
  prescription: StrengthPrescription,
  completedSets: CompletedStrengthSet[]
): StrengthProgressionRecommendation {
  const prescribedSetCount =
    prescription.prescribedSets;

  const completedSetCount =
    completedSets.length;

  const baseProposal =
    getBaseProposedPrescription(
      prescription
    );

  /*
   * ---------------------------------------------------------
   * RULE 1
   * No usable training data
   * ---------------------------------------------------------
   */

  if (
    completedSetCount === 0
  ) {
    return {
      action:
        "insufficient_data",

      reason:
        "No completed sets were recorded. Carry the current prescription forward unchanged.",

      completedSetCount,
      prescribedSetCount,

      averageRpe:
        null,

      suggestedWeightChange:
        null,

      proposedPrescription:
        baseProposal,
    };
  }

  const completedRpes =
    completedSets
      .map(
        (set) =>
          set.rpe
      )
      .filter(
        (
          value
        ): value is number =>
          value != null
      );

  const completedWeights =
    completedSets
      .map(
        (set) =>
          set.weight
      )
      .filter(
        (
          value
        ): value is number =>
          value != null
      );

  const averageRpe =
    average(
      completedRpes
    );

  /*
   * ---------------------------------------------------------
   * RULE 2
   * Partial completion
   *
   * Never automatically progress an incomplete exercise.
   * ---------------------------------------------------------
   */

  if (
    completedSetCount <
    prescribedSetCount
  ) {
    return {
      action:
        "hold",

      reason:
        `Only ${completedSetCount} of ${prescribedSetCount} prescribed sets were completed. Hold the current prescription.`,

      completedSetCount,
      prescribedSetCount,

      averageRpe,

      suggestedWeightChange:
        null,

      proposedPrescription:
        {
          ...baseProposal,

          targetWeight:
            getProposedWeight(
              prescription,
              completedWeights,
              null
            ),
        },
    };
  }

  const completedReps =
    completedSets
      .map(
        (set) =>
          set.reps
      )
      .filter(
        (
          value
        ): value is number =>
          value != null
      );

  /*
   * ---------------------------------------------------------
   * RULE 3
   * Missing rep data
   * ---------------------------------------------------------
   */

  if (
    completedReps.length <
    prescribedSetCount
  ) {
    return {
      action:
        "insufficient_data",

      reason:
        "The exercise was completed, but not every set has a recorded rep count.",

      completedSetCount,
      prescribedSetCount,

      averageRpe,

      suggestedWeightChange:
        null,

      proposedPrescription:
        {
          ...baseProposal,

          targetWeight:
            getProposedWeight(
              prescription,
              completedWeights,
              null
            ),
        },
    };
  }

  const repsMin =
    prescription.repsMin;

  const repsMax =
    prescription.repsMax;

  /*
   * ---------------------------------------------------------
   * RULE 4
   * Missed minimum reps
   * ---------------------------------------------------------
   */

  if (
    repsMin != null &&
    completedReps.some(
      (reps) =>
        reps < repsMin
    )
  ) {
    const clearlyTooHard =
      prescription.targetRpeMax !=
        null &&
      completedRpes.length >
        0 &&
      completedRpes.some(
        (rpe) =>
          rpe >
          prescription.targetRpeMax!
      );

    if (
      clearlyTooHard
    ) {
      const weightChange =
        getSuggestedLoadChange(
          completedWeights,
          "decrease"
        );

      return {
        action:
          "reduce_load",

        reason:
          "Minimum prescribed reps were missed and effort exceeded the target RPE. Reduce load slightly next time.",

        completedSetCount,
        prescribedSetCount,

        averageRpe,

        suggestedWeightChange:
          weightChange,

        proposedPrescription:
          {
            ...baseProposal,

            targetWeight:
              getProposedWeight(
                prescription,
                completedWeights,
                weightChange
              ),
          },
      };
    }

    return {
      action:
        "hold",

      reason:
        "Minimum prescribed reps were not achieved across all sets. Keep the current prescription before progressing.",

      completedSetCount,
      prescribedSetCount,

      averageRpe,

      suggestedWeightChange:
        null,

      proposedPrescription:
        {
          ...baseProposal,

          targetWeight:
            getProposedWeight(
              prescription,
              completedWeights,
              null
            ),
        },
    };
  }

  /*
   * ---------------------------------------------------------
   * RULE 5
   * RPE exceeded prescribed ceiling
   * ---------------------------------------------------------
   */

  if (
    prescription.targetRpeMax !=
      null &&
    completedRpes.length >
      0 &&
    completedRpes.some(
      (rpe) =>
        rpe >
        prescription.targetRpeMax!
    )
  ) {
    return {
      action:
        "hold",

      reason:
        "Prescribed reps were achieved, but at least one set exceeded the target RPE. Hold the current load.",

      completedSetCount,
      prescribedSetCount,

      averageRpe,

      suggestedWeightChange:
        null,

      proposedPrescription:
        {
          ...baseProposal,

          targetWeight:
            getProposedWeight(
              prescription,
              completedWeights,
              null
            ),
        },
    };
  }

  /*
   * ---------------------------------------------------------
   * RULE 6
   * Fixed-rep prescription
   *
   * Example:
   * 4 x 6 @ RPE 7-8
   * ---------------------------------------------------------
   */

  const isFixedRepPrescription =
    repsMin != null &&
    repsMax != null &&
    repsMin === repsMax;

  if (
    isFixedRepPrescription
  ) {
    const allTargetRepsHit =
      completedReps.every(
        (reps) =>
          reps >= repsMin
      );

    if (
      allTargetRepsHit
    ) {
      const effortDataComplete =
        completedRpes.length ===
        prescribedSetCount;

      const allWithinRpe =
        prescription.targetRpeMax !=
          null &&
        effortDataComplete &&
        completedRpes.every(
          (rpe) =>
            rpe <=
            prescription.targetRpeMax!
        );

      if (
        allWithinRpe
      ) {
        const weightChange =
          getSuggestedLoadChange(
            completedWeights,
            "increase"
          );

        return {
          action:
            "increase_load",

          reason:
            "All prescribed sets and reps were completed within the target RPE. Progress load slightly next time.",

          completedSetCount,
          prescribedSetCount,

          averageRpe,

          suggestedWeightChange:
            weightChange,

          proposedPrescription:
            {
              ...baseProposal,

              targetWeight:
                getProposedWeight(
                  prescription,
                  completedWeights,
                  weightChange
                ),
            },
        };
      }

      return {
        action:
          "hold",

        reason:
          "All prescribed reps were completed, but there is not enough effort data to justify an automatic load increase.",

        completedSetCount,
        prescribedSetCount,

        averageRpe,

        suggestedWeightChange:
          null,

        proposedPrescription:
          {
            ...baseProposal,

            targetWeight:
              getProposedWeight(
                prescription,
                completedWeights,
                null
              ),
          },
      };
    }
  }

  /*
   * ---------------------------------------------------------
   * RULE 7
   * Rep-range prescription
   *
   * Example:
   * 3 x 8-12
   *
   * Double progression:
   *
   * - below top of range:
   *   keep load and try to add reps
   *
   * - top of range across every set:
   *   increase load and return toward lower end
   * ---------------------------------------------------------
   */

  const isRepRange =
    repsMin != null &&
    repsMax != null &&
    repsMax > repsMin;

  if (
    isRepRange
  ) {
    const allAtTopOfRange =
      completedReps.every(
        (reps) =>
          reps >= repsMax
      );

    if (
      allAtTopOfRange
    ) {
      const acceptableEffort =
        prescription.targetRpeMax ==
          null ||
        completedRpes.length ===
          0 ||
        completedRpes.every(
          (rpe) =>
            rpe <=
            prescription.targetRpeMax!
        );

      if (
        acceptableEffort
      ) {
        const weightChange =
          getSuggestedLoadChange(
            completedWeights,
            "increase"
          );

        return {
          action:
            "increase_load",

          reason:
            "The top of the prescribed rep range was reached across all sets. Increase load slightly and return toward the lower end of the rep range.",

          completedSetCount,
          prescribedSetCount,

          averageRpe,

          suggestedWeightChange:
            weightChange,

          proposedPrescription:
            {
              ...baseProposal,

              targetWeight:
                getProposedWeight(
                  prescription,
                  completedWeights,
                  weightChange
                ),

              suggestedRepTarget:
                repsMin,
            },
        };
      }
    }

    /*
     * Find the lowest completed rep count.
     *
     * The next goal is one rep higher than the
     * weakest completed set, capped by repsMax.
     */
    const lowestCompletedReps =
      Math.min(
        ...completedReps
      );

    const nextRepGoal =
      Math.min(
        repsMax,
        Math.max(
          repsMin,
          lowestCompletedReps + 1
        )
      );

    return {
      action:
        "increase_reps",

      reason:
        `Keep the current load and aim for at least ${nextRepGoal} reps on each set, working toward ${repsMax}.`,

      completedSetCount,
      prescribedSetCount,

      averageRpe,

      suggestedWeightChange:
        null,

      proposedPrescription:
        {
          ...baseProposal,

          targetWeight:
            getProposedWeight(
              prescription,
              completedWeights,
              null
            ),

          suggestedRepTarget:
            nextRepGoal,
        },
    };
  }

  /*
   * ---------------------------------------------------------
   * FALLBACK
   * ---------------------------------------------------------
   */

  return {
    action:
      "hold",

    reason:
      "The completed work does not meet a defined automatic progression rule. Carry the prescription forward unchanged.",

    completedSetCount,
    prescribedSetCount,

    averageRpe,

    suggestedWeightChange:
      null,

    proposedPrescription:
      {
        ...baseProposal,

        targetWeight:
          getProposedWeight(
            prescription,
            completedWeights,
            null
          ),
      },
  };
}

/** Available individual dumbbell weights in pounds. */
export const AVAILABLE_DUMBBELL_WEIGHTS = [5, 10, 20, 25, 30, 35, 40] as const;

export type StrengthEquipmentLimits = {
  /** Pass for dumbbell movements; omit for barbell/cable/bodyweight exercises. */
  availableWeights?: number[];
};

/**
 * Apply actual equipment availability after performance-based progression.
 * The caller must supply availableWeights for dumbbell exercises; otherwise
 * the default is the barbell progression above (5 lb increments).
 * No exercise is substituted automatically.
 */
export function getStrengthProgressionRecommendation(
  prescription: StrengthPrescription,
  completedSets: CompletedStrengthSet[],
  equipment: StrengthEquipmentLimits = {}
): StrengthProgressionRecommendation {
  const result = calculateStrengthProgressionRecommendation(prescription, completedSets);
  const options = [...new Set((equipment.availableWeights ?? [])
    .filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  if (options.length === 0) return result;

  const maximum = options[options.length - 1];
  const currentTarget = prescription.targetWeight;
  const logged = completedSets.map((set) => set.weight)
    .filter((weight): weight is number => weight != null && Number.isFinite(weight));
  const loggedWeight = logged.length ? Math.max(...logged) : null;
  const base = loggedWeight ?? currentTarget;
  const maxReps = prescription.repsMax;
  const minReps = prescription.repsMin;
  const hasRepRange = minReps != null && maxReps != null && maxReps > minReps;
  const alternativeAdvice =
    "Progress reps, control, or tempo at your available weight. " +
    "If more load is needed, review a suitable barbell or cable variation. " +
    "No exercise substitution is automatic.";

  // If the prescription already calls for unavailable dumbbells, flag it for
  // review; equipment correction is not a failed-performance load reduction.
  if (currentTarget != null && !options.includes(currentTarget)) {
    const available = [...options].reverse().find((n) => n <= currentTarget) ?? options[0];
    return {
      ...result,
      action: "hold",
      reason: `The current ${currentTarget} lb target is unavailable. ` +
        `Your dumbbells are ${options.join(", ")} lb. Review ${available} lb instead.`,
      suggestedWeightChange: null,
      proposedPrescription: {
        ...result.proposedPrescription,
        targetWeight: available,
        suggestedRepTarget: hasRepRange ? maxReps : null,
      },
    };
  }

  // When training at an unavailable weight, do not extrapolate to a larger
  // unavailable load; flag the data for manual review.
  if (loggedWeight != null && !options.includes(loggedWeight)) {
    return {
      ...result,
      action: "hold",
      reason: `The logged ${loggedWeight} lb weight is not in your available ` +
        `dumbbell set. Review the recorded load before progressing.`,
      suggestedWeightChange: null,
      proposedPrescription: {
        ...result.proposedPrescription,
        targetWeight: currentTarget,
      },
    };
  }

  if (result.action === "increase_load") {
    if (base == null) {
      return {
        ...result, action: "hold", suggestedWeightChange: null,
        reason: "No confirmed working weight is available for progression.",
      };
    }
    const next = options.find((weight) => weight > base);
    // Reject 10 -> 20 or any other jumps greater than 5 lb per hand.
    if (next == null || next - base > 5 || base >= maximum) {
      return {
        ...result,
        action: "hold",
        reason: `No suitable next dumbbell above ${base} lb is available. ` + alternativeAdvice,
        suggestedWeightChange: null,
        proposedPrescription: {
          ...result.proposedPrescription,
          targetWeight: base,
          suggestedRepTarget: hasRepRange ? maxReps : null,
        },
      };
    }
    return {
      ...result,
      suggestedWeightChange: next - base,
      reason: `Next available dumbbell is ${next} lb (from ${base} lb). ` + result.reason,
      proposedPrescription: {
        ...result.proposedPrescription,
        targetWeight: next,
        suggestedRepTarget: hasRepRange ? minReps : null,
      },
    };
  }

  if (result.action === "reduce_load") {
    const existing = base;
    const previous = existing == null
      ? null
      : [...options].reverse().find((weight) => weight < existing) ?? null;
    if (previous == null) {
      return {
        ...result,
        action: "hold",
        suggestedWeightChange: null,
        reason: "No lighter dumbbell is available. Reduce reps or effort and review the exercise.",
        proposedPrescription: {
          ...result.proposedPrescription,
          targetWeight: currentTarget,
        },
      };
    }
    return {
      ...result,
      suggestedWeightChange: previous - (existing ?? previous),
      proposedPrescription: { ...result.proposedPrescription, targetWeight: previous },
    };
  }

  // For holds/rep progressions, keep the target if available, otherwise the
  // actual trained dumbbell; never carry over a fabricated intermediate load.
  const safeWeight = base == null ? null : (options.includes(base) ? base : currentTarget);
  return {
    ...result,
    suggestedWeightChange: null,
    proposedPrescription: {
      ...result.proposedPrescription,
      targetWeight: safeWeight,
    },
  };
}



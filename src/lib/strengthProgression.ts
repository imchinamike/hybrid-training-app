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

  /*
   * Conservative MVP loading increments:
   *
   * < 50 lb   -> 2.5 lb
   * 50+ lb    -> 5 lb
   *
   * We can eventually make this exercise-specific.
   */
  let change = 5;

  if (
    representativeWeight <
    50
  ) {
    change = 2.5;
  }

  return direction ===
    "increase"
    ? change
    : -change;
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

  return (
    baseWeight +
    (weightChange ?? 0)
  );
}

export function getStrengthProgressionRecommendation(
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
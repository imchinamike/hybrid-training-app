import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

type WorkoutComponent = {
  id: number;
  component_order: number;
  component_type: string;
  title: string | null;
  notes: string | null;
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
  coaching_note: string | null;
  is_optional: boolean;
};

type Exercise = {
  id: number;
  name: string;
  default_notes: string | null;
};

type CardioPrescription = {
  id: number;
  planned_workout_id: number;
  prescription_order: number;
  segment_type: string;
  title: string;
  duration_minutes: number | null;
  repeats: number | null;
  work_seconds: number | null;
  recovery_seconds: number | null;
  target_zone: string | null;
  target_rpe_min: number | null;
  target_rpe_max: number | null;
  incline_percent: number | null;
  pace_guidance: string | null;
  notes: string | null;
};

function formatRest(seconds: number | null) {
  if (!seconds) return null;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds} sec`;
  }

  if (remainingSeconds === 0) {
    return `${minutes}:00`;
  }

  return `${minutes}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

function formatSecondsCompact(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

function formatReps(
  repsMin: number | null,
  repsMax: number | null
) {
  if (repsMin == null && repsMax == null) return null;

  if (repsMin === repsMax) {
    return `${repsMin}`;
  }

  return `${repsMin}–${repsMax}`;
}

function formatTarget(prescription: Prescription) {
  const pieces: string[] = [];

  const reps = formatReps(
    prescription.reps_min,
    prescription.reps_max
  );

  if (prescription.sets && reps) {
    pieces.push(`${prescription.sets} × ${reps}`);
  }

  if (
    prescription.target_rpe_min != null &&
    prescription.target_rpe_max != null
  ) {
    if (
      prescription.target_rpe_min ===
      prescription.target_rpe_max
    ) {
      pieces.push(`RPE ${prescription.target_rpe_min}`);
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
      pieces.push(`${prescription.target_rir_min} RIR`);
    } else {
      pieces.push(
        `${prescription.target_rir_min}–${prescription.target_rir_max} RIR`
      );
    }
  }

  if (prescription.target_weight != null) {
    pieces.push(`${prescription.target_weight} lb`);
  }

  return pieces.join(" · ");
}

function formatCardioRpe(
  min: number | null,
  max: number | null
) {
  if (min == null && max == null) return null;

  if (min != null && max != null) {
    if (min === max) {
      return `RPE ${min}`;
    }

    return `RPE ${min}–${max}`;
  }

  return `RPE ${min ?? max}`;
}

function formatInterval(
  workSeconds: number | null,
  recoverySeconds: number | null,
  repeats: number | null
) {
  if (
    workSeconds == null &&
    recoverySeconds == null &&
    repeats == null
  ) {
    return null;
  }

  const pieces: string[] = [];

  if (repeats != null) {
    pieces.push(`${repeats} rounds`);
  }

  if (workSeconds != null) {
    pieces.push(`${workSeconds}s work`);
  }

  if (recoverySeconds != null) {
    pieces.push(`${recoverySeconds}s recovery`);
  }

  return pieces.join(" · ");
}

function formatWatchSegment(
  prescription: CardioPrescription
) {
  const title = prescription.title;

  if (
    prescription.repeats != null &&
    prescription.work_seconds != null &&
    prescription.recovery_seconds != null
  ) {
    return `${prescription.repeats} × (${formatSecondsCompact(
      prescription.work_seconds
    )} run / ${formatSecondsCompact(
      prescription.recovery_seconds
    )} walk)`;
  }

  if (prescription.duration_minutes != null) {
    return `${prescription.duration_minutes} min ${title}`;
  }

  return title;
}

export default async function WorkoutDetailPage({
  params,
}: Props) {
  const { id } = await params;

  const { data: workout, error: workoutError } =
    await supabase
      .from("planned_workouts")
      .select(
        `
        id,
        name,
        planned_date,
        workout_type,
        requirement_level,
        priority_level,
        estimated_duration_min,
        coaching_intent,
        notes,
        status
      `
      )
      .eq("id", id)
      .single();

  if (workoutError || !workout) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto max-w-md">
          <Link
            href="/"
            className="text-sm font-medium text-emerald-400"
          >
            ← Back
          </Link>

          <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <h1 className="text-lg font-semibold">
              Workout not found
            </h1>

            <p className="mt-2 text-sm text-red-400">
              {workoutError?.message ??
                "Unable to load workout."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { data: componentData, error: componentError } =
    await supabase
      .from("workout_components")
      .select(
        `
        id,
        component_order,
        component_type,
        title,
        notes
      `
      )
      .eq("planned_workout_id", workout.id)
      .order("component_order", { ascending: true });

  const components =
    (componentData as WorkoutComponent[] | null) ?? [];

  const componentIds = components.map(
    (component) => component.id
  );

  let prescriptions: Prescription[] = [];

  if (componentIds.length > 0) {
    const { data, error } = await supabase
      .from("exercise_prescriptions")
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
        rest_seconds,
        coaching_note,
        is_optional
      `
      )
      .in("workout_component_id", componentIds)
      .order("exercise_order", { ascending: true });

    if (error) {
      console.error("Prescription load error:", error);
    } else {
      prescriptions =
        (data as Prescription[] | null) ?? [];
    }
  }

  const exerciseIds = [
    ...new Set(
      prescriptions.map(
        (prescription) => prescription.exercise_id
      )
    ),
  ];

  let exercises: Exercise[] = [];

  if (exerciseIds.length > 0) {
    const { data, error } = await supabase
      .from("exercises")
      .select("id, name, default_notes")
      .in("id", exerciseIds);

    if (error) {
      console.error("Exercise load error:", error);
    } else {
      exercises = (data as Exercise[] | null) ?? [];
    }
  }

  const exerciseMap = new Map(
    exercises.map((exercise) => [
      exercise.id,
      exercise,
    ])
  );

  const { data: cardioData, error: cardioError } =
    await supabase
      .from("cardio_session_prescriptions")
      .select(
        `
        id,
        planned_workout_id,
        prescription_order,
        segment_type,
        title,
        duration_minutes,
        repeats,
        work_seconds,
        recovery_seconds,
        target_zone,
        target_rpe_min,
        target_rpe_max,
        incline_percent,
        pace_guidance,
        notes
      `
      )
      .eq("planned_workout_id", workout.id)
      .order("prescription_order", { ascending: true });

  const cardioPrescriptions =
    (cardioData as CardioPrescription[] | null) ?? [];

  const isCompleted = workout.status === "completed";

  const hasStrengthDetails =
    components.length > 0;

  const hasCardioDetails =
    cardioPrescriptions.length > 0;

  const watchSetup = cardioPrescriptions
    .map(formatWatchSegment)
    .join(" → ");

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-8 text-zinc-100">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="text-sm font-medium text-emerald-400"
        >
          ← Today
        </Link>

        <header className="mt-6">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
              {workout.requirement_level}
            </span>

            <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
              {workout.priority_level} priority
            </span>

            {workout.estimated_duration_min && (
              <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                {workout.estimated_duration_min} min
              </span>
            )}

            {isCompleted && (
              <span className="rounded-full bg-emerald-950 px-2 py-1 text-xs font-medium text-emerald-400">
                ✓ completed
              </span>
            )}
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            {workout.name}
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            {workout.planned_date}
          </p>

          <p className="mt-1 text-sm capitalize text-zinc-400">
            {workout.workout_type.replaceAll("_", " ")}
          </p>
        </header>

        {workout.coaching_intent && (
          <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">
              Today&apos;s intent
            </p>

            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {workout.coaching_intent}
            </p>
          </section>
        )}

        {workout.notes && (
          <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">
              Notes
            </p>

            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {workout.notes}
            </p>
          </section>
        )}

        {!isCompleted && (
          <Link
            href={`/workout/${workout.id}/move`}
            className="mt-4 flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 transition hover:bg-zinc-800"
          >
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Move workout
              </p>

              <p className="mt-1 text-xs text-zinc-500">
                Reschedule this session to another day
              </p>
            </div>

            <span className="text-zinc-500">→</span>
          </Link>
        )}

        {componentError && (
          <section className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <p className="text-sm text-red-400">
              Unable to load exercise details:{" "}
              {componentError.message}
            </p>
          </section>
        )}

        {cardioError && (
          <section className="mt-6 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <p className="text-sm text-red-400">
              Unable to load cardio details:{" "}
              {cardioError.message}
            </p>
          </section>
        )}

        {hasCardioDetails && watchSetup && (
          <section className="mt-6 rounded-2xl border border-emerald-800/70 bg-emerald-950/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                  Watch setup
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  Quick prescription for your watch
                </p>
              </div>

              <span className="text-lg">
                ⌚
              </span>
            </div>

            <p className="mt-4 text-base font-semibold leading-7 text-zinc-100">
              {watchSetup}
            </p>
          </section>
        )}

        {hasCardioDetails && (
          <div className="mt-6 space-y-4">
            {cardioPrescriptions.map((prescription) => {
              const rpe = formatCardioRpe(
                prescription.target_rpe_min,
                prescription.target_rpe_max
              );

              const interval = formatInterval(
                prescription.work_seconds,
                prescription.recovery_seconds,
                prescription.repeats
              );

              return (
                <section
                  key={prescription.id}
                  className="overflow-hidden rounded-2xl border border-emerald-900/70 bg-emerald-950/20"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-widest text-emerald-400">
                          {prescription.segment_type.replaceAll(
                            "_",
                            " "
                          )}
                        </p>

                        <h2 className="mt-2 text-lg font-semibold text-zinc-100">
                          {prescription.title}
                        </h2>
                      </div>

                      <span className="text-xs text-zinc-600">
                        {prescription.prescription_order}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {prescription.duration_minutes != null && (
                        <div className="rounded-lg bg-zinc-950 px-3 py-2">
                          <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                            Duration
                          </p>

                          <p className="mt-1 text-xs font-medium text-zinc-300">
                            {prescription.duration_minutes} min
                          </p>
                        </div>
                      )}

                      {rpe && (
                        <div className="rounded-lg bg-zinc-950 px-3 py-2">
                          <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                            Effort
                          </p>

                          <p className="mt-1 text-xs font-medium text-zinc-300">
                            {rpe}
                          </p>
                        </div>
                      )}

                      {prescription.target_zone && (
                        <div className="rounded-lg bg-zinc-950 px-3 py-2">
                          <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                            Zone
                          </p>

                          <p className="mt-1 text-xs font-medium text-zinc-300">
                            {prescription.target_zone}
                          </p>
                        </div>
                      )}

                      {prescription.incline_percent != null && (
                        <div className="rounded-lg bg-zinc-950 px-3 py-2">
                          <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                            Incline
                          </p>

                          <p className="mt-1 text-xs font-medium text-zinc-300">
                            {prescription.incline_percent}%
                          </p>
                        </div>
                      )}
                    </div>

                    {interval && (
                      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                        <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                          Interval structure
                        </p>

                        <p className="mt-1 text-sm font-medium text-zinc-300">
                          {interval}
                        </p>
                      </div>
                    )}

                    {prescription.pace_guidance && (
                      <div className="mt-4">
                        <p className="text-[10px] uppercase tracking-wide text-zinc-600">
                          Pace guidance
                        </p>

                        <p className="mt-1 text-sm leading-6 text-zinc-300">
                          {prescription.pace_guidance}
                        </p>
                      </div>
                    )}

                    {prescription.notes && (
                      <div className="mt-4 border-t border-emerald-900/40 pt-4">
                        <p className="text-[10px] uppercase tracking-wide text-zinc-600">
                          Guidance
                        </p>

                        <p className="mt-2 text-sm leading-6 text-zinc-400">
                          {prescription.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-6 space-y-6">
          {components.map((component) => {
            const componentPrescriptions =
              prescriptions
                .filter(
                  (prescription) =>
                    prescription.workout_component_id ===
                    component.id
                )
                .sort(
                  (a, b) =>
                    a.exercise_order - b.exercise_order
                );

            return (
              <section key={component.id}>
                <div className="mb-3">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-emerald-400">
                    {component.component_type.replaceAll(
                      "_",
                      " "
                    )}
                  </p>

                  <h2 className="mt-1 text-lg font-semibold">
                    {component.title}
                  </h2>

                  {component.notes && (
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {component.notes}
                    </p>
                  )}
                </div>

                <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                  {componentPrescriptions.map(
                    (prescription, index) => {
                      const exercise =
                        exerciseMap.get(
                          prescription.exercise_id
                        );

                      const rest = formatRest(
                        prescription.rest_seconds
                      );

                      return (
                        <div
                          key={prescription.id}
                          className={`p-4 ${
                            index !==
                            componentPrescriptions.length - 1
                              ? "border-b border-zinc-800"
                              : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-zinc-100">
                                  {exercise?.name ?? "Exercise"}
                                </h3>

                                {prescription.is_optional && (
                                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-[9px] uppercase text-zinc-500">
                                    Optional
                                  </span>
                                )}
                              </div>

                              <p className="mt-1 text-sm font-medium text-emerald-400">
                                {formatTarget(prescription)}
                              </p>
                            </div>

                            <span className="text-xs text-zinc-600">
                              {prescription.exercise_order}
                            </span>
                          </div>

                          {rest && (
                            <div className="mt-3 inline-flex rounded-lg bg-zinc-950 px-3 py-2">
                              <div>
                                <p className="text-[9px] uppercase text-zinc-600">
                                  Rest
                                </p>

                                <p className="mt-0.5 text-xs font-medium text-zinc-300">
                                  {rest}
                                </p>
                              </div>
                            </div>
                          )}

                          {prescription.coaching_note && (
                            <p className="mt-3 text-xs leading-5 text-zinc-400">
                              {prescription.coaching_note}
                            </p>
                          )}

                          {exercise?.default_notes && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs text-zinc-600">
                                Movement notes
                              </summary>

                              <p className="mt-2 text-xs leading-5 text-zinc-500">
                                {exercise.default_notes}
                              </p>
                            </details>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {!componentError &&
          !cardioError &&
          !hasStrengthDetails &&
          !hasCardioDetails && (
            <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-500">
                No detailed prescription has been added to
                this workout yet.
              </p>
            </section>
          )}

        {hasStrengthDetails && !isCompleted && (
          <Link
            href={`/workout/${workout.id}/log`}
            className="mt-8 block w-full rounded-xl bg-emerald-500 py-4 text-center text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            Start workout
          </Link>
        )}

        {hasCardioDetails &&
          !hasStrengthDetails &&
          !isCompleted && (
            <Link
              href={`/workout/${workout.id}/cardio-log`}
              className="mt-8 block w-full rounded-xl bg-emerald-500 py-4 text-center text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              Log session
            </Link>
          )}

        {isCompleted && (
          <Link
            href="/history"
            className="mt-8 block w-full rounded-xl border border-emerald-800 py-4 text-center text-sm font-semibold text-emerald-400 transition hover:bg-emerald-950/40"
          >
            View in History
          </Link>
        )}
      </div>
    </main>
  );
}
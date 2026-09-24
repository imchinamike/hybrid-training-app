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
  requirement_level: string;
  priority_level: string;
  estimated_duration_min: number | null;
  status: string;
};

type CardioPrescription = {
  id: number;
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

function formatRpe(
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
  prescription: CardioPrescription
) {
  const pieces: string[] = [];

  if (prescription.repeats != null) {
    pieces.push(`${prescription.repeats} rounds`);
  }

  if (prescription.work_seconds != null) {
    pieces.push(`${prescription.work_seconds}s work`);
  }

  if (prescription.recovery_seconds != null) {
    pieces.push(
      `${prescription.recovery_seconds}s recovery`
    );
  }

  return pieces.length > 0
    ? pieces.join(" · ")
    : null;
}

export default function CardioLogPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const workoutId = Number(params.id);

  const [workout, setWorkout] =
    useState<Workout | null>(null);

  const [prescriptions, setPrescriptions] =
    useState<CardioPrescription[]>([]);

  const [durationMinutes, setDurationMinutes] =
    useState("");

  const [distanceMiles, setDistanceMiles] =
    useState("");

  const [averageHeartRate, setAverageHeartRate] =
    useState("");

  const [sessionRpe, setSessionRpe] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  useEffect(() => {
    async function loadSession() {
      setLoading(true);
      setErrorMessage("");

      if (!Number.isFinite(workoutId)) {
        setErrorMessage("Invalid workout ID.");
        setLoading(false);
        return;
      }

      const {
        data: workoutData,
        error: workoutError,
      } = await supabase
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
          status
        `
        )
        .eq("id", workoutId)
        .single();

      if (workoutError || !workoutData) {
        setErrorMessage(
          workoutError?.message ??
            "Workout not found."
        );
        setLoading(false);
        return;
      }

      const loadedWorkout =
        workoutData as Workout;

      setWorkout(loadedWorkout);

      if (
        loadedWorkout.estimated_duration_min != null
      ) {
        setDurationMinutes(
          String(
            loadedWorkout.estimated_duration_min
          )
        );
      }

      const {
        data: prescriptionData,
        error: prescriptionError,
      } = await supabase
        .from("cardio_session_prescriptions")
        .select(
          `
          id,
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
        .eq(
          "planned_workout_id",
          workoutId
        )
        .order(
          "prescription_order",
          { ascending: true }
        );

      if (prescriptionError) {
        setErrorMessage(
          prescriptionError.message
        );
        setLoading(false);
        return;
      }

      setPrescriptions(
        (prescriptionData as
          | CardioPrescription[]
          | null) ?? []
      );

      setLoading(false);
    }

    loadSession();
  }, [workoutId]);

  const prescribedMinutes =
    useMemo(() => {
      const values =
        prescriptions
          .map(
            (prescription) =>
              prescription.duration_minutes
          )
          .filter(
            (
              value
            ): value is number =>
              value != null
          );

      if (values.length === 0) {
        return null;
      }

      return values.reduce(
        (total, value) =>
          total + value,
        0
      );
    }, [prescriptions]);

  async function finishSession() {
    if (!workout) return;

    const parsedDuration =
      Number(durationMinutes);

    const parsedRpe =
      Number(sessionRpe);

    const parsedDistance =
      distanceMiles.trim() === ""
        ? null
        : Number(distanceMiles);

    const parsedHeartRate =
      averageHeartRate.trim() === ""
        ? null
        : Number(averageHeartRate);

    if (
      durationMinutes.trim() === "" ||
      !Number.isFinite(parsedDuration) ||
      parsedDuration <= 0
    ) {
      setErrorMessage(
        "Enter the actual session duration before finishing."
      );
      return;
    }

    if (
      sessionRpe.trim() === "" ||
      !Number.isFinite(parsedRpe) ||
      parsedRpe < 1 ||
      parsedRpe > 10
    ) {
      setErrorMessage(
        "Enter a session RPE from 1 to 10."
      );
      return;
    }

    if (
      parsedDistance != null &&
      (
        !Number.isFinite(parsedDistance) ||
        parsedDistance < 0
      )
    ) {
      setErrorMessage(
        "Enter a valid distance."
      );
      return;
    }

    if (
      parsedHeartRate != null &&
      (
        !Number.isFinite(parsedHeartRate) ||
        parsedHeartRate <= 0
      )
    ) {
      setErrorMessage(
        "Enter a valid average heart rate."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const {
      data: existingMatch,
      error: existingMatchError,
    } = await supabase
      .from("workout_activity_matches")
      .select("id")
      .eq(
        "planned_workout_id",
        workout.id
      )
      .limit(1);

    if (existingMatchError) {
      setErrorMessage(
        existingMatchError.message
      );
      setSaving(false);
      return;
    }

    if (
      existingMatch &&
      existingMatch.length > 0
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

    const combinedNotes = [
      `Completed planned session: ${workout.name}`,
      notes.trim()
        ? notes.trim()
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const distanceMeters =
      parsedDistance == null
        ? null
        : parsedDistance * 1609.344;

    const {
      data: activity,
      error: activityError,
    } = await supabase
      .from("activities")
      .insert({
        athlete_id: athleteData.id,
        activity_type:
          workout.workout_type,
        source: "app",
        start_time:
          new Date().toISOString(),
        duration_seconds:
          Math.round(
            parsedDuration * 60
          ),
        distance_meters:
          distanceMeters,
        average_heart_rate:
          parsedHeartRate,
        session_rpe:
          parsedRpe,
        notes: combinedNotes,
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
      .from("planned_workouts")
      .update({
        status: "completed",
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", workout.id);

    if (statusError) {
      setErrorMessage(
        statusError.message
      );
      setSaving(false);
      return;
    }

    setSuccessMessage(
      "Session saved ✓"
    );

    setSaving(false);

    window.setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1000);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto w-full max-w-md">
          <p className="text-sm text-zinc-500">
            Loading session...
          </p>
        </div>
      </main>
    );
  }

  if (!workout) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto w-full max-w-md">
          <p className="text-sm text-red-400">
            {errorMessage ||
              "Workout not found."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-20 pt-8 text-zinc-100">
      <div className="mx-auto w-full max-w-md">
        <Link
          href={`/workout/${workout.id}`}
          className="text-sm font-medium text-emerald-400"
        >
          ← Workout
        </Link>

        <header className="mt-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
            Post-workout log
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {workout.name}
          </h1>

          <p className="mt-2 text-sm capitalize text-zinc-500">
            {workout.workout_type.replaceAll(
              "_",
              " "
            )}
          </p>
        </header>

        {prescriptions.length > 0 && (
          <section className="mt-6 space-y-3">
            {prescriptions.map(
              (prescription) => {
                const rpe =
                  formatRpe(
                    prescription.target_rpe_min,
                    prescription.target_rpe_max
                  );

                const interval =
                  formatInterval(
                    prescription
                  );

                return (
                  <div
                    key={
                      prescription.id
                    }
                    className="rounded-xl border border-emerald-900/70 bg-emerald-950/20 p-4"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                      {prescription.segment_type.replaceAll(
                        "_",
                        " "
                      )}
                    </p>

                    <h2 className="mt-2 text-base font-semibold">
                      {prescription.title}
                    </h2>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                      {prescription.duration_minutes != null && (
                        <span>
                          {prescription.duration_minutes} min
                        </span>
                      )}

                      {rpe && (
                        <span>
                          {rpe}
                        </span>
                      )}

                      {prescription.target_zone && (
                        <span>
                          {prescription.target_zone}
                        </span>
                      )}

                      {prescription.incline_percent != null && (
                        <span>
                          {prescription.incline_percent}% incline
                        </span>
                      )}
                    </div>

                    {interval && (
                      <div className="mt-3 rounded-lg bg-zinc-950 px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wide text-zinc-600">
                          Structure
                        </p>

                        <p className="mt-1 text-xs text-zinc-300">
                          {interval}
                        </p>
                      </div>
                    )}

                    {prescription.pace_guidance && (
                      <p className="mt-3 text-xs leading-5 text-zinc-400">
                        {prescription.pace_guidance}
                      </p>
                    )}

                    {prescription.notes && (
                      <p className="mt-3 text-xs leading-5 text-zinc-400">
                        {prescription.notes}
                      </p>
                    )}
                  </div>
                );
              }
            )}
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Session results
          </p>

          {prescribedMinutes != null && (
            <p className="mt-2 text-xs text-zinc-500">
              Prescribed duration:{" "}
              {prescribedMinutes} min
            </p>
          )}

          <label className="mt-5 block">
            <span className="text-xs font-medium text-zinc-400">
              Actual duration
            </span>

            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={durationMinutes}
                onChange={(event) =>
                  setDurationMinutes(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base outline-none focus:border-emerald-500"
                placeholder="Minutes"
              />

              <span className="text-sm text-zinc-500">
                min
              </span>
            </div>
          </label>

          <label className="mt-5 block">
            <span className="text-xs font-medium text-zinc-400">
              Distance
            </span>

            <p className="mt-1 text-[10px] text-zinc-600">
              Optional
            </p>

            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={distanceMiles}
                onChange={(event) =>
                  setDistanceMiles(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base outline-none focus:border-emerald-500"
                placeholder="Example: 3.25"
              />

              <span className="text-sm text-zinc-500">
                mi
              </span>
            </div>
          </label>

          <label className="mt-5 block">
            <span className="text-xs font-medium text-zinc-400">
              Average HR
            </span>

            <p className="mt-1 text-[10px] text-zinc-600">
              Optional
            </p>

            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={averageHeartRate}
                onChange={(event) =>
                  setAverageHeartRate(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base outline-none focus:border-emerald-500"
                placeholder="Example: 142"
              />

              <span className="text-sm text-zinc-500">
                bpm
              </span>
            </div>
          </label>

          <label className="mt-5 block">
            <span className="text-xs font-medium text-zinc-400">
              Session RPE
            </span>

            <p className="mt-1 text-[10px] text-zinc-600">
              Overall effort from 1–10
            </p>

            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="1"
              max="10"
              value={sessionRpe}
              onChange={(event) =>
                setSessionRpe(
                  event.target.value
                )
              }
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base outline-none focus:border-emerald-500"
              placeholder="Example: 3"
            />
          </label>

          <label className="mt-5 block">
            <span className="text-xs font-medium text-zinc-400">
              Notes
            </span>

            <p className="mt-1 text-[10px] text-zinc-600">
              Optional — symptoms, how it felt, or anything
              worth remembering.
            </p>

            <textarea
              value={notes}
              onChange={(event) =>
                setNotes(
                  event.target.value
                )
              }
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm leading-6 outline-none focus:border-emerald-500"
              placeholder="Session notes..."
            />
          </label>
        </section>

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
          onClick={finishSession}
          disabled={
            saving ||
            successMessage !== ""
          }
          className="mt-6 w-full rounded-xl bg-emerald-500 py-4 text-base font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : successMessage
            ? "Session saved ✓"
            : "Save session"}
        </button>
      </div>
    </main>
  );
}
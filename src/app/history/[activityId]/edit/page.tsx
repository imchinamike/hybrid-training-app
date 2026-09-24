"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Activity = {
  id: number;
  activity_type: string;
  duration_seconds: number | null;
  distance_meters: number | null;
  average_heart_rate: number | null;
  session_rpe: number | null;
  notes: string | null;
};

type PlannedWorkout = {
  id: number;
  name: string;
};

const METERS_PER_MILE = 1609.344;

function getEditableNotes(notes: string | null) {
  if (!notes) return "";

  const parts = notes.split("\n\n");

  if (
    parts[0]
      ?.toLowerCase()
      .startsWith("completed planned session:")
  ) {
    return parts.slice(1).join("\n\n");
  }

  return notes;
}

export default function EditActivityPage() {
  const params = useParams<{ activityId: string }>();
  const router = useRouter();

  const activityId = Number(params.activityId);

  const [activity, setActivity] =
    useState<Activity | null>(null);

  const [workout, setWorkout] =
    useState<PlannedWorkout | null>(null);

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
    async function loadActivity() {
      setLoading(true);
      setErrorMessage("");

      if (!Number.isFinite(activityId)) {
        setErrorMessage("Invalid activity ID.");
        setLoading(false);
        return;
      }

      const {
        data: activityData,
        error: activityError,
      } = await supabase
        .from("activities")
        .select(
          `
          id,
          activity_type,
          duration_seconds,
          distance_meters,
          average_heart_rate,
          session_rpe,
          notes
        `
        )
        .eq("id", activityId)
        .single();

      if (activityError || !activityData) {
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

      if (
        loadedActivity.duration_seconds != null
      ) {
        setDurationMinutes(
          String(
            Math.round(
              loadedActivity.duration_seconds / 60
            )
          )
        );
      }

      if (
        loadedActivity.distance_meters != null
      ) {
        setDistanceMiles(
          (
            loadedActivity.distance_meters /
            METERS_PER_MILE
          ).toFixed(2)
        );
      }

      if (
        loadedActivity.average_heart_rate != null
      ) {
        setAverageHeartRate(
          String(
            loadedActivity.average_heart_rate
          )
        );
      }

      if (
        loadedActivity.session_rpe != null
      ) {
        setSessionRpe(
          String(loadedActivity.session_rpe)
        );
      }

      setNotes(
        getEditableNotes(
          loadedActivity.notes
        )
      );

      const {
        data: matchData,
        error: matchError,
      } = await supabase
        .from("workout_activity_matches")
        .select("planned_workout_id")
        .eq("activity_id", activityId)
        .maybeSingle();

      if (matchError) {
        setErrorMessage(matchError.message);
        setLoading(false);
        return;
      }

      if (matchData?.planned_workout_id) {
        const {
          data: workoutData,
          error: workoutError,
        } = await supabase
          .from("planned_workouts")
          .select("id, name")
          .eq(
            "id",
            matchData.planned_workout_id
          )
          .single();

        if (workoutError) {
          setErrorMessage(
            workoutError.message
          );
          setLoading(false);
          return;
        }

        setWorkout(
          workoutData as PlannedWorkout
        );
      }

      setLoading(false);
    }

    loadActivity();
  }, [activityId]);

  async function saveChanges() {
    if (!activity) return;

    const parsedDuration =
      Number(durationMinutes);

    const parsedDistance =
      distanceMiles.trim() === ""
        ? null
        : Number(distanceMiles);

    const parsedHeartRate =
      averageHeartRate.trim() === ""
        ? null
        : Number(averageHeartRate);

    const parsedRpe =
      Number(sessionRpe);

    if (
      durationMinutes.trim() === "" ||
      !Number.isFinite(parsedDuration) ||
      parsedDuration <= 0
    ) {
      setErrorMessage(
        "Enter a valid duration."
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

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const distanceMeters =
      parsedDistance == null
        ? null
        : parsedDistance *
          METERS_PER_MILE;

    const combinedNotes = [
      workout
        ? `Completed planned session: ${workout.name}`
        : null,
      notes.trim()
        ? notes.trim()
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { error } = await supabase
      .from("activities")
      .update({
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
        notes:
          combinedNotes || null,
      })
      .eq("id", activity.id);

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    setSuccessMessage(
      "Changes saved ✓"
    );

    setSaving(false);

    window.setTimeout(() => {
      router.push("/history");
      router.refresh();
    }, 700);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto max-w-md">
          <p className="text-sm text-zinc-500">
            Loading activity...
          </p>
        </div>
      </main>
    );
  }

  if (!activity) {
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
                "Activity not found."}
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
            Edit completed session
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {workout?.name ??
              activity.activity_type.replaceAll(
                "_",
                " "
              )}
          </h1>

          <p className="mt-2 text-sm capitalize text-zinc-500">
            {activity.activity_type.replaceAll(
              "_",
              " "
            )}
          </p>
        </header>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <label className="block">
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
            />
          </label>

          <label className="mt-5 block">
            <span className="text-xs font-medium text-zinc-400">
              Notes
            </span>

            <p className="mt-1 text-[10px] text-zinc-600">
              Optional
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
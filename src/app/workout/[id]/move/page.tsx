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

function getMonday(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const difference = day === 0 ? -6 : 1 - day;

  copy.setDate(copy.getDate() + difference);
  copy.setHours(12, 0, 0, 0);

  return copy;
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function MoveWorkoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const workoutId = params.id;

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadWorkout() {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("planned_workouts")
        .select("id, name, planned_date, workout_type, status")
        .eq("id", workoutId)
        .single();

      if (error || !data) {
        setErrorMessage(
          error?.message ?? "Unable to load workout."
        );
        setLoading(false);
        return;
      }

      setWorkout(data);
      setSelectedDate(data.planned_date);
      setLoading(false);
    }

    loadWorkout();
  }, [workoutId]);

  const weekDays = useMemo(() => {
    if (!workout) return [];

    const workoutDate = new Date(
      `${workout.planned_date}T12:00:00`
    );

    const monday = getMonday(workoutDate);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);

      return {
        date,
        dateString: toDateString(date),
        label: formatDayLabel(date),
      };
    });
  }, [workout]);

  async function saveMove() {
    if (!workout) return;

    if (selectedDate === workout.planned_date) {
      router.push("/week");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("planned_workouts")
      .update({
        planned_date: selectedDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workout.id);

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    router.push("/week");
    router.refresh();
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
          <p className="text-sm text-red-400">
            {errorMessage || "Workout not found."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-8 text-zinc-100">
      <div className="mx-auto w-full max-w-md">
        <Link
          href={`/workout/${workout.id}`}
          className="text-sm font-medium text-emerald-400"
        >
          ← Workout
        </Link>

        <header className="mt-6">
          <p className="text-[10px] font-medium uppercase tracking-widest text-emerald-400">
            Schedule
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Move workout
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            {workout.name}
          </p>
        </header>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            Currently scheduled
          </p>

          <p className="mt-2 text-base font-medium">
            {formatDayLabel(
              new Date(`${workout.planned_date}T12:00:00`)
            )}
          </p>
        </section>

        {errorMessage && (
          <div className="mt-5 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <p className="text-sm text-red-400">
              {errorMessage}
            </p>
          </div>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-300">
            Choose a new day
          </h2>

          <div className="mt-3 space-y-2">
            {weekDays.map((day) => {
              const isSelected =
                selectedDate === day.dateString;

              const isCurrent =
                workout.planned_date === day.dateString;

              return (
                <button
                  key={day.dateString}
                  onClick={() =>
                    setSelectedDate(day.dateString)
                  }
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition ${
                    isSelected
                      ? "border-emerald-700 bg-emerald-950/40"
                      : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
                  }`}
                >
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        isSelected
                          ? "text-emerald-300"
                          : "text-zinc-200"
                      }`}
                    >
                      {day.label}
                    </p>

                    {isCurrent && (
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
                        Current day
                      </p>
                    )}
                  </div>

                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-zinc-600"
                    }`}
                  >
                    {isSelected && (
                      <span className="text-[10px] font-bold text-zinc-950">
                        ✓
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <button
          onClick={saveMove}
          disabled={saving}
          className="mt-8 w-full rounded-xl bg-emerald-500 py-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving
            ? "Moving..."
            : selectedDate === workout.planned_date
            ? "Keep current day"
            : "Move workout"}
        </button>
      </div>
    </main>
  );
}
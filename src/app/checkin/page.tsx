"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ScoreSelectorProps = {
  label: string;
  description: string;
  lowLabel: string;
  highLabel: string;
  value: number | null;
  onChange: (value: number) => void;
};

function ScoreSelector({
  label,
  description,
  lowLabel,
  highLabel,
  value,
  onChange,
}: ScoreSelectorProps) {
  return (
    <div>
      <div>
        <p className="text-sm font-semibold text-zinc-100">
          {label}
        </p>

        <p className="mt-1 text-xs text-zinc-500">
          {description}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={`rounded-lg border py-3 text-sm font-semibold transition ${
              value === score
                ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {score}
          </button>
        ))}
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

function getPacificDateString() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
}

export default function CheckinPage() {
  const router = useRouter();

  const [sleepQuality, setSleepQuality] =
    useState<number | null>(null);

  const [energy, setEnergy] =
    useState<number | null>(null);

  const [soreness, setSoreness] =
    useState<number | null>(null);

  const [injuryStatus, setInjuryStatus] =
    useState<number | null>(null);

  const [motivation, setMotivation] =
    useState<number | null>(null);

  const [availableMinutes, setAvailableMinutes] =
    useState("");

  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingCheckin, setExistingCheckin] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadExistingCheckin() {
      setLoading(true);
      setErrorMessage("");

      const athleteId = 1;
      const checkinDate = getPacificDateString();

      const { data, error } = await supabase
        .from("readiness_checkins")
        .select(
          `
          sleep_quality,
          energy,
          soreness,
          injury_status,
          motivation,
          available_minutes,
          notes
        `
        )
        .eq("athlete_id", athleteId)
        .eq("checkin_date", checkinDate)
        .maybeSingle();

      if (error) {
        console.error("Readiness load error:", error);
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      if (data) {
        setExistingCheckin(true);

        setSleepQuality(data.sleep_quality);
        setEnergy(data.energy);
        setSoreness(data.soreness);
        setInjuryStatus(data.injury_status);
        setMotivation(data.motivation);

        setAvailableMinutes(
          data.available_minutes == null
            ? ""
            : String(data.available_minutes)
        );

        setNotes(data.notes ?? "");
      }

      setLoading(false);
    }

    loadExistingCheckin();
  }, []);

  const isComplete =
    sleepQuality !== null &&
    energy !== null &&
    soreness !== null &&
    injuryStatus !== null &&
    motivation !== null;

  async function handleSave() {
    if (!isComplete) {
      setErrorMessage(
        "Please answer all five readiness questions."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    const athleteId = 1;
    const checkinDate = getPacificDateString();

    const { error } = await supabase
      .from("readiness_checkins")
      .upsert(
        {
          athlete_id: athleteId,
          checkin_date: checkinDate,
          sleep_quality: sleepQuality,
          energy,
          soreness,
          injury_status: injuryStatus,
          motivation,
          available_minutes:
            availableMinutes.trim() === ""
              ? null
              : Number(availableMinutes),
          notes:
            notes.trim() === ""
              ? null
              : notes.trim(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "athlete_id,checkin_date",
        }
      );

    if (error) {
      console.error("Readiness save error:", error);
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto w-full max-w-md">
          <p className="text-sm text-zinc-500">
            Loading today&apos;s check-in...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-16 pt-8 text-zinc-100">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="text-sm font-medium text-emerald-400"
        >
          ← Today
        </Link>

        <header className="mt-6">
          <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
            Daily readiness
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {existingCheckin
              ? "Update your check-in"
              : "How are you feeling?"}
          </h1>

          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {existingCheckin
              ? "Adjust anything that has changed since your earlier check-in."
              : "A quick check-in helps us understand how today’s training should feel."}
          </p>
        </header>

        {existingCheckin && (
          <div className="mt-5 rounded-xl border border-emerald-900 bg-emerald-950/30 p-4">
            <p className="text-sm font-medium text-emerald-400">
              Today&apos;s check-in is loaded
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              Make any changes below and save again.
            </p>
          </div>
        )}

        <section className="mt-6 space-y-7 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <ScoreSelector
            label="Sleep"
            description="How was your sleep last night?"
            lowLabel="Poor"
            highLabel="Great"
            value={sleepQuality}
            onChange={setSleepQuality}
          />

          <div className="border-t border-zinc-800" />

          <ScoreSelector
            label="Energy"
            description="How much energy do you have today?"
            lowLabel="Drained"
            highLabel="Excellent"
            value={energy}
            onChange={setEnergy}
          />

          <div className="border-t border-zinc-800" />

          <ScoreSelector
            label="Soreness"
            description="How recovered does your body feel?"
            lowLabel="Very sore"
            highLabel="Fresh"
            value={soreness}
            onChange={setSoreness}
          />

          <div className="border-t border-zinc-800" />

          <ScoreSelector
            label="Knee / injury"
            description="How does the area you're monitoring feel today?"
            lowLabel="Significant"
            highLabel="Normal"
            value={injuryStatus}
            onChange={setInjuryStatus}
          />

          <div className="border-t border-zinc-800" />

          <ScoreSelector
            label="Motivation"
            description="How ready do you feel to train?"
            lowLabel="Very low"
            highLabel="Very high"
            value={motivation}
            onChange={setMotivation}
          />
        </section>

        <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <label className="block">
            <span className="text-sm font-semibold text-zinc-100">
              Time available
            </span>

            <span className="mt-1 block text-xs text-zinc-500">
              Optional — leave blank if time is not a constraint
            </span>

            <div className="mt-3 flex items-center gap-3">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={availableMinutes}
                onChange={(event) =>
                  setAvailableMinutes(event.target.value)
                }
                placeholder="60"
                className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-500"
              />

              <span className="text-sm text-zinc-500">
                minutes
              </span>
            </div>
          </label>
        </section>

        <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <label className="block">
            <span className="text-sm font-semibold text-zinc-100">
              Anything else?
            </span>

            <span className="mt-1 block text-xs text-zinc-500">
              Optional notes about soreness, stress,
              schedule, or anything else relevant today.
            </span>

            <textarea
              value={notes}
              onChange={(event) =>
                setNotes(event.target.value)
              }
              rows={4}
              placeholder="Add a note..."
              className="mt-3 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-emerald-500"
            />
          </label>
        </section>

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <p className="text-sm text-red-400">
              {errorMessage}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={!isComplete || saving}
          className={`mt-6 w-full rounded-xl py-4 text-sm font-semibold transition ${
            isComplete && !saving
              ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              : "cursor-not-allowed bg-zinc-800 text-zinc-600"
          }`}
        >
          {saving
            ? "Saving..."
            : existingCheckin
            ? "Update check-in"
            : "Save check-in"}
        </button>

        <p className="mt-3 text-center text-[10px] leading-4 text-zinc-600">
          Your check-in does not automatically change
          today&apos;s training yet.
        </p>
      </div>
    </main>
  );
}
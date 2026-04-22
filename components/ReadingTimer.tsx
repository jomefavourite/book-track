"use client";

import { useState, useEffect, useRef } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatCountdown } from "@/lib/dateUtils";

// Exported so parents can hold timer state
export type TimerPhase =
  | { status: "setup" }
  | { status: "running"; endsAt: number; totalSec: number }
  | { status: "paused"; remainingSec: number; totalSec: number }
  | { status: "finished"; totalSec: number };

interface TimeInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
}

function TimeInput({ label, value, onChange, max }: TimeInputProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type="number"
        inputMode="numeric"
        min="0"
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (isNaN(n) || n < 0) onChange("0");
          else if (n > max) onChange(String(max));
          else onChange(e.target.value);
        }}
        className="w-16 text-center text-lg font-mono"
      />
    </div>
  );
}

export interface ReadingTimerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayLabel: string;
  sessionId: Id<"readingSessions"> | undefined;
  userId: string;
  savedDurationSec?: number;
  onSaved?: (durationSec: number) => void;
  // Controlled timer state from parent (persists when dialog closes)
  phase: TimerPhase;
  displaySec: number;
  onStart: (totalSec: number) => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}

export default function ReadingTimer({
  open,
  onOpenChange,
  dayLabel,
  sessionId,
  userId,
  savedDurationSec,
  onSaved,
  phase,
  displaySec,
  onStart,
  onPause,
  onResume,
  onReset,
}: ReadingTimerProps) {
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("30");
  const [seconds, setSeconds] = useState("0");
  const [saving, setSaving] = useState(false);
  const prefilled = useRef(false);

  const updateSessionMutation = useConvexMutation(api.readingSessions.updateSession);

  // Pre-fill H/M/S inputs from saved duration on open (setup phase only)
  useEffect(() => {
    if (open && savedDurationSec && !prefilled.current && phase.status === "setup") {
      setHours(String(Math.floor(savedDurationSec / 3600)));
      setMinutes(String(Math.floor((savedDurationSec % 3600) / 60)));
      setSeconds(String(savedDurationSec % 60));
      prefilled.current = true;
    }
    if (!open) prefilled.current = false;
  }, [open, savedDurationSec, phase.status]);

  const totalSec =
    (parseInt(hours || "0", 10) || 0) * 3600 +
    (parseInt(minutes || "0", 10) || 0) * 60 +
    (parseInt(seconds || "0", 10) || 0);

  async function handleStart() {
    if (totalSec === 0 || !sessionId) return;
    setSaving(true);
    try {
      await updateSessionMutation({ sessionId, userId, timerDurationSec: totalSec });
      onSaved?.(totalSec);
    } catch {
      // Non-fatal — timer still starts
    } finally {
      setSaving(false);
    }
    onStart(totalSec);
  }

  const phaseTotalSec =
    phase.status === "running" || phase.status === "paused" || phase.status === "finished"
      ? phase.totalSec
      : 0;
  const progressPct = phaseTotalSec > 0 ? (displaySec / phaseTotalSec) * 100 : 0;

  return (
    // Closing the dialog does NOT reset the timer — parent holds state
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reading Timer · {dayLabel}</DialogTitle>
        </DialogHeader>

        {phase.status === "setup" && (
          <div className="space-y-6 pt-2">
            <div className="flex items-end justify-center gap-3">
              <TimeInput label="Hours" value={hours} onChange={setHours} max={23} />
              <span className="mb-2 text-xl font-bold text-muted-foreground">:</span>
              <TimeInput label="Min" value={minutes} onChange={setMinutes} max={59} />
              <span className="mb-2 text-xl font-bold text-muted-foreground">:</span>
              <TimeInput label="Sec" value={seconds} onChange={setSeconds} max={59} />
            </div>
            <Button
              className="w-full"
              onClick={handleStart}
              disabled={totalSec === 0 || !sessionId || saving}
            >
              {saving ? "Starting…" : "Start"}
            </Button>
            {!sessionId && (
              <p className="text-center text-xs text-muted-foreground">
                Save the day first to enable the timer.
              </p>
            )}
          </div>
        )}

        {(phase.status === "running" || phase.status === "paused") && (
          <div className="space-y-5 pt-2">
            <div className="text-center font-mono text-5xl tabular-nums tracking-tight">
              {formatCountdown(displaySec)}
            </div>
            <Progress value={progressPct} className="h-2" />
            <div className="flex justify-center gap-3">
              <Button
                onClick={phase.status === "running" ? onPause : onResume}
                className="min-w-24"
              >
                {phase.status === "running" ? "Pause" : "Resume"}
              </Button>
              <Button variant="outline" onClick={onReset}>
                Reset
              </Button>
            </div>
          </div>
        )}

        {phase.status === "finished" && (
          <div className="space-y-4 pt-2 text-center">
            <p className="text-3xl">Time&apos;s up!</p>
            <p className="text-sm text-muted-foreground">
              Great reading session — {formatCountdown(phaseTotalSec)} completed.
            </p>
            <Button className="w-full" onClick={onReset}>
              Set New Timer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

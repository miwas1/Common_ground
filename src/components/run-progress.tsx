"use client";

import { Check, Circle, CircleAlert, CirclePause, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

export type StageProgress = {
  position: number;
  name: string;
  doing: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  typicalSeconds: number;
};

const seconds = (from: string, to: number) => Math.max(0, (to - new Date(from).getTime()) / 1000);

function clock(sec: number) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function timeLeft(sec: number) {
  if (sec < 45) return "Less than a minute left";
  return `About ${Math.ceil(sec / 60)} min left`;
}

/**
 * Live progress for a research run: the step in hand, a time estimate from typical step durations,
 * and the full list of steps. Ticks every second on the client; the server poller refreshes the data.
 */
export function RunProgress({ stages, runStatus }: { stages: StageProgress[]; runStatus: string }) {
  const [now, setNow] = useState(() => Date.now());
  const active = runStatus === "pending" || runStatus === "running";
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const paused = runStatus === "needs_input";
  // Before the first step reports in, the run is queued: treat the first pending step as current.
  const current = stages.find((s) => s.status === "running") ?? (active ? stages.find((s) => s.status === "pending") : undefined);
  const elapsedInCurrent = current?.startedAt && current.status === "running" ? seconds(current.startedAt, now) : 0;

  const remainingFor = (s: StageProgress) => {
    if (s.status === "done" || s.status === "cancelled") return 0;
    if (s === current) return Math.max(s.typicalSeconds - elapsedInCurrent, Math.min(15, s.typicalSeconds * 0.25));
    return s.typicalSeconds;
  };
  const total = stages.reduce((sum, s) => sum + s.typicalSeconds, 0);
  const remaining = stages.reduce((sum, s) => sum + remainingFor(s), 0);
  const fraction = Math.min(0.98, Math.max(0.03, 1 - remaining / total));
  const firstStart = stages.map((s) => s.startedAt).filter((t): t is string => Boolean(t)).sort()[0];
  const slow = current?.status === "running" && elapsedInCurrent > current.typicalSeconds * 2 + 20;
  const done = stages.filter((s) => s.status === "done").length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-lg font-semibold tracking-tight" aria-live="polite">
            {paused ? "Paused for your answer" : !active ? null : runStatus === "pending" && !firstStart ? "Starting…" : timeLeft(remaining)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Step {Math.min(done + 1, stages.length)} of {stages.length}
            {firstStart && active ? ` · ${clock(seconds(firstStart, now))} elapsed` : ""}
          </p>
        </div>
        <div
          className="relative h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          aria-label="Research progress"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-out" style={{ width: `${fraction * 100}%` }} />
          {active && (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent motion-safe:animate-shimmer" />
          )}
        </div>
      </div>

      {current && active && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
          <LoaderCircle className="mt-0.5 size-4 shrink-0 text-primary motion-safe:animate-spin" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{current.name}</p>
            <p className="text-sm text-muted-foreground">
              {current.doing}
              <span className="motion-safe:animate-pulse">…</span>
            </p>
            {slow && <p className="mt-1 text-xs text-muted-foreground">This step is taking longer than usual. It&apos;s still working.</p>}
          </div>
          {current.status === "running" && <span className="text-xs text-muted-foreground tabular-nums">{clock(elapsedInCurrent)}</span>}
        </div>
      )}

      <ol className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {stages.map((s) => {
          const isCurrent = s === current && active;
          const took = s.status === "done" && s.startedAt && s.finishedAt && s.position !== 2 ? seconds(s.startedAt, new Date(s.finishedAt).getTime()) : null;
          return (
            <li key={s.position} className="flex items-center gap-2">
              <StageIcon status={isCurrent ? "running" : s.status} />
              <span className={s.status === "pending" && !isCurrent ? "text-muted-foreground" : isCurrent ? "font-medium" : ""}>{s.name}</span>
              {took !== null && <span className="text-xs text-muted-foreground tabular-nums">{took < 60 ? `${Math.max(1, Math.round(took))}s` : clock(took)}</span>}
              <span className="sr-only">({isCurrent ? "in progress" : s.status})</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StageIcon({ status }: { status: string }) {
  const cls = "size-4 shrink-0";
  if (status === "done") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-success text-white motion-safe:animate-in motion-safe:zoom-in-50" aria-hidden>
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "running") return <LoaderCircle className={`${cls} text-primary motion-safe:animate-spin`} aria-hidden />;
  if (status === "needs_input") return <CirclePause className={`${cls} text-warning`} aria-hidden />;
  if (status === "error") return <CircleAlert className={`${cls} text-destructive`} aria-hidden />;
  return <Circle className={`${cls} text-border`} aria-hidden />;
}

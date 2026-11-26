import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";

import { formatContextWindowTokens } from "../../lib/contextWindow";

export type ContextWindowTone = "error" | "warning" | "normal";

export interface ContextWindowPillModel {
  /** Ring fill, clamped to 0..100. Null when the window has no known maximum. */
  readonly ringPercent: number | null;
  readonly tone: ContextWindowTone;
  readonly usedTokens: number | null;
  readonly maxTokens: number | null;
  readonly remainingTokens: number | null;
  readonly usedPercent: number | null;
  readonly autoCompactThreshold: number | null;
  readonly autoCompactPercent: number | null;
  /** Value shown after `Context ·`, without the separator. Null without a snapshot. */
  readonly label: string | null;
}

const EMPTY: ContextWindowPillModel = {
  ringPercent: null,
  tone: "normal",
  usedTokens: null,
  maxTokens: null,
  remainingTokens: null,
  usedPercent: null,
  autoCompactThreshold: null,
  autoCompactPercent: null,
  label: null,
};

function nonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function positive(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** 90% and up is an error, 80% and up a warning; an unknown window stays neutral. */
export function contextWindowTone(percent: number | null): ContextWindowTone {
  if (percent === null || !Number.isFinite(percent)) return "normal";
  if (percent >= 90) return "error";
  if (percent >= 80) return "warning";
  return "normal";
}

export function formatContextWindowPercent(percent: number): string {
  return `${Math.round(clampPercent(percent))}%`;
}

/**
 * Presentation model for the floating context pill. Division, negative values, and NaN all
 * resolve to null or zero instead of leaking into the label or ring.
 */
export function contextWindowPillModel(
  snapshot: ContextWindowSnapshot | null | undefined,
): ContextWindowPillModel {
  if (snapshot === null || snapshot === undefined) return EMPTY;

  const usedTokens = nonNegative(snapshot.usedTokens) ?? 0;
  const maxTokens = positive(snapshot.maxTokens);
  const usedPercent = maxTokens === null ? null : clampPercent((usedTokens / maxTokens) * 100);
  const remainingTokens = maxTokens === null ? null : Math.max(0, maxTokens - usedTokens);
  const autoCompactThreshold = positive(snapshot.autoCompactThreshold);
  const autoCompactPercent =
    autoCompactThreshold === null || maxTokens === null
      ? null
      : clampPercent((autoCompactThreshold / maxTokens) * 100);

  return {
    ringPercent: usedPercent,
    tone: contextWindowTone(usedPercent),
    usedTokens,
    maxTokens,
    remainingTokens,
    usedPercent,
    autoCompactThreshold,
    autoCompactPercent,
    label:
      maxTokens === null
        ? formatContextWindowTokens(usedTokens)
        : `${formatContextWindowTokens(usedTokens)} / ${formatContextWindowTokens(maxTokens)}${
            usedPercent === null ? "" : ` (${formatContextWindowPercent(usedPercent)})`
          }`,
  };
}

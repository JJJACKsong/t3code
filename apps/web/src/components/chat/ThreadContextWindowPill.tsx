import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { Link } from "@tanstack/react-router";
import { useGT, useLocale, useMessages } from "gt-react";

import { cn } from "../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { formatContextWindowCompactionMessage } from "./compaction.logic";
import { contextWindowPillModel } from "./threadContextWindowPill.logic";

const RADIUS = 5.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const RING_TONE_CLASS = {
  error: "stroke-error",
  warning: "stroke-warning",
  normal: "stroke-foreground/70",
} as const;

const LABEL_TONE_CLASS = {
  error: "text-error-foreground",
  warning: "text-warning-foreground",
  normal: "text-foreground",
} as const;

/**
 * A compact glass pill above the composer: context use as a ring and a label, opening the thread's
 * token analytics. Pointer events stay on the pill so the surrounding composer overlay passes through.
 */
export function ThreadContextWindowPill({
  environmentId,
  threadId,
  contextWindow,
  subagentCount,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly subagentCount: number;
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const model = contextWindowPillModel(contextWindow);
  const displayLabel = model.label ?? gt("Token analytics");
  const ringPercent = model.ringPercent;
  const dash = ringPercent === null ? 0 : (ringPercent / 100) * CIRCUMFERENCE;
  const ringClass =
    model.maxTokens === null ? "stroke-muted-foreground/40" : RING_TONE_CLASS[model.tone];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to="/token-analytics"
            search={{ env: environmentId, thread: threadId }}
            aria-label={gt("Context window: {label}", { label: displayLabel })}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/85 px-2.5 py-1 text-xs shadow-sm backdrop-blur-md transition hover:border-border hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        }
      >
        <span aria-hidden className="inline-flex size-3.5 shrink-0 items-center justify-center">
          <svg viewBox="0 0 14 14" className="size-3.5 -rotate-90" fill="none">
            <circle
              cx="7"
              cy="7"
              r={RADIUS}
              strokeWidth="2"
              className="stroke-muted-foreground/25"
            />
            {dash > 0 ? (
              <circle
                cx="7"
                cy="7"
                r={RADIUS}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
                className={cn("transition-[stroke-dasharray] duration-300", ringClass)}
              />
            ) : null}
          </svg>
        </span>
        <span className="whitespace-nowrap tabular-nums">
          <span className="text-muted-foreground">{gt("Context")}</span>
          <span aria-hidden className="px-1 text-muted-foreground/60">
            ·
          </span>
          <span
            className={cn(
              "font-medium",
              model.label === null ? "text-muted-foreground" : LABEL_TONE_CLASS[model.tone],
            )}
          >
            {displayLabel}
          </span>
        </span>
        {subagentCount > 0 ? (
          <span className="hidden whitespace-nowrap text-muted-foreground tabular-nums sm:inline">
            {gt("· {count, plural, one {# subagent} other {# subagents}}", {
              count: subagentCount,
            })}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipPopup side="top" align="end">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{gt("Context window")}</span>
          {model.usedTokens !== null ? (
            <span className="text-muted-foreground">
              {model.maxTokens !== null
                ? gt("{used} of {max} tokens", {
                    used: model.usedTokens.toLocaleString(locale),
                    max: model.maxTokens.toLocaleString(locale),
                  })
                : gt("{used} tokens used", {
                    used: model.usedTokens.toLocaleString(locale),
                  })}
            </span>
          ) : null}
          {model.remainingTokens !== null ? (
            <span className="text-muted-foreground">
              {gt("{tokens} tokens remaining", {
                tokens: model.remainingTokens.toLocaleString(locale),
              })}
            </span>
          ) : null}
          {model.autoCompactThreshold !== null ? (
            <span className="text-muted-foreground">
              {formatContextWindowCompactionMessage(model.autoCompactThreshold, m, locale)}
            </span>
          ) : null}
          {subagentCount > 0 ? (
            <span className="text-muted-foreground">
              {gt("{count, plural, one {# subagent} other {# subagents}}", {
                count: subagentCount,
              })}
            </span>
          ) : null}
          <span className="text-muted-foreground">{gt("Click to open token analytics")}</span>
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}

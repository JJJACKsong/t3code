import {
  type OrchestrationV2ThreadTokenAnalytics,
  type ThreadTokenAggregateSummary,
  type ThreadTokenAnalyticsNode,
  type ThreadTokenDataSource,
  type ThreadTokenModelBreakdown,
  type ThreadTokenNodeOrigin,
  type ThreadTokenTurnEntry,
  type ThreadTokenUsageStatus,
  type UsageTokenTotals,
} from "@t3tools/contracts";
import { msg } from "gt-react";

import { m } from "../../i18n/messages";
import { contextWindowTone, type ContextWindowTone } from "../chat/threadContextWindowPill.logic";
import type { ShareSegment } from "../usage/UsageShareBar";

export type AnalyticsScope = "all" | "self" | "subagents";
export type AnalyticsOriginFilter = "all" | Exclude<ThreadTokenNodeOrigin, "root">;
export type AnalyticsSort = "tokens" | "cost" | "time";

export interface TokenAnalyticsSearch {
  readonly env?: string;
  readonly thread?: string;
  readonly focus?: string;
}

const MAX_SEARCH_LENGTH = 512;

function searchText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length === 0 ? undefined : text.slice(0, MAX_SEARCH_LENGTH);
}

/** Route search is shareable, so every param is optional and invalid values are dropped. */
export function tokenAnalyticsSearchFromUrl(raw: Record<string, unknown>): TokenAnalyticsSearch {
  const env = searchText(raw.env);
  const thread = searchText(raw.thread);
  const focus = searchText(raw.focus);
  return {
    ...(env === undefined ? {} : { env }),
    ...(thread === undefined ? {} : { thread }),
    ...(focus === undefined ? {} : { focus }),
  };
}

const ink = (percent: number) =>
  `color-mix(in oklab, var(--foreground) ${percent}%, var(--background))`;

export type TokenShareId = "uncachedInput" | "cacheRead" | "cacheWrite" | "output" | "other";

export interface TokenShareSegment extends ShareSegment {
  readonly id: TokenShareId;
}

const TOKEN_COLORS: Record<TokenShareId, string> = {
  uncachedInput: ink(60),
  cacheRead: ink(30),
  cacheWrite: ink(72),
  output: ink(100),
  other: ink(44),
};

export interface AttributionSegment {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly color: string;
}

const ATTRIBUTION_TONES = [78, 66, 54, 42, 30] as const;
const ATTRIBUTION_OTHER = ink(20);
const ATTRIBUTION_MAIN = ink(100);

const EMPTY_TOTALS: UsageTokenTotals = {
  uncachedInputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
};

/** Share of a total, clamped to 0..1. Zero, negative, or non-finite input yields 0. */
export function safeRatio(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || value <= 0 || total <= 0) return 0;
  return Math.min(1, value / total);
}

export function safePercent(value: number, total: number): number {
  return safeRatio(value, total) * 100;
}

export function usageTokenTotal(totals: UsageTokenTotals): number {
  return (
    totals.uncachedInputTokens +
    totals.cachedInputTokens +
    totals.cacheCreationTokens +
    totals.outputTokens
  );
}

export function selectScopeSummary(
  data: OrchestrationV2ThreadTokenAnalytics,
  scope: AnalyticsScope,
): ThreadTokenAggregateSummary {
  if (scope === "self") return data.summary.self;
  if (scope === "subagents") return data.summary.subagents;
  return data.summary.total;
}

export function tokenTypeSegments(
  summary: Pick<ThreadTokenAggregateSummary, "totals" | "otherInputTokens" | "otherOutputTokens">,
): readonly TokenShareSegment[] {
  const totals = summary.totals ?? EMPTY_TOTALS;
  return [
    {
      id: "uncachedInput",
      label: msg("Input"),
      value: totals.uncachedInputTokens,
      color: TOKEN_COLORS.uncachedInput,
    },
    {
      id: "cacheRead",
      label: msg("Cache read"),
      value: totals.cachedInputTokens,
      color: TOKEN_COLORS.cacheRead,
    },
    {
      id: "cacheWrite",
      label: msg("Cache write"),
      value: totals.cacheCreationTokens,
      color: TOKEN_COLORS.cacheWrite,
    },
    {
      id: "output",
      label: msg("Output"),
      value: totals.outputTokens,
      color: TOKEN_COLORS.output,
    },
    {
      id: "other",
      label: msg("Other"),
      value: summary.otherInputTokens + summary.otherOutputTokens,
      color: TOKEN_COLORS.other,
    },
  ];
}

function sessionNode(data: OrchestrationV2ThreadTokenAnalytics): ThreadTokenAnalyticsNode | null {
  return (
    data.nodes.find((node) => node.threadId === data.requestedThreadId) ??
    data.nodes.find((node) => node.parentNodeId === null) ??
    data.nodes[0] ??
    null
  );
}

/**
 * Main session plus the biggest direct subagent branches. A direct branch is ranked by its subtree,
 * so nested subagents are counted once, inside the ancestor that owns them.
 */
export function attributionSegments(
  data: OrchestrationV2ThreadTokenAnalytics,
  resolve: (message: string) => string = m,
): readonly AttributionSegment[] {
  const session = sessionNode(data);
  if (session === null) return [];
  const branches = data.nodes
    .filter(
      (node) =>
        node.parentNodeId === session.nodeId &&
        (node.subtreeTotalTokens > 0 || node.subtreeCostUsd > 0),
    )
    .toSorted(
      (left, right) =>
        right.subtreeTotalTokens - left.subtreeTotalTokens ||
        right.subtreeCostUsd - left.subtreeCostUsd ||
        left.title.localeCompare(right.title),
    );
  const shown = branches.slice(0, 5);
  const otherTokens = branches.slice(5).reduce((sum, node) => sum + node.subtreeTotalTokens, 0);

  const segments: AttributionSegment[] = [
    {
      id: "main",
      label: resolve(msg("Main session")),
      value: session.totalTokens,
      color: ATTRIBUTION_MAIN,
    },
    ...shown.map((node, index) => ({
      id: `subagent:${node.nodeId}`,
      label: node.title.trim() || resolve(msg("Subagent")),
      value: node.subtreeTotalTokens,
      color: ink(ATTRIBUTION_TONES[index] ?? ATTRIBUTION_TONES.at(-1)!),
    })),
    ...(otherTokens > 0
      ? [
          {
            id: "other-subagents",
            label: resolve(msg("Other subagents")),
            value: otherTokens,
            color: ATTRIBUTION_OTHER,
          },
        ]
      : []),
  ];
  return segments.filter((segment) => segment.value > 0);
}

function matchesOrigin(node: ThreadTokenAnalyticsNode, origin: AnalyticsOriginFilter): boolean {
  return origin === "all" || node.origin === origin;
}

function sortValue(node: ThreadTokenAnalyticsNode, sort: AnalyticsSort): number {
  if (sort === "cost") return node.subtreeCostUsd;
  if (sort === "time") return node.durationMs ?? 0;
  return node.subtreeTotalTokens;
}

/**
 * Depth-first order with siblings ranked by the chosen metric. Filtering keeps every ancestor of a
 * match, so a matching subagent is still indented under the session that owns it.
 */
export function sortAnalyticsTree(
  nodes: readonly ThreadTokenAnalyticsNode[],
  options: { readonly origin: AnalyticsOriginFilter; readonly sort: AnalyticsSort },
): readonly ThreadTokenAnalyticsNode[] {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const children = new Map<string | null, ThreadTokenAnalyticsNode[]>();
  for (const node of nodes) {
    const parent =
      node.parentNodeId !== null && byId.has(node.parentNodeId) ? node.parentNodeId : null;
    const siblings = children.get(parent);
    if (siblings === undefined) children.set(parent, [node]);
    else siblings.push(node);
  }

  const matching = new Set(
    nodes.filter((node) => matchesOrigin(node, options.origin)).map((node) => node.nodeId),
  );
  const keepsMatch = new Set<string>();
  for (const id of matching) {
    let current: string | null = id;
    const seen = new Set<string>();
    while (current !== null && !seen.has(current)) {
      seen.add(current);
      keepsMatch.add(current);
      current = byId.get(current)?.parentNodeId ?? null;
    }
  }

  const ordered: ThreadTokenAnalyticsNode[] = [];
  const visited = new Set<string>();
  const walk = (parent: string | null) => {
    const siblings = (children.get(parent) ?? [])
      .filter((node) => keepsMatch.has(node.nodeId))
      .toSorted(
        (left, right) =>
          sortValue(right, options.sort) - sortValue(left, options.sort) ||
          left.nodeId.localeCompare(right.nodeId),
      );
    for (const node of siblings) {
      if (visited.has(node.nodeId)) continue;
      visited.add(node.nodeId);
      ordered.push(node);
      walk(node.nodeId);
    }
  };
  walk(null);
  return ordered;
}

export function resolveFocusedNodeId(input: {
  readonly nodes: readonly ThreadTokenAnalyticsNode[];
  readonly focus?: string | null;
  readonly requestedThreadId?: string | null;
}): string | null {
  const { nodes } = input;
  if (nodes.length === 0) return null;
  if (input.focus != null && nodes.some((node) => node.nodeId === input.focus)) return input.focus;
  const requested =
    input.requestedThreadId == null
      ? null
      : nodes.find((node) => node.threadId === input.requestedThreadId);
  return (
    requested?.nodeId ??
    nodes.find((node) => node.parentNodeId === null)?.nodeId ??
    nodes[0]!.nodeId
  );
}

export interface AnalyticsContextCard {
  readonly usedTokens: number | null;
  readonly maxTokens: number | null;
  readonly percent: number | null;
  readonly tone: ContextWindowTone;
  readonly peakTokens: number | null;
  readonly measuredTurns: number;
}

export function contextCardModel(
  node: ThreadTokenAnalyticsNode | null | undefined,
): AnalyticsContextCard {
  const usedTokens = node?.contextWindow?.usedTokens ?? null;
  const maxTokens = node?.contextWindow?.maxTokens ?? null;
  const percent =
    usedTokens === null || maxTokens === null || maxTokens <= 0
      ? null
      : Math.min(100, Math.max(0, (usedTokens / maxTokens) * 100));
  const turnPeak = (node?.turns ?? []).reduce<number | null>(
    (peak, turn) =>
      turn.contextUsedTokens === null ? peak : Math.max(peak ?? 0, turn.contextUsedTokens),
    null,
  );
  return {
    usedTokens,
    maxTokens,
    percent,
    tone: contextWindowTone(percent),
    peakTokens: node?.contextPeakTokens ?? turnPeak,
    measuredTurns: (node?.turns ?? []).filter((turn) => turn.contextUsedTokens !== null).length,
  };
}

export interface TurnChartSegment {
  readonly id: TokenShareId;
  readonly value: number;
  readonly percent: number;
  readonly color: string;
}

export interface TurnChartBar {
  readonly turn: ThreadTokenTurnEntry;
  readonly total: number;
  readonly segments: readonly TurnChartSegment[];
  readonly contextPercent: number | null;
}

export interface TurnChartModel {
  readonly bars: readonly TurnChartBar[];
  readonly maxTotal: number;
  readonly hasContext: boolean;
  readonly maxContextTokens: number | null;
}

/** Stacked bars normalised against the biggest turn, with each turn's own context marker. */
export function buildTurnChart(node: ThreadTokenAnalyticsNode | null | undefined): TurnChartModel {
  const turns = node?.turns ?? [];
  const maxTotal = turns.reduce((max, turn) => Math.max(max, turn.totalTokens), 0);
  const maxContextTokens = turns.reduce<number | null>(
    (max, turn) =>
      turn.contextMaxTokens === null ? max : Math.max(max ?? 0, turn.contextMaxTokens),
    null,
  );
  const bars = turns.map((turn) => {
    const values: Array<{ id: TokenShareId; value: number }> = [
      { id: "uncachedInput", value: turn.totals.uncachedInputTokens },
      { id: "cacheRead", value: turn.totals.cachedInputTokens },
      { id: "cacheWrite", value: turn.totals.cacheCreationTokens },
      { id: "output", value: turn.totals.outputTokens },
      { id: "other", value: turn.otherInputTokens + turn.otherOutputTokens },
    ];
    const contextPercent =
      turn.contextUsedTokens === null ||
      turn.contextMaxTokens === null ||
      turn.contextMaxTokens <= 0
        ? null
        : Math.min(100, Math.max(0, (turn.contextUsedTokens / turn.contextMaxTokens) * 100));
    return {
      turn,
      total: turn.totalTokens,
      segments: values.map((value) => ({
        ...value,
        percent: safePercent(value.value, maxTotal),
        color: TOKEN_COLORS[value.id],
      })),
      contextPercent,
    };
  });
  return {
    bars,
    maxTotal,
    hasContext: bars.some((bar) => bar.contextPercent !== null),
    maxContextTokens,
  };
}

export function sortModelBreakdown(
  byModel: readonly ThreadTokenModelBreakdown[],
): readonly ThreadTokenModelBreakdown[] {
  return byModel.toSorted(
    (left, right) =>
      right.totalTokens - left.totalTokens ||
      right.costUsd - left.costUsd ||
      left.model.localeCompare(right.model),
  );
}

export function isAnalyticsEmpty(data: OrchestrationV2ThreadTokenAnalytics): boolean {
  return (
    data.nodes.length === 0 ||
    (data.summary.total.totalTokens === 0 &&
      data.summary.total.turnCount === 0 &&
      data.nodes.every((node) => node.totalTokens === 0))
  );
}

export type AnalyticsPricingNotice = "unavailable" | "unpriced" | "cached";

export function resolvePricingNotice(
  data: OrchestrationV2ThreadTokenAnalytics,
): AnalyticsPricingNotice | null {
  if (data.pricingStatus === "unavailable") return "unavailable";
  if (data.nodes.some((node) => node.costSource === "unpriced")) return "unpriced";
  if (data.pricingStatus === "cached") return "cached";
  return null;
}

export type AnalyticsDataNoticeId = "partial" | "unavailable" | "snapshot" | "workflow" | "remote";

export interface AnalyticsDataNotice {
  readonly id: AnalyticsDataNoticeId;
  readonly count: number;
  readonly label: string;
}

const DATA_NOTICE_LABELS: Record<AnalyticsDataNoticeId, string> = {
  partial: msg("Some turns report partial usage."),
  unavailable: msg("Some sessions report no usage."),
  snapshot: msg("Some context figures come from a snapshot, not turn usage."),
  workflow: msg("Some workflow figures come from a summary."),
  remote: msg("Some subagents run on a remote environment."),
};

export function collectDataNotices(
  nodes: readonly ThreadTokenAnalyticsNode[],
): readonly AnalyticsDataNotice[] {
  const counts = new Map<AnalyticsDataNoticeId, number>();
  const add = (id: AnalyticsDataNoticeId) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const node of nodes) {
    if (node.usageStatus === "partial") add("partial");
    if (node.usageStatus === "unavailable" || node.dataSource === "unavailable") {
      add("unavailable");
    }
    if (node.dataSource === "context_snapshot") add("snapshot");
    if (node.dataSource === "workflow_summary") add("workflow");
    if (node.origin === "remote" || node.remoteTarget !== undefined) add("remote");
  }
  return (["partial", "unavailable", "snapshot", "workflow", "remote"] as const).flatMap((id) =>
    (counts.get(id) ?? 0) === 0
      ? []
      : [{ id, count: counts.get(id)!, label: DATA_NOTICE_LABELS[id] }],
  );
}

export const ANALYTICS_SCOPE_OPTIONS = [
  { value: "all", label: msg("All") },
  { value: "self", label: msg("Main session") },
  { value: "subagents", label: msg("Subagents") },
] as const satisfies readonly { readonly value: AnalyticsScope; readonly label: string }[];

export const ANALYTICS_ORIGIN_OPTIONS = [
  { value: "all", label: msg("All") },
  { value: "app_owned", label: msg("Subagents") },
  { value: "provider_native", label: msg("Native") },
  { value: "workflow", label: msg("Workflow") },
  { value: "remote", label: msg("Remote") },
] as const satisfies readonly {
  readonly value: AnalyticsOriginFilter;
  readonly label: string;
}[];

export const ANALYTICS_SORT_OPTIONS = [
  { value: "tokens", label: msg("Tokens") },
  { value: "cost", label: msg("Cost") },
  { value: "time", label: msg("Time") },
] as const satisfies readonly { readonly value: AnalyticsSort; readonly label: string }[];

export const ORIGIN_LABELS: Record<ThreadTokenNodeOrigin, string> = {
  root: msg("Root"),
  app_owned: msg("Subagent"),
  provider_native: msg("Native"),
  workflow: msg("Workflow"),
  remote: msg("Remote"),
};

export const USAGE_STATUS_LABELS: Record<ThreadTokenUsageStatus, string> = {
  complete: msg("Complete"),
  partial: msg("Partial"),
  unavailable: msg("Unavailable"),
};

export const DATA_SOURCE_LABELS: Record<ThreadTokenDataSource, string> = {
  turn_usage: msg("Turn usage"),
  transcript: msg("Transcript"),
  context_snapshot: msg("Context snapshot"),
  workflow_summary: msg("Workflow summary"),
  unavailable: msg("Unavailable"),
};

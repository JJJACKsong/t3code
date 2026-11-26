import * as Schema from "effect/Schema";

import {
  ForwardCompatibleArray,
  NonNegativeInt,
  PositiveInt,
  ThreadId,
  RunId,
  EnvironmentId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

import { ProviderDriverKind, ProviderInstanceId } from "./providerInstance.ts";

/** Bump for incompatible UsageSummary changes; skipped unknown array variants need no bump. */
export const USAGE_CONTRACT_VERSION = 6 as const;

export const USAGE_MERGE_COMPATIBLE_SINCE = 4 as const;

export const UsageProviderKind = Schema.Literals([
  "claude",
  "codex",
  "grok",
  "cursor",
  "opencode",
  "antigravity",
  "pi",
  "muse",
]);
export type UsageProviderKind = typeof UsageProviderKind.Type;

const USAGE_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const UsageDay = TrimmedNonEmptyString.check(Schema.isPattern(USAGE_DAY_PATTERN)).pipe(
  Schema.brand("UsageDay"),
);
export type UsageDay = typeof UsageDay.Type;

export const UsageResolution = Schema.Literals(["day", "hour"]);
export type UsageResolution = typeof UsageResolution.Type;

export const UsageCostSource = Schema.Literals(["providerReported", "modelPriced", "unpriced"]);
export type UsageCostSource = typeof UsageCostSource.Type;

/** Sum uncached input, cache reads, and cache writes for input totals; reasoning is already included in output. */
export const UsageTokenTotals = Schema.Struct({
  uncachedInputTokens: NonNegativeInt,
  cachedInputTokens: NonNegativeInt,
  cacheCreationTokens: NonNegativeInt,
  outputTokens: NonNegativeInt,
  reasoningTokens: NonNegativeInt,
});
export type UsageTokenTotals = typeof UsageTokenTotals.Type;

export const UsageCategoryCost = Schema.Struct({
  input: Schema.Number,
  cacheRead: Schema.Number,
  cacheWrite: Schema.Number,
  output: Schema.Number,
});
export type UsageCategoryCost = typeof UsageCategoryCost.Type;

export const UsageBucket = Schema.Struct({
  day: UsageDay,
  hourStart: Schema.optional(TrimmedNonEmptyString),
  provider: UsageProviderKind,
  model: TrimmedNonEmptyString,
  sourcePath: Schema.optional(TrimmedNonEmptyString),
  totals: UsageTokenTotals,
  costUsd: Schema.Number,
  cacheSavingsUsd: Schema.Number,
  categoryCostUsd: Schema.optional(UsageCategoryCost),
  fastCostUsd: Schema.optional(Schema.Number),
  ultrafastCostUsd: Schema.optional(Schema.Number),
  speedPremiumUsd: Schema.optional(Schema.Number),
  costSource: UsageCostSource,
  records: NonNegativeInt,
  unpricedRecords: NonNegativeInt,
  /** Absent from older servers; merges then estimate it from the unpriced record share. */
  unpricedTokens: Schema.optional(NonNegativeInt),
  sessions: NonNegativeInt,
});
export type UsageBucket = typeof UsageBucket.Type;

export const UsageSourceFingerprint = Schema.Struct({
  hostId: TrimmedNonEmptyString,
  provider: UsageProviderKind,
  resolvedHomePath: TrimmedNonEmptyString,
  /** Transcript directory device:inode distinguishes machines sharing a hostname and home path. */
  volumeId: Schema.String,
  /**
   * Opaque identity of a directory that the Windows server of a desktop install
   * reads natively and its managed WSL server reads through a drvfs mount. Path
   * and `volumeId` differ between the two sides, so clients treat sources with
   * an equal value as one directory in addition to the fields above.
   */
  physicalSourceId: Schema.optionalKey(TrimmedNonEmptyString),
});
export type UsageSourceFingerprint = typeof UsageSourceFingerprint.Type;

export const UsageSourceStatus = Schema.Literals(["ok", "missing", "partial", "failed"]);
export type UsageSourceStatus = typeof UsageSourceStatus.Type;

export const UsageSource = Schema.Struct({
  fingerprint: UsageSourceFingerprint,
  status: UsageSourceStatus,
  scannedFiles: NonNegativeInt,
  skippedFiles: NonNegativeInt,
  malformedRecords: NonNegativeInt,
  /** Total this count; bucket counts double-count sessions spanning days or models. */
  distinctSessions: NonNegativeInt,
  message: Schema.NullOr(TrimmedNonEmptyString),
  /** Cached response during refresh; repeat with awaitRefresh for fresh data. */
  refreshing: Schema.optionalKey(Schema.Literal(true)),
});
export type UsageSource = typeof UsageSource.Type;

export const UsagePricingStatus = Schema.Literals(["fresh", "cached", "unavailable"]);
export type UsagePricingStatus = typeof UsagePricingStatus.Type;

export const UsagePricing = Schema.Struct({
  status: UsagePricingStatus,
  source: TrimmedNonEmptyString,
  fetchedAt: Schema.NullOr(Schema.String),
  knownModels: NonNegativeInt,
});
export type UsagePricing = typeof UsagePricing.Type;

/**
 * Matches a provider's original model ID, before usage model aliases apply. Omit provider to
 * match any; a string provider lets older clients carry selectors for providers they lack.
 */
export const UsageModelSelector = Schema.Struct({
  provider: Schema.optional(TrimmedNonEmptyString),
  model: TrimmedNonEmptyString,
});
export type UsageModelSelector = typeof UsageModelSelector.Type;

/** Keeps records matching `include` (all when omitted) and not matching `exclude`. */
export const UsageModelFilter = Schema.Struct({
  include: Schema.optional(Schema.Array(UsageModelSelector)),
  exclude: Schema.optional(Schema.Array(UsageModelSelector)),
});
export type UsageModelFilter = typeof UsageModelFilter.Type;

export const UsageSummaryInput = Schema.Struct({
  sinceDay: UsageDay,
  untilDay: UsageDay,
  /** IANA bucketing zone; offsets fail across DST boundaries. */
  timeZone: TrimmedNonEmptyString,
  resolution: Schema.optional(UsageResolution),
  sinceTime: Schema.optional(TrimmedNonEmptyString),
  untilTime: Schema.optional(TrimmedNonEmptyString),
  awaitRefresh: Schema.optional(Schema.Boolean),
  /** Accept an immediate answer from the last scan; its sources are marked refreshing. */
  provisional: Schema.optional(Schema.Boolean),
  modelFilter: Schema.optional(UsageModelFilter),
});
export type UsageSummaryInput = typeof UsageSummaryInput.Type;

export const UsageSummary = Schema.Struct({
  contractVersion: Schema.Number,
  readAt: Schema.String,
  timeZone: TrimmedNonEmptyString,
  sinceDay: UsageDay,
  untilDay: UsageDay,
  buckets: ForwardCompatibleArray(UsageBucket),
  sources: ForwardCompatibleArray(UsageSource),
  pricing: UsagePricing,
  scanDurationMs: NonNegativeInt,
  /** The filter the server applied; absent means unfiltered, including servers that predate filters. */
  modelFilter: Schema.optional(UsageModelFilter),
});
export type UsageSummary = typeof UsageSummary.Type;

export class UsageReadError extends Schema.TaggedError<UsageReadError>()("UsageReadError", {
  reason: Schema.Literals(["scanFailed", "invalidWindow"]),
  detail: TrimmedNonEmptyString,
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    return `Usage read failed (${this.reason}): ${this.detail}`;
  }
}

export const ThreadTokenDataSource = Schema.Literals([
  "turn_usage",
  "transcript",
  "context_snapshot",
  "workflow_summary",
  "unavailable",
]);
export type ThreadTokenDataSource = typeof ThreadTokenDataSource.Type;

export const ThreadTokenUsageStatus = Schema.Literals(["complete", "partial", "unavailable"]);
export type ThreadTokenUsageStatus = typeof ThreadTokenUsageStatus.Type;

export const ThreadTokenNodeKind = Schema.Literals([
  "root",
  "subagent_thread",
  "native_subagent",
  "workflow_agent",
  "remote_subagent",
]);
export type ThreadTokenNodeKind = typeof ThreadTokenNodeKind.Type;

export const ThreadTokenNodeOrigin = Schema.Literals([
  "root",
  "app_owned",
  "provider_native",
  "workflow",
  "remote",
]);
export type ThreadTokenNodeOrigin = typeof ThreadTokenNodeOrigin.Type;

export const ThreadTokenContextSnapshot = Schema.Struct({
  usedTokens: NonNegativeInt,
  maxTokens: Schema.NullOr(PositiveInt),
  usedPercentage: Schema.NullOr(Schema.Number),
  autoCompactThreshold: Schema.NullOr(PositiveInt),
  updatedAt: Schema.NullOr(Schema.String),
});
export type ThreadTokenContextSnapshot = typeof ThreadTokenContextSnapshot.Type;

export const ThreadTokenTurnEntry = Schema.Struct({
  turnId: Schema.String,
  runId: Schema.NullOr(RunId),
  runOrdinal: Schema.NullOr(PositiveInt),
  ordinal: PositiveInt,
  status: Schema.String,
  driver: ProviderDriverKind,
  model: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.String),
  completedAt: Schema.NullOr(Schema.String),
  durationMs: Schema.NullOr(NonNegativeInt),
  totals: UsageTokenTotals,
  otherInputTokens: NonNegativeInt,
  otherOutputTokens: NonNegativeInt,
  totalTokens: NonNegativeInt,
  contextUsedTokens: Schema.NullOr(NonNegativeInt),
  contextMaxTokens: Schema.NullOr(PositiveInt),
  costUsd: Schema.Number,
  cacheSavingsUsd: Schema.Number,
  costSource: UsageCostSource,
  dataSource: ThreadTokenDataSource,
  usageStatus: ThreadTokenUsageStatus,
  hasSubagents: Schema.Boolean,
});
export type ThreadTokenTurnEntry = typeof ThreadTokenTurnEntry.Type;

export const ThreadTokenAggregateSummary = Schema.Struct({
  totals: UsageTokenTotals,
  otherInputTokens: NonNegativeInt,
  otherOutputTokens: NonNegativeInt,
  totalTokens: NonNegativeInt,
  cacheHitRate: Schema.NullOr(Schema.Number),
  costUsd: Schema.Number,
  cacheSavingsUsd: Schema.Number,
  costSource: UsageCostSource,
  turnCount: NonNegativeInt,
  measuredTurnCount: NonNegativeInt,
  durationMs: NonNegativeInt,
  contextPeakTokens: Schema.NullOr(NonNegativeInt),
  contextMaxTokens: Schema.NullOr(PositiveInt),
});
export type ThreadTokenAggregateSummary = typeof ThreadTokenAggregateSummary.Type;

export const ThreadTokenModelBreakdown = Schema.Struct({
  provider: ProviderDriverKind,
  model: Schema.String,
  selfTotals: UsageTokenTotals,
  subagentTotals: UsageTokenTotals,
  totalTotals: UsageTokenTotals,
  otherInputTokens: NonNegativeInt,
  otherOutputTokens: NonNegativeInt,
  totalTokens: NonNegativeInt,
  cacheHitRate: Schema.NullOr(Schema.Number),
  costUsd: Schema.Number,
  cacheSavingsUsd: Schema.Number,
  costSource: UsageCostSource,
  turnCount: NonNegativeInt,
});
export type ThreadTokenModelBreakdown = typeof ThreadTokenModelBreakdown.Type;

export const ThreadTokenAnalyticsNode = Schema.Struct({
  nodeId: Schema.String,
  kind: ThreadTokenNodeKind,
  origin: ThreadTokenNodeOrigin,
  depth: NonNegativeInt,
  parentNodeId: Schema.NullOr(Schema.String),
  threadId: Schema.NullOr(ThreadId),
  parentThreadId: Schema.NullOr(ThreadId),
  title: Schema.String,
  driver: ProviderDriverKind,
  providerInstanceId: ProviderInstanceId,
  model: Schema.NullOr(Schema.String),
  status: Schema.String,
  startedAt: Schema.NullOr(Schema.String),
  completedAt: Schema.NullOr(Schema.String),
  durationMs: Schema.NullOr(NonNegativeInt),
  contextWindow: Schema.NullOr(ThreadTokenContextSnapshot),
  contextPeakTokens: Schema.NullOr(NonNegativeInt),
  totals: UsageTokenTotals,
  otherInputTokens: NonNegativeInt,
  otherOutputTokens: NonNegativeInt,
  totalTokens: NonNegativeInt,
  cacheHitRate: Schema.NullOr(Schema.Number),
  costUsd: Schema.Number,
  cacheSavingsUsd: Schema.Number,
  costSource: UsageCostSource,
  dataSource: ThreadTokenDataSource,
  usageStatus: ThreadTokenUsageStatus,
  turnCount: NonNegativeInt,
  measuredTurnCount: NonNegativeInt,
  subtreeTotalTokens: NonNegativeInt,
  subtreeCostUsd: Schema.Number,
  remoteTarget: Schema.optional(
    Schema.Struct({ environmentId: EnvironmentId, threadId: ThreadId, label: Schema.String }),
  ),
  turns: Schema.Array(ThreadTokenTurnEntry),
});
export type ThreadTokenAnalyticsNode = typeof ThreadTokenAnalyticsNode.Type;

export const OrchestrationV2GetThreadTokenAnalyticsInput = Schema.Struct({
  threadId: ThreadId,
  includeSubagents: Schema.optional(Schema.Boolean),
});
export type OrchestrationV2GetThreadTokenAnalyticsInput =
  typeof OrchestrationV2GetThreadTokenAnalyticsInput.Type;

export const OrchestrationV2ThreadTokenAnalytics = Schema.Struct({
  generatedAt: Schema.String,
  requestedThreadId: ThreadId,
  rootThreadId: ThreadId,
  parentThreadId: Schema.NullOr(ThreadId),
  pricingStatus: UsagePricingStatus,
  summary: Schema.Struct({
    self: ThreadTokenAggregateSummary,
    subagents: ThreadTokenAggregateSummary,
    total: ThreadTokenAggregateSummary,
    subagentCount: NonNegativeInt,
    activeSubagentCount: NonNegativeInt,
  }),
  byModel: Schema.Array(ThreadTokenModelBreakdown),
  nodes: Schema.Array(ThreadTokenAnalyticsNode),
});
export type OrchestrationV2ThreadTokenAnalytics = typeof OrchestrationV2ThreadTokenAnalytics.Type;

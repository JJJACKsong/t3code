import {
  OrchestrationV2GetThreadProjectionError,
  ProviderDriverKind,
  type OrchestrationV2GetThreadTokenAnalyticsInput,
  type OrchestrationV2ThreadTokenAnalytics,
  type OrchestrationV2ProviderTurn,
  type ThreadId,
  type ThreadTokenAnalyticsNode,
  type ThreadTokenAggregateSummary,
  type ThreadTokenContextSnapshot,
  type ThreadTokenTurnEntry,
  type UsageTokenTotals,
  type UsageCostSource,
} from "@t3tools/contracts";
import { EMPTY_TOTALS, totalTokens, type UsageRecord } from "@t3tools/provider-core/server/usage";
import { piUsageFormat } from "@t3tools/provider-pi/server/usage";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import {
  ProjectionStoreV2,
  type ProjectionRecords,
  type ProjectionStoreV2Error,
} from "../orchestration-v2/ProjectionStore.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { antigravityRateModel } from "../provider/Drivers/antigravityUsageReader.ts";
import { UsageService } from "./UsageService.ts";
import { resolveModelAliases } from "./usageAggregation.ts";
import { cacheSavingsUsd, lookupRate, priceUsage, type PricedRecord } from "./usagePricing.ts";

const MAX_NODES = 200;
const MAX_DEPTH = 16;
const FIELDS = ["runs", "attempts", "subagents", "providerThreads", "providerTurns"] as const;
const isGetThreadProjectionError = Schema.is(OrchestrationV2GetThreadProjectionError);
type Records = ProjectionRecords<(typeof FIELDS)[number]>;
type Usage = Pick<
  ThreadTokenTurnEntry,
  "totals" | "otherInputTokens" | "otherOutputTokens" | "costUsd" | "cacheSavingsUsd" | "costSource"
>;
type MutableNode = { -readonly [K in keyof ThreadTokenAnalyticsNode]: ThreadTokenAnalyticsNode[K] };
const iso = (date: DateTime.Utc | null | undefined) =>
  date == null ? null : DateTime.formatIso(date);
const millis = (date: DateTime.Utc | null | undefined) =>
  date == null ? null : DateTime.toEpochMillis(date);
const duration = (start: number | null, end: number | null) =>
  start === null || end === null ? null : Math.max(0, end - start);
const positive = (n: number | null | undefined) => (n != null && n > 0 ? n : null);
const peak = (values: ReadonlyArray<number | null | undefined>) =>
  values.reduce<number | null>((max, n) => (n == null ? max : Math.max(max ?? 0, n)), null);
const active = (status: string) =>
  ["active", "running", "pending", "queued", "waiting", "starting", "preparing"].includes(status);
const count = (u: Usage) => totalTokens(u.totals) + u.otherInputTokens + u.otherOutputTokens;
const cacheRate = (totals: UsageTokenTotals) => {
  const input = totals.uncachedInputTokens + totals.cachedInputTokens + totals.cacheCreationTokens;
  return input === 0 ? null : totals.cachedInputTokens / input;
};
function add(a: UsageTokenTotals, b: UsageTokenTotals): UsageTokenTotals {
  return {
    uncachedInputTokens: a.uncachedInputTokens + b.uncachedInputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
  };
}
function aggregate(items: readonly Usage[]): Usage {
  const sources = new Set<UsageCostSource>();
  let totals = EMPTY_TOTALS,
    otherInputTokens = 0,
    otherOutputTokens = 0,
    costUsd = 0,
    savings = 0;
  for (const item of items) {
    totals = add(totals, item.totals);
    otherInputTokens += item.otherInputTokens;
    otherOutputTokens += item.otherOutputTokens;
    costUsd += item.costUsd;
    savings += item.cacheSavingsUsd;
    if (count(item) > 0 || item.costUsd !== 0) sources.add(item.costSource);
  }
  return {
    totals,
    otherInputTokens,
    otherOutputTokens,
    costUsd,
    cacheSavingsUsd: savings,
    costSource:
      sources.size === 0 ? "unpriced" : sources.size === 1 ? [...sources][0]! : "modelPriced",
  };
}
function summary(
  nodes: readonly ThreadTokenAnalyticsNode[],
  usage: readonly Usage[] = nodes,
): ThreadTokenAggregateSummary {
  const u = aggregate(usage);
  return {
    ...u,
    totalTokens: count(u),
    cacheHitRate: cacheRate(u.totals),
    turnCount: nodes.reduce((n, node) => n + node.turnCount, 0),
    measuredTurnCount: nodes.reduce((n, node) => n + node.measuredTurnCount, 0),
    durationMs: nodes.reduce((n, node) => n + (node.durationMs ?? 0), 0),
    contextPeakTokens: peak(nodes.map((n) => n.contextPeakTokens)),
    contextMaxTokens: peak(nodes.map((n) => n.contextWindow?.maxTokens)),
  };
}
const measured = (turn: OrchestrationV2ProviderTurn) =>
  turn.turnTokenUsage !== undefined &&
  (turn.turnTokenUsage.inputTokens !== undefined || turn.turnTokenUsage.outputTokens !== undefined);

function closestTurn(turns: readonly OrchestrationV2ProviderTurn[], timestamp: number) {
  let closest: OrchestrationV2ProviderTurn | undefined;
  let distance = Infinity;
  for (const turn of turns) {
    const start = millis(turn.startedAt) ?? millis(turn.completedAt);
    if (start === null) continue;
    const end = millis(turn.completedAt) ?? start;
    const d = timestamp < start ? start - timestamp : timestamp > end ? timestamp - end : 0;
    if (d < distance) {
      closest = turn;
      distance = d;
    }
  }
  return closest ?? turns[0];
}

export class ThreadTokenAnalyticsService extends Context.Service<
  ThreadTokenAnalyticsService,
  {
    readonly getThreadTokenAnalytics: (
      input: OrchestrationV2GetThreadTokenAnalyticsInput,
    ) => Effect.Effect<
      OrchestrationV2ThreadTokenAnalytics,
      OrchestrationV2GetThreadProjectionError
    >;
  }
>()("t3/usage/ThreadTokenAnalyticsService") {}

const make = Effect.gen(function* () {
  const store = yield* ProjectionStoreV2;
  const usage = yield* UsageService;
  const fs = yield* FileSystem.FileSystem;
  const settingsService = yield* ServerSettingsService;

  const readPi = Effect.fn("ThreadTokenAnalyticsService.readPi")(
    function* (file: string | null | undefined) {
      if (!file?.endsWith(".jsonl") || !(yield* fs.exists(file))) return [];
      const state = piUsageFormat.state!.initial();
      const seen = new Set<string>();
      const records: UsageRecord[] = [];
      yield* fs.stream(file).pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.runForEach((line) =>
          Effect.sync(() => {
            for (const record of piUsageFormat.parseLine(line, state)) {
              if (record.dedupeKey !== null) {
                if (seen.has(record.dedupeKey)) continue;
                seen.add(record.dedupeKey);
              }
              records.push(record);
            }
          }),
        ),
      );
      return records;
    },
    Effect.orElseSucceed(() => [] as UsageRecord[]),
  );

  const getThreadTokenAnalytics = Effect.fn("ThreadTokenAnalyticsService.getThreadTokenAnalytics")(
    function* (input: OrchestrationV2GetThreadTokenAnalyticsInput) {
      const root = yield* store.getThreadRecords(input.threadId, FIELDS);
      if (root.thread.deletedAt !== null)
        return yield* new OrchestrationV2GetThreadProjectionError({
          threadId: input.threadId,
          message: "Thread not found",
        });
      const { rates, overrides, pricing } = yield* usage.getRateContext;
      const settings = yield* settingsService.getSettings;
      const aliases = resolveModelAliases(settings.usageModelAliases);
      const shells =
        input.includeSubagents === false
          ? null
          : yield* store.getShellSnapshot({ familyOf: root.thread.lineage.rootThreadId });
      const family = shells === null ? [] : [...shells.threads, ...shells.archivedThreads];
      const nodes: MutableNode[] = [];
      const visited = new Set<ThreadId>();
      const otherRows: {
        node: MutableNode;
        usage: Usage;
        driver: ProviderDriverKind;
        model: string | null;
      }[] = [];
      const modelRows: {
        node: MutableNode;
        usage: Usage;
        driver: ProviderDriverKind;
        model: string | null;
        turns: number;
      }[] = [];

      const price = (
        driver: ProviderDriverKind,
        originalModel: string | null,
        totals: UsageTokenTotals,
        record?: UsageRecord,
      ) => {
        const model = aliases.get(originalModel ?? "") ?? originalModel ?? "";
        const rateModel =
          lookupRate(rates, model) !== null
            ? undefined
            : driver === "antigravity"
              ? antigravityRateModel(model)
              : driver === "pi"
                ? model.slice(model.lastIndexOf("/") + 1)
                : undefined;
        const priced: PricedRecord = {
          model,
          ...(rateModel === undefined ? {} : { rateModel }),
          totals,
          reportedCostUsd: record?.reportedCostUsd ?? null,
          speed: record?.speed ?? "standard",
        };
        const { costUsd, costSource } = priceUsage(rates, priced, overrides);
        return {
          totals,
          otherInputTokens: 0,
          otherOutputTokens: 0,
          costUsd,
          costSource,
          cacheSavingsUsd: cacheSavingsUsd(rates, priced, overrides),
        };
      };

      const visit: (
        records: Records,
        parent: MutableNode | null,
        origin: ThreadTokenAnalyticsNode["origin"],
      ) => Effect.Effect<MutableNode | null, ProjectionStoreV2Error> = Effect.fn(
        "ThreadTokenAnalyticsService.visit",
      )(function* (
        records: Records,
        parent: MutableNode | null,
        origin: ThreadTokenAnalyticsNode["origin"],
      ) {
        const { thread, runs, attempts, providerThreads, providerTurns, subagents } = records;
        if (
          visited.has(thread.id) ||
          nodes.length >= MAX_NODES ||
          (parent?.depth ?? -1) >= MAX_DEPTH ||
          thread.deletedAt !== null
        )
          return null;
        visited.add(thread.id);
        const runById = new Map(runs.map((r) => [r.id, r]));
        const attemptById = new Map(attempts.map((a) => [a.id, a]));
        const runFor = (turn: OrchestrationV2ProviderTurn) => {
          const attempt =
            turn.runAttemptId === null ? undefined : attemptById.get(turn.runAttemptId);
          return attempt === undefined ? undefined : runById.get(attempt.runId);
        };
        const turns = providerTurns.filter((t) => runFor(t)?.status !== "rolled_back");
        const agents = subagents.filter(
          (a) => a.runId === null || runById.get(a.runId)?.status !== "rolled_back",
        );
        const current = providerThreads.find((t) => t.id === thread.activeProviderThreadId);
        const driver =
          current?.driver ??
          providerThreads.at(-1)?.driver ??
          settings.providerInstances[thread.providerInstanceId]?.driver ??
          ProviderDriverKind.make(thread.providerInstanceId);
        const model = thread.modelSelection.model;
        const live = turns
          .filter((t) => current == null || t.providerThreadId === current.id)
          .flatMap((t) => (t.tokenUsage ? [t.tokenUsage] : []))
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
        const compactions = (yield* store.getThreadRecords(thread.id, ["turnItems"], {
          turnItemTypes: ["compaction"],
        })).turnItems
          .filter(
            (i) =>
              i.type === "compaction" &&
              (i.runId === null || runById.get(i.runId)?.status !== "rolled_back"),
          )
          .filter((i) => i.type === "compaction");
        const compact = compactions
          .filter(
            (i) =>
              i.status === "completed" &&
              (current == null ||
                i.providerThreadId == null ||
                i.providerThreadId === current.id) &&
              i.afterTokenCount != null,
          )
          .sort(
            (a, b) =>
              (millis(b.completedAt ?? b.updatedAt) ?? 0) -
              (millis(a.completedAt ?? a.updatedAt) ?? 0),
          )[0];
        const context = live ?? current?.contextUsage;
        const contextAt =
          live?.updatedAt ?? (current?.contextUsage == null ? null : iso(current.updatedAt));
        const compactAt = compact ? iso(compact.completedAt ?? compact.updatedAt) : null;
        const useCompact =
          compactAt !== null &&
          (contextAt === null || Date.parse(compactAt) > Date.parse(contextAt));
        const usedTokens = useCompact ? compact?.afterTokenCount : context?.usedTokens;
        const maxTokens = positive(context?.maxTokens ?? current?.contextUsage?.maxTokens);
        const contextWindow: ThreadTokenContextSnapshot | null =
          usedTokens == null
            ? null
            : {
                usedTokens,
                maxTokens,
                usedPercentage:
                  maxTokens === null ? null : Math.min(100, (usedTokens / maxTokens) * 100),
                autoCompactThreshold: positive(context?.autoCompactThreshold),
                updatedAt: useCompact ? compactAt : contextAt,
              };
        const validRuns = runs.filter((r) => r.status !== "rolled_back");
        const started = validRuns.find((r) => r.startedAt !== null)?.startedAt ?? thread.createdAt;
        const latestRun = validRuns.at(-1);
        const completed = latestRun?.completedAt ?? null;
        const node: MutableNode = {
          nodeId: thread.id,
          kind: parent === null ? "root" : "subagent_thread",
          origin,
          depth: (parent?.depth ?? -1) + 1,
          parentNodeId: parent?.nodeId ?? null,
          threadId: thread.id,
          parentThreadId: thread.lineage.parentThreadId,
          title: thread.title,
          driver,
          providerInstanceId: thread.providerInstanceId,
          model: aliases.get(model) ?? model,
          status: latestRun?.status ?? current?.status ?? "idle",
          startedAt: iso(started),
          completedAt: iso(completed),
          durationMs: duration(millis(started), millis(completed)),
          contextWindow,
          contextPeakTokens: peak([
            contextWindow?.usedTokens,
            ...turns.map((t) => t.tokenUsage?.usedTokens),
            ...providerThreads.map((t) => t.contextUsage?.usedTokens),
            ...compactions.flatMap((i) => [i.beforeTokenCount, i.afterTokenCount]),
          ]),
          ...aggregate([]),
          totalTokens: 0,
          cacheHitRate: null,
          dataSource: "unavailable",
          usageStatus: "unavailable",
          turnCount: 0,
          measuredTurnCount: 0,
          subtreeTotalTokens: 0,
          subtreeCostUsd: 0,
          turns: [],
        };
        nodes.push(node);
        let nativeMeasured = false;
        if (input.includeSubagents !== false && node.depth < MAX_DEPTH) {
          const childIds = new Set(
            family
              .filter(
                (t) =>
                  t.lineage.parentThreadId === thread.id &&
                  t.lineage.relationshipToParent === "subagent" &&
                  !t.lineage.sideChat,
              )
              .map((t) => t.id),
          );
          for (const agent of subagents) {
            if (agents.includes(agent)) continue;
            if (agent.childThreadId !== null) childIds.delete(agent.childThreadId);
            for (const step of agent.workflow?.agents ?? [])
              if (step.childThreadId !== undefined) childIds.delete(step.childThreadId);
          }
          for (const agent of agents) {
            if (agent.childThreadId !== null) childIds.add(agent.childThreadId);
            for (const step of agent.workflow?.agents ?? [])
              if (step.childThreadId !== undefined) childIds.add(step.childThreadId);
          }
          for (const id of childIds) {
            if (nodes.length >= MAX_NODES) break;
            if (visited.has(id)) continue;
            const child = yield* store
              .getThreadRecords(id, FIELDS)
              .pipe(Effect.orElseSucceed(() => null));
            if (
              child === null ||
              child.thread.lineage.relationshipToParent !== "subagent" ||
              child.thread.lineage.sideChat ||
              child.thread.deletedAt !== null
            )
              continue;
            const agent = agents.find(
              (a) =>
                a.childThreadId === id ||
                a.workflow?.agents.some((step) => step.childThreadId === id),
            );
            const childOrigin =
              agent?.origin ??
              (child.thread.creationSource === "provider" ? "provider_native" : "app_owned");
            const loaded = yield* visit(
              child,
              node,
              child.thread.lineage.workflowStep ? "workflow" : childOrigin,
            );
            if (
              childOrigin === "provider_native" &&
              loaded !== null &&
              loaded.turns.some(
                (turn) =>
                  turn.dataSource === "turn_usage" ||
                  turn.dataSource === "transcript" ||
                  (turn.dataSource === "context_snapshot" && turn.totalTokens > 0),
              )
            )
              nativeMeasured = true;
          }
          for (const agent of agents) {
            if (nodes.length >= MAX_NODES) break;
            const steps = agent.workflow?.agents ?? [];
            const leaves =
              steps.length > 0
                ? steps.filter(
                    (step) =>
                      step.childThreadId === undefined ||
                      (!visited.has(step.childThreadId) &&
                        !family.some(
                          (t) =>
                            t.id === step.childThreadId &&
                            (t.lineage.relationshipToParent !== "subagent" || t.lineage.sideChat),
                        )),
                  )
                : agent.childThreadId !== null
                  ? []
                  : [null];
            for (const step of leaves) {
              if (nodes.length >= MAX_NODES) break;
              const kind = agent.remoteChild
                ? "remote_subagent"
                : step
                  ? "workflow_agent"
                  : agent.origin === "provider_native"
                    ? "native_subagent"
                    : null;
              if (kind === null) continue;
              const tokens =
                step?.totalTokens ?? (step === null ? agent.workflow?.totalTokens : undefined);
              // Workflow summaries supply only a total, not a token-category split.
              const u = { ...aggregate([]), otherInputTokens: tokens ?? 0 };
              const leaf: MutableNode = {
                ...u,
                nodeId: step ? `${agent.id}:${step.index}` : agent.id,
                kind,
                origin:
                  kind === "remote_subagent"
                    ? "remote"
                    : kind === "workflow_agent"
                      ? "workflow"
                      : "provider_native",
                depth: node.depth + 1,
                parentNodeId: node.nodeId,
                threadId: null,
                parentThreadId: thread.id,
                title: step?.label ?? agent.title ?? agent.remoteChild?.label ?? "Subagent",
                driver: agent.driver,
                providerInstanceId: agent.providerInstanceId,
                model: step?.model ?? agent.executedModel ?? agent.model,
                status: step?.state ?? agent.status,
                startedAt:
                  step?.startedAt != null
                    ? iso(DateTime.makeUnsafe(step.startedAt))
                    : iso(agent.startedAt),
                completedAt:
                  step?.completedAt != null
                    ? iso(DateTime.makeUnsafe(step.completedAt))
                    : iso(agent.completedAt),
                durationMs:
                  step?.durationMs ??
                  agent.workflow?.durationMs ??
                  duration(millis(agent.startedAt), millis(agent.completedAt)),
                contextWindow: null,
                contextPeakTokens: null,
                totalTokens: count(u),
                cacheHitRate: null,
                dataSource: tokens === undefined ? "unavailable" : "workflow_summary",
                usageStatus: tokens === undefined ? "unavailable" : "partial",
                turnCount: 0,
                measuredTurnCount: 0,
                subtreeTotalTokens: count(u),
                subtreeCostUsd: 0,
                turns: [],
                ...(agent.remoteChild
                  ? {
                      remoteTarget: {
                        environmentId: agent.remoteChild.environmentId,
                        threadId: agent.remoteChild.threadId,
                        label: agent.remoteChild.label,
                      },
                    }
                  : {}),
              };
              nodes.push(leaf);
              modelRows.push({
                node: leaf,
                usage: u,
                driver: leaf.driver,
                model: leaf.model,
                turns: 0,
              });
            }
          }
        }
        const transcriptByTurn = new Map<string, UsageRecord[]>();
        const synthetic: { id: string; records: UsageRecord[]; driver: ProviderDriverKind }[] = [];
        const piFiles = new Map<string, Set<string>>();
        for (const pt of providerThreads) {
          const file = pt.nativeThreadRef?.nativeId;
          if (pt.driver !== "pi" || !file?.endsWith(".jsonl")) continue;
          const ids = piFiles.get(file) ?? new Set<string>();
          ids.add(pt.id);
          piFiles.set(file, ids);
        }
        const seenTranscriptRecords = new Set<string>();
        for (const [file, ids] of piFiles) {
          const candidates = providerTurns.filter((t) => ids.has(t.providerThreadId));
          if (candidates.length > 0 && candidates.every(measured)) continue;
          const parsed = yield* readPi(file);
          for (const record of parsed) {
            if (record.dedupeKey !== null) {
              if (seenTranscriptRecords.has(record.dedupeKey)) continue;
              seenTranscriptRecords.add(record.dedupeKey);
            }
            const target = closestTurn(candidates, record.timestampMs);
            if (target && (!turns.includes(target) || measured(target))) continue;
            if (!target) {
              let entry = synthetic[0];
              if (!entry) {
                entry = { id: thread.id, records: [], driver: ProviderDriverKind.make("pi") };
                synthetic.push(entry);
              }
              entry.records.push(record);
            } else {
              const batch = transcriptByTurn.get(target.id) ?? [];
              batch.push(record);
              transcriptByTurn.set(target.id, batch);
            }
          }
        }

        const entries: ThreadTokenTurnEntry[] = [];
        for (const turn of turns) {
          const run = runFor(turn);
          const turnDriver =
            providerThreads.find((t) => t.id === turn.providerThreadId)?.driver ?? driver;
          const turnModel = turn.model ?? run?.modelSelection.model ?? model;
          const reported = turn.turnTokenUsage;
          const snapshot = turn.tokenUsage;
          const parsed = transcriptByTurn.get(turn.id) ?? [];
          const transcriptModel = parsed[0]?.model;
          const displayModel =
            transcriptModel !== undefined && parsed.every((r) => r.model === transcriptModel)
              ? transcriptModel
              : turnModel;
          let u = aggregate([]);
          let dataSource: ThreadTokenTurnEntry["dataSource"] = "unavailable";
          let usageStatus: ThreadTokenTurnEntry["usageStatus"] = "unavailable";
          if (measured(turn) && reported) {
            const cached = reported.cachedInputTokens ?? 0,
              written = reported.cacheCreationTokens ?? 0,
              output = reported.outputTokens ?? 0;
            u = price(turnDriver, turnModel, {
              uncachedInputTokens: Math.max(0, (reported.inputTokens ?? 0) - cached - written),
              cachedInputTokens: cached,
              cacheCreationTokens: written,
              outputTokens: output,
              reasoningTokens: Math.min(output, reported.reasoningTokens ?? 0),
            });
            dataSource = "turn_usage";
            usageStatus = reported.usageStatus === "complete" ? "complete" : "partial";
          } else if (parsed.length > 0) {
            u = aggregate(parsed.map((r) => price(turnDriver, r.model, r.totals, r)));
            dataSource = "transcript";
            usageStatus = "complete";
          } else if (snapshot) {
            const raw = snapshot.inputTokens ?? 0,
              cached = snapshot.cachedInputTokens ?? 0,
              output = snapshot.outputTokens ?? 0;
            u = price(turnDriver, turnModel, {
              uncachedInputTokens: cached > raw ? raw : raw - cached,
              cachedInputTokens: cached,
              cacheCreationTokens: 0,
              outputTokens: output,
              reasoningTokens: Math.min(output, snapshot.reasoningOutputTokens ?? 0),
            });
            dataSource = "context_snapshot";
            usageStatus = "partial";
          }
          if (dataSource === "transcript") {
            for (const m of new Set(parsed.map((r) => r.model)))
              modelRows.push({
                node,
                usage: aggregate(
                  parsed
                    .filter((r) => r.model === m)
                    .map((r) => price(turnDriver, r.model, r.totals, r)),
                ),
                driver: turnDriver,
                model: m,
                turns: 1,
              });
          } else modelRows.push({ node, usage: u, driver: turnDriver, model: turnModel, turns: 1 });
          if (
            input.includeSubagents !== false &&
            !nativeMeasured &&
            measured(turn) &&
            reported?.otherUsage
          ) {
            const other = reported.otherUsage;
            const priced = price(turnDriver, turnModel, {
              ...EMPTY_TOTALS,
              uncachedInputTokens: other.inputTokens,
              outputTokens: other.outputTokens,
            });
            const otherUsage = {
              ...priced,
              totals: EMPTY_TOTALS,
              otherInputTokens: other.inputTokens,
              otherOutputTokens: other.outputTokens,
            };
            otherRows.push({ node, usage: otherUsage, driver: turnDriver, model: turnModel });
            u = aggregate([u, otherUsage]);
          }
          entries.push({
            ...u,
            turnId: turn.id,
            runId: run?.id ?? null,
            runOrdinal: run?.ordinal ?? null,
            ordinal: turn.ordinal,
            status: turn.status,
            driver: turnDriver,
            model: aliases.get(displayModel) ?? displayModel,
            startedAt: iso(turn.startedAt),
            completedAt: iso(turn.completedAt),
            durationMs: duration(millis(turn.startedAt), millis(turn.completedAt)),
            totalTokens: count(u),
            contextUsedTokens: snapshot?.usedTokens ?? null,
            contextMaxTokens: positive(snapshot?.maxTokens),
            dataSource,
            usageStatus,
            hasSubagents: reported?.hasSubagents ?? agents.some((a) => a.runId === run?.id),
          });
        }
        for (const entry of synthetic) {
          const u = aggregate(entry.records.map((r) => price(entry.driver, r.model, r.totals, r)));
          for (const m of new Set(entry.records.map((r) => r.model)))
            modelRows.push({
              node,
              usage: aggregate(
                entry.records
                  .filter((r) => r.model === m)
                  .map((r) => price(entry.driver, r.model, r.totals, r)),
              ),
              driver: entry.driver,
              model: m,
              turns: 1,
            });
          const first = entry.records.reduce((n, r) => Math.min(n, r.timestampMs), Infinity),
            last = entry.records.reduce((n, r) => Math.max(n, r.timestampMs), -Infinity);
          entries.push({
            ...u,
            totalTokens: count(u),
            turnId: `transcript:${entry.id}`,
            runId: null,
            runOrdinal: null,
            ordinal: entries.length + 1,
            status: "completed",
            driver: entry.driver,
            model: entry.records[0]?.model ?? model,
            startedAt: iso(DateTime.makeUnsafe(first)),
            completedAt: iso(DateTime.makeUnsafe(last)),
            durationMs: last - first,
            contextUsedTokens: null,
            contextMaxTokens: null,
            dataSource: "transcript",
            usageStatus: "complete",
            hasSubagents: false,
          });
        }
        const totals = aggregate(entries);
        const measuredCount = entries.filter((t) => t.usageStatus !== "unavailable").length;
        Object.assign(node, totals, {
          turns: entries,
          totalTokens: count(totals),
          cacheHitRate: cacheRate(totals.totals),
          turnCount: entries.length,
          measuredTurnCount: measuredCount,
          dataSource:
            entries.find((t) => t.dataSource === "turn_usage")?.dataSource ??
            entries.find((t) => t.dataSource === "transcript")?.dataSource ??
            entries.find((t) => t.dataSource === "context_snapshot")?.dataSource ??
            "unavailable",
          usageStatus:
            measuredCount === 0
              ? "unavailable"
              : entries.every((t) => t.usageStatus === "complete")
                ? "complete"
                : "partial",
          subtreeTotalTokens: count(totals),
          subtreeCostUsd: totals.costUsd,
        });
        for (const child of nodes.filter((n) => n.parentNodeId === node.nodeId)) {
          node.subtreeTotalTokens += child.subtreeTotalTokens;
          node.subtreeCostUsd += child.subtreeCostUsd;
        }
        return node;
      });
      yield* visit(root, null, "root");
      const rootNode = nodes[0]!;
      const children = nodes.slice(1);
      const selfRows = modelRows.filter((r) => r.node === rootNode);
      const subRows = [
        ...modelRows.filter((r) => r.node !== rootNode),
        ...otherRows.map((r) => ({ ...r, turns: 0 })),
      ];
      const models = new Map<
        string,
        { driver: ProviderDriverKind; model: string; self: Usage[]; subs: Usage[]; turns: number }
      >();
      for (const [rows, key] of [
        [selfRows, "self"],
        [subRows, "subs"],
      ] as const) {
        for (const row of rows) {
          const model = aliases.get(row.model ?? "") ?? row.model ?? "unknown";
          const id = row.driver + "\0" + model;
          const bucket = models.get(id) ?? {
            driver: row.driver,
            model,
            self: [],
            subs: [],
            turns: 0,
          };
          bucket[key].push(row.usage);
          bucket.turns += row.turns;
          models.set(id, bucket);
        }
      }
      return {
        generatedAt: DateTime.formatIso(yield* DateTime.now),
        requestedThreadId: input.threadId,
        rootThreadId: root.thread.lineage.rootThreadId,
        parentThreadId: root.thread.lineage.parentThreadId,
        pricingStatus: pricing.status,
        summary: {
          self: summary(
            [rootNode],
            selfRows.map((r) => r.usage),
          ),
          subagents: summary(
            children,
            subRows.map((r) => r.usage),
          ),
          total: summary(nodes),
          subagentCount: children.length,
          activeSubagentCount: children.filter((n) => active(n.status)).length,
        },
        byModel: [...models.values()].map((b) => {
          const self = aggregate(b.self),
            subs = aggregate(b.subs),
            total = aggregate([self, subs]);
          return {
            provider: b.driver,
            model: b.model,
            selfTotals: self.totals,
            subagentTotals: subs.totals,
            totalTotals: total.totals,
            otherInputTokens: total.otherInputTokens,
            otherOutputTokens: total.otherOutputTokens,
            costUsd: total.costUsd,
            cacheSavingsUsd: total.cacheSavingsUsd,
            costSource: total.costSource,
            totalTokens: count(total),
            cacheHitRate: cacheRate(total.totals),
            turnCount: b.turns,
          };
        }),
        nodes,
      } satisfies OrchestrationV2ThreadTokenAnalytics;
    },
    (effect, input) =>
      effect.pipe(
        Effect.mapError((cause) =>
          isGetThreadProjectionError(cause)
            ? cause
            : new OrchestrationV2GetThreadProjectionError({
                threadId: input.threadId,
                message: "Failed to load thread token analytics",
                cause,
              }),
        ),
      ),
  );
  return ThreadTokenAnalyticsService.of({ getThreadTokenAnalytics });
});
export const layer = Layer.effect(ThreadTokenAnalyticsService, make);

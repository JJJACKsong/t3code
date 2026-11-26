import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  DEFAULT_SERVER_SETTINGS,
  OrchestrationV2ThreadTokenAnalytics,
  ThreadId,
  RunId,
  RunAttemptId,
  ProviderTurnId,
  type OrchestrationV2ThreadProjection,
  type ServerSettings,
  type OrchestrationV2ThreadShellSnapshot,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import {
  ProjectionStoreV2,
  ProjectionStoreThreadNotFoundError,
} from "../orchestration-v2/ProjectionStore.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { UsageService } from "./UsageService.ts";
import { ThreadTokenAnalyticsService, layer } from "./ThreadTokenAnalyticsService.ts";
import { createOverrideRateTable, parseRateTable } from "./usagePricing.ts";

const start = DateTime.makeUnsafe("2026-10-01T10:00:00Z");
const end = DateTime.makeUnsafe("2026-10-01T10:01:00Z");
const rootId = ThreadId.make("root");
const decodeAnalytics = Schema.decodeEffect(OrchestrationV2ThreadTokenAnalytics);
const usage = {
  usageScope: "main_agent",
  usageStatus: "complete",
  inputTokens: 100,
  cachedInputTokens: 20,
  cacheCreationTokens: 10,
  outputTokens: 30,
  reasoningTokens: 5,
  hasSubagents: false,
} as const;

function fixture(
  id: string,
  options: {
    driver?: string;
    model?: string;
    parent?: string;
    relationship?: string;
    sideChat?: boolean;
    deleted?: boolean;
    archived?: boolean;
    nativeFile?: string;
    turnUsage?: unknown;
    snapshot?: unknown;
    noTurns?: boolean;
    children?: readonly {
      id: string;
      childThreadId: string | null;
      origin: string;
      workflow?: unknown;
      remoteChild?: unknown;
    }[];
    rolledBack?: boolean;
  } = {},
): OrchestrationV2ThreadProjection {
  const driver = options.driver ?? "codex";
  const model = options.model ?? "model";
  return {
    thread: {
      id,
      title: id,
      providerInstanceId: driver,
      modelSelection: { instanceId: driver, model },
      lineage: {
        rootThreadId: rootId,
        parentThreadId: options.parent ?? null,
        relationshipToParent: options.relationship ?? (options.parent ? "subagent" : null),
        sideChat: options.sideChat,
      },
      deletedAt: options.deleted ? end : null,
      archivedAt: options.archived ? end : null,
      createdAt: start,
      activeProviderThreadId: id + ":pt",
      creationSource: "user",
    },
    runs: [
      {
        id: id + ":run",
        ordinal: 1,
        modelSelection: { instanceId: driver, model },
        status: options.rolledBack ? "rolled_back" : "completed",
        startedAt: start,
        completedAt: end,
      },
    ],
    attempts: [{ id: id + ":attempt", runId: id + ":run" }],
    providerThreads: [
      {
        id: id + ":pt",
        driver,
        providerInstanceId: driver,
        nativeThreadRef: options.nativeFile ? { nativeId: options.nativeFile } : null,
        updatedAt: end,
        status: "idle",
      },
    ],
    providerTurns: options.noTurns
      ? []
      : [
          {
            id: id + ":turn",
            providerThreadId: id + ":pt",
            runAttemptId: id + ":attempt",
            ordinal: 1,
            status: "completed",
            startedAt: start,
            completedAt: end,
            model,
            turnTokenUsage:
              options.turnUsage === undefined ? usage : (options.turnUsage ?? undefined),
            tokenUsage: options.snapshot,
          },
        ],
    subagents: (options.children ?? []).map((child) => ({
      ...child,
      runId: id + ":run",
      threadId: id,
      driver,
      providerInstanceId: driver,
      model,
      status: "completed",
      startedAt: start,
      completedAt: end,
    })),
    turnItems: [],
  } as unknown as OrchestrationV2ThreadProjection;
}
function query(
  rows: readonly OrchestrationV2ThreadProjection[],
  includeSubagents = true,
  settings: ServerSettings = DEFAULT_SERVER_SETTINGS,
) {
  const rates = parseRateTable({
    model: {
      input_cost_per_token: 0.001,
      output_cost_per_token: 0.002,
      cache_read_input_token_cost: 0.0001,
    },
    "gemini-3-flash-preview": { input_cost_per_token: 0.001, output_cost_per_token: 0.002 },
  });
  return Effect.gen(function* () {
    const service = yield* ThreadTokenAnalyticsService;
    const result = yield* service.getThreadTokenAnalytics({ threadId: rootId, includeSubagents });
    return yield* decodeAnalytics(result);
  }).pipe(
    Effect.provide(
      layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            NodeServices.layer,
            Layer.mock(ProjectionStoreV2)({
              getThreadRecords: (threadId) => {
                const row = rows.find((r) => r.thread.id === threadId);
                return row
                  ? Effect.succeed(row)
                  : Effect.fail(new ProjectionStoreThreadNotFoundError({ threadId }));
              },
              getShellSnapshot: () =>
                Effect.succeed({
                  threads: rows.filter((r) => r.thread.archivedAt === null).map((r) => r.thread),
                  archivedThreads: rows
                    .filter((r) => r.thread.archivedAt !== null)
                    .map((r) => r.thread),
                  snapshotSequence: 0,
                  schemaVersion: 1,
                } as unknown as OrchestrationV2ThreadShellSnapshot),
            }),
            Layer.mock(UsageService)({
              getRateContext: Effect.succeed({
                rates,
                overrides: createOverrideRateTable(settings.usagePriceOverrides),
                pricing: { status: "cached", source: "test", fetchedAt: null, knownModels: 2 },
              }),
            }),
            Layer.mock(ServerSettingsService)({
              getSettings: Effect.succeed(settings),
            }),
          ),
        ),
      ),
    ),
  );
}

it.effect("prices Codex and Claude totals without double-counting reasoning", () =>
  Effect.gen(function* () {
    for (const driver of ["codex", "claudeAgent", "antigravity"]) {
      const result = yield* query([
        fixture("root", {
          driver,
          model: driver === "antigravity" ? "gemini-3-flash-high" : "model",
        }),
      ]);
      const turn = result.nodes[0]!.turns[0]!;
      assert.deepEqual(turn.totals, {
        uncachedInputTokens: 70,
        cachedInputTokens: 20,
        cacheCreationTokens: 10,
        outputTokens: 30,
        reasoningTokens: 5,
      });
      assert.equal(turn.totalTokens, 130);
      assert.equal(turn.costSource, "modelPriced");
      assert.closeTo(turn.costUsd, driver === "antigravity" ? 0.16 : 0.142, 1e-9);
      assert.equal(result.summary.total.totalTokens, 130);
    }
  }),
);

it.effect("rejects missing and deleted threads", () =>
  Effect.gen(function* () {
    for (const rows of [[], [fixture("root", { deleted: true })]]) {
      const error = yield* query(rows).pipe(Effect.flip);
      assert.equal(error._tag, "OrchestrationV2GetThreadProjectionError");
    }
  }),
);

it.effect(
  "expands nested subagents once, excludes forks, side chats and rollback, and suppresses overlapping native usage",
  () =>
    Effect.gen(function* () {
      const rows = [
        fixture("root", {
          turnUsage: {
            ...usage,
            hasSubagents: true,
            otherUsage: { inputTokens: 100, outputTokens: 30 },
          },
          children: [{ id: "agent", childThreadId: "child", origin: "provider_native" }],
        }),
        fixture("child", {
          parent: "root",
          children: [{ id: "cycle", childThreadId: "root", origin: "app_owned" }],
        }),
        fixture("grandchild", { parent: "child", archived: true }),
        fixture("fork", { parent: "root", relationship: "fork" }),
        fixture("side", { parent: "root", sideChat: true }),
        fixture("rollback", { parent: "root", rolledBack: true }),
      ];
      const result = yield* query(rows);
      assert.deepEqual(
        result.nodes.map((n) => n.nodeId),
        ["root", "child", "grandchild", "rollback"],
      );
      assert.equal(result.summary.self.totalTokens, 130);
      assert.equal(result.summary.subagents.totalTokens, 260);
      assert.equal(result.summary.total.totalTokens, 390);
      assert.equal(result.nodes[0]!.subtreeTotalTokens, 390);
      assert.equal(result.nodes[3]!.turnCount, 0);
      const onlyRoot = yield* query(rows, false);
      assert.lengthOf(onlyRoot.nodes, 1);
      assert.equal(onlyRoot.summary.total.totalTokens, 130);
    }),
);

it.effect("counts unattributed other usage only in subagent and total summaries", () =>
  Effect.gen(function* () {
    const result = yield* query([
      fixture("root", {
        turnUsage: { ...usage, otherUsage: { inputTokens: 11, outputTokens: 7 } },
      }),
    ]);
    assert.equal(result.summary.self.totalTokens, 130);
    assert.equal(result.summary.subagents.totalTokens, 18);
    assert.equal(result.summary.total.totalTokens, 148);
    assert.equal(result.byModel[0]!.totalTokens, 148);
  }),
);

it.effect("reads Pi JSONL, ignores malformed and duplicate lines, and prefers measured turns", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = dir + "/session.jsonl";
    const record =
      '{"type":"usage","id":"1","timestamp":"2026-10-01T10:00:20Z","provider":"openai","model":"model","usage":{"input":30,"output":9,"cacheRead":40,"cacheWrite":2,"reasoning":3}}';
    yield* fs.writeFileString(
      file,
      ['{"type":"session","id":"session"}', record, "broken json", record].join("\n"),
    );
    const result = yield* query([
      fixture("root", {
        driver: "pi",
        nativeFile: file,
        turnUsage: null,
        snapshot: { usedTokens: 20, inputTokens: 10, updatedAt: "2026-10-01T10:01:00Z" },
      }),
    ]);
    assert.equal(result.nodes[0]!.turns[0]!.dataSource, "transcript");
    assert.equal(result.summary.total.totalTokens, 81);
    assert.equal(result.byModel[0]!.model, "openai/model");
    assert.equal(result.byModel[0]!.turnCount, 1);
    const synthetic = yield* query([
      fixture("root", { driver: "pi", nativeFile: file, noTurns: true }),
    ]);
    assert.equal(synthetic.nodes[0]!.turnCount, 1);
    assert.equal(synthetic.summary.total.totalTokens, 81);
    const preferred = yield* query([fixture("root", { driver: "pi", nativeFile: file })]);
    assert.equal(preferred.summary.total.totalTokens, 130);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "falls back on unavailable Pi transcripts, keeping historical disjoint cache counters",
  () =>
    Effect.gen(function* () {
      const result = yield* query([
        fixture("root", {
          driver: "pi",
          nativeFile: "/definitely-missing/session.jsonl",
          turnUsage: null,
          snapshot: {
            usedTokens: 120,
            maxTokens: 200,
            inputTokens: 10,
            cachedInputTokens: 100,
            outputTokens: 5,
            updatedAt: "2026-10-01T10:01:00Z",
          },
        }),
      ]);
      const node = result.nodes[0]!;
      assert.equal(node.dataSource, "context_snapshot");
      assert.equal(node.usageStatus, "partial");
      assert.equal(node.totalTokens, 115);
      assert.equal(node.contextWindow?.usedPercentage, 60);
      const unavailable = yield* query([
        fixture("root", {
          driver: "pi",
          nativeFile: "/definitely-missing/session.jsonl",
          turnUsage: null,
        }),
      ]);
      assert.equal(unavailable.nodes[0]!.usageStatus, "unavailable");
      assert.equal(unavailable.summary.total.totalTokens, 0);
    }),
);

it.effect(
  "represents native, workflow and remote leaves without repeating local workflow children",
  () =>
    Effect.gen(function* () {
      const root = fixture("root", {
        children: [
          { id: "native", childThreadId: null, origin: "provider_native" },
          {
            id: "workflow",
            childThreadId: null,
            origin: "provider_native",
            workflow: {
              agents: [
                {
                  index: 0,
                  label: "local",
                  childThreadId: "local",
                  state: "completed",
                  totalTokens: 150,
                },
                { index: 1, label: "external", state: "completed", totalTokens: 42 },
              ],
            },
          },
          {
            id: "remote",
            childThreadId: null,
            origin: "app_owned",
            remoteChild: {
              environmentId: "remote-env",
              threadId: "remote-thread",
              label: "Remote",
            },
          },
        ],
      });
      const result = yield* query([root, fixture("local", { parent: "root" })]);
      assert.deepEqual(
        result.nodes.map((n) => n.kind),
        ["root", "subagent_thread", "native_subagent", "workflow_agent", "remote_subagent"],
      );
      assert.equal(result.nodes[3]!.totalTokens, 42);
      assert.equal(result.nodes[3]!.dataSource, "workflow_summary");
      assert.equal(result.nodes[4]!.remoteTarget?.threadId, "remote-thread");
      assert.equal(result.summary.total.totalTokens, 302);
    }),
);

it.effect("caps recursive traversal and includes aliases and price overrides", () =>
  Effect.gen(function* () {
    const deep = [fixture("root")];
    for (let i = 1; i < 25; i++)
      deep.push(fixture("deep-" + i, { parent: i === 1 ? "root" : "deep-" + (i - 1) }));
    const result = yield* query(deep);
    assert.lengthOf(result.nodes, 17);
    assert.equal(result.nodes.at(-1)?.depth, 16);
    const wide = [
      fixture("root"),
      ...Array.from({ length: 220 }, (_, i) => fixture("wide-" + i, { parent: "root" })),
    ];
    assert.lengthOf((yield* query(wide)).nodes, 200);
    const priced = yield* query([fixture("root", { driver: "pi", model: "vendor/alias" })], true, {
      ...DEFAULT_SERVER_SETTINGS,
      usageModelAliases: { "vendor/alias": "model" },
      usagePriceOverrides: {
        model: {
          inputCostPerMillionTokens: 100,
          outputCostPerMillionTokens: 200,
          cacheReadCostPerMillionTokens: 10,
        },
      },
    });
    assert.equal(priced.byModel[0]?.model, "model");
    assert.closeTo(priced.summary.total.costUsd, 0.0142, 1e-9);
  }),
);

it.effect(
  "assigns Pi records to their nearest turn, skipping measured and rolled-back intervals",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = dir + "/multi.jsonl";
      const writeRecord = (id: string, timestamp: string, input: number) =>
        JSON.stringify({
          type: "usage",
          id,
          timestamp,
          provider: "vendor",
          model: "model",
          usage: { input, output: 1 },
        });
      yield* fs.writeFileString(
        file,
        [
          writeRecord("pre", "2026-10-01T09:59:55Z", 2),
          writeRecord("first", "2026-10-01T10:00:20Z", 3),
          writeRecord("rollback", "2026-10-01T10:02:20Z", 100),
          writeRecord("measured", "2026-10-01T10:04:20Z", 200),
        ].join("\n"),
      );
      const root = fixture("root", { driver: "pi", nativeFile: file, turnUsage: null });
      const rolledBackRun = RunId.make("rolled");
      const rolledBackAttempt = RunAttemptId.make("rolled-attempt");
      const at = (time: string) => DateTime.makeUnsafe("2026-10-01T" + time + "Z");
      const original = root.providerTurns[0]!;
      const result = yield* query([
        {
          ...root,
          runs: [
            ...root.runs,
            { ...root.runs[0]!, id: rolledBackRun, ordinal: 2, status: "rolled_back" },
          ],
          attempts: [
            ...root.attempts,
            { ...root.attempts[0]!, id: rolledBackAttempt, runId: rolledBackRun },
          ],
          providerTurns: [
            original,
            {
              ...original,
              id: ProviderTurnId.make("rolled-turn"),
              ordinal: 2,
              runAttemptId: rolledBackAttempt,
              startedAt: at("10:02:00"),
              completedAt: at("10:03:00"),
            },
            {
              ...original,
              id: ProviderTurnId.make("measured-turn"),
              ordinal: 3,
              startedAt: at("10:04:00"),
              completedAt: at("10:05:00"),
              turnTokenUsage: usage,
            },
          ],
        },
      ]);
      assert.deepEqual(
        result.nodes[0]!.turns.map((t) => [t.dataSource, t.totalTokens]),
        [
          ["transcript", 7],
          ["turn_usage", 130],
        ],
      );
      assert.equal(result.summary.total.totalTokens, 137);
      yield* fs.writeFileString(file, "{broken");
      const degraded = yield* query([
        fixture("root", {
          driver: "pi",
          nativeFile: file,
          turnUsage: null,
          snapshot: {
            usedTokens: 9,
            inputTokens: 8,
            outputTokens: 1,
            updatedAt: "2026-10-01T10:01:00Z",
          },
        }),
      ]);
      assert.equal(degraded.nodes[0]!.turns[0]!.dataSource, "context_snapshot");
      assert.equal(degraded.summary.total.totalTokens, 9);
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "uses the newest completed compaction for current context while retaining the historical peak",
  () =>
    Effect.gen(function* () {
      const root = fixture("root", {
        snapshot: {
          usedTokens: 180,
          maxTokens: 200,
          autoCompactThreshold: 170,
          inputTokens: 100,
          updatedAt: "2026-10-01T10:00:20Z",
        },
      });
      const compact = {
        type: "compaction",
        status: "completed",
        providerThreadId: root.providerThreads[0]!.id,
        runId: root.runs[0]!.id,
        beforeTokenCount: 190,
        afterTokenCount: 50,
        completedAt: end,
        updatedAt: end,
      } as OrchestrationV2ThreadProjection["turnItems"][number];
      const result = yield* query([{ ...root, turnItems: [compact] }]);
      assert.equal(result.nodes[0]!.contextWindow?.usedTokens, 50);
      assert.equal(result.nodes[0]!.contextWindow?.usedPercentage, 25);
      assert.equal(result.nodes[0]!.contextWindow?.maxTokens, 200);
      assert.equal(result.nodes[0]!.contextPeakTokens, 190);
      assert.equal(result.summary.self.contextPeakTokens, 190);
    }),
);

import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadTokenAnalytics,
  type ThreadTokenAggregateSummary,
  type ThreadTokenAnalyticsNode,
  type ThreadTokenModelBreakdown,
  type ThreadTokenTurnEntry,
  type UsageTokenTotals,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  attributionSegments,
  buildTurnChart,
  collectDataNotices,
  contextCardModel,
  isAnalyticsEmpty,
  resolveFocusedNodeId,
  resolvePricingNotice,
  safePercent,
  safeRatio,
  selectScopeSummary,
  sortAnalyticsTree,
  sortModelBreakdown,
  tokenAnalyticsSearchFromUrl,
  tokenTypeSegments,
} from "./threadTokenAnalytics.logic";

const codex = ProviderDriverKind.make("codex");
const instance = ProviderInstanceId.make("codex");
const resolve = (message: string) => message;

function totals(
  uncachedInputTokens = 0,
  cachedInputTokens = 0,
  cacheCreationTokens = 0,
  outputTokens = 0,
): UsageTokenTotals {
  return {
    uncachedInputTokens,
    cachedInputTokens,
    cacheCreationTokens,
    outputTokens,
    reasoningTokens: 0,
  };
}

function turn(overrides: Partial<ThreadTokenTurnEntry> = {}): ThreadTokenTurnEntry {
  const value = totals(10, 20, 5, 15);
  return {
    turnId: "turn-1",
    runId: RunId.make("run-1"),
    runOrdinal: 1,
    ordinal: 1,
    status: "completed",
    driver: codex,
    model: "gpt-5",
    startedAt: "2026-11-23T10:00:00.000Z",
    completedAt: "2026-11-23T10:01:00.000Z",
    durationMs: 60_000,
    totals: value,
    otherInputTokens: 0,
    otherOutputTokens: 0,
    totalTokens: 50,
    contextUsedTokens: 100,
    contextMaxTokens: 1_000,
    costUsd: 0.01,
    cacheSavingsUsd: 0.02,
    costSource: "modelPriced",
    dataSource: "turn_usage",
    usageStatus: "complete",
    hasSubagents: false,
    ...overrides,
  };
}

function node(overrides: Partial<ThreadTokenAnalyticsNode> = {}): ThreadTokenAnalyticsNode {
  const value = totals(10, 20, 5, 15);
  const totalTokens = overrides.totalTokens ?? 50;
  return {
    nodeId: "root",
    kind: "root",
    origin: "root",
    depth: 0,
    parentNodeId: null,
    threadId: ThreadId.make("root"),
    parentThreadId: null,
    title: "root",
    driver: codex,
    providerInstanceId: instance,
    model: "gpt-5",
    status: "completed",
    startedAt: "2026-11-23T10:00:00.000Z",
    completedAt: "2026-11-23T10:01:00.000Z",
    durationMs: 60_000,
    contextWindow: {
      usedTokens: 100,
      maxTokens: 1_000,
      usedPercentage: 10,
      autoCompactThreshold: 800,
      updatedAt: "2026-11-23T10:00:30.000Z",
    },
    contextPeakTokens: 100,
    totals: value,
    otherInputTokens: 0,
    otherOutputTokens: 0,
    totalTokens,
    cacheHitRate: 20 / 35,
    costUsd: 0.01,
    cacheSavingsUsd: 0.02,
    costSource: "modelPriced",
    dataSource: "turn_usage",
    usageStatus: "complete",
    turnCount: 1,
    measuredTurnCount: 1,
    subtreeTotalTokens: totalTokens,
    subtreeCostUsd: 0.01,
    turns: [turn()],
    ...overrides,
  };
}

function summary(
  overrides: Partial<ThreadTokenAggregateSummary> = {},
): ThreadTokenAggregateSummary {
  return {
    totals: totals(10, 20, 5, 15),
    otherInputTokens: 0,
    otherOutputTokens: 0,
    totalTokens: 50,
    cacheHitRate: 20 / 35,
    costUsd: 0.01,
    cacheSavingsUsd: 0.02,
    costSource: "modelPriced",
    turnCount: 1,
    measuredTurnCount: 1,
    durationMs: 60_000,
    contextPeakTokens: 100,
    contextMaxTokens: 1_000,
    ...overrides,
  };
}

function model(overrides: Partial<ThreadTokenModelBreakdown> = {}): ThreadTokenModelBreakdown {
  return {
    provider: codex,
    model: "gpt-5",
    selfTotals: totals(10, 20, 5, 15),
    subagentTotals: totals(),
    totalTotals: totals(10, 20, 5, 15),
    otherInputTokens: 0,
    otherOutputTokens: 0,
    totalTokens: 50,
    cacheHitRate: 20 / 35,
    costUsd: 0.01,
    cacheSavingsUsd: 0.02,
    costSource: "modelPriced",
    turnCount: 1,
    ...overrides,
  };
}

function analytics(
  overrides: Partial<OrchestrationV2ThreadTokenAnalytics> = {},
): OrchestrationV2ThreadTokenAnalytics {
  return {
    generatedAt: "2026-11-23T10:05:00.000Z",
    requestedThreadId: ThreadId.make("root"),
    rootThreadId: ThreadId.make("root"),
    parentThreadId: null,
    pricingStatus: "fresh",
    summary: {
      self: summary(),
      subagents: summary({ totalTokens: 0, turnCount: 0, measuredTurnCount: 0, durationMs: 0 }),
      total: summary(),
      subagentCount: 0,
      activeSubagentCount: 0,
    },
    byModel: [model()],
    nodes: [node()],
    ...overrides,
  };
}

describe("token analytics route search", () => {
  it("keeps text params and drops the URL parser's numbers", () => {
    expect(tokenAnalyticsSearchFromUrl({ env: " env-1 ", thread: 42, focus: " node-1 " })).toEqual({
      env: "env-1",
      focus: "node-1",
    });
  });

  it("drops empty and oversized values", () => {
    const long = "x".repeat(600);
    expect(tokenAnalyticsSearchFromUrl({ env: "  ", thread: long })).toEqual({
      thread: "x".repeat(512),
    });
  });
});

describe("share helpers", () => {
  it("keeps zero totals finite", () => {
    expect(safeRatio(0, 0)).toBe(0);
    expect(safePercent(10, 0)).toBe(0);
    expect(Number.isNaN(safePercent(0, 0))).toBe(false);
  });

  it("guards negative and non-finite input", () => {
    expect(safeRatio(-1, 10)).toBe(0);
    expect(safeRatio(10, -1)).toBe(0);
    expect(safeRatio(Number.NaN, 10)).toBe(0);
    expect(safeRatio(10, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("clamps a share to the whole", () => {
    expect(safeRatio(5, 10)).toBe(0.5);
    expect(safeRatio(15, 10)).toBe(1);
  });
});

describe("scope", () => {
  const data = analytics({
    summary: {
      ...analytics().summary,
      self: summary({ totalTokens: 50 }),
      subagents: summary({ totalTokens: 30 }),
      total: summary({ totalTokens: 80 }),
    },
  });

  it.each([
    ["all", 80],
    ["self", 50],
    ["subagents", 30],
  ] as const)("selects the %s summary", (scope, total) => {
    expect(selectScopeSummary(data, scope).totalTokens).toBe(total);
  });
});

describe("token type segments", () => {
  it("splits every token category and folds other tokens together", () => {
    const segments = tokenTypeSegments({
      totals: totals(10, 20, 5, 15),
      otherInputTokens: 2,
      otherOutputTokens: 3,
    });
    expect(segments.map((segment) => [segment.id, segment.value])).toEqual([
      ["uncachedInput", 10],
      ["cacheRead", 20],
      ["cacheWrite", 5],
      ["output", 15],
      ["other", 5],
    ]);
  });

  it("keeps zero totals finite", () => {
    const segments = tokenTypeSegments({
      totals: totals(),
      otherInputTokens: 0,
      otherOutputTokens: 0,
    });
    expect(segments.every((segment) => segment.value === 0)).toBe(true);
  });
});

describe("attribution", () => {
  const root = node({ nodeId: "root", totalTokens: 100, subtreeTotalTokens: 160 });
  const first = node({
    nodeId: "first",
    parentNodeId: "root",
    depth: 1,
    origin: "app_owned",
    title: "First branch",
    totalTokens: 20,
    subtreeTotalTokens: 40,
  });
  const nested = node({
    nodeId: "nested",
    parentNodeId: "first",
    depth: 2,
    origin: "app_owned",
    title: "Nested branch",
    totalTokens: 20,
    subtreeTotalTokens: 20,
  });
  const second = node({
    nodeId: "second",
    parentNodeId: "root",
    depth: 1,
    origin: "provider_native",
    title: "Second branch",
    totalTokens: 20,
    subtreeTotalTokens: 20,
  });

  it("counts the main session and direct branches once, never their nested children", () => {
    const data = analytics({ nodes: [root, first, nested, second] });
    expect(attributionSegments(data, resolve)).toEqual([
      { id: "main", label: "Main session", value: 100, color: expect.any(String) },
      { id: "subagent:first", label: "First branch", value: 40, color: expect.any(String) },
      { id: "subagent:second", label: "Second branch", value: 20, color: expect.any(String) },
    ]);
  });

  it("groups branches beyond the top five into one bucket", () => {
    const branches = Array.from({ length: 7 }, (_, index) =>
      node({
        nodeId: `branch-${index}`,
        parentNodeId: "root",
        depth: 1,
        origin: "app_owned",
        title: `Branch ${index}`,
        subtreeTotalTokens: (7 - index) * 10,
      }),
    );
    const data = analytics({ nodes: [root, ...branches] });
    const segments = attributionSegments(data, resolve);
    expect(segments).toHaveLength(7);
    expect(segments.at(-1)).toMatchObject({
      id: "other-subagents",
      label: "Other subagents",
      value: 30,
    });
  });

  it("uses a title fallback and skips zero-value branches", () => {
    const data = analytics({
      nodes: [
        root,
        node({
          nodeId: "blank",
          parentNodeId: "root",
          depth: 1,
          origin: "workflow",
          title: "   ",
          subtreeTotalTokens: 0,
        }),
      ],
    });
    expect(attributionSegments(data, resolve)).toEqual([
      { id: "main", label: "Main session", value: 100, color: expect.any(String) },
    ]);
  });

  it("returns nothing without nodes", () => {
    expect(attributionSegments(analytics({ nodes: [] }), resolve)).toEqual([]);
  });
});

describe("tree order", () => {
  const root = node({ nodeId: "root", subtreeTotalTokens: 120, subtreeCostUsd: 0.3 });
  const big = node({
    nodeId: "big",
    parentNodeId: "root",
    depth: 1,
    origin: "app_owned",
    subtreeTotalTokens: 100,
    subtreeCostUsd: 0.01,
    durationMs: 10,
  });
  const small = node({
    nodeId: "small",
    parentNodeId: "root",
    depth: 1,
    origin: "workflow",
    subtreeTotalTokens: 20,
    subtreeCostUsd: 0.2,
    durationMs: 90,
  });
  const nested = node({
    nodeId: "deep",
    parentNodeId: "small",
    depth: 2,
    origin: "provider_native",
    subtreeTotalTokens: 5,
    subtreeCostUsd: 5,
    durationMs: 500,
  });
  const nodes = [root, small, nested, big];

  it("sorts siblings by tokens while keeping children with their parent", () => {
    expect(
      sortAnalyticsTree(nodes, { origin: "all", sort: "tokens" }).map((entry) => entry.nodeId),
    ).toEqual(["root", "big", "small", "deep"]);
  });

  it("sorts siblings by cost", () => {
    expect(
      sortAnalyticsTree(nodes, { origin: "all", sort: "cost" }).map((entry) => entry.nodeId),
    ).toEqual(["root", "small", "deep", "big"]);
  });

  it("sorts siblings by duration", () => {
    expect(
      sortAnalyticsTree(nodes, { origin: "all", sort: "time" }).map((entry) => entry.nodeId),
    ).toEqual(["root", "small", "deep", "big"]);
  });

  it("keeps the ancestors of a matching origin", () => {
    expect(
      sortAnalyticsTree(nodes, { origin: "provider_native", sort: "tokens" }).map(
        (entry) => entry.nodeId,
      ),
    ).toEqual(["root", "small", "deep"]);
  });

  it("returns only the family under a matching branch", () => {
    expect(
      sortAnalyticsTree(nodes, { origin: "app_owned", sort: "tokens" }).map(
        (entry) => entry.nodeId,
      ),
    ).toEqual(["root", "big"]);
  });
});

describe("focused node", () => {
  const nodes = [
    node({ nodeId: "root", threadId: ThreadId.make("root") }),
    node({ nodeId: "child", threadId: ThreadId.make("child"), parentNodeId: "root", depth: 1 }),
  ];

  it("honours a focus that exists", () => {
    expect(resolveFocusedNodeId({ nodes, focus: "child", requestedThreadId: "root" })).toBe(
      "child",
    );
  });

  it("falls back from a stale focus to the requested thread", () => {
    expect(resolveFocusedNodeId({ nodes, focus: "gone", requestedThreadId: "child" })).toBe(
      "child",
    );
  });

  it("falls back to the root node and finally the first node", () => {
    expect(resolveFocusedNodeId({ nodes, requestedThreadId: "gone" })).toBe("root");
    expect(
      resolveFocusedNodeId({
        nodes: [node({ nodeId: "only", parentNodeId: "missing" })],
        requestedThreadId: "gone",
      }),
    ).toBe("only");
  });

  it("returns null without nodes", () => {
    expect(resolveFocusedNodeId({ nodes: [] })).toBeNull();
  });
});

describe("context card", () => {
  it("reads the snapshot and falls back to the peak of its turns", () => {
    const card = contextCardModel(
      node({
        contextWindow: {
          usedTokens: 900,
          maxTokens: 1_000,
          usedPercentage: 90,
          autoCompactThreshold: 800,
          updatedAt: "2026-11-23T10:00:00.000Z",
        },
        contextPeakTokens: null,
        turns: [turn({ contextUsedTokens: 700 }), turn({ contextUsedTokens: 900 })],
      }),
    );
    expect(card).toMatchObject({
      usedTokens: 900,
      maxTokens: 1_000,
      percent: 90,
      tone: "error",
      peakTokens: 900,
      measuredTurns: 2,
    });
  });

  it("has no percent without a maximum", () => {
    const card = contextCardModel(
      node({
        contextWindow: {
          usedTokens: 900,
          maxTokens: null,
          usedPercentage: null,
          autoCompactThreshold: null,
          updatedAt: "2026-11-23T10:00:00.000Z",
        },
      }),
    );
    expect(card.percent).toBeNull();
    expect(card.tone).toBe("normal");
  });

  it("is empty without a node", () => {
    expect(contextCardModel(null)).toMatchObject({
      usedTokens: null,
      maxTokens: null,
      percent: null,
      tone: "normal",
      peakTokens: null,
      measuredTurns: 0,
    });
  });
});

describe("turn chart", () => {
  it("normalises stacked bars against the biggest turn", () => {
    const chart = buildTurnChart(
      node({
        turns: [
          turn({
            turnId: "a",
            totals: totals(20, 40, 10, 30),
            totalTokens: 100,
          }),
          turn({ turnId: "b", totals: totals(10, 20, 5, 15), totalTokens: 50 }),
        ],
      }),
    );
    expect(chart.maxTotal).toBe(100);
    expect(chart.bars[0]?.segments.reduce((sum, segment) => sum + segment.percent, 0)).toBe(100);
    expect(chart.bars[1]?.segments.reduce((sum, segment) => sum + segment.percent, 0)).toBe(50);
  });

  it("keeps context markers finite and skips turns without a maximum", () => {
    const chart = buildTurnChart(
      node({
        turns: [
          turn({ contextUsedTokens: 500, contextMaxTokens: 1_000 }),
          turn({ contextUsedTokens: 10, contextMaxTokens: null }),
        ],
      }),
    );
    expect(chart.bars[0]?.contextPercent).toBe(50);
    expect(chart.bars[1]?.contextPercent).toBeNull();
    expect(chart.hasContext).toBe(true);
    expect(chart.maxContextTokens).toBe(1_000);
  });

  it("keeps zero-turn charts finite", () => {
    const chart = buildTurnChart(node({ turns: [] }));
    expect(chart).toEqual({ bars: [], maxTotal: 0, hasContext: false, maxContextTokens: null });
    expect(Number.isNaN(buildTurnChart(node({ turns: [turn({ totalTokens: 0 })] })).maxTotal)).toBe(
      false,
    );
  });
});

describe("model breakdown", () => {
  it("sorts by total tokens, then cost, then name", () => {
    const rows = sortModelBreakdown([
      model({ model: "b", totalTokens: 10, costUsd: 1 }),
      model({ model: "a", totalTokens: 10, costUsd: 1 }),
      model({ model: "c", totalTokens: 30, costUsd: 0 }),
    ]);
    expect(rows.map((row) => row.model)).toEqual(["c", "a", "b"]);
  });
});

describe("empty, pricing, and notices", () => {
  it("detects an empty thread", () => {
    const empty = summary({
      totals: totals(),
      totalTokens: 0,
      cacheHitRate: null,
      costUsd: 0,
      cacheSavingsUsd: 0,
      turnCount: 0,
      measuredTurnCount: 0,
      durationMs: 0,
      contextPeakTokens: null,
      contextMaxTokens: null,
    });
    expect(isAnalyticsEmpty(analytics())).toBe(false);
    expect(isAnalyticsEmpty(analytics({ nodes: [] }))).toBe(true);
    expect(
      isAnalyticsEmpty(
        analytics({
          summary: {
            self: empty,
            subagents: empty,
            total: empty,
            subagentCount: 0,
            activeSubagentCount: 0,
          },
          nodes: [node({ totalTokens: 0, turnCount: 0 })],
        }),
      ),
    ).toBe(true);
  });

  it("reports pricing trouble in priority order", () => {
    expect(resolvePricingNotice(analytics({ pricingStatus: "unavailable" }))).toBe("unavailable");
    expect(
      resolvePricingNotice(
        analytics({
          nodes: [node({ costSource: "unpriced" })],
          pricingStatus: "cached",
        }),
      ),
    ).toBe("unpriced");
    expect(resolvePricingNotice(analytics({ pricingStatus: "cached" }))).toBe("cached");
    expect(resolvePricingNotice(analytics())).toBeNull();
  });

  it("counts each data-quality notice once per node", () => {
    const notices = collectDataNotices([
      node({ usageStatus: "partial", dataSource: "context_snapshot" }),
      node({ nodeId: "child", parentNodeId: "root", usageStatus: "unavailable" }),
      node({
        nodeId: "remote",
        parentNodeId: "root",
        origin: "remote",
        usageStatus: "complete",
        dataSource: "workflow_summary",
        remoteTarget: {
          environmentId: EnvironmentId.make("env-2"),
          threadId: ThreadId.make("remote"),
          label: "Remote",
        },
      }),
      node({
        nodeId: "no-source",
        parentNodeId: "root",
        usageStatus: "complete",
        dataSource: "unavailable",
      }),
    ]);
    expect(notices.map((notice) => [notice.id, notice.count])).toEqual([
      ["partial", 1],
      ["unavailable", 2],
      ["snapshot", 1],
      ["workflow", 1],
      ["remote", 1],
    ]);
  });

  it("returns no notices for complete local nodes", () => {
    expect(collectDataNotices([node()])).toEqual([]);
  });
});

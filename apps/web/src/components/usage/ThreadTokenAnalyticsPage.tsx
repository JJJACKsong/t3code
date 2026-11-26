import {
  EnvironmentId,
  ThreadId,
  type ProviderDriverKind,
  type ThreadTokenAnalyticsNode,
  type ThreadTokenModelBreakdown,
  type ThreadTokenTurnEntry,
} from "@t3tools/contracts";
import { formatDuration } from "@t3tools/shared/usageLimitsCopy";
import { formatCount, formatPercent, formatTokens, formatUsd } from "@t3tools/shared/usageFormat";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { CircleAlertIcon, ExternalLinkIcon } from "lucide-react";
import { useGT, useLocale, useMessages } from "gt-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import { useEnvironmentQuery } from "../../state/query";
import { orchestrationEnvironment } from "../../state/orchestration";
import { formatContextWindowTokens } from "../../lib/contextWindow";
import { cn } from "../../lib/utils";
import { buildThreadRouteParams } from "../../threadRoutes";
import { AppRouteModal, AppRouteModalClose } from "../AppRouteModal";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { ScrollArea } from "../ui/scroll-area";
import { Skeleton } from "../ui/skeleton";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { UsageShareBar } from "./UsageShareBar";
import { PROVIDER_PRESENTATION } from "./usageProviders";
import {
  ANALYTICS_ORIGIN_OPTIONS,
  ANALYTICS_SCOPE_OPTIONS,
  ANALYTICS_SORT_OPTIONS,
  DATA_SOURCE_LABELS,
  ORIGIN_LABELS,
  USAGE_STATUS_LABELS,
  attributionSegments,
  buildTurnChart,
  collectDataNotices,
  contextCardModel,
  isAnalyticsEmpty,
  resolveFocusedNodeId,
  resolvePricingNotice,
  safeRatio,
  selectScopeSummary,
  sortAnalyticsTree,
  sortModelBreakdown,
  tokenTypeSegments,
  usageTokenTotal,
  type AnalyticsOriginFilter,
  type AnalyticsScope,
  type AnalyticsSort,
  type AttributionSegment,
  type TurnChartModel,
} from "./threadTokenAnalytics.logic";

function isScope(value: string | undefined): value is AnalyticsScope {
  return ANALYTICS_SCOPE_OPTIONS.some((option) => option.value === value);
}

function isOriginFilter(value: string | undefined): value is AnalyticsOriginFilter {
  return ANALYTICS_ORIGIN_OPTIONS.some((option) => option.value === value);
}

function isSort(value: string | undefined): value is AnalyticsSort {
  return ANALYTICS_SORT_OPTIONS.some((option) => option.value === value);
}

function providerLabel(driver: ProviderDriverKind): string {
  for (const presentation of Object.values(PROVIDER_PRESENTATION)) {
    if (presentation.driverKind === driver) return presentation.label;
  }
  return driver;
}

function statusVariant(status: ThreadTokenAnalyticsNode["usageStatus"]) {
  if (status === "partial") return "warning" as const;
  if (status === "unavailable") return "error" as const;
  return "outline" as const;
}

export function ThreadTokenAnalyticsPage() {
  const gt = useGT();
  const locale = useLocale();
  const m = useMessages();
  const navigate = useNavigate();
  const search = useSearch({ from: "/_chat/token-analytics" });
  const [scope, setScope] = useState<AnalyticsScope>("all");
  const [origin, setOrigin] = useState<AnalyticsOriginFilter>("all");
  const [sort, setSort] = useState<AnalyticsSort>("tokens");

  const environmentId = search.env === undefined ? null : EnvironmentId.make(search.env);
  const requestedThreadId = search.thread === undefined ? null : ThreadId.make(search.thread);
  const query = useEnvironmentQuery(
    environmentId === null || requestedThreadId === null
      ? null
      : orchestrationEnvironment.threadTokenAnalytics({
          environmentId,
          input: { threadId: requestedThreadId, includeSubagents: true },
        }),
  );
  const data = query.data;
  const scoped = data === null ? null : selectScopeSummary(data, scope);
  const focusedNodeId =
    data === null
      ? null
      : resolveFocusedNodeId({
          nodes: data.nodes,
          focus: search.focus ?? null,
          requestedThreadId: data.requestedThreadId,
        });
  const focusedNode =
    data === null || focusedNodeId === null
      ? null
      : (data.nodes.find((node) => node.nodeId === focusedNodeId) ?? null);
  const activeThreadTitle =
    data?.nodes.find((node) => node.threadId === data.requestedThreadId)?.title ?? null;
  const treeRows = data === null ? [] : sortAnalyticsTree(data.nodes, { origin, sort });
  const models = data === null ? [] : sortModelBreakdown(data.byModel);
  const tokenSegments = scoped === null ? [] : tokenTypeSegments(scoped);
  const attribution = data === null ? [] : attributionSegments(data, m);
  const chart = buildTurnChart(focusedNode);
  const context = contextCardModel(focusedNode);
  const notices = data === null ? [] : collectDataNotices(data.nodes);
  const pricingNotice = data === null ? null : resolvePricingNotice(data);
  const empty = data !== null && isAnalyticsEmpty(data);

  const selectNode = (nodeId: string) => {
    navigate({
      to: "/token-analytics",
      search: {
        ...(search.env === undefined ? {} : { env: search.env }),
        ...(search.thread === undefined ? {} : { thread: search.thread }),
        focus: nodeId,
      },
      replace: true,
    });
  };

  const openRootTree = () => {
    if (data === null) return;
    navigate({
      to: "/token-analytics",
      search: {
        ...(search.env === undefined ? {} : { env: search.env }),
        thread: data.rootThreadId,
        ...(focusedNodeId === null ? {} : { focus: focusedNodeId }),
      },
    });
  };

  return (
    <AppRouteModal label={gt("Token analytics")}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-col gap-2 border-b px-4 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <h1 className="truncate text-sm font-medium text-foreground">
                {gt("Session token analytics")}
              </h1>
              {data !== null ? (
                <p className="truncate text-xs text-muted-foreground">
                  {activeThreadTitle === null || activeThreadTitle.trim().length === 0
                    ? gt("Current session")
                    : activeThreadTitle}
                </p>
              ) : null}
            </div>
            <AppRouteModalClose />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data !== null && data.requestedThreadId !== data.rootThreadId ? (
              <Button variant="outline" size="sm-multiline" onClick={openRootTree}>
                {gt("View full root thread tree")}
              </Button>
            ) : null}
            <ToggleGroup
              aria-label={gt("Token scope")}
              variant="segmented"
              value={[scope]}
              onValueChange={(next) => {
                if (isScope(next[0])) setScope(next[0]);
              }}
            >
              {ANALYTICS_SCOPE_OPTIONS.map((option) => (
                <Toggle key={option.value} value={option.value}>
                  {m(option.label)}
                </Toggle>
              ))}
            </ToggleGroup>
            <Button
              onClick={query.refresh}
              aria-label={gt("Refresh token analytics")}
              aria-busy={query.isPending}
              disabled={query.isPending || environmentId === null || requestedThreadId === null}
              size="icon-sm"
              variant="ghost"
            >
              <RefreshIcon size="sm" refreshing={query.isPending} />
            </Button>
          </div>
        </header>

        <ScrollArea className="min-h-0 flex-1" observeContent>
          <WorkspacePageContainer width="wide">
            {environmentId === null || requestedThreadId === null ? (
              <EmptyNotice
                title={gt("No thread selected")}
                body={gt(
                  "Open token analytics from a thread to see its session and subagent usage.",
                )}
              />
            ) : query.isPending && data === null ? (
              <AnalyticsSkeleton />
            ) : query.error !== null && data === null ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-error/30 bg-error/8 p-4 text-sm text-error-foreground"
              >
                <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                  <p className="break-words">{query.error}</p>
                  <Button size="sm" variant="outline" onClick={query.refresh}>
                    {gt("Retry")}
                  </Button>
                </div>
              </div>
            ) : data === null ? null : (
              <div className="flex min-w-0 flex-col gap-6">
                {notices.length > 0 ? (
                  <div
                    role="status"
                    className="flex flex-col gap-1 rounded-xl border border-warning/25 bg-warning/8 px-3 py-2.5 text-xs text-warning-foreground"
                  >
                    {notices.map((notice) => (
                      <p key={notice.id} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="break-words">{m(notice.label)}</span>
                        <span className="tabular-nums opacity-80">
                          · {formatCount(notice.count, locale)}
                        </span>
                      </p>
                    ))}
                  </div>
                ) : null}

                {empty ? (
                  <EmptyNotice
                    title={gt("No token usage recorded for this thread yet")}
                    body={gt("Run a turn in this session, then reopen token analytics.")}
                  />
                ) : scoped === null ? null : (
                  <>
                    <section
                      aria-label={gt("Session totals")}
                      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                    >
                      <StatCard
                        label={gt("Total tokens")}
                        value={formatTokens(scoped.totalTokens)}
                        hint={
                          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                            <span>
                              {gt("Main session {tokens}", {
                                tokens: formatTokens(data.summary.self.totalTokens),
                              })}
                            </span>
                            <span>
                              {gt("Subagents {tokens}", {
                                tokens: formatTokens(data.summary.subagents.totalTokens),
                              })}
                            </span>
                          </span>
                        }
                      />
                      <StatCard
                        label={gt("Estimated cost")}
                        value={formatUsd(scoped.costUsd, locale)}
                        hint={
                          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                            <span>
                              {scoped.cacheHitRate === null
                                ? gt("No cache activity")
                                : gt("Cache hit rate {rate}", {
                                    rate: formatPercent(scoped.cacheHitRate),
                                  })}
                            </span>
                            <span>
                              {gt("Cache savings {cost}", {
                                cost: formatUsd(scoped.cacheSavingsUsd, locale),
                              })}
                            </span>
                          </span>
                        }
                        badge={
                          pricingNotice === null ? null : (
                            <Badge
                              variant={pricingNotice === "cached" ? "outline" : "warning"}
                              size="sm"
                            >
                              {pricingNotice === "unavailable"
                                ? gt("Pricing unavailable")
                                : pricingNotice === "unpriced"
                                  ? gt("Some models unpriced")
                                  : gt("Cached pricing")}
                            </Badge>
                          )
                        }
                      />
                      <StatCard
                        label={gt("Context window")}
                        value={
                          context.usedTokens === null
                            ? gt("No context data")
                            : `${formatContextWindowTokens(context.usedTokens)}${
                                context.maxTokens === null
                                  ? ""
                                  : ` / ${formatContextWindowTokens(context.maxTokens)}`
                              }`
                        }
                        hint={
                          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                            {context.percent === null ? null : (
                              <span>{formatPercent(context.percent / 100)}</span>
                            )}
                            {context.peakTokens === null ? null : (
                              <span>
                                {gt("Peak {tokens}", {
                                  tokens: formatContextWindowTokens(context.peakTokens),
                                })}
                              </span>
                            )}
                          </span>
                        }
                        footer={
                          context.percent === null ? null : (
                            <div
                              aria-hidden
                              className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/20"
                            >
                              <div
                                className={cn(
                                  "h-full rounded-full transition-[width] duration-300",
                                  context.tone === "error"
                                    ? "bg-error"
                                    : context.tone === "warning"
                                      ? "bg-warning"
                                      : "bg-foreground/70",
                                )}
                                style={{ width: `${context.percent}%` }}
                              />
                            </div>
                          )
                        }
                      />
                      <StatCard
                        label={gt("Turns and subagents")}
                        value={formatCount(scoped.turnCount, locale)}
                        hint={
                          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                            <span>
                              {gt("{measured} of {total} measured", {
                                measured: formatCount(scoped.measuredTurnCount, locale),
                                total: formatCount(scoped.turnCount, locale),
                              })}
                            </span>
                            <span>
                              {gt("{total} subagents, {active} active", {
                                total: formatCount(data.summary.subagentCount, locale),
                                active: formatCount(data.summary.activeSubagentCount, locale),
                              })}
                            </span>
                            <span>{formatDuration(scoped.durationMs, m)}</span>
                          </span>
                        }
                      />
                    </section>

                    <section className="grid grid-cols-1 gap-6 rounded-xl border border-border bg-card/50 p-4 lg:grid-cols-2">
                      <UsageShareBar
                        label={gt("Token types")}
                        segments={tokenSegments}
                        format={formatTokens}
                        aside={
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatTokens(scoped.totalTokens)}
                          </span>
                        }
                      />
                      <AttributionShareBar
                        label={gt("Session vs subagents")}
                        segments={attribution}
                        format={formatTokens}
                      />
                    </section>

                    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-medium text-foreground">
                          {gt("Session and subagent tree")}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2">
                          <ToggleGroup
                            aria-label={gt("Filter by origin")}
                            variant="segmented"
                            value={[origin]}
                            onValueChange={(next) => {
                              if (isOriginFilter(next[0])) setOrigin(next[0]);
                            }}
                          >
                            {ANALYTICS_ORIGIN_OPTIONS.map((option) => (
                              <Toggle key={option.value} value={option.value}>
                                {m(option.label)}
                              </Toggle>
                            ))}
                          </ToggleGroup>
                          <ToggleGroup
                            aria-label={gt("Sort sessions")}
                            variant="segmented"
                            value={[sort]}
                            onValueChange={(next) => {
                              if (isSort(next[0])) setSort(next[0]);
                            }}
                          >
                            {ANALYTICS_SORT_OPTIONS.map((option) => (
                              <Toggle key={option.value} value={option.value}>
                                {m(option.label)}
                              </Toggle>
                            ))}
                          </ToggleGroup>
                        </div>
                      </div>
                      {treeRows.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          {gt("No sessions match this filter.")}
                        </p>
                      ) : (
                        <ul className="flex min-w-0 flex-col gap-0.5">
                          {treeRows.map((node) => (
                            <AnalyticsTreeRow
                              key={node.nodeId}
                              node={node}
                              focused={node.nodeId === focusedNodeId}
                              share={safeRatio(node.totalTokens, data.summary.total.totalTokens)}
                              environmentId={environmentId}
                              onSelect={() => selectNode(node.nodeId)}
                            />
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card/50 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-sm font-medium text-foreground">{gt("Turn usage")}</h2>
                        {focusedNode === null ? null : (
                          <span className="min-w-0 truncate text-xs text-muted-foreground">
                            {focusedNode.title}
                          </span>
                        )}
                      </div>
                      {chart.bars.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          {gt("No turns recorded for this session.")}
                        </p>
                      ) : (
                        <>
                          <TurnChart chart={chart} />
                          <TurnTable turns={focusedNode?.turns ?? []} />
                        </>
                      )}
                    </section>

                    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card/50 p-4">
                      <h2 className="text-sm font-medium text-foreground">{gt("By model")}</h2>
                      {models.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          {gt("No model usage recorded.")}
                        </p>
                      ) : (
                        <ModelTable models={models} />
                      )}
                    </section>
                  </>
                )}
              </div>
            )}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </AppRouteModal>
  );
}

function StatCard({
  label,
  value,
  hint,
  badge,
  footer,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: ReactNode;
  readonly badge?: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {badge}
      </div>
      <p className="break-words text-2xl font-semibold text-foreground tabular-nums">{value}</p>
      <div className="min-w-0 text-xs text-muted-foreground">{hint}</div>
      {footer}
    </div>
  );
}

function EmptyNotice({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card/50 p-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function AttributionShareBar({
  label,
  segments,
  format,
}: {
  readonly label: string;
  readonly segments: readonly AttributionSegment[];
  readonly format: (value: number) => string;
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{format(total)}</span>
      </div>
      {/* Dynamic thread titles are rendered as plain text, never parsed as ICU messages. */}
      <div aria-hidden className="flex h-2 gap-0.5">
        {visible.map((segment) => (
          <Tooltip key={segment.id}>
            <TooltipTrigger
              render={
                <div
                  className="h-full min-w-1 rounded-xs first:rounded-l-full last:rounded-r-full"
                  style={{ flex: `${segment.value} 1 0`, backgroundColor: segment.color }}
                />
              }
            />
            <TooltipPopup>
              {segment.label} · {format(segment.value)} · {formatPercent(segment.value / total)}
            </TooltipPopup>
          </Tooltip>
        ))}
      </div>
      <ul aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {visible.map((segment) => (
          <li key={segment.id} className="flex min-w-0 max-w-full items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-xs"
              style={{ backgroundColor: segment.color }}
            />
            <span className="min-w-0 truncate text-muted-foreground">{segment.label}</span>
            <span className="text-foreground tabular-nums">{format(segment.value)}</span>
            <span className="sr-only">, {formatPercent(segment.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalyticsTreeRow({
  node,
  focused,
  share,
  environmentId,
  onSelect,
}: {
  readonly node: ThreadTokenAnalyticsNode;
  readonly focused: boolean;
  readonly share: number;
  readonly environmentId: EnvironmentId | null;
  readonly onSelect: () => void;
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const context = contextCardModel(node);
  const indent = Math.min(node.depth, 4) * 12;
  const threadLink =
    node.threadId !== null && node.remoteTarget === undefined && environmentId !== null;
  return (
    <li className="relative min-w-0">
      <div
        className={cn(
          "relative flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors",
          focused ? "border-border bg-muted/60" : "border-transparent hover:bg-muted/40",
        )}
      >
        <button
          type="button"
          aria-pressed={focused}
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
        >
          <span
            className="flex min-w-0 flex-1 items-center gap-2"
            style={{ paddingInlineStart: indent } as CSSProperties}
          >
            <Badge
              variant={node.origin === "root" ? "secondary" : "outline"}
              size="sm"
              className="shrink-0"
            >
              {m(ORIGIN_LABELS[node.origin])}
            </Badge>
            <ProviderInstanceIcon
              driverKind={node.driver}
              displayName={providerLabel(node.driver)}
              size="compact"
              className="shrink-0"
            />
            <span className="min-w-0 truncate text-sm text-foreground">{node.title}</span>
            <span className="hidden min-w-0 truncate text-xs text-muted-foreground md:inline">
              {node.model ?? node.driver}
            </span>
            {node.usageStatus === "complete" ? null : (
              <Badge variant={statusVariant(node.usageStatus)} size="sm" className="shrink-0">
                {m(USAGE_STATUS_LABELS[node.usageStatus])}
              </Badge>
            )}
            {node.dataSource === "turn_usage" ? null : (
              <Badge variant="outline" size="sm" className="hidden shrink-0 lg:inline-flex">
                {m(DATA_SOURCE_LABELS[node.dataSource])}
              </Badge>
            )}
          </span>
          <span className="hidden h-1 w-14 shrink-0 overflow-hidden rounded-full bg-muted-foreground/20 sm:block">
            <span
              aria-hidden
              className="block h-full rounded-full bg-foreground/60"
              style={{ width: `${share * 100}%` }}
            />
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums lg:hidden">
            {formatTokens(node.totalTokens)}
          </span>
        </button>
        <dl className="pointer-events-none relative z-10 hidden shrink-0 items-center gap-3 text-right text-xs tabular-nums lg:flex">
          <div className="w-14">
            <dt className="sr-only">{gt("Tokens")}</dt>
            <dd className="text-foreground">{formatTokens(node.totalTokens)}</dd>
          </div>
          <div className="hidden w-12 xl:block">
            <dt className="sr-only">{gt("Cache hit rate")}</dt>
            <dd className="text-muted-foreground">
              {node.cacheHitRate === null ? "–" : formatPercent(node.cacheHitRate)}
            </dd>
          </div>
          <div className="hidden w-14 xl:block">
            <dt className="sr-only">{gt("Cost")}</dt>
            <dd className="text-muted-foreground">{formatUsd(node.costUsd, locale)}</dd>
          </div>
          <div className="hidden w-20 md:block">
            <dt className="sr-only">{gt("Context window")}</dt>
            <dd className="text-muted-foreground">
              {context.usedTokens === null ? "–" : formatContextWindowTokens(context.usedTokens)}
            </dd>
          </div>
          <div className="hidden w-10 md:block">
            <dt className="sr-only">{gt("Turns")}</dt>
            <dd className="text-muted-foreground">{formatCount(node.turnCount, locale)}</dd>
          </div>
          <div className="hidden w-14 xl:block">
            <dt className="sr-only">{gt("Duration")}</dt>
            <dd className="text-muted-foreground">
              {node.durationMs === null ? "–" : formatDuration(node.durationMs, m)}
            </dd>
          </div>
        </dl>
        {threadLink && environmentId !== null && node.threadId !== null ? (
          <Link
            to="/$environmentId/$threadId"
            params={buildThreadRouteParams({
              environmentId,
              threadId: node.threadId,
            })}
            aria-label={gt("Open thread")}
            className="relative z-10 inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <ExternalLinkIcon aria-hidden className="size-3" />
            <span className="hidden sm:inline">{gt("Open")}</span>
          </Link>
        ) : node.remoteTarget === undefined ? null : (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="relative z-10 max-w-20 shrink-0 truncate rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:max-w-28">
                  {node.remoteTarget.label}
                </span>
              }
            />
            <TooltipPopup>{node.remoteTarget.label}</TooltipPopup>
          </Tooltip>
        )}
      </div>
    </li>
  );
}

const CHART_HEIGHT = 196;
const PLOT_TOP = 16;
const PLOT_BOTTOM = 154;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;

function TurnChart({ chart }: { readonly chart: TurnChartModel }) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const [active, setActive] = useState<number | null>(null);
  const width = Math.max(320, chart.bars.length * 46 + 24);
  const slot = width / chart.bars.length;
  const barWidth = Math.max(8, Math.min(30, slot - 14));
  const activeBar = active === null ? null : (chart.bars[active] ?? null);
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="relative" style={{ width }}>
        <svg
          width={width}
          height={CHART_HEIGHT}
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          role="img"
          aria-label={gt("Tokens by turn")}
          className="block max-w-none"
        >
          <line
            x1="0"
            x2={width}
            y1={PLOT_BOTTOM + 0.5}
            y2={PLOT_BOTTOM + 0.5}
            className="stroke-border"
            strokeWidth="1"
          />
          {chart.bars.map((bar, index) => {
            const x = index * slot + (slot - barWidth) / 2;
            let y = PLOT_BOTTOM;
            const segments = bar.segments.filter((segment) => segment.value > 0);
            const contextY =
              bar.contextPercent === null
                ? null
                : PLOT_BOTTOM - (bar.contextPercent / 100) * PLOT_HEIGHT;
            return (
              <g
                key={bar.turn.turnId}
                tabIndex={0}
                role="img"
                aria-label={gt("Turn {turn}: {tokens}", {
                  turn: bar.turn.ordinal,
                  tokens: formatTokens(bar.total),
                })}
                className="cursor-default outline-none [&:focus-visible>rect:first-child]:stroke-2 [&:focus-visible>rect:first-child]:stroke-ring"
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive((current) => (current === index ? null : current))}
                onFocus={() => setActive(index)}
                onBlur={() => setActive((current) => (current === index ? null : current))}
              >
                <rect
                  x={x - 2}
                  y={PLOT_TOP}
                  width={barWidth + 4}
                  height={PLOT_HEIGHT}
                  fill="transparent"
                />
                {segments.map((segment) => {
                  const height = (segment.percent / 100) * PLOT_HEIGHT;
                  y -= height;
                  return (
                    <rect
                      key={segment.id}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(0.5, height)}
                      rx={1}
                      fill={segment.color}
                    />
                  );
                })}
                {contextY === null ? null : (
                  <line
                    x1={x - 2}
                    x2={x + barWidth + 2}
                    y1={contextY}
                    y2={contextY}
                    className="stroke-info"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                )}
                <text
                  x={x + barWidth / 2}
                  y={CHART_HEIGHT - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-3xs"
                >
                  {bar.turn.ordinal}
                </text>
              </g>
            );
          })}
        </svg>
        {activeBar === null || active === null ? null : (
          <div
            className="pointer-events-none absolute top-0 z-10 w-56 max-w-[calc(100vw-4rem)] -translate-x-1/2 rounded-xl border border-border/60 bg-card/95 px-2.5 py-2 text-xs shadow-lg backdrop-blur-md"
            style={{
              left: `clamp(7rem, ${((active + 0.5) / chart.bars.length) * 100}%, calc(100% - 7rem))`,
            }}
          >
            <p className="font-medium text-foreground">
              {gt("Turn {turn}", { turn: activeBar.turn.ordinal })}
            </p>
            <p className="text-muted-foreground">
              {gt("{tokens} tokens", { tokens: formatTokens(activeBar.total) })}
            </p>
            {activeBar.turn.model === null ? null : (
              <p className="truncate text-muted-foreground">{activeBar.turn.model}</p>
            )}
            {activeBar.contextPercent === null ? null : (
              <p className="text-muted-foreground">
                {gt("Context {percent}", {
                  percent: formatPercent(activeBar.contextPercent / 100),
                })}
              </p>
            )}
            <p className="text-muted-foreground">
              {formatUsd(activeBar.turn.costUsd, locale)}
              {activeBar.turn.durationMs === null
                ? ""
                : ` · ${formatDuration(activeBar.turn.durationMs, m)}`}
            </p>
            <p className="text-muted-foreground">
              {m(DATA_SOURCE_LABELS[activeBar.turn.dataSource])}
              {activeBar.turn.usageStatus === "complete"
                ? ""
                : ` · ${m(USAGE_STATUS_LABELS[activeBar.turn.usageStatus])}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TurnTable({ turns }: { readonly turns: readonly ThreadTokenTurnEntry[] }) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[56rem] text-sm">
        <caption className="sr-only">{gt("Usage by turn")}</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 pl-2 font-normal">{gt("Turn")}</th>
            <th className="py-2 pr-3 font-normal">{gt("Model")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Input")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Cache read")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Cache write")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Output")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Other")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Context")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Duration")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Cost")}</th>
            <th className="py-2 pr-2 font-normal">{gt("Source")}</th>
          </tr>
        </thead>
        <tbody>
          {turns.map((turn) => (
            <tr
              key={turn.turnId}
              className="border-b border-border/50 text-muted-foreground tabular-nums transition-colors last:border-b-0 hover:bg-muted/40"
            >
              <td className="py-2 pr-3 pl-2 text-left text-foreground">{turn.ordinal}</td>
              <td className="max-w-40 truncate py-2 pr-3 text-left text-foreground">
                {turn.model ?? turn.driver}
              </td>
              <td className="py-2 pr-3 text-right">
                {formatTokens(turn.totals.uncachedInputTokens)}
              </td>
              <td className="py-2 pr-3 text-right">
                {formatTokens(turn.totals.cachedInputTokens)}
              </td>
              <td className="py-2 pr-3 text-right">
                {formatTokens(turn.totals.cacheCreationTokens)}
              </td>
              <td className="py-2 pr-3 text-right">{formatTokens(turn.totals.outputTokens)}</td>
              <td className="py-2 pr-3 text-right">
                {formatTokens(turn.otherInputTokens + turn.otherOutputTokens)}
              </td>
              <td className="py-2 pr-3 text-right">
                {turn.contextUsedTokens === null
                  ? "–"
                  : `${formatContextWindowTokens(turn.contextUsedTokens)}${
                      turn.contextMaxTokens === null
                        ? ""
                        : ` / ${formatContextWindowTokens(turn.contextMaxTokens)}`
                    }`}
              </td>
              <td className="py-2 pr-3 text-right">
                {turn.durationMs === null ? "–" : formatDuration(turn.durationMs, m)}
              </td>
              <td className="py-2 pr-3 text-right text-foreground">
                {formatUsd(turn.costUsd, locale)}
              </td>
              <td className="py-2 pr-2">
                <span className="flex flex-wrap items-center gap-1">
                  <Badge variant="outline" size="sm">
                    {m(DATA_SOURCE_LABELS[turn.dataSource])}
                  </Badge>
                  {turn.usageStatus === "complete" ? null : (
                    <Badge variant={statusVariant(turn.usageStatus)} size="sm">
                      {m(USAGE_STATUS_LABELS[turn.usageStatus])}
                    </Badge>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelTable({ models }: { readonly models: readonly ThreadTokenModelBreakdown[] }) {
  const gt = useGT();
  const locale = useLocale();
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">{gt("Usage by model")}</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 pl-2 font-normal">{gt("Provider")}</th>
            <th className="py-2 pr-3 font-normal">{gt("Model")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Main session")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Subagents")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Total")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Cache hit rate")}</th>
            <th className="py-2 pr-3 text-right font-normal">{gt("Turns")}</th>
            <th className="py-2 pr-2 text-right font-normal">{gt("Cost")}</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr
              key={`${model.provider}\u0000${model.model}`}
              className="border-b border-border/50 text-muted-foreground tabular-nums transition-colors last:border-b-0 hover:bg-muted/40"
            >
              <td className="py-2 pr-3 pl-2 text-left">
                <span className="flex items-center gap-2 text-foreground">
                  <ProviderInstanceIcon
                    driverKind={model.provider}
                    displayName={providerLabel(model.provider)}
                    size="compact"
                    className="shrink-0"
                  />
                  <span className="truncate">{providerLabel(model.provider)}</span>
                </span>
              </td>
              <td className="max-w-48 truncate py-2 pr-3 text-left text-foreground">
                {model.model}
              </td>
              <td className="py-2 pr-3 text-right">
                {formatTokens(usageTokenTotal(model.selfTotals))}
              </td>
              <td className="py-2 pr-3 text-right">
                {formatTokens(usageTokenTotal(model.subagentTotals))}
              </td>
              <td className="py-2 pr-3 text-right text-foreground">
                {formatTokens(model.totalTokens)}
              </td>
              <td className="py-2 pr-3 text-right">
                {model.cacheHitRate === null ? "–" : formatPercent(model.cacheHitRate)}
              </td>
              <td className="py-2 pr-3 text-right">{formatCount(model.turnCount, locale)}</td>
              <td className="py-2 pr-2 text-right text-foreground">
                {formatUsd(model.costUsd, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {["tokens", "cost", "context", "turns"].map((key) => (
          <Skeleton key={key} shape="card" className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 rounded-xl border border-border bg-card/50 p-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-2" />
          <Skeleton className="h-4 w-52" />
        </div>
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-2" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>
      <Skeleton shape="card" className="h-64" />
      <Skeleton shape="card" className="h-48" />
    </div>
  );
}

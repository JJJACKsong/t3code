import type { EnvironmentId } from "@t3tools/contracts";
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => ({ saved: [] as unknown[] }));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../../state/preferences", () => ({ saveMobilePreferences: {} }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => async (value: unknown) => {
    harness.saved.push(value);
    return { _tag: "Success", value: undefined };
  },
}));

import { makeThreadShellFixture } from "../../test-fixtures";
import {
  filterThreadOrigin,
  HomeListOptionsProvider,
  useHomeListOptions,
} from "./home-list-options";

const ENVIRONMENT = "env-1" as EnvironmentId;
const android = process.env.T3_MOBILE_TEST_PLATFORM === "android";
const AVAILABLE = new Set([ENVIRONMENT]);

it("saves the scope from every update made in one event", async () => {
  harness.saved = [];
  let controls: ReturnType<typeof useHomeListOptions> | undefined;
  function Probe() {
    const result = useHomeListOptions(AVAILABLE);
    useLayoutEffect(() => {
      controls = result;
    });
    return null;
  }

  const root = createRoot(document.createElement("div"));
  await act(async () =>
    root.render(
      <HomeListOptionsProvider projectGroupingMode="repository">
        <Probe />
      </HomeListOptionsProvider>,
    ),
  );
  expect(controls!.options.origin).toBe(android ? "user" : "all");
  act(() => {
    controls!.setSelectedEnvironmentId(ENVIRONMENT);
    controls!.setSelectedProjectKey("env-1:project-1");
  });

  expect(harness.saved.at(-1)).toEqual({
    threadListFilters: {
      ...(android ? { origin: "user" } : {}),
      environmentId: ENVIRONMENT,
      projectKey: "env-1:project-1",
    },
  });
  expect(controls!.options.selectedEnvironmentId).toBe(ENVIRONMENT);
  expect(controls!.options.selectedProjectKey).toBe("env-1:project-1");
  act(() => controls!.setOrigin("agent"));
  expect(controls!.options.origin).toBe("agent");
  if (android)
    expect(harness.saved.at(-1)).toMatchObject({ threadListFilters: { origin: "agent" } });
  act(() => root.unmount());
});

it("uses the thread creator even after subsequent activity and includes delegated tasks", () => {
  const mine = makeThreadShellFixture({ latestUserAuthoredMessageAt: null });
  const agent = { ...mine, source: { ...mine.source, createdBy: "agent" as const } };
  const child = {
    ...mine,
    delegatedFrom: { environmentId: mine.environmentId, threadId: mine.id, title: mine.title },
  };
  const system = { ...mine, source: { ...mine.source, createdBy: "system" as const } };
  const rows = [mine, agent, child, system];
  expect(filterThreadOrigin(rows, "user")).toEqual([mine]);
  expect(filterThreadOrigin(rows, "agent")).toEqual([agent, child]);
  expect(filterThreadOrigin(rows, "all")).toBe(rows);
});

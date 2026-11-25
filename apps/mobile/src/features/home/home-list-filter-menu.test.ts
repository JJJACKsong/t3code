import type { EnvironmentId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";

import type { WorkspaceEnvironment } from "../../state/workspaceModel";
import { adjacentHomeEnvironment, homeListFilterEnvironments } from "./home-list-filter-menu";

function environment(
  environmentId: string,
  environmentLabel: string,
  isEnabled: boolean,
): WorkspaceEnvironment {
  return {
    environmentId: environmentId as EnvironmentId,
    environmentLabel,
    displayUrl: "",
    isRelayManaged: false,
    isEnabled,
    connectionState: isEnabled ? "connected" : "available",
    connectionError: null,
    connectionErrorTraceId: null,
  };
}

it("offers only switched-on environments, sorted by label", () => {
  expect(
    homeListFilterEnvironments([
      environment("env-studio", "Studio", true),
      environment("env-laptop", "Laptop", false),
      environment("env-desk", "Desk", true),
    ]),
  ).toEqual([
    { environmentId: "env-desk", label: "Desk", connectionState: "connected" },
    { environmentId: "env-studio", label: "Studio", connectionState: "connected" },
  ]);
});

it("pages in both directions through All and enabled environments, including the empty list", () => {
  const desk = environment("desk", "Desk", true);
  const studio = environment("studio", "Studio", true);
  const choices = homeListFilterEnvironments([studio, desk]);
  expect(adjacentHomeEnvironment(choices, null, 1)).toBe(desk.environmentId);
  expect(adjacentHomeEnvironment(choices, desk.environmentId, 1)).toBe(studio.environmentId);
  expect(adjacentHomeEnvironment(choices, studio.environmentId, 1)).toBeNull();
  expect(adjacentHomeEnvironment(choices, null, -1)).toBe(studio.environmentId);
  expect(adjacentHomeEnvironment([], null, -1)).toBeNull();
});

import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildSidebarEnvironmentOptions,
  isSidebarThreadOrigin,
  resolveSidebarEnvironmentMenuValue,
  resolveSidebarEnvironmentScope,
  resolveSidebarLocalEnvironmentId,
  sidebarEnvironmentScopeValueFor,
  SIDEBAR_ENVIRONMENT_SCOPE_ALL,
  SIDEBAR_ENVIRONMENT_SCOPE_LOCAL,
  type SidebarEnvironmentIdentity,
} from "./sidebarFilters.logic";

const environment = (value: string, label: string = value): SidebarEnvironmentIdentity => ({
  environmentId: EnvironmentId.make(value),
  label,
});

const local = environment("this-mac", "This Mac");
const studio = environment("studio", "Studio");
const cloud = environment("cloud", "Cloud VM");

describe("resolveSidebarLocalEnvironmentId", () => {
  it("prefers this machine's own connection over the primary one", () => {
    expect(
      resolveSidebarLocalEnvironmentId(EnvironmentId.make("this-mac"), cloud.environmentId),
    ).toBe("this-mac");
  });

  it("uses the primary connection when no local one is known", () => {
    expect(resolveSidebarLocalEnvironmentId(null, cloud.environmentId)).toBe("cloud");
  });

  it("answers nothing when no connection exists yet", () => {
    expect(resolveSidebarLocalEnvironmentId(null, null)).toBeNull();
  });
});

describe("resolveSidebarEnvironmentScope", () => {
  it("keeps every environment for all", () => {
    expect(
      resolveSidebarEnvironmentScope({
        storedValue: SIDEBAR_ENVIRONMENT_SCOPE_ALL,
        environments: [local, studio, cloud],
        localEnvironmentId: local.environmentId,
        primaryEnvironmentId: null,
      }),
    ).toEqual({ environmentId: null, isLoading: false });
  });

  it("keeps this machine for local", () => {
    expect(
      resolveSidebarEnvironmentScope({
        storedValue: SIDEBAR_ENVIRONMENT_SCOPE_LOCAL,
        environments: [local, studio],
        localEnvironmentId: local.environmentId,
        primaryEnvironmentId: null,
      }),
    ).toEqual({ environmentId: local.environmentId, isLoading: false });
  });

  it("falls back to the primary connection for local", () => {
    expect(
      resolveSidebarEnvironmentScope({
        storedValue: SIDEBAR_ENVIRONMENT_SCOPE_LOCAL,
        environments: [cloud],
        localEnvironmentId: null,
        primaryEnvironmentId: cloud.environmentId,
      }),
    ).toEqual({ environmentId: cloud.environmentId, isLoading: false });
  });

  it("stays unfiltered while no environment is known, instead of emptying the list", () => {
    expect(
      resolveSidebarEnvironmentScope({
        storedValue: SIDEBAR_ENVIRONMENT_SCOPE_LOCAL,
        environments: [],
        localEnvironmentId: null,
        primaryEnvironmentId: null,
      }),
    ).toEqual({ environmentId: null, isLoading: true });
  });

  it("stays unfiltered for local when the catalog loaded without a local machine", () => {
    expect(
      resolveSidebarEnvironmentScope({
        storedValue: SIDEBAR_ENVIRONMENT_SCOPE_LOCAL,
        environments: [cloud],
        localEnvironmentId: null,
        primaryEnvironmentId: null,
      }),
    ).toEqual({ environmentId: null, isLoading: false });
  });

  it("keeps a saved machine that is still in the catalog", () => {
    expect(
      resolveSidebarEnvironmentScope({
        storedValue: "studio",
        environments: [local, studio, cloud],
        localEnvironmentId: local.environmentId,
        primaryEnvironmentId: null,
      }),
    ).toEqual({ environmentId: studio.environmentId, isLoading: false });
  });

  it("returns to this machine when the saved one left the catalog", () => {
    expect(
      resolveSidebarEnvironmentScope({
        storedValue: "retired",
        environments: [local, studio],
        localEnvironmentId: local.environmentId,
        primaryEnvironmentId: null,
      }),
    ).toEqual({ environmentId: local.environmentId, isLoading: false });
  });

  it("returns to every environment when the saved one left and nothing is local", () => {
    expect(
      resolveSidebarEnvironmentScope({
        storedValue: "retired",
        environments: [cloud],
        localEnvironmentId: null,
        primaryEnvironmentId: null,
      }),
    ).toEqual({ environmentId: null, isLoading: false });
  });

  it("holds a saved machine while the catalog is still loading", () => {
    expect(
      resolveSidebarEnvironmentScope({
        storedValue: "studio",
        environments: [],
        localEnvironmentId: local.environmentId,
        primaryEnvironmentId: null,
      }),
    ).toEqual({ environmentId: local.environmentId, isLoading: false });
  });

  it("reads the old remote scope as a machine id, so an upgrade keeps a filled list", () => {
    expect(
      resolveSidebarEnvironmentScope({
        storedValue: "remote",
        environments: [local, studio],
        localEnvironmentId: local.environmentId,
        primaryEnvironmentId: null,
      }),
    ).toEqual({ environmentId: local.environmentId, isLoading: false });
  });
});

describe("resolveSidebarEnvironmentMenuValue", () => {
  it("returns empty string while loading so All environments is neither checked nor swallowed", () => {
    expect(resolveSidebarEnvironmentMenuValue({ environmentId: null, isLoading: true })).toBe("");
  });

  it("returns all when unfiltered and loaded", () => {
    expect(resolveSidebarEnvironmentMenuValue({ environmentId: null, isLoading: false })).toBe(
      SIDEBAR_ENVIRONMENT_SCOPE_ALL,
    );
  });

  it("returns the selected environment id when loaded", () => {
    expect(
      resolveSidebarEnvironmentMenuValue({
        environmentId: local.environmentId,
        isLoading: false,
      }),
    ).toBe("this-mac");
  });
});

describe("sidebarEnvironmentScopeValueFor", () => {
  it("stores all for every environment", () => {
    expect(
      sidebarEnvironmentScopeValueFor(SIDEBAR_ENVIRONMENT_SCOPE_ALL, local.environmentId, null),
    ).toBe(SIDEBAR_ENVIRONMENT_SCOPE_ALL);
  });

  it("stores local for this machine, so a rename keeps the scope", () => {
    expect(sidebarEnvironmentScopeValueFor("this-mac", local.environmentId, null)).toBe(
      SIDEBAR_ENVIRONMENT_SCOPE_LOCAL,
    );
  });

  it("stores local for the primary connection when no local one is known", () => {
    expect(sidebarEnvironmentScopeValueFor("cloud", null, cloud.environmentId)).toBe(
      SIDEBAR_ENVIRONMENT_SCOPE_LOCAL,
    );
  });

  it("stores the machine id for another machine", () => {
    expect(sidebarEnvironmentScopeValueFor("studio", local.environmentId, null)).toBe("studio");
  });
});

describe("buildSidebarEnvironmentOptions", () => {
  it("lists this machine first, then the others by name", () => {
    expect(
      buildSidebarEnvironmentOptions({
        environments: [studio, cloud, local],
        machineKinds: new Map<EnvironmentId, "server">(),
        connectedEnvironmentIds: [],
        localEnvironmentId: local.environmentId,
        primaryEnvironmentId: null,
      }).map((option) => option.environmentId),
    ).toEqual(["this-mac", "cloud", "studio"]);
  });

  it("sorts by name when nothing is local", () => {
    expect(
      buildSidebarEnvironmentOptions({
        environments: [studio, cloud],
        machineKinds: new Map(),
        connectedEnvironmentIds: [],
        localEnvironmentId: null,
        primaryEnvironmentId: null,
      }).map((option) => option.label),
    ).toEqual(["Cloud VM", "Studio"]);
  });

  it("carries the machine icon, falling back to a server for a machine it does not know", () => {
    expect(
      buildSidebarEnvironmentOptions({
        environments: [studio, cloud],
        machineKinds: new Map([[studio.environmentId, "laptop" as const]]),
        connectedEnvironmentIds: [],
        localEnvironmentId: null,
        primaryEnvironmentId: null,
      }).map((option) => [option.machineKind, option.isLocal, option.isConnected]),
    ).toEqual([
      ["server", false, false],
      ["laptop", false, false],
    ]);
  });

  it("marks this machine and the machines that are connected", () => {
    expect(
      buildSidebarEnvironmentOptions({
        environments: [local, studio],
        machineKinds: new Map(),
        connectedEnvironmentIds: [studio.environmentId],
        localEnvironmentId: local.environmentId,
        primaryEnvironmentId: null,
      }).map((option) => [option.isLocal, option.isConnected]),
    ).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it("lists a machine once even when the catalog repeats it", () => {
    expect(
      buildSidebarEnvironmentOptions({
        environments: [studio, studio],
        machineKinds: new Map(),
        connectedEnvironmentIds: [],
        localEnvironmentId: null,
        primaryEnvironmentId: null,
      }).map((option) => option.environmentId),
    ).toEqual(["studio"]);
  });

  it("has nothing to list before the catalog answers", () => {
    expect(
      buildSidebarEnvironmentOptions({
        environments: [],
        machineKinds: new Map(),
        connectedEnvironmentIds: [],
        localEnvironmentId: null,
        primaryEnvironmentId: null,
      }),
    ).toEqual([]);
  });
});

describe("isSidebarThreadOrigin", () => {
  it("accepts the three origins", () => {
    expect(["all", "user", "agent"].every(isSidebarThreadOrigin)).toBe(true);
  });

  it("rejects anything else a stored value or a menu may hold", () => {
    expect(["remote", "", "All"].some(isSidebarThreadOrigin)).toBe(false);
  });
});

import type { EnvironmentId, EnvironmentMachineKind } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

/** A machine id, `"local"` for this app's machine, or `"all"` for no environment filter. */
export const SIDEBAR_ENVIRONMENT_SCOPE_STORAGE_KEY = "desktop.sidebar.environment-id";
export const SIDEBAR_ENVIRONMENT_SCOPE_ALL = "all";
export const SIDEBAR_ENVIRONMENT_SCOPE_LOCAL = "local";

export const sidebarThreadOriginSchema = Schema.Literals(["all", "user", "agent"]);
export type SidebarThreadOrigin = typeof sidebarThreadOriginSchema.Type;

const isThreadOrigin = Schema.is(sidebarThreadOriginSchema);

export const isSidebarThreadOrigin = (value: unknown): value is SidebarThreadOrigin =>
  isThreadOrigin(value);

export interface SidebarEnvironmentIdentity {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}

export interface SidebarEnvironmentOption extends SidebarEnvironmentIdentity {
  readonly machineKind: EnvironmentMachineKind;
  /** This app's machine: the one `"local"` means, listed first and held back to when a saved
   * machine disappears. */
  readonly isLocal: boolean;
  readonly isConnected: boolean;
}

export interface SidebarEnvironmentScope {
  /** Kept in view; `null` lists every environment, as no filter would. */
  readonly environmentId: EnvironmentId | null;
  /** True while nothing is known yet, so the pill says "This machine" instead of emptying the list. */
  readonly isLoading: boolean;
}

/** This app's machine, once a connection names one. */
export function resolveSidebarLocalEnvironmentId(
  localEnvironmentId: EnvironmentId | null,
  primaryEnvironmentId: EnvironmentId | null,
): EnvironmentId | null {
  return localEnvironmentId ?? primaryEnvironmentId;
}

/**
 * Reads the saved scope as the environment to keep. A saved machine that left the catalog falls
 * back to this one, and a cold start keeps the list unfiltered rather than showing a false empty
 * state: the stored value survives, so the filter returns once its machine does.
 */
export function resolveSidebarEnvironmentScope(input: {
  readonly storedValue: string;
  readonly environments: ReadonlyArray<SidebarEnvironmentIdentity>;
  readonly localEnvironmentId: EnvironmentId | null;
  readonly primaryEnvironmentId: EnvironmentId | null;
}): SidebarEnvironmentScope {
  if (input.storedValue === SIDEBAR_ENVIRONMENT_SCOPE_ALL) {
    return { environmentId: null, isLoading: false };
  }
  const localId = resolveSidebarLocalEnvironmentId(
    input.localEnvironmentId,
    input.primaryEnvironmentId,
  );
  if (input.storedValue === SIDEBAR_ENVIRONMENT_SCOPE_LOCAL) {
    return localId === null
      ? { environmentId: null, isLoading: input.environments.length === 0 }
      : { environmentId: localId, isLoading: false };
  }
  const saved = input.environments.find(
    (environment) => environment.environmentId === input.storedValue,
  );
  if (saved !== undefined) return { environmentId: saved.environmentId, isLoading: false };
  return {
    environmentId: localId,
    isLoading: input.environments.length === 0 && localId === null,
  };
}

/** Empty while loading so the menu neither checks "All environments" nor swallows a click on it. */
export function resolveSidebarEnvironmentMenuValue(scope: SidebarEnvironmentScope): string {
  if (scope.isLoading) return "";
  return scope.environmentId ?? SIDEBAR_ENVIRONMENT_SCOPE_ALL;
}

/** The value a click in the menu stores: this machine stays `"local"` so the scope follows a rename. */
export function sidebarEnvironmentScopeValueFor(
  environmentId: string,
  localEnvironmentId: EnvironmentId | null,
  primaryEnvironmentId: EnvironmentId | null,
): string {
  if (environmentId === SIDEBAR_ENVIRONMENT_SCOPE_ALL) return SIDEBAR_ENVIRONMENT_SCOPE_ALL;
  return environmentId ===
    resolveSidebarLocalEnvironmentId(localEnvironmentId, primaryEnvironmentId)
    ? SIDEBAR_ENVIRONMENT_SCOPE_LOCAL
    : environmentId;
}

// Names sort like the rest of the app's lists: case and accents ignored, digits by value.
const environmentLabelOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** The pill's menu: this machine first, then the rest by name. */
export function buildSidebarEnvironmentOptions(input: {
  readonly environments: ReadonlyArray<SidebarEnvironmentIdentity>;
  readonly machineKinds: ReadonlyMap<EnvironmentId, EnvironmentMachineKind>;
  readonly connectedEnvironmentIds: ReadonlyArray<EnvironmentId>;
  readonly localEnvironmentId: EnvironmentId | null;
  readonly primaryEnvironmentId: EnvironmentId | null;
}): ReadonlyArray<SidebarEnvironmentOption> {
  const localId = resolveSidebarLocalEnvironmentId(
    input.localEnvironmentId,
    input.primaryEnvironmentId,
  );
  const connected = new Set(input.connectedEnvironmentIds);
  const seen = new Set<EnvironmentId>();
  const options: SidebarEnvironmentOption[] = [];
  for (const environment of input.environments) {
    if (seen.has(environment.environmentId)) continue;
    seen.add(environment.environmentId);
    options.push({
      environmentId: environment.environmentId,
      label: environment.label,
      // A machine whose icon is not known yet still reads as a server, as elsewhere.
      machineKind: input.machineKinds.get(environment.environmentId) ?? "server",
      isLocal: environment.environmentId === localId,
      isConnected: connected.has(environment.environmentId),
    });
  }
  return options.toSorted(
    (left, right) =>
      Number(right.isLocal) - Number(left.isLocal) ||
      environmentLabelOrder.compare(left.label, right.label) ||
      left.environmentId.localeCompare(right.environmentId),
  );
}

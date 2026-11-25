import type { EnvironmentId } from "@t3tools/contracts";
import type { ReactNode } from "react";
import type { HomeListFilterMenuEnvironment } from "./home-list-filter-menu";

export interface EnvironmentPagerProps {
  readonly environments: ReadonlyArray<HomeListFilterMenuEnvironment>;
  readonly selected: EnvironmentId | null;
  readonly onChange: (id: EnvironmentId | null) => void;
  readonly children: (id: EnvironmentId | null, active: boolean) => ReactNode;
}

export function EnvironmentPager(props: EnvironmentPagerProps) {
  return <>{props.children(props.selected, true)}</>;
}

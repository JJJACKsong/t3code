import type { EnvironmentId } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { ChevronDownIcon, GlobeIcon } from "lucide-react";

import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItemDetail,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { SidebarMenuItem } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  resolveSidebarEnvironmentMenuValue,
  SIDEBAR_ENVIRONMENT_SCOPE_ALL,
  sidebarEnvironmentScopeValueFor,
  type SidebarEnvironmentOption,
  type SidebarEnvironmentScope,
} from "./sidebarFilters.logic";

/**
 * The footer's environment scope in the free slot after the utility icons: icon, label and chevron
 * while the slot has room, the selected machine's icon alone when it does not, and nothing at all
 * while a cramped row shows the undo notice, which needs those pixels to stay clickable.
 */
export function SidebarEnvironmentScopePill({
  scope,
  options,
  localEnvironmentId,
  primaryEnvironmentId,
  onScopeChange,
}: {
  readonly scope: SidebarEnvironmentScope;
  readonly options: ReadonlyArray<SidebarEnvironmentOption>;
  readonly localEnvironmentId: EnvironmentId | null;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly onScopeChange: (storedValue: string) => void;
}) {
  const gt = useGT();
  const active =
    scope.environmentId === null
      ? null
      : (options.find((option) => option.environmentId === scope.environmentId) ?? null);
  const activeLabel =
    active !== null
      ? active.label
      : scope.environmentId === null && !scope.isLoading
        ? gt("All environments")
        : gt("This machine");
  // The control's name says what it scopes; the tooltip repeats the truncated label in full.
  const description = `${gt("Workspace environment")}: ${activeLabel}`;
  const menuValue = resolveSidebarEnvironmentMenuValue(scope);
  // The glyph follows the label: a globe for every environment, a machine for the one in view.
  const showsEveryEnvironment = scope.environmentId === null && !scope.isLoading;

  const handleValueChange = (value: string) => {
    if (value === menuValue) return;
    onScopeChange(sidebarEnvironmentScopeValueFor(value, localEnvironmentId, primaryEnvironmentId));
  };

  return (
    <SidebarMenuItem className="@container/environment-scope flex min-w-8 flex-1 items-center @max-[13.75rem]/sidebar-footer:min-w-7 @max-[15rem]/sidebar-footer:has-[~[data-sidebar-undo-notice]]:not-has-[[aria-expanded=true]]:hidden">
      <Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={description}
                    className="inline-flex h-8 max-w-full min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-full bg-sidebar-control-surface px-2.5 text-xs font-medium text-sidebar-muted-foreground ring-1 ring-sidebar-border/60 ring-inset outline-hidden transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-sidebar-row-hover data-popup-open:text-sidebar-foreground @max-[13.75rem]/sidebar-footer:h-7 @max-[4.5rem]/environment-scope:aspect-square @max-[4.5rem]/environment-scope:justify-center @max-[4.5rem]/environment-scope:gap-0 @max-[4.5rem]/environment-scope:px-0"
                  />
                }
              />
            }
          >
            {showsEveryEnvironment ? (
              <GlobeIcon className="size-3.5 shrink-0 text-(--sidebar-icon-color) @max-[4.5rem]/environment-scope:size-4" />
            ) : (
              <EnvironmentMachineIcon
                kind={active?.machineKind ?? "server"}
                className="size-3.5 shrink-0 text-(--sidebar-icon-color) @max-[4.5rem]/environment-scope:size-4"
              />
            )}
            <span className="min-w-0 truncate @max-[4.5rem]/environment-scope:hidden">
              {activeLabel}
            </span>
            <ChevronDownIcon
              aria-hidden
              className="size-3 shrink-0 opacity-60 @max-[4.5rem]/environment-scope:hidden"
            />
          </TooltipTrigger>
          <TooltipPopup side="top">{activeLabel}</TooltipPopup>
        </Tooltip>
        <MenuPopup align="start" side="top">
          <MenuGroup>
            <MenuGroupLabel>{gt("Workspace environment")}</MenuGroupLabel>
            <MenuRadioGroup value={menuValue} onValueChange={handleValueChange}>
              <MenuRadioItem closeOnClick value={SIDEBAR_ENVIRONMENT_SCOPE_ALL}>
                <span className="flex min-w-0 items-center gap-2">
                  <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{gt("All environments")}</span>
                  <MenuRadioItemIndicator />
                </span>
              </MenuRadioItem>
              {options.length === 0 ? null : <MenuSeparator />}
              {options.map((option) => (
                <MenuRadioItem key={option.environmentId} closeOnClick value={option.environmentId}>
                  <span className="flex min-w-0 items-center gap-2">
                    <EnvironmentMachineIcon
                      kind={option.machineKind}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.isLocal || !option.isConnected ? (
                      <MenuItemDetail>
                        <span className="inline-flex items-center gap-1.5">
                          {option.isLocal ? (
                            <span>{gt("Local", { $context: "machine location" })}</span>
                          ) : null}
                          {option.isConnected ? null : <span>{gt("Offline")}</span>}
                        </span>
                      </MenuItemDetail>
                    ) : null}
                    <MenuRadioItemIndicator />
                  </span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
        </MenuPopup>
      </Menu>
    </SidebarMenuItem>
  );
}

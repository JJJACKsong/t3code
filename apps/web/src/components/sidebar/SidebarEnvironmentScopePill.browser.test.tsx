import { EnvironmentId } from "@t3tools/contracts";
import { ChartNoAxesColumnIcon, GlobeIcon } from "lucide-react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { act, render } from "../../../test/render";
import { useThreadUndoNotice } from "../../hooks/showThreadUndoNotice";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "../ui/sidebar";
import { SidebarEnvironmentScopePill } from "./SidebarEnvironmentScopePill";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import type { SidebarEnvironmentOption, SidebarEnvironmentScope } from "./sidebarFilters.logic";

const LOCAL_ID = EnvironmentId.make("this-mac");
const STUDIO_ID = EnvironmentId.make("studio");
const CLOUD_ID = EnvironmentId.make("cloud");

const OPTIONS: ReadonlyArray<SidebarEnvironmentOption> = [
  {
    environmentId: LOCAL_ID,
    label: "This Mac",
    machineKind: "laptop",
    isLocal: true,
    isConnected: true,
  },
  {
    environmentId: STUDIO_ID,
    label: "Studio Rack By The Window",
    machineKind: "mac-studio",
    isLocal: false,
    isConnected: true,
  },
  {
    environmentId: CLOUD_ID,
    label: "Cloud VM",
    machineKind: "cloud",
    isLocal: false,
    isConnected: false,
  },
];

/**
 * Mirrors the desktop footer row at a given sidebar width: four utility buttons, the environment
 * pill, the real undo notice, and the round update button, built from the same primitives and
 * classes `SidebarChrome` uses.
 */
function FooterRow({
  sidebarWidth,
  scope,
  onScopeChange,
}: {
  readonly sidebarWidth: number;
  readonly scope: SidebarEnvironmentScope;
  readonly onScopeChange?: (stored: string) => void;
}) {
  return (
    <SidebarProvider>
      <div className="relative bg-sidebar p-2" style={{ width: `${sidebarWidth}px` }}>
        <SidebarMenu className="@container/sidebar-footer flex-row items-center">
          {["Settings", "Pull requests", "Issues", "Usage"].map((label) => (
            <SidebarMenuItem key={label} className="shrink-0">
              <SidebarMenuButton
                aria-label={label}
                size="icon"
                className="@max-[13.75rem]/sidebar-footer:size-7"
              >
                <ChartNoAxesColumnIcon />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarEnvironmentScopePill
            scope={scope}
            options={OPTIONS}
            localEnvironmentId={LOCAL_ID}
            primaryEnvironmentId={null}
            onScopeChange={onScopeChange ?? (() => {})}
          />
          <SidebarThreadUndoNotice />
          <li
            aria-hidden
            className="ml-auto size-8 shrink-0 rounded-full bg-sidebar-control-surface"
          />
        </SidebarMenu>
        <div hidden>
          <span data-icon-reference="globe">
            <GlobeIcon />
          </span>
          {OPTIONS.map((option) => (
            <span key={option.environmentId} data-icon-reference={option.machineKind}>
              <EnvironmentMachineIcon kind={option.machineKind} />
            </span>
          ))}
        </div>
      </div>
    </SidebarProvider>
  );
}

function rowMetrics(container: HTMLElement) {
  const row = container.querySelector("ul")!;
  const button = row.querySelector<HTMLButtonElement>("button[aria-haspopup]")!;
  const label = button.querySelector("span")!;
  const [icon, chevron] = button.querySelectorAll("svg");
  const rect = button.getBoundingClientRect();
  return {
    button,
    label,
    iconHtml: icon!.innerHTML,
    iconWidth: icon!.getBoundingClientRect().width,
    rowHeight: row.getBoundingClientRect().height,
    rowOverflow: row.scrollWidth - row.clientWidth,
    buttonWidth: rect.width,
    buttonHeight: rect.height,
    slotWidth: button.parentElement!.getBoundingClientRect().width,
    slotDisplay: getComputedStyle(button.parentElement!).display,
    labelDisplay: getComputedStyle(label).display,
    labelFontSize: getComputedStyle(label).fontSize,
    chevronDisplay: getComputedStyle(chevron!).display,
    reference: (name: string) =>
      container.querySelector(`[data-icon-reference="${name}"] svg`)!.innerHTML,
  };
}

function undoMetrics(container: HTMLElement) {
  const row = container.querySelector("ul")!;
  const item = row.querySelector<HTMLElement>("[data-sidebar-undo-notice]");
  const button = item?.querySelector("button") ?? null;
  const icon = button?.querySelector("svg") ?? null;
  return {
    item,
    itemWidth: item?.getBoundingClientRect().width ?? 0,
    button,
    buttonWidth: button?.getBoundingClientRect().width ?? 0,
    iconVisibility: icon ? getComputedStyle(icon).visibility : "missing",
    rowOverflow: row.scrollWidth - row.clientWidth,
    rowHeight: row.getBoundingClientRect().height,
  };
}

/**
 * Drives the real undo notice store for one test: browser tests keep shared state in a
 * disposable rather than in lifecycle hooks, so the notice never outlives its test.
 */
function undoNotifications() {
  const show = async (undo: () => Promise<void> = async () => {}) => {
    await act(() =>
      useThreadUndoNotice.setState({ notice: { action: "Archived", count: 3, undo } }),
    );
  };
  // Clears the notice and dispatches nothing: the row must leave the DOM on its own, from the
  // transition the browser really runs or from the notice's fallback timer.
  const clear = async () => {
    await act(() => useThreadUndoNotice.setState({ notice: null }));
  };
  return {
    show,
    clear,
    [Symbol.dispose]() {
      useThreadUndoNotice.setState({ notice: null });
    },
  };
}

describe("SidebarEnvironmentScopePill", () => {
  it("collapses to the selected machine's icon at the 208px sidebar minimum", async () => {
    await using screen = await render(
      <FooterRow sidebarWidth={208} scope={{ environmentId: LOCAL_ID, isLoading: false }} />,
      { router: false },
    );
    const metrics = rowMetrics(screen.container);

    expect(metrics.slotWidth).toBeLessThan(72);
    expect(metrics.labelDisplay).toBe("none");
    expect(metrics.chevronDisplay).toBe("none");
    // Below 13.75rem the four utility buttons are 28px, and the collapsed pill matches them.
    expect(metrics.buttonWidth).toBe(28);
    expect(metrics.buttonHeight).toBe(28);
    expect(metrics.iconWidth).toBe(16);
    expect(metrics.iconHtml).toBe(metrics.reference("laptop"));
    expect(metrics.button.getAttribute("aria-label")).toBe("Workspace environment: This Mac");
    expect(metrics.rowOverflow).toBeLessThanOrEqual(0);
    expect(metrics.rowHeight).toBe(32);
  });

  it("keeps the globe for every environment while collapsed", async () => {
    await using screen = await render(
      <FooterRow sidebarWidth={208} scope={{ environmentId: null, isLoading: false }} />,
      { router: false },
    );
    const metrics = rowMetrics(screen.container);

    expect(metrics.labelDisplay).toBe("none");
    expect(metrics.iconHtml).toBe(metrics.reference("globe"));
    expect(metrics.button.getAttribute("aria-label")).toBe(
      "Workspace environment: All environments",
    );
  });

  it("keeps the icon button at 32px beside 32px utility buttons at the default width", async () => {
    await using screen = await render(
      <FooterRow sidebarWidth={256} scope={{ environmentId: CLOUD_ID, isLoading: false }} />,
      { router: false },
    );
    const metrics = rowMetrics(screen.container);

    expect(metrics.slotWidth).toBeLessThan(72);
    expect(metrics.labelDisplay).toBe("none");
    expect(metrics.buttonWidth).toBe(32);
    expect(metrics.buttonHeight).toBe(32);
    expect(metrics.iconWidth).toBe(16);
    expect(metrics.iconHtml).toBe(metrics.reference("cloud"));
  });

  it("truncates the label once the slot holds it but not in full", async () => {
    await using screen = await render(
      <FooterRow sidebarWidth={280} scope={{ environmentId: STUDIO_ID, isLoading: false }} />,
      { router: false },
    );
    const metrics = rowMetrics(screen.container);

    expect(metrics.slotWidth).toBeGreaterThanOrEqual(72);
    expect(metrics.slotWidth).toBeLessThan(100);
    expect(metrics.labelDisplay).not.toBe("none");
    expect(metrics.chevronDisplay).not.toBe("none");
    expect(metrics.label.scrollWidth).toBeGreaterThan(metrics.label.clientWidth);
    expect(metrics.labelFontSize).toBe("12px");
    expect(metrics.rowOverflow).toBeLessThanOrEqual(0);
  });

  it("shows icon, label and chevron on a wide sidebar", async () => {
    await using screen = await render(
      <FooterRow sidebarWidth={320} scope={{ environmentId: STUDIO_ID, isLoading: false }} />,
      { router: false },
    );
    const metrics = rowMetrics(screen.container);

    expect(metrics.slotWidth).toBeGreaterThanOrEqual(100);
    expect(metrics.labelDisplay).not.toBe("none");
    expect(metrics.label.textContent).toBe("Studio Rack By The Window");
    expect(metrics.chevronDisplay).not.toBe("none");
    expect(metrics.labelFontSize).toBe("12px");
    expect(metrics.buttonHeight).toBe(32);
    expect(metrics.iconWidth).toBe(14);
  });

  it("opens the menu from the collapsed button and stores the picked scope", async () => {
    const onScopeChange = vi.fn();
    await using screen = await render(
      <FooterRow
        sidebarWidth={208}
        scope={{ environmentId: LOCAL_ID, isLoading: false }}
        onScopeChange={onScopeChange}
      />,
      { router: false },
    );
    const metrics = rowMetrics(screen.container);
    expect(metrics.button.getAttribute("aria-expanded")).toBe("false");

    await userEvent.click(metrics.button);
    expect(metrics.button.getAttribute("aria-expanded")).toBe("true");
    // Native menu typography: the group label stays 12px medium; items keep `text-base sm:text-sm`.
    const groupLabel = page.getByText("Workspace environment").element();
    expect(getComputedStyle(groupLabel).fontSize).toBe("12px");
    expect(getComputedStyle(groupLabel).fontWeight).toBe("500");
    expect(metrics.labelFontSize).toBe("12px");
    expect(page.getByRole("menuitemradio", { name: /This Mac/ }).element().ariaChecked).toBe(
      "true",
    );

    await userEvent.click(page.getByRole("menuitemradio", { name: "All environments" }));
    expect(onScopeChange).toHaveBeenCalledWith("all");
  });

  it("opens from the keyboard while collapsed", async () => {
    await using screen = await render(
      <FooterRow sidebarWidth={208} scope={{ environmentId: LOCAL_ID, isLoading: false }} />,
      { router: false },
    );
    const button = screen.container.querySelector<HTMLButtonElement>("button[aria-haspopup]")!;

    button.focus();
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(page.getByRole("menuitemradio", { name: "All environments" }).element()).toBeTruthy();
  });

  it("unmounts a notice cleared mid-fade-in at 208px and gives the row back", async () => {
    using undoNotice = undoNotifications();
    await using screen = await render(
      <FooterRow sidebarWidth={208} scope={{ environmentId: LOCAL_ID, isLoading: false }} />,
      { router: false },
    );
    // Cleared while `starting:opacity-0` still holds opacity at 0: the browser runs no transition
    // at all here, so only the notice's own fallback can unmount the row.
    await undoNotice.show();
    expect(undoMetrics(screen.container).item).not.toBeNull();
    expect(rowMetrics(screen.container).slotDisplay).toBe("none");

    await undoNotice.clear();

    await vi.waitFor(
      () => expect(screen.container.querySelector("[data-sidebar-undo-notice]")).toBeNull(),
      { timeout: 1000 },
    );
    const restored = rowMetrics(screen.container);
    expect(restored.slotDisplay).toBe("flex");
    expect(restored.buttonWidth).toBe(28);
    expect(restored.buttonHeight).toBe(28);
    await userEvent.click(restored.button);
    expect(restored.button.getAttribute("aria-expanded")).toBe("true");
    expect(page.getByRole("menuitemradio", { name: /This Mac/ }).element()).toBeTruthy();
  });

  it("unmounts a notice the real undo button clears at 224px, giving the row back", async () => {
    using undoNotice = undoNotifications();
    // The real undo path clears the notice through the store; the row then has to leave the DOM
    // without anyone dispatching a transitionend, or the pill stays hidden at this width.
    const undo = vi.fn(async () => {
      await act(() => useThreadUndoNotice.setState({ notice: null }));
    });
    await using screen = await render(
      <FooterRow sidebarWidth={224} scope={{ environmentId: LOCAL_ID, isLoading: false }} />,
      { router: false },
    );
    const before = rowMetrics(screen.container);
    expect(before.slotDisplay).toBe("flex");
    await undoNotice.show(undo);
    expect(rowMetrics(screen.container).slotDisplay).toBe("none");
    expect(undoMetrics(screen.container).item).not.toBeNull();

    await userEvent.click(undoMetrics(screen.container).button!);
    expect(undo).toHaveBeenCalledTimes(1);

    await vi.waitFor(
      () => expect(screen.container.querySelector("[data-sidebar-undo-notice]")).toBeNull(),
      { timeout: 1000 },
    );
    const restored = rowMetrics(screen.container);
    expect(restored.slotDisplay).toBe("flex");
    expect(restored.buttonWidth).toBe(28);
    expect(restored.buttonHeight).toBe(28);
    expect(restored.buttonWidth).toBe(before.buttonWidth);
    expect(restored.buttonHeight).toBe(before.buttonHeight);
    await userEvent.click(restored.button);
    expect(restored.button.getAttribute("aria-expanded")).toBe("true");
    expect(page.getByRole("menuitemradio", { name: /This Mac/ }).element()).toBeTruthy();
  });

  it("keeps this machine stored as local", async () => {
    const onScopeChange = vi.fn();
    await using screen = await render(
      <FooterRow
        sidebarWidth={208}
        scope={{ environmentId: null, isLoading: false }}
        onScopeChange={onScopeChange}
      />,
      { router: false },
    );

    await userEvent.click(screen.container.querySelector("button[aria-haspopup]")!);
    await userEvent.click(page.getByRole("menuitemradio", { name: /This Mac/ }));
    expect(onScopeChange).toHaveBeenCalledWith("local");
  });

  it("yields the row to a real undo notice at 208px, then returns", async () => {
    using undoNotice = undoNotifications();
    const undo = vi.fn(async () => {});
    await using screen = await render(
      <FooterRow sidebarWidth={208} scope={{ environmentId: LOCAL_ID, isLoading: false }} />,
      { router: false },
    );
    await undoNotice.show(undo);
    const undoRow = undoMetrics(screen.container);
    const pill = rowMetrics(screen.container);

    // The pill gives up its slot so the notice can be read and clicked.
    expect(pill.slotDisplay).toBe("none");
    expect(undoRow.itemWidth).toBe(28);
    expect(undoRow.buttonWidth).toBeGreaterThanOrEqual(16);
    expect(undoRow.iconVisibility).toBe("visible");
    expect(undoRow.rowOverflow).toBe(0);
    expect(undoRow.rowHeight).toBe(32);

    await userEvent.click(undoRow.button!);
    expect(undo).toHaveBeenCalledTimes(1);

    await undoNotice.clear();
    await vi.waitFor(
      () => expect(screen.container.querySelector("[data-sidebar-undo-notice]")).toBeNull(),
      { timeout: 1000 },
    );
    const restored = rowMetrics(screen.container);
    expect(restored.slotDisplay).toBe("flex");
    expect(restored.buttonWidth).toBe(28);
    expect(restored.buttonHeight).toBe(28);
    await userEvent.click(restored.button);
    expect(restored.button.getAttribute("aria-expanded")).toBe("true");
    expect(page.getByRole("menuitemradio", { name: /This Mac/ }).element()).toBeTruthy();
  });

  it.each([224, 240])("yields the row to a real undo notice at %ipx", async (sidebarWidth) => {
    using undoNotice = undoNotifications();
    const undo = vi.fn(async () => {});
    await using screen = await render(
      <FooterRow
        sidebarWidth={sidebarWidth}
        scope={{ environmentId: LOCAL_ID, isLoading: false }}
      />,
      { router: false },
    );
    await undoNotice.show(undo);
    const undoRow = undoMetrics(screen.container);
    const pill = rowMetrics(screen.container);

    expect(pill.slotDisplay).toBe("none");
    expect(undoRow.itemWidth).toBe(44);
    expect(undoRow.buttonWidth).toBeGreaterThanOrEqual(16);
    expect(undoRow.iconVisibility).toBe("visible");
    expect(undoRow.rowOverflow).toBe(0);
    expect(undoRow.rowHeight).toBe(32);

    await userEvent.click(undoRow.button!);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("keeps the pill and a real undo notice side by side at 256px", async () => {
    using undoNotice = undoNotifications();
    const undo = vi.fn(async () => {});
    await using screen = await render(
      <FooterRow sidebarWidth={256} scope={{ environmentId: LOCAL_ID, isLoading: false }} />,
      { router: false },
    );
    await undoNotice.show(undo);
    const undoRow = undoMetrics(screen.container);
    const pill = rowMetrics(screen.container);

    expect(pill.slotDisplay).toBe("flex");
    expect(pill.buttonWidth).toBe(32);
    expect(pill.buttonHeight).toBe(32);
    expect(undoRow.itemWidth).toBeGreaterThanOrEqual(16);
    expect(undoRow.iconVisibility).toBe("visible");
    expect(undoRow.rowOverflow).toBe(0);
    expect(undoRow.rowHeight).toBe(32);

    await userEvent.click(undoRow.button!);
    expect(undo).toHaveBeenCalledTimes(1);
    await userEvent.click(pill.button);
    expect(pill.button.getAttribute("aria-expanded")).toBe("true");
  });

  it.each([288, 360])("keeps both clickable at %ipx", async (sidebarWidth) => {
    using undoNotice = undoNotifications();
    const undo = vi.fn(async () => {});
    await using screen = await render(
      <FooterRow
        sidebarWidth={sidebarWidth}
        scope={{ environmentId: LOCAL_ID, isLoading: false }}
      />,
      { router: false },
    );
    await undoNotice.show(undo);
    const undoRow = undoMetrics(screen.container);
    const pill = rowMetrics(screen.container);

    expect(pill.slotDisplay).toBe("flex");
    expect(pill.buttonHeight).toBe(32);
    expect(undoRow.iconVisibility).toBe("visible");
    expect(undoRow.rowOverflow).toBe(0);
    expect(undoRow.rowHeight).toBe(32);

    await userEvent.click(undoRow.button!);
    expect(undo).toHaveBeenCalledTimes(1);
    await userEvent.click(pill.button);
    expect(pill.button.getAttribute("aria-expanded")).toBe("true");
  });

  it("yields to a notice while only the tooltip is open at 208px", async () => {
    using undoNotice = undoNotifications();
    const undo = vi.fn(async () => {
      await act(() => useThreadUndoNotice.setState({ notice: null }));
    });
    await using screen = await render(
      <FooterRow sidebarWidth={208} scope={{ environmentId: LOCAL_ID, isLoading: false }} />,
      { router: false },
    );
    const pill = rowMetrics(screen.container);

    // Hovering opens only the tooltip, which reuses the pill's button: `data-popup-open` lands on
    // it with `aria-expanded="false"`, so the yield must key on the menu's real open state.
    await userEvent.hover(pill.button);
    await vi.waitFor(() => expect(pill.button.hasAttribute("data-popup-open")).toBe(true), {
      timeout: 3000,
    });
    expect(pill.button.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[data-slot="tooltip-popup"]')).not.toBeNull();

    await undoNotice.show(undo);
    const undoRow = undoMetrics(screen.container);
    expect(rowMetrics(screen.container).slotDisplay).toBe("none");
    expect(pill.button.getBoundingClientRect().width).toBe(0);
    expect(undoRow.itemWidth).toBe(28);
    expect(undoRow.buttonWidth).toBeGreaterThanOrEqual(16);
    expect(undoRow.iconVisibility).toBe("visible");
    expect(undoRow.rowOverflow).toBe(0);
    expect(undoRow.rowHeight).toBe(32);

    await userEvent.click(undoRow.button!);
    expect(undo).toHaveBeenCalledTimes(1);

    await vi.waitFor(
      () => expect(screen.container.querySelector("[data-sidebar-undo-notice]")).toBeNull(),
      { timeout: 1000 },
    );
    const restored = rowMetrics(screen.container);
    expect(restored.slotDisplay).toBe("flex");
    expect(restored.buttonWidth).toBe(28);
    expect(restored.buttonHeight).toBe(28);
  });

  it("keeps an open menu while a notice appears, then yields once it closes", async () => {
    using undoNotice = undoNotifications();
    const undo = vi.fn(async () => {});
    await using screen = await render(
      <FooterRow sidebarWidth={208} scope={{ environmentId: LOCAL_ID, isLoading: false }} />,
      { router: false },
    );
    const pill = rowMetrics(screen.container);
    await userEvent.click(pill.button);
    expect(pill.button.getAttribute("aria-expanded")).toBe("true");

    await undoNotice.show(undo);
    // An open menu owns the slot: hiding its trigger would pull the menu out from under the pointer.
    expect(getComputedStyle(pill.button.parentElement!).display).toBe("flex");

    await userEvent.keyboard("{Escape}");
    expect(pill.button.getAttribute("aria-expanded")).toBe("false");
    await vi.waitFor(() =>
      expect(getComputedStyle(pill.button.parentElement!).display).toBe("none"),
    );
    // A closed menu hands the row back even though the pointer still hovers the hidden pill.
    const undoRow = undoMetrics(screen.container);
    expect(undoRow.iconVisibility).toBe("visible");
    expect(undoRow.rowOverflow).toBe(0);
    await userEvent.click(undoRow.button!);
    expect(undo).toHaveBeenCalledTimes(1);
  });
});

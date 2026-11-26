import { useGT } from "gt-react";
import { ListFilterIcon } from "lucide-react";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuTrigger,
} from "../ui/menu";
import { SidebarHeaderIconButton } from "./SidebarThreadHeader";
import { isSidebarThreadOrigin, type SidebarThreadOrigin } from "./sidebarFilters.logic";

/**
 * The header's thread-origin filter. It sits beside the new-thread button because the list obeys
 * it: keeping it here puts the filter within a click of the list's first row.
 */
export function SidebarThreadOriginMenu({
  origin,
  onOriginChange,
}: {
  readonly origin: SidebarThreadOrigin;
  readonly onOriginChange: (origin: SidebarThreadOrigin) => void;
}) {
  const gt = useGT();
  const options = [
    { value: "user", label: gt("Started by me") },
    { value: "agent", label: gt("Started by agent") },
    { value: "all", label: gt("All threads") },
  ] as const;
  const filtered = origin !== "all";
  const activeLabel = options.find((option) => option.value === origin)?.label ?? gt("All threads");
  // Names both the control and its state: the glyph alone cannot say which origin is kept.
  const description = `${gt("Thread origin")}: ${activeLabel}`;

  return (
    <Menu>
      <MenuTrigger render={<SidebarHeaderIconButton label={description} tooltip={description} />}>
        <ListFilterIcon className="size-4" />
        {filtered ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary"
          />
        ) : null}
      </MenuTrigger>
      <MenuPopup align="end" side="bottom">
        <MenuGroup>
          <MenuGroupLabel>{gt("Thread origin")}</MenuGroupLabel>
          <MenuRadioGroup
            value={origin}
            onValueChange={(next) => {
              if (isSidebarThreadOrigin(next) && next !== origin) onOriginChange(next);
            }}
          >
            {options.map((option) => (
              <MenuRadioItem key={option.value} closeOnClick value={option.value}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <MenuRadioItemIndicator />
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

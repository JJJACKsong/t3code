import { ClientSettingsSchema, type ClientSettings } from "@t3tools/contracts";

import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

import { getLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";

const CLIENT_SETTINGS_STORAGE_KEY = "t3code:client-settings:v1";

export const ZH_DEFAULT_MIGRATION_KEY = "t3code:zh-default-migrated:v1";
const BrowserClientSettingsSchema = ClientSettingsSchema.mapFields((fields) => ({
  ...fields,
  language: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed("zh"))),
}));

export function markBrowserChineseDefaultMigrated(): void {
  try {
    if (hasWindow()) window.localStorage.setItem(ZH_DEFAULT_MIGRATION_KEY, "1");
  } catch {
    // Local storage may be disabled.
  }
}

export function hasBrowserChineseDefaultMigrated(): boolean {
  try {
    return hasWindow() && window.localStorage.getItem(ZH_DEFAULT_MIGRATION_KEY) !== null;
  } catch {
    return false;
  }
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export function readBrowserClientSettings(): ClientSettings | null {
  if (!hasWindow()) {
    return null;
  }

  return getLocalStorageItem(CLIENT_SETTINGS_STORAGE_KEY, BrowserClientSettingsSchema);
}

export function writeBrowserClientSettings(settings: ClientSettings): void {
  if (!hasWindow()) {
    return;
  }

  setLocalStorageItem(CLIENT_SETTINGS_STORAGE_KEY, settings, ClientSettingsSchema);
  markBrowserChineseDefaultMigrated();
}

/** Storage events fire only for other tabs' writes; a null key means storage was cleared. */
export function subscribeBrowserClientSettingsWrites(onChange: () => void): () => void {
  if (!hasWindow()) {
    return () => undefined;
  }
  const handleStorage = (event: StorageEvent) => {
    if (event.key === CLIENT_SETTINGS_STORAGE_KEY || event.key === null) {
      onChange();
    }
  };
  const target = window;
  target.addEventListener("storage", handleStorage);
  return () => target.removeEventListener("storage", handleStorage);
}

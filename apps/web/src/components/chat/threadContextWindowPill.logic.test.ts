import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { describe, expect, it } from "vite-plus/test";

import {
  contextWindowPillModel,
  contextWindowTone,
  formatContextWindowPercent,
} from "./threadContextWindowPill.logic";

function snapshot(overrides: Partial<ContextWindowSnapshot> = {}): ContextWindowSnapshot {
  return {
    usedTokens: 128_000,
    maxTokens: 200_000,
    usedPercentage: 64,
    remainingTokens: 72_000,
    remainingPercentage: 36,
    autoCompactThreshold: 160_000,
    updatedAt: "2026-11-23T10:00:00.000Z",
    ...overrides,
  };
}

describe("context window pill model", () => {
  it("returns a neutral model without a snapshot", () => {
    const model = contextWindowPillModel(null);
    expect(model).toMatchObject({
      ringPercent: null,
      tone: "normal",
      usedTokens: null,
      maxTokens: null,
      remainingTokens: null,
      usedPercent: null,
      label: null,
    });
  });

  it("formats a used / max label with a rounded percent", () => {
    const model = contextWindowPillModel(snapshot());
    expect(model.label).toBe("128k / 200k (64%)");
    expect(model.ringPercent).toBe(64);
    expect(model.usedPercent).toBe(64);
    expect(model.remainingTokens).toBe(72_000);
    expect(model.tone).toBe("normal");
    expect(model.autoCompactPercent).toBe(80);
  });

  it("derives the percent from the tokens when the snapshot percentage is stale or missing", () => {
    const model = contextWindowPillModel(snapshot({ usedPercentage: null }));
    expect(model.usedPercent).toBe(64);
    expect(model.ringPercent).toBe(64);
  });

  it.each([
    [79, "normal"],
    [80, "warning"],
    [89, "warning"],
    [90, "error"],
    [100, "error"],
  ] as const)("tones %i%% as %s", (percent, tone) => {
    expect(contextWindowTone(percent)).toBe(tone);
    expect(
      contextWindowPillModel(snapshot({ usedTokens: percent * 1_000, maxTokens: 100_000 })).tone,
    ).toBe(tone);
  });

  it("shows used tokens alone when the maximum is unknown", () => {
    const model = contextWindowPillModel(snapshot({ maxTokens: null, usedPercentage: null }));
    expect(model.label).toBe("128k");
    expect(model.ringPercent).toBeNull();
    expect(model.remainingTokens).toBeNull();
    expect(model.usedPercent).toBeNull();
    expect(model.tone).toBe("normal");
    expect(model.autoCompactPercent).toBeNull();
  });

  it("clamps a window used past its maximum", () => {
    const model = contextWindowPillModel(snapshot({ usedTokens: 250_000 }));
    expect(model.ringPercent).toBe(100);
    expect(model.label).toBe("250k / 200k (100%)");
    expect(model.remainingTokens).toBe(0);
    expect(model.tone).toBe("error");
  });

  it("guards zero, negative, and NaN maxima", () => {
    for (const maxTokens of [0, -1, Number.NaN]) {
      const model = contextWindowPillModel(snapshot({ maxTokens }));
      expect(model.ringPercent).toBeNull();
      expect(model.maxTokens).toBeNull();
      expect(model.label).toBe("128k");
    }
  });

  it("guards negative and NaN used tokens", () => {
    for (const usedTokens of [-1, Number.NaN]) {
      const model = contextWindowPillModel(snapshot({ usedTokens }));
      expect(model.usedTokens).toBe(0);
      expect(model.label).toBe("0 / 200k (0%)");
      expect(model.ringPercent).toBe(0);
      expect(Number.isNaN(model.ringPercent)).toBe(false);
      expect(Number.isNaN(model.usedPercent)).toBe(false);
    }
  });

  it("clamps an auto-compact threshold above the window", () => {
    const model = contextWindowPillModel(snapshot({ autoCompactThreshold: 250_000 }));
    expect(model.autoCompactPercent).toBe(100);
    expect(
      contextWindowPillModel(snapshot({ autoCompactThreshold: null })).autoCompactPercent,
    ).toBe(null);
  });

  it("rounds and clamps the displayed percent", () => {
    expect(formatContextWindowPercent(64.4)).toBe("64%");
    expect(formatContextWindowPercent(64.6)).toBe("65%");
    expect(formatContextWindowPercent(-3)).toBe("0%");
    expect(formatContextWindowPercent(180)).toBe("100%");
  });
});

import { expect, it } from "vite-plus/test";
import { environmentPageSnap } from "./environment-page-snap";

it("settles a drag or flick onto the adjacent page in either direction", () => {
  for (const direction of [-1, 1]) {
    expect(environmentPageSnap(direction * 100, 0, 400, false)).toBe(direction * 400);
    expect(environmentPageSnap(direction * 30, direction * 800, 400, false)).toBe(direction * 400);
  }
});

it("returns to the same page after a short drag, reversed flick, or interruption", () => {
  expect(environmentPageSnap(48, 50, 400, false)).toBe(0);
  expect(environmentPageSnap(30, -900, 400, false)).toBe(0);
  expect(environmentPageSnap(-150, -900, 400, true)).toBe(0);
});

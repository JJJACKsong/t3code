export function environmentPageSnap(x: number, velocity: number, width: number, canceled: boolean) {
  "worklet";
  if (canceled || width <= 0) return 0;
  const flick =
    Math.abs(x) >= 20 && Math.sign(velocity) === Math.sign(x) && Math.abs(velocity) > 650;
  return Math.abs(x) >= width * 0.24 || flick ? Math.sign(x) * width : 0;
}

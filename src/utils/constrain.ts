export function constrain(n: number, low: number, high: number): number {
  return Math.max(Math.min(n, high), low);
}

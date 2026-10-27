/** Parses a slope angle in degrees (Dutch comma allowed); accepts 1 to 89, as the schema needs 0 < angle < 90. */
export function parseSlope(text: string): number | null {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value >= 1 && value <= 89 ? value : null;
}

/** Millimetres shown and edited as centimetres (one decimal, Dutch comma). */
export const mmToCm = (mm: number) => String(Math.round(mm) / 10).replace('.', ',');

/** Like cmToMm but accepts 0 (for a sill height at floor level). */
export const cmToMmOrZero = (text: string): number | null => {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 10) : null;
};

export const cmToMm = (text: string): number | null => {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 10) : null;
};

/** Millimetres shown and edited as centimetres (one decimal, Dutch comma). */
export const mmToCm = (mm: number) => String(Math.round(mm) / 10).replace('.', ',');

export const cmToMm = (text: string): number | null => {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 10) : null;
};

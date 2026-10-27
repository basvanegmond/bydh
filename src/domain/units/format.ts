/** All lengths are stored in millimetres; the UI shows cm or m with locale-aware decimals. */
export type UiLocale = 'en' | 'nl';
export type DisplayUnit = 'cm' | 'm';

const INTL_LOCALE: Record<UiLocale, string> = { en: 'en-GB', nl: 'nl-NL' };

function numberFormat(locale: UiLocale, fractionDigits: number): Intl.NumberFormat {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** 4250 → "4.25 m" (en) / "4,25 m" (nl); in cm → "425 cm". */
export function formatLength(mm: number, unit: DisplayUnit, locale: UiLocale): string {
  if (unit === 'cm') {
    const cm = mm / 10;
    return `${numberFormat(locale, Number.isInteger(cm) ? 0 : 1).format(cm)} cm`;
  }
  return `${numberFormat(locale, 2).format(mm / 1000)} m`;
}

/** Square millimetres → "18.6 m²" / "18,6 m²". */
export function formatArea(mm2: number, locale: UiLocale): string {
  return `${numberFormat(locale, 1).format(mm2 / 1_000_000)} m²`;
}

const UNIT_TO_MM = { mm: 1, cm: 10, m: 1000 } as const;
const LENGTH_PATTERN = /^\s*(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*$/i;

/**
 * Parses typed lengths such as "425", "4,25 m", "4.25m", "425cm" or "4250 mm".
 * A bare number is read in `defaultUnit`. Returns millimetres, or null when unparseable.
 */
export function parseLength(input: string, defaultUnit: DisplayUnit): number | null {
  const match = LENGTH_PATTERN.exec(input);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(',', '.'));
  const unit = (match[2]?.toLowerCase() ?? defaultUnit) as keyof typeof UNIT_TO_MM;
  return Math.round(value * UNIT_TO_MM[unit] * 10) / 10;
}

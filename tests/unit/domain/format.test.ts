import { describe, expect, it } from 'vitest';
import { formatArea, formatLength, parseLength } from '@/domain/units/format';

describe('formatLength', () => {
  it('formats metres with locale decimals', () => {
    expect(formatLength(4250, 'm', 'en')).toBe('4.25 m');
    expect(formatLength(4250, 'm', 'nl')).toBe('4,25 m');
  });

  it('formats centimetres, with one decimal only when needed', () => {
    expect(formatLength(4250, 'cm', 'nl')).toBe('425 cm');
    expect(formatLength(4255, 'cm', 'nl')).toBe('425,5 cm');
  });

  it('groups thousands per locale', () => {
    expect(formatLength(1_234_500, 'm', 'en')).toBe('1,234.50 m');
    expect(formatLength(1_234_500, 'm', 'nl')).toBe('1.234,50 m');
  });
});

describe('formatArea', () => {
  it('converts mm² to m² with one decimal', () => {
    expect(formatArea(18_600_000, 'nl')).toBe('18,6 m²');
    expect(formatArea(18_600_000, 'en')).toBe('18.6 m²');
  });
});

describe('parseLength', () => {
  it.each([
    ['425', 'cm', 4250],
    ['4,25', 'm', 4250],
    ['4.25 m', 'cm', 4250],
    ['425cm', 'm', 4250],
    ['4250 mm', 'm', 4250],
    [' 3,5M ', 'cm', 3500],
  ] as const)('parses %j (default %s) as %d mm', (input, unit, expected) => {
    expect(parseLength(input, unit)).toBe(expected);
  });

  it.each(['', 'abc', '4,2,5', '12 km', '--3'])('rejects %j', (input) => {
    expect(parseLength(input, 'm')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { calibrate, imageToPlan, planToImage, underlaySizeMm } from '@/domain/model/underlay';
import { PRESET_MATERIALS, floorFinishFor } from '@/data/materials';

const underlay = { position: { x: 1000, y: 5000 }, rotationDeg: 0, mmPerPx: 10, imagePx: { w: 800, h: 600 } };

describe('underlay transform', () => {
  it('maps the image top-left to its position and y downwards', () => {
    expect(imageToPlan(underlay, { x: 0, y: 0 })).toEqual({ x: 1000, y: 5000 });
    expect(imageToPlan(underlay, { x: 100, y: 50 })).toEqual({ x: 2000, y: 4500 });
  });

  it('round-trips with rotation', () => {
    const rotated = { ...underlay, rotationDeg: 33 };
    const back = planToImage(rotated, imageToPlan(rotated, { x: 123, y: 456 }));
    expect(back.x).toBeCloseTo(123);
    expect(back.y).toBeCloseTo(456);
  });

  it('calibrates from two points and keeps the first point fixed', () => {
    const a = imageToPlan(underlay, { x: 100, y: 100 });
    const b = imageToPlan(underlay, { x: 300, y: 100 }); // 200 px apart
    const result = calibrate(underlay, a, b, 5620)!;
    expect(result.mmPerPx).toBeCloseTo(28.1);
    const moved = { ...underlay, ...result };
    const aAfter = imageToPlan(moved, { x: 100, y: 100 });
    expect(aAfter.x).toBeCloseTo(a.x);
    expect(aAfter.y).toBeCloseTo(a.y);
    expect(underlaySizeMm(moved).w).toBeCloseTo(800 * 28.1);
  });

  it('rejects degenerate calibrations', () => {
    expect(calibrate(underlay, { x: 0, y: 0 }, { x: 1, y: 0 }, 1000)).toBeNull();
    expect(calibrate(underlay, { x: 0, y: 0 }, { x: 5000, y: 0 }, 0)).toBeNull();
  });
});

describe('material presets', () => {
  it('load and validate from data', () => {
    expect(PRESET_MATERIALS.length).toBeGreaterThan(5);
    expect(new Set(PRESET_MATERIALS.map((m) => m.id)).size).toBe(PRESET_MATERIALS.length);
  });

  it('suggest a pattern per material', () => {
    const byId = (id: string) => PRESET_MATERIALS.find((m) => m.id === id)!;
    expect(floorFinishFor(byId('oak-herringbone')).pattern).toBe('herringbone');
    expect(floorFinishFor(byId('tile-light')).pattern).toBe('tile');
    expect(floorFinishFor(byId('concrete-polished')).pattern).toBe('seamless');
  });
});

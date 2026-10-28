import { describe, expect, it } from 'vitest';
import {
  cutScale,
  eyePose,
  frameBox,
  isWallCut,
  longestAxis,
  pickRoom,
  roomEyePose,
  walk,
} from '@/render3d/camera';

const sq = (w: number, h: number) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

describe('frameBox', () => {
  it('targets the box centre at mid wall height and looks down about 50 degrees', () => {
    const pose = frameBox({ min: { x: 0, y: 0 }, max: { x: 8000, y: 6000 } }, 2700, 2.6);
    expect(pose.target[0]).toBeCloseTo(4);
    expect(pose.target[2]).toBeCloseTo(-3);
    expect(pose.target[1]).toBeCloseTo(2.7 + 1.3);
    const dy = pose.position[1] - pose.target[1];
    const horiz = Math.hypot(pose.position[0] - pose.target[0], pose.position[2] - pose.target[2]);
    expect((Math.atan2(dy, horiz) * 180) / Math.PI).toBeCloseTo(50, 0);
  });
  it('moves further away for bigger boxes', () => {
    const dist = (w: number) => {
      const p = frameBox({ min: { x: 0, y: 0 }, max: { x: w, y: w } }, 0);
      return Math.hypot(
        p.position[0] - p.target[0],
        p.position[1] - p.target[1],
        p.position[2] - p.target[2],
      );
    };
    expect(dist(20000)).toBeGreaterThan(dist(5000));
  });
  it('handles a missing box', () => {
    expect(frameBox(null, 0).position.every(Number.isFinite)).toBe(true);
  });
});

describe('inside view', () => {
  it('puts the eye 1.6 m above the floor and looks horizontally', () => {
    const pose = eyePose({ x: 1000, y: 2000 }, 2700, { x: 1, y: 0 });
    expect(pose.position[1]).toBeCloseTo(4.3);
    expect([pose.position[0], pose.position[2]]).toEqual([1, -2]);
    expect(pose.target[1]).toBe(pose.position[1]);
    expect(pose.target[0]).toBeGreaterThan(pose.position[0]);
  });
  it('looks along the longest axis', () => {
    expect(longestAxis(sq(5000, 3000))).toEqual({ x: 1, y: 0 });
    expect(longestAxis(sq(3000, 5000))).toEqual({ x: 0, y: 1 });
  });
  it('maps plan north to scene -z', () => {
    const room = { roomId: 'r', area: 1, labelPoint: { x: 0, y: 0 }, polygon: sq(3000, 5000) };
    const pose = roomEyePose(room, 0);
    expect(pose.target[2]).toBeLessThan(pose.position[2]);
  });
  it('picks the selected room, else the largest', () => {
    const a = { roomId: 'a', area: 5, labelPoint: { x: 0, y: 0 }, polygon: [] };
    const b = { ...a, roomId: 'b', area: 9 };
    expect(pickRoom([a, b], 'a')).toBe(a);
    expect(pickRoom([a, b], null)).toBe(b);
    expect(pickRoom([], null)).toBeNull();
  });
  it('walks along the view direction and sideways', () => {
    const pose = {
      position: [0, 1.6, 0] as [number, number, number],
      target: [0, 1.6, -0.1] as [number, number, number],
    };
    expect(walk(pose, 1).position[2]).toBeCloseTo(-1);
    expect(walk(pose, 1, true).position[0]).toBeCloseTo(1);
  });
});

describe('isWallCut', () => {
  const centre = { x: 3000, y: 2000 };
  const target = centre;
  const south = { a: { x: 0, y: 0 }, b: { x: 6000, y: 0 } };
  const north = { a: { x: 6000, y: 4000 }, b: { x: 0, y: 4000 } };
  it('cuts the near outer wall and keeps the far one', () => {
    const camera = { x: 3000, y: -10000 }; // south of the house
    expect(isWallCut({ ...south, centre, target, camera })).toBe(true);
    expect(isWallCut({ ...north, centre, target, camera })).toBe(false);
  });
  it('is independent of wall direction', () => {
    const camera = { x: 3000, y: -10000 };
    expect(isWallCut({ a: south.b, b: south.a, centre, target, camera })).toBe(true);
  });
  it('does not cut a wall whose outer side faces away from the camera', () => {
    const camera = { x: 3000, y: 1000 }; // inside the house
    expect(isWallCut({ ...south, centre, target, camera })).toBe(false);
  });
});

describe('cutScale', () => {
  it('brings a 2.6 m wall down to 0.3 m', () => {
    expect(cutScale(2.6) * 2.6).toBeCloseTo(0.3);
    expect(cutScale(0.2)).toBe(1);
  });
});

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { boundingBox } from '@/domain/geometry/polygon';
import { floorGeometry } from '@/domain/model/floorGeometry';
import { mainBuilding, orderedFloors, resolveFloor } from '@/domain/model/project';
import { floorElevations } from '@/domain/schema';
import type { Project } from '@/domain/schema';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { floorBox, frameBox, isWallCut, pickRoom, roomEyePose, walk } from './camera';
import type { CameraPose, Vec3 } from './camera';

const toArr = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];

export interface OrbitLike {
  target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
  update: () => void;
}

const KEYS: Record<string, [number, boolean]> = {
  w: [0.3, false],
  arrowup: [0.3, false],
  s: [-0.3, false],
  arrowdown: [-0.3, false],
  a: [-0.3, true],
  arrowleft: [-0.3, true],
  d: [0.3, true],
  arrowright: [0.3, true],
};

/**
 * Frames the active floor when a project, floor or "reset view" changes (not on every edit), and puts the
 * camera at eye height inside a room in inside view, restoring the orbit camera when it ends.
 */
export function CameraRig({ project, inside }: { project: Project; inside: boolean }) {
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);
  const dom = useThree((s) => s.gl.domElement);
  const tick = useViewStore((s) => s.resetViewTick);
  const activeFloorId = useViewStore((s) => s.activeFloorId);
  const saved = useRef<CameraPose | null>(null);
  const lastTick = useRef(tick);
  const projectId = project.id;
  const variantId = project.activeVariantId;

  useEffect(() => {
    if (!controls) return;
    const apply = (pose: CameraPose) => {
      camera.position.set(...pose.position);
      controls.target.set(...pose.target);
      controls.update();
      invalidate();
    };
    const current = useProjectStore.getState().project;
    const building = mainBuilding(current);
    const floor = resolveFloor(current, activeFloorId);
    const elevation = building && floor ? (floorElevations(building)[floor.id] ?? 0) : 0;
    const reset = lastTick.current !== tick;
    lastTick.current = tick;
    if (inside && floor) {
      const selection = useViewStore.getState().selection;
      const room = pickRoom(
        Object.values(floorGeometry(floor).rooms),
        selection?.kind === 'room' ? selection.id : null,
      );
      if (room) {
        saved.current ??= { position: toArr(camera.position), target: toArr(controls.target) };
        apply(roomEyePose(room, elevation));
        return;
      }
      useViewStore.setState({ insideView: false });
    }
    if (saved.current && !reset) {
      apply(saved.current);
    } else {
      const all = orderedFloors(current).flatMap((f) => Object.values(f.wallNodes).map((n) => n.position));
      apply(frameBox(floorBox(floor) ?? boundingBox(all), elevation, floor ? floor.height / 1000 : 2.6));
    }
    saved.current = null;
  }, [projectId, variantId, activeFloorId, tick, inside, camera, controls, invalidate]);

  // A wider lens inside a room, where walls are close.
  useEffect(() => {
    const persp = get().camera as { fov?: number; updateProjectionMatrix?: () => void };
    if (persp.fov === undefined) return;
    persp.fov = inside ? 70 : 45;
    persp.updateProjectionMatrix?.();
    invalidate();
  }, [inside, get, invalidate]);

  // Walking in inside view: wheel and arrow / WASD keys move the eye along the view direction.
  useEffect(() => {
    if (!inside || !controls) return;
    const move = (step: number, strafe: boolean) => {
      const pose = walk({ position: toArr(camera.position), target: toArr(controls.target) }, step, strafe);
      camera.position.set(...pose.position);
      controls.target.set(...pose.target);
      controls.update();
      invalidate();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      move(e.deltaY < 0 ? 0.3 : -0.3, false);
    };
    const onKey = (e: KeyboardEvent) => {
      const action = KEYS[e.key.toLowerCase()];
      if (!action || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      move(action[0], action[1]);
    };
    const onDown = () => dom.focus({ preventScroll: true });
    dom.setAttribute('tabindex', '0');
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('keydown', onKey);
    dom.addEventListener('pointerdown', onDown);
    return () => {
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('keydown', onKey);
      dom.removeEventListener('pointerdown', onDown);
    };
  }, [inside, controls, camera, dom, invalidate]);
  return null;
}

export interface CutWall {
  id: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
  centre: { x: number; y: number };
}

/**
 * Watches the camera and reports which walls are cut away. Runs in the render loop but only sets state
 * when the set of cut walls actually changes.
 */
export function CutawayDriver({
  walls,
  enabled,
  onChange,
}: {
  walls: CutWall[];
  enabled: boolean;
  onChange: (ids: ReadonlySet<string>) => void;
}) {
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;
  const invalidate = useThree((s) => s.invalidate);
  const lastKey = useRef('');
  useEffect(() => {
    lastKey.current = '\u0000';
    invalidate();
  }, [walls, enabled, controls, invalidate]);
  useFrame(({ camera }) => {
    const ids: string[] = [];
    if (enabled && controls) {
      const cam = { x: camera.position.x * 1000, y: -camera.position.z * 1000 };
      const target = { x: controls.target.x * 1000, y: -controls.target.z * 1000 };
      for (const w of walls) {
        if (isWallCut({ a: w.a, b: w.b, centre: w.centre, target, camera: cam })) ids.push(w.id);
      }
    }
    const key = ids.join(',');
    if (key === lastKey.current) return;
    lastKey.current = key;
    onChange(new Set(ids));
  });
  return null;
}

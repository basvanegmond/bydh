import { useRef, useState } from 'react';
import { add, sub } from '@/domain/geometry/vec2';
import { nearestWall, placeOpening } from '@/domain/model/openings';
import { findFloor } from '@/domain/model/project';
import { deleteWall, moveNode, moveWall, wallsAtNode } from '@/domain/model/walls';
import type { Floor, Id, Vec2 } from '@/domain/schema';
import { snapPoint } from '@/domain/snapping/snap';
import type { SnapResult } from '@/domain/snapping/snap';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { snapTargets } from '../planData';
import { planToScreen } from '../viewport';
import { SnapMarker } from './ToolHint';
import { entityAt } from './types';
import type { ToolContext, ToolHandlers } from './types';

type Drag =
  | { kind: 'node'; nodeId: Id; startScreen: Vec2; started: boolean; current: Vec2 }
  | { kind: 'wall'; wallId: Id; startScreen: Vec2; started: boolean; startPlan: Vec2; applied: Vec2 }
  | { kind: 'underlay'; id: Id; startScreen: Vec2; started: boolean; last: Vec2 }
  | { kind: 'opening'; id: Id; startScreen: Vec2; started: boolean };

/** Pixels the pointer must travel before a press becomes a drag (so clicks never nudge walls). */
const DRAG_THRESHOLD_PX = 4;
/** True when any wall touching one of these nodes is locked (moving the node would move it). */
const touchesLocked = (floor: Floor, nodeIds: Id[]): boolean =>
  nodeIds.some((id) => wallsAtNode(floor, id).some((w) => w.locked));
/** Pointer distance (in snap radii) within which a dragged opening still jumps to a wall. */
const OPENING_DRAG_REACH = 4;
const openingWallLocked = (floor: Floor, wallId: Id) => floor.walls[wallId]?.locked === true;

/** Moves an opening to the wall point under the pointer, if it fits there; otherwise leaves it alone. */
function dragOpening(floorId: Id | null, id: Id, p: Vec2, toleranceMm: number): void {
  const store = useProjectStore.getState();
  const floor = findFloor(store.project, floorId);
  const opening = floor?.openings[id];
  if (!floor || !opening) return;
  const hit = nearestWall(floor, p, toleranceMm * OPENING_DRAG_REACH);
  if (!hit || openingWallLocked(floor, hit.wallId)) return;
  const placed = placeOpening(floor, opening, hit.wallId, hit.offset, id);
  if (!placed || (placed.wallId === opening.wallId && placed.offset === opening.offset)) return;
  store.editFloor('Move opening', floorId, (f) => {
    const o = f.openings[id];
    if (o) {
      o.wallId = placed.wallId;
      o.offset = placed.offset;
    }
  });
}

const roundTo = (value: number, step: number) => (step > 0 ? Math.round(value / step) * step : value);

export function useSelectTool(ctx: ToolContext): ToolHandlers {
  const { editFloor, beginTransaction, commitTransaction } = useProjectStore.getState();
  const selection = useViewStore((s) => s.selection);
  const select = useViewStore((s) => s.select);
  const drag = useRef<Drag | null>(null);
  const [nodeSnap, setNodeSnap] = useState<SnapResult | null>(null);
  const floor = ctx.floor;

  const onPointerDown: ToolHandlers['onPointerDown'] = (e, p) => {
    if (e.button !== 0 || !floor) return;
    const hit = entityAt(e);
    const startScreen = { x: e.clientX, y: e.clientY };
    if (hit?.kind === 'node') {
      if (touchesLocked(floor, [hit.id])) return;
      drag.current = { kind: 'node', nodeId: hit.id, startScreen, started: false, current: p };
    } else if (hit?.kind === 'wall') {
      select({ kind: 'wall', id: hit.id });
      const wall = floor.walls[hit.id];
      if (wall && !touchesLocked(floor, [wall.startNodeId, wall.endNodeId])) {
        drag.current = {
          kind: 'wall',
          wallId: hit.id,
          startScreen,
          started: false,
          startPlan: p,
          applied: { x: 0, y: 0 },
        };
      }
    } else if (hit?.kind === 'opening') {
      select({ kind: 'opening', id: hit.id });
      const host = floor.openings[hit.id]?.wallId;
      if (host && !openingWallLocked(floor, host))
        drag.current = { kind: 'opening', id: hit.id, startScreen, started: false };
    } else if (hit?.kind === 'room') {
      select({ kind: 'room', id: hit.id });
    } else if (hit?.kind === 'underlay') {
      select({ kind: 'underlay', id: hit.id });
      if (!floor.underlays[hit.id]?.locked)
        drag.current = { kind: 'underlay', id: hit.id, startScreen, started: false, last: p };
    } else {
      select(null);
    }
    if (drag.current) e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove: ToolHandlers['onPointerMove'] = (e, p) => {
    const d = drag.current;
    if (!d) return;
    if (d.started && !useProjectStore.getState().transaction) {
      // The transaction was closed under us (tool switch, undo button): abandon the drag.
      drag.current = null;
      setNodeSnap(null);
      return;
    }
    if (!d.started) {
      if (Math.hypot(e.clientX - d.startScreen.x, e.clientY - d.startScreen.y) < DRAG_THRESHOLD_PX) return;
      d.started = true;
      beginTransaction(
        d.kind === 'underlay'
          ? 'Move background'
          : d.kind === 'node'
            ? 'Move corner'
            : d.kind === 'opening'
              ? 'Move opening'
              : 'Move wall',
      );
    }
    if (d.kind === 'node') {
      const snapped = snapPoint(p, {
        ...snapTargets(floor, [d.nodeId], ctx.ghostFloor),
        gridMm: ctx.gridMm,
        toleranceMm: ctx.toleranceMm,
      });
      d.current = snapped.point;
      setNodeSnap(snapped);
      // No merging mid-drag: passing over another corner must not join them.
      editFloor('Move corner', ctx.floorId, (f) => void moveNode(f, d.nodeId, snapped.point, -1));
    } else if (d.kind === 'wall') {
      const total = sub(p, d.startPlan);
      const snapped = { x: roundTo(total.x, ctx.gridMm), y: roundTo(total.y, ctx.gridMm) };
      const step = sub(snapped, d.applied);
      if (step.x === 0 && step.y === 0) return;
      d.applied = snapped;
      editFloor('Move wall', ctx.floorId, (f) => moveWall(f, d.wallId, step));
    } else if (d.kind === 'opening') {
      dragOpening(ctx.floorId, d.id, p, ctx.toleranceMm);
    } else {
      const step = sub(p, d.last);
      d.last = p;
      editFloor('Move background', ctx.floorId, (f) => {
        const u = f.underlays[d.id];
        if (u) u.position = add(u.position, step);
      });
    }
  };

  const onPointerUp: ToolHandlers['onPointerUp'] = () => {
    const d = drag.current;
    drag.current = null;
    setNodeSnap(null);
    if (!d?.started || !useProjectStore.getState().transaction) return;
    if (d.kind === 'node') {
      // Dropped on another corner: join them.
      editFloor('Move corner', ctx.floorId, (f) => void moveNode(f, d.nodeId, d.current, 1));
    }
    commitTransaction();
  };

  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (e.key === 'Escape' && selection) {
      select(null);
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection && floor) {
      if (selection.kind === 'wall' && !floor.walls[selection.id]?.locked) {
        editFloor('Delete wall', ctx.floorId, (f) => deleteWall(f, selection.id));
        select(null);
        return true;
      }
      const host = selection.kind === 'opening' ? floor.openings[selection.id]?.wallId : undefined;
      if (host && !openingWallLocked(floor, host)) {
        editFloor('Delete opening', ctx.floorId, (f) => {
          delete f.openings[selection.id];
        });
        select(null);
        return true;
      }
      if (selection.kind === 'underlay' && !floor.underlays[selection.id]?.locked) {
        editFloor('Delete background', ctx.floorId, (f) => {
          delete f.underlays[selection.id];
        });
        select(null);
        return true;
      }
    }
    return false;
  };

  const selectedWall = selection?.kind === 'wall' ? floor?.walls[selection.id] : undefined;
  const handles =
    selectedWall && floor && !touchesLocked(floor, [selectedWall.startNodeId, selectedWall.endNodeId])
      ? [selectedWall.startNodeId, selectedWall.endNodeId]
      : [];
  const snapScreen = nodeSnap ? planToScreen(ctx.view, nodeSnap.point) : null;

  const overlay = (
    <g data-testid="select-overlay">
      {handles.map((nodeId) => {
        const node = floor?.wallNodes[nodeId];
        if (!node) return null;
        const s = planToScreen(ctx.view, node.position);
        return (
          <circle
            key={nodeId}
            cx={s.x}
            cy={s.y}
            r={6}
            fill="var(--plan-paper)"
            stroke="var(--plan-selection)"
            strokeWidth={2}
            className="cursor-move"
            data-entity={`node:${nodeId}`}
            data-testid="node-handle"
          />
        );
      })}
      {snapScreen && nodeSnap && <SnapMarker x={snapScreen.x} y={snapScreen.y} kind={nodeSnap.kind} />}
    </g>
  );

  return { onPointerDown, onPointerMove, onPointerUp, onKeyDown, overlay, html: null, cursor: 'default' };
}

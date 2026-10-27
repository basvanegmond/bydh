import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createStair, directionDeg, floorAbove, STAIR_ANGLE_STEP_DEG } from '@/domain/model/stairPlacement';
import { mainBuilding, findFloor } from '@/domain/model/project';
import type { Vec2 } from '@/domain/schema';
import { snapPoint } from '@/domain/snapping/snap';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { snapTargets } from '../planData';
import { StairPreview } from '../layers/StairLayer';
import { ToolHint } from './ToolHint';
import type { ToolContext, ToolHandlers } from './types';

/** Stair placement: click the bottom step, then click the direction (Shift snaps to 15 degrees). */
export function useStairTool(ctx: ToolContext): ToolHandlers {
  const { t } = useTranslation();
  const select = useViewStore((s) => s.select);
  const hasAbove = useProjectStore((s) => {
    const building = mainBuilding(s.project);
    return !!(building && ctx.floorId && floorAbove(building, ctx.floorId));
  });
  const [anchor, setAnchor] = useState<Vec2 | null>(null);
  const [hover, setHover] = useState<Vec2 | null>(null);
  const [shift, setShift] = useState(false);

  const snap = (raw: Vec2): Vec2 =>
    snapPoint(raw, {
      ...snapTargets(ctx.floor, [], ctx.ghostFloor),
      gridMm: ctx.gridMm,
      toleranceMm: ctx.toleranceMm,
    }).point;

  const place = (at: Vec2, rotationDeg: number) => {
    const project = useProjectStore.getState().project;
    const building = mainBuilding(project);
    const from = findFloor(project, ctx.floorId);
    const to = building && from ? floorAbove(building, from.id) : undefined;
    if (!building || !from || !to) return;
    const stair = createStair(from, to.id, at, rotationDeg);
    useProjectStore.getState().edit('Add stair', (draft) => {
      const b = mainBuilding(draft);
      if (b) b.stairs[stair.id] = stair;
    });
    select({ kind: 'stair', id: stair.id });
  };

  const onPointerDown: ToolHandlers['onPointerDown'] = (e, p) => {
    if (e.button !== 0 || !ctx.floor || !hasAbove) return;
    if (!anchor) {
      setAnchor(snap(p));
      return;
    }
    place(anchor, directionDeg(anchor, p, e.shiftKey ? STAIR_ANGLE_STEP_DEG : 0));
    setAnchor(null);
  };

  const onPointerMove: ToolHandlers['onPointerMove'] = (e, p) => {
    setShift(e.shiftKey);
    setHover(anchor ? p : snap(p));
  };

  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (e.key !== 'Escape') return false;
    if (anchor) setAnchor(null);
    else useViewStore.getState().setTool('select');
    return true;
  };

  const preview =
    ctx.floor && hasAbove && hover
      ? createStair(
          ctx.floor,
          'preview',
          anchor ?? hover,
          anchor ? directionDeg(anchor, hover, shift ? STAIR_ANGLE_STEP_DEG : 0) : 0,
        )
      : null;
  const { view } = ctx;
  const overlay = (
    <g
      transform={`matrix(${view.scale} 0 0 ${-view.scale} ${view.offsetX} ${view.offsetY})`}
      pointerEvents="none"
      data-testid="stair-tool-overlay"
    >
      {preview && <StairPreview stair={preview} />}
    </g>
  );

  const hint = !hasAbove
    ? t('stairs.hint.noFloorAbove')
    : anchor
      ? t('stairs.hint.direction')
      : t('stairs.hint.start');
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: () => undefined,
    onKeyDown,
    overlay,
    html: <ToolHint>{hint}</ToolHint>,
    cursor: hasAbove ? 'crosshair' : 'not-allowed',
  };
}

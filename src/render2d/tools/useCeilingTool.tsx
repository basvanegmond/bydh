import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { planeFromClicks, MIN_EAVE_LENGTH_MM } from '@/domain/model/ceilingTools';
import { distance } from '@/domain/geometry/vec2';
import type { Vec2 } from '@/domain/schema';
import { snapPoint } from '@/domain/snapping/snap';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { snapTargets } from '../planData';
import { planToScreen } from '../viewport';
import { SnapMarker, ToolHint } from './ToolHint';
import type { ToolContext, ToolHandlers } from './types';

/** Ceiling plane tool: click the two eave points, then click on the side that rises. */
export function useCeilingTool(ctx: ToolContext): ToolHandlers {
  const { t } = useTranslation();
  const editFloor = useProjectStore((s) => s.editFloor);
  const select = useViewStore((s) => s.select);
  const defaults = useViewStore((s) => s.ceilingDefaults);
  const [points, setPoints] = useState<Vec2[]>([]);
  const [hover, setHover] = useState<{ point: Vec2; kind: string } | null>(null);

  const snap = (p: Vec2) => {
    const r = snapPoint(p, {
      ...snapTargets(ctx.floor, [], ctx.ghostFloor),
      gridMm: ctx.gridMm,
      toleranceMm: ctx.toleranceMm,
    });
    return { point: r.point, kind: r.kind as string };
  };

  const onPointerDown: ToolHandlers['onPointerDown'] = (e, p) => {
    if (e.button !== 0 || !ctx.floor) return;
    if (points.length < 2) {
      const q = snap(p).point;
      const [first] = points;
      if (first && distance(first, q) < MIN_EAVE_LENGTH_MM) return;
      setPoints([...points, q]);
      return;
    }
    const [a, b] = points;
    // The third click is free (no snapping): it only chooses the side.
    const plane = a && b ? planeFromClicks(a, b, p, defaults.kneeHeight, defaults.slopeDeg) : null;
    if (!plane) return;
    editFloor('Add ceiling plane', ctx.floorId, (f) => {
      f.ceilingPlanes[plane.id] = plane;
    });
    select({ kind: 'ceilingPlane', id: plane.id });
    setPoints([]);
  };

  const onPointerMove: ToolHandlers['onPointerMove'] = (_e, p) => {
    setHover(points.length < 2 ? snap(p) : { point: p, kind: 'free' });
  };

  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (e.key !== 'Escape') return false;
    if (points.length > 0) setPoints([]);
    else useViewStore.getState().setTool('select');
    return true;
  };

  const shown = [...points, ...(hover && points.length < 2 ? [hover.point] : [])];
  const screen = shown.map((p) => planToScreen(ctx.view, p));
  const side = points.length === 2 && hover ? planToScreen(ctx.view, hover.point) : null;
  const hintKey = ['ceilings.hint.first', 'ceilings.hint.second', 'ceilings.hint.side'][points.length];
  const snapScreen = hover && points.length < 2 ? planToScreen(ctx.view, hover.point) : null;

  const overlay = (
    <g data-testid="ceiling-tool-overlay" pointerEvents="none">
      {screen.length >= 2 && screen[0] && screen[1] && (
        <line
          x1={screen[0].x}
          y1={screen[0].y}
          x2={screen[1].x}
          y2={screen[1].y}
          stroke="var(--plan-ceiling)"
          strokeWidth={2}
          strokeDasharray="12 4 2 4"
        />
      )}
      {side && (
        <circle cx={side.x} cy={side.y} r={4} fill="none" stroke="var(--plan-ceiling)" strokeWidth={2} />
      )}
      {snapScreen && hover && <SnapMarker x={snapScreen.x} y={snapScreen.y} kind={hover.kind} />}
    </g>
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: () => undefined,
    onKeyDown,
    overlay,
    html: <ToolHint>{t(hintKey ?? 'ceilings.hint.first')}</ToolHint>,
    cursor: 'crosshair',
  };
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_DOOR, DEFAULT_WINDOW, nearestWall, placeOpening } from '@/domain/model/openings';
import type { OpeningSpec, PlacedOpening } from '@/domain/model/openings';
import type { Floor, Id, Opening, Vec2 } from '@/domain/schema';
import { newId } from '@/domain/schema/factories';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { OpeningSymbol } from '../layers/OpeningSymbol';
import { ToolHint } from './ToolHint';
import type { ToolContext, ToolHandlers } from './types';

/** How far from a wall (in snap radii) the pointer still counts as pointing at it. */
export const OPENING_REACH = 2.5;

interface Candidate {
  wallId: Id;
  /** Where the pointer projects on the wall. */
  offset: number;
  /** The clamped placement, or null when nothing fits (preview turns red). */
  placed: PlacedOpening | null;
}

/** Pure: the opening a tool would place at the pointer, or null when no wall is near. */
export function candidateAt(floor: Floor, spec: OpeningSpec, p: Vec2, toleranceMm: number): Candidate | null {
  const hit = nearestWall(floor, p, toleranceMm);
  if (!hit) return null;
  const locked = floor.walls[hit.wallId]?.locked === true;
  const placed = locked ? null : placeOpening(floor, spec, hit.wallId, hit.offset);
  return { wallId: hit.wallId, offset: hit.offset, placed };
}

/** Door and window placement: a preview follows the nearest wall, a click places the opening. */
export function useOpeningTool(ctx: ToolContext, kind: 'door' | 'window'): ToolHandlers {
  const { t } = useTranslation();
  const editFloor = useProjectStore((s) => s.editFloor);
  const select = useViewStore((s) => s.select);
  const size = useViewStore((s) => s.openingDefaults[kind]);
  const [hover, setHover] = useState<Candidate | null>(null);
  const base = kind === 'door' ? DEFAULT_DOOR : DEFAULT_WINDOW;
  const spec: OpeningSpec = { ...base, ...size };
  const reach = ctx.toleranceMm * OPENING_REACH;

  const onPointerDown: ToolHandlers['onPointerDown'] = (e, p) => {
    if (e.button !== 0 || !ctx.floor) return;
    const candidate = candidateAt(ctx.floor, spec, p, reach);
    if (!candidate?.placed) return;
    const id = newId();
    const placed = candidate.placed;
    editFloor(kind === 'door' ? 'Add door' : 'Add window', ctx.floorId, (f) => {
      f.openings[id] = { id, ...placed };
    });
    select({ kind: 'opening', id });
  };

  const onPointerMove: ToolHandlers['onPointerMove'] = (_e, p) =>
    setHover(ctx.floor ? candidateAt(ctx.floor, spec, p, reach) : null);

  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (e.key !== 'Escape') return false;
    useViewStore.getState().setTool('select');
    return true;
  };

  let preview: { opening: Opening; invalid: boolean } | null = null;
  if (hover && ctx.floor) {
    const shape = hover.placed ?? { ...spec, wallId: hover.wallId, offset: hover.offset };
    preview = { opening: { id: 'preview', ...shape } as Opening, invalid: !hover.placed };
  }
  const { view } = ctx;
  const overlay = (
    <g
      transform={`matrix(${view.scale} 0 0 ${-view.scale} ${view.offsetX} ${view.offsetY})`}
      pointerEvents="none"
      data-testid="opening-tool-overlay"
      data-invalid={preview?.invalid ? 'true' : undefined}
    >
      {preview && ctx.floor && (
        <OpeningSymbol
          floor={ctx.floor}
          opening={preview.opening}
          visual={preview.invalid ? 'invalid' : 'preview'}
        />
      )}
    </g>
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: () => undefined,
    onKeyDown,
    overlay,
    html: <ToolHint>{t(`openings.hint.${kind}`)}</ToolHint>,
    cursor: 'crosshair',
  };
}

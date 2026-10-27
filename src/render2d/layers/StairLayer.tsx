import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { normalize, sub } from '@/domain/geometry/vec2';
import { stairGeometry } from '@/domain/model/stairs';
import type { Id, Stair, Vec2 } from '@/domain/schema';
import { pointsAttr } from '../planData';

const ARROW_HEAD_MM = 160;
const LABEL_MM = 200;

/** Arrow head at `tip`, pointing along `dir` (a unit vector). */
function arrowHead(tip: Vec2, dir: Vec2): string {
  const back = { x: tip.x - dir.x * ARROW_HEAD_MM, y: tip.y - dir.y * ARROW_HEAD_MM };
  const side = { x: -dir.y * ARROW_HEAD_MM * 0.5, y: dir.x * ARROW_HEAD_MM * 0.5 };
  return pointsAttr([
    tip,
    { x: back.x + side.x, y: back.y + side.y },
    { x: back.x - side.x, y: back.y - side.y },
  ]);
}

interface StairSymbolProps {
  stair: Stair;
  /** 'up' = full stair on its lower floor; 'down' = dashed outline on the floor it arrives at. */
  direction: 'up' | 'down';
  selected: boolean;
}

const StairSymbol = memo(function StairSymbol({ stair, direction, selected }: StairSymbolProps) {
  const { t } = useTranslation();
  const geo = useMemo(() => stairGeometry(stair), [stair]);
  const up = direction === 'up';
  const stroke = selected ? 'var(--plan-selection)' : 'var(--plan-wall-edge)';
  const line = geo.walkingLine;
  const first = line[0];
  const second = line[1];
  const last = line[line.length - 1];
  const beforeLast = line[line.length - 2];
  if (!first || !second || !last || !beforeLast) return null;
  // Up arrow ends at the top step; the down arrow ends at the bottom step.
  const tip = up ? last : first;
  const dir = up ? normalize(sub(last, beforeLast)) : normalize(sub(first, second));
  const labelAt = up ? first : last;
  const labelDir = normalize(sub(up ? second : beforeLast, labelAt));
  const label = {
    x: labelAt.x + labelDir.x * LABEL_MM * 1.2,
    y: labelAt.y + labelDir.y * LABEL_MM * 1.2,
  };
  const common = { stroke, fill: 'none', vectorEffect: 'non-scaling-stroke' as const };
  return (
    <g
      data-entity={`stair:${stair.id}`}
      data-testid={`stair-${stair.id}`}
      data-stair-direction={direction}
      data-selected={selected ? 'true' : undefined}
      className="cursor-pointer"
    >
      <polygon
        points={pointsAttr(geo.outline)}
        {...common}
        fill={up ? 'transparent' : 'none'}
        strokeWidth={selected ? 2 : 1.25}
        strokeDasharray={up ? undefined : '6 4'}
        pointerEvents={up ? 'all' : 'stroke'}
        data-part="outline"
      />
      {up &&
        geo.steps.map((step, i) => (
          <polygon key={i} points={pointsAttr(step)} {...common} strokeWidth={0.75} pointerEvents="none" />
        ))}
      <polyline
        points={pointsAttr(line)}
        {...common}
        strokeWidth={1}
        strokeDasharray={up ? undefined : '4 3'}
        pointerEvents="none"
      />
      <polygon points={arrowHead(tip, dir)} fill={stroke} stroke="none" pointerEvents="none" />
      <text
        x={label.x}
        y={-label.y}
        transform="scale(1 -1)"
        fontSize={LABEL_MM}
        fill={stroke}
        textAnchor="middle"
        dominantBaseline="middle"
        pointerEvents="none"
        data-testid={`stair-label-${stair.id}`}
        style={{ userSelect: 'none' }}
      >
        {up ? t('stairs.up') : t('stairs.down')}
      </text>
    </g>
  );
});

interface StairLayerProps {
  stairs: Record<Id, Stair>;
  floorId: Id;
  selectedId: Id | null;
}

/** Stairs of the building on the active floor: full stair on the lower floor, dashed outline on the upper. */
export const StairLayer = memo(function StairLayer({ stairs, floorId, selectedId }: StairLayerProps) {
  return (
    <g data-layer="stairs">
      {Object.values(stairs).map((stair) => {
        const direction = stair.fromFloorId === floorId ? 'up' : stair.toFloorId === floorId ? 'down' : null;
        return direction ? (
          <StairSymbol
            key={stair.id}
            stair={stair}
            direction={direction}
            selected={stair.id === selectedId}
          />
        ) : null;
      })}
    </g>
  );
});

/** Non-interactive preview of a stair being placed. */
export function StairPreview({ stair }: { stair: Stair }) {
  const geo = useMemo(() => stairGeometry(stair), [stair]);
  const common = {
    stroke: 'var(--plan-selection)',
    fill: 'none',
    vectorEffect: 'non-scaling-stroke' as const,
  };
  return (
    <g pointerEvents="none" data-testid="stair-preview">
      <polygon points={pointsAttr(geo.outline)} {...common} fill="var(--plan-selection)" fillOpacity={0.15} />
      {geo.steps.map((step, i) => (
        <polygon key={i} points={pointsAttr(step)} {...common} strokeWidth={0.75} />
      ))}
      <polyline points={pointsAttr(geo.walkingLine)} {...common} />
    </g>
  );
}

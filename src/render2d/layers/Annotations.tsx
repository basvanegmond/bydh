import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomGeometry } from '@/domain/model/rooms';
import { wallLength } from '@/domain/model/walls';
import type { Floor, Id } from '@/domain/schema';
import { formatArea, formatLength } from '@/domain/units/format';
import { currentLocale } from '@/i18n';
import type { Selection } from '@/store/viewStore';
import { planToScreen } from '../viewport';
import type { Viewport } from '../viewport';

/* Screen-space annotations: text stays readable and upright at every zoom level. */

const HALO = {
  paintOrder: 'stroke',
  stroke: 'var(--plan-paper)',
  strokeWidth: 4,
  strokeLinejoin: 'round',
} as const;

export const RoomLabels = memo(function RoomLabels({
  rooms,
  floor,
  view,
}: {
  rooms: Record<Id, RoomGeometry>;
  floor: Floor;
  view: Viewport;
}) {
  const { t } = useTranslation();
  const locale = currentLocale();
  return (
    <g pointerEvents="none" data-layer="room-labels">
      {Object.values(rooms).map((geometry) => {
        const room = floor.rooms[geometry.roomId];
        const p = planToScreen(view, geometry.labelPoint);
        return (
          <text
            key={geometry.roomId}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            className="fill-foreground text-xs"
            {...HALO}
          >
            <tspan x={p.x} dy="-0.2em" className="font-medium" data-testid="room-name">
              {room?.name || t('room.unnamed')}
            </tspan>
            <tspan x={p.x} dy="1.3em" className="fill-muted-foreground" data-testid="room-area">
              {formatArea(geometry.area, locale)}
            </tspan>
          </text>
        );
      })}
    </g>
  );
});

export const WallDimensions = memo(function WallDimensions({
  floor,
  view,
  selection,
  showAll,
}: {
  floor: Floor;
  view: Viewport;
  selection: Selection;
  showAll: boolean;
}) {
  const locale = currentLocale();
  const walls = Object.values(floor.walls).filter(
    (w) => showAll || (selection?.kind === 'wall' && selection.id === w.id),
  );
  return (
    <g pointerEvents="none" data-layer="dimensions">
      {walls.map((wall) => {
        const a = floor.wallNodes[wall.startNodeId];
        const b = floor.wallNodes[wall.endNodeId];
        if (!a || !b) return null;
        const sa = planToScreen(view, a.position);
        const sb = planToScreen(view, b.position);
        const screenLength = Math.hypot(sb.x - sa.x, sb.y - sa.y);
        if (screenLength < 40) return null;
        let angle = (Math.atan2(sb.y - sa.y, sb.x - sa.x) * 180) / Math.PI;
        if (angle > 90 || angle < -90) angle += 180;
        const mid = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 };
        return (
          <text
            key={wall.id}
            x={mid.x}
            y={mid.y}
            dy="0.35em"
            textAnchor="middle"
            transform={`rotate(${angle} ${mid.x} ${mid.y})`}
            className="fill-foreground text-[11px] tabular-nums"
            data-testid="wall-dimension"
            {...HALO}
          >
            {formatLength(wallLength(floor, wall), 'm', locale)}
          </text>
        );
      })}
    </g>
  );
});

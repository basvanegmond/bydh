import { memo } from 'react';
import { findMaterial } from '@/data/materials';
import type { WallOutline } from '@/domain/model/outlines';
import type { RoomGeometry } from '@/domain/model/rooms';
import type { Floor, Id, Underlay } from '@/domain/schema';
import { useProjectStore } from '@/store/projectStore';
import type { Selection } from '@/store/viewStore';
import { pointsAttr, ringsPath } from '../planData';
import { useAssetUrl } from '../useAssetUrl';

/*
 * These layers draw in plan millimetres inside a group whose transform maps plan → screen
 * (including the Y flip), so panning and zooming only change one transform.
 */

const isSelected = (selection: Selection, kind: string, id: Id) =>
  selection?.kind === kind && selection.id === id;

function UnderlayImage({ underlay, selected }: { underlay: Underlay; selected: boolean }) {
  const url = useAssetUrl(underlay.assetId);
  if (!url || underlay.hidden) return null;
  const { position, rotationDeg, mmPerPx, imagePx } = underlay;
  return (
    <g
      transform={`translate(${position.x} ${position.y}) rotate(${rotationDeg}) scale(${mmPerPx} ${-mmPerPx})`}
      data-entity={`underlay:${underlay.id}`}
      data-testid="underlay-image"
    >
      <image
        href={url}
        width={imagePx.w}
        height={imagePx.h}
        opacity={underlay.opacity}
        preserveAspectRatio="none"
      />
      {selected && (
        <rect
          width={imagePx.w}
          height={imagePx.h}
          fill="none"
          stroke="var(--plan-selection)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeDasharray="6 4"
        />
      )}
    </g>
  );
}

export const UnderlayLayer = memo(function UnderlayLayer({
  floor,
  selection,
}: {
  floor: Floor;
  selection: Selection;
}) {
  return (
    <g data-layer="underlays">
      {Object.values(floor.underlays).map((u) => (
        <UnderlayImage key={u.id} underlay={u} selected={isSelected(selection, 'underlay', u.id)} />
      ))}
    </g>
  );
});

export const RoomLayer = memo(function RoomLayer({
  rooms,
  floor,
  selection,
}: {
  rooms: Record<Id, RoomGeometry>;
  floor: Floor;
  selection: Selection;
}) {
  const project = useProjectStore((s) => s.project);
  return (
    <g data-layer="rooms">
      {Object.values(rooms).map((geometry) => {
        const room = floor.rooms[geometry.roomId];
        const color = findMaterial(project, room?.floorFinish.materialId)?.color ?? '#d9cbb5';
        const selected = isSelected(selection, 'room', geometry.roomId);
        return (
          <path
            key={geometry.roomId}
            d={ringsPath([geometry.polygon, ...geometry.holes])}
            fillRule="evenodd"
            fill={color}
            fillOpacity={selected ? 0.55 : 0.35}
            stroke={selected ? 'var(--plan-selection)' : 'none'}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            data-entity={`room:${geometry.roomId}`}
            data-testid="room"
          />
        );
      })}
    </g>
  );
});

export const WallLayer = memo(function WallLayer({
  outlines,
  floor,
  selection,
}: {
  outlines: Record<Id, WallOutline>;
  floor: Floor;
  selection: Selection;
}) {
  return (
    <g data-layer="walls">
      {Object.values(outlines).map((outline) => {
        const selected = isSelected(selection, 'wall', outline.wallId);
        const locked = floor.walls[outline.wallId]?.locked;
        return (
          <polygon
            key={outline.wallId}
            points={pointsAttr(outline.polygon)}
            fill={selected ? 'var(--plan-selection)' : 'var(--plan-wall)'}
            stroke="var(--plan-wall-edge)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            data-entity={`wall:${outline.wallId}`}
            data-testid="wall"
            data-locked={locked ? 'true' : undefined}
          />
        );
      })}
    </g>
  );
});

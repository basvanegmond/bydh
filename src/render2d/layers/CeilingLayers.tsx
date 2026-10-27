import { memo, useMemo } from 'react';
import { normalize, perpLeft, sub } from '@/domain/geometry/vec2';
import { headroomAreas } from '@/domain/model/ceilings';
import type { CeilingPlane, Floor, Polygon } from '@/domain/schema';

const pointsOf = (polygon: Polygon): string => polygon.map((p) => `${p.x},${p.y}`).join(' ');

const HATCH_ID = 'headroom-hatch';

/**
 * Headroom bands (plan mm space): ceiling below `mid` lightly shaded, below `low` hatched. Derived from
 * the ceiling planes on every render of a changed floor; nothing is stored.
 */
export const HeadroomLayer = memo(function HeadroomLayer({
  floor,
  low,
  mid,
  ceilingSlabMm,
}: {
  floor: Floor;
  low: number;
  mid: number;
  ceilingSlabMm?: number | undefined;
}) {
  const bands = useMemo(
    () => ({ mid: headroomAreas(floor, mid, ceilingSlabMm), low: headroomAreas(floor, low, ceilingSlabMm) }),
    [floor, low, mid, ceilingSlabMm],
  );
  return (
    <g data-layer="headroom" pointerEvents="none">
      <defs>
        <pattern
          id={HATCH_ID}
          width={120}
          height={120}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={120} stroke="var(--plan-ceiling)" strokeWidth={24} />
        </pattern>
      </defs>
      {bands.mid.map((polygon, i) => (
        <polygon
          key={`mid-${i}`}
          points={pointsOf(polygon)}
          fill="var(--plan-ceiling)"
          fillOpacity={0.14}
          data-testid="headroom-band"
          data-band="shade"
        />
      ))}
      {bands.low.map((polygon, i) => (
        <polygon
          key={`low-${i}`}
          points={pointsOf(polygon)}
          fill={`url(#${HATCH_ID})`}
          fillOpacity={0.7}
          data-testid="headroom-band"
          data-band="hatch"
        />
      ))}
    </g>
  );
});

interface CeilingPlaneLayerProps {
  floor: Floor;
  selectedId: string | null;
  /** Viewport scale (px per mm), so the rising-side arrow keeps a constant on-screen size. */
  scale: number;
}

const ARROW_PX = 14;

function PlaneShape({ plane, selected, scale }: { plane: CeilingPlane; selected: boolean; scale: number }) {
  const { a, b } = plane.eave;
  const dir = normalize(sub(b, a));
  const left = perpLeft(dir);
  const n = plane.risesToward === 'left' ? left : { x: -left.x, y: -left.y };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const k = ARROW_PX / scale;
  const tip = { x: mid.x + n.x * k * 1.6, y: mid.y + n.y * k * 1.6 };
  const base1 = { x: mid.x + n.x * k * 0.6 + dir.x * k * 0.5, y: mid.y + n.y * k * 0.6 + dir.y * k * 0.5 };
  const base2 = { x: mid.x + n.x * k * 0.6 - dir.x * k * 0.5, y: mid.y + n.y * k * 0.6 - dir.y * k * 0.5 };
  const stroke = selected ? 'var(--plan-selection)' : 'var(--plan-ceiling)';
  return (
    <g
      data-entity={`ceilingPlane:${plane.id}`}
      data-testid={`ceiling-plane-${plane.id}`}
      data-selected={selected ? 'true' : undefined}
      data-rises-toward={plane.risesToward}
      className="cursor-pointer"
    >
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="transparent"
        strokeWidth={14}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={stroke}
        strokeWidth={selected ? 3 : 2}
        strokeDasharray="12 4 2 4"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <polygon
        points={`${tip.x},${tip.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`}
        fill={stroke}
        pointerEvents="none"
      />
    </g>
  );
}

/** Eave line (dash-dot) of every ceiling plane with an arrow towards the rising side. */
export const CeilingPlaneLayer = memo(function CeilingPlaneLayer({
  floor,
  selectedId,
  scale,
}: CeilingPlaneLayerProps) {
  return (
    <g data-layer="ceiling-planes">
      {Object.values(floor.ceilingPlanes).map((plane) => (
        <PlaneShape key={plane.id} plane={plane} selected={plane.id === selectedId} scale={scale} />
      ))}
    </g>
  );
});

import { memo, useMemo } from 'react';
import { floorGeometry } from '@/domain/model/floorGeometry';
import type { Floor } from '@/domain/schema';
import { pointsAttr } from '../planData';

/** The floor below, as faint wall outlines. Non-interactive: it never receives pointer events. */
export const GhostFloorLayer = memo(function GhostFloorLayer({ floor }: { floor: Floor }) {
  const outlines = useMemo(() => floorGeometry(floor).outlines, [floor]);
  return (
    <g
      data-layer="ghost-floor"
      data-testid="ghost-floor"
      data-floor-id={floor.id}
      opacity={0.25}
      pointerEvents="none"
    >
      {Object.values(outlines).map((outline) => (
        <polygon
          key={outline.wallId}
          points={pointsAttr(outline.polygon)}
          fill="none"
          stroke="var(--plan-wall-edge)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
});

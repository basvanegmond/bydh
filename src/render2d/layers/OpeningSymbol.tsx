import { memo } from 'react';
import { angleOf, normalize, sub } from '@/domain/geometry/vec2';
import { wallExtents } from '@/domain/model/outlines';
import { wallEnds } from '@/domain/model/walls';
import type { Floor, Opening } from '@/domain/schema';
import { openingShapes } from '../openingShapes';
import type { OpeningShape } from '../openingShapes';

export type OpeningVisual = 'normal' | 'selected' | 'preview' | 'invalid';

const STROKE: Record<OpeningVisual, string> = {
  normal: 'var(--plan-wall-edge)',
  selected: 'var(--plan-selection)',
  preview: 'var(--plan-selection)',
  invalid: '#dc2626',
};

function Shape({ shape, stroke }: { shape: OpeningShape; stroke: string }) {
  const common = {
    stroke,
    fill: 'none',
    vectorEffect: 'non-scaling-stroke' as const,
  };
  if (shape.kind === 'arc')
    return <path d={shape.d} {...common} strokeWidth={1} strokeDasharray="4 3" data-shape="arc" />;
  if (shape.kind === 'rect')
    return (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        {...common}
        fill="var(--plan-paper)"
        strokeWidth={1}
        strokeDasharray={shape.dashed ? '4 3' : undefined}
        data-shape="rect"
      />
    );
  return (
    <line
      x1={shape.x1}
      y1={shape.y1}
      x2={shape.x2}
      y2={shape.y2}
      {...common}
      strokeWidth={shape.thin ? 0.75 : 1.25}
      data-shape="line"
    />
  );
}

interface OpeningSymbolProps {
  floor: Floor;
  opening: Opening;
  visual?: OpeningVisual;
}

/** Draws in plan millimetres inside the plan group. Also hosts the click/hover target of the opening. */
export const OpeningSymbol = memo(function OpeningSymbol({
  floor,
  opening,
  visual = 'normal',
}: OpeningSymbolProps) {
  const wall = floor.walls[opening.wallId];
  if (!wall || !floor.wallNodes[wall.startNodeId] || !floor.wallNodes[wall.endNodeId]) return null;
  const { a, b } = wallEnds(floor, wall);
  const dir = normalize(sub(b, a));
  const cx = a.x + dir.x * opening.offset;
  const cy = a.y + dir.y * opening.offset;
  const angle = (angleOf(dir) * 180) / Math.PI;
  const ext = wallExtents(wall);
  const stroke = STROKE[visual];
  const interactive = visual === 'normal' || visual === 'selected';
  return (
    <g
      transform={`translate(${cx} ${cy}) rotate(${angle})`}
      pointerEvents={interactive ? undefined : 'none'}
      data-entity={interactive ? `opening:${opening.id}` : undefined}
      data-testid={interactive ? `opening-${opening.id}` : 'opening-preview'}
      data-opening-type={opening.spec.type}
      data-operation={opening.spec.operation}
      data-selected={visual === 'selected' ? 'true' : undefined}
      data-invalid={visual === 'invalid' ? 'true' : undefined}
    >
      <rect
        x={-opening.width / 2}
        y={-ext.right}
        width={opening.width}
        height={ext.left + ext.right}
        fill={visual === 'invalid' ? '#dc2626' : 'var(--plan-selection)'}
        fillOpacity={
          visual === 'selected' ? 0.25 : visual === 'preview' ? 0.2 : visual === 'invalid' ? 0.3 : 0
        }
        stroke="none"
        className={interactive ? 'hover:[fill-opacity:0.15]' : undefined}
      />
      {openingShapes(opening, { left: ext.left, right: ext.right }).map((shape, i) => (
        <Shape key={i} shape={shape} stroke={stroke} />
      ))}
    </g>
  );
});

export const OpeningLayer = memo(function OpeningLayer({
  floor,
  selectedId,
}: {
  floor: Floor;
  selectedId: string | null;
}) {
  return (
    <g data-layer="openings">
      {Object.values(floor.openings).map((o) => (
        <OpeningSymbol
          key={o.id}
          floor={floor}
          opening={o}
          visual={o.id === selectedId ? 'selected' : 'normal'}
        />
      ))}
    </g>
  );
});

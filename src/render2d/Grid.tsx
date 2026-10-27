import { memo } from 'react';
import { gridSpacing, planToScreen, screenToPlan } from './viewport';
import type { Viewport } from './viewport';

interface GridProps {
  view: Viewport;
  width: number;
  height: number;
}

function linePositions(from: number, to: number, step: number): number[] {
  const start = Math.ceil(Math.min(from, to) / step) * step;
  const end = Math.max(from, to);
  const positions: number[] = [];
  for (let value = start; value <= end; value += step) positions.push(value);
  return positions;
}

/** Adaptive plan grid (minor + major lines) with the origin axes highlighted. */
export const Grid = memo(function Grid({ view, width, height }: GridProps) {
  const { minor, major } = gridSpacing(view.scale);
  const topLeft = screenToPlan(view, { x: 0, y: 0 });
  const bottomRight = screenToPlan(view, { x: width, y: height });
  const origin = planToScreen(view, { x: 0, y: 0 });

  const xs = linePositions(topLeft.x, bottomRight.x, minor);
  const ys = linePositions(bottomRight.y, topLeft.y, minor);
  const isMajor = (value: number) => Math.abs(value % major) < 1e-6;

  return (
    <g data-testid="plan-grid" shapeRendering="crispEdges">
      {xs.map((x) => {
        const sx = x * view.scale + view.offsetX;
        return (
          <line
            key={`x${x}`}
            x1={sx}
            x2={sx}
            y1={0}
            y2={height}
            stroke={isMajor(x) ? 'var(--plan-grid-major)' : 'var(--plan-grid-minor)'}
          />
        );
      })}
      {ys.map((y) => {
        const sy = -y * view.scale + view.offsetY;
        return (
          <line
            key={`y${y}`}
            x1={0}
            x2={width}
            y1={sy}
            y2={sy}
            stroke={isMajor(y) ? 'var(--plan-grid-major)' : 'var(--plan-grid-minor)'}
          />
        );
      })}
      <line x1={origin.x} x2={origin.x} y1={0} y2={height} stroke="var(--plan-axis)" />
      <line x1={0} x2={width} y1={origin.y} y2={origin.y} stroke="var(--plan-axis)" />
    </g>
  );
});

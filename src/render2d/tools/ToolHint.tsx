import type { ReactNode } from 'react';

export function ToolHint({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute top-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-md bg-foreground/85 px-3 py-1.5 text-center text-xs text-background shadow"
      data-testid="tool-hint"
    >
      {children}
    </div>
  );
}

export function SnapMarker({ x, y, kind }: { x: number; y: number; kind: string }) {
  if (kind === 'free' || kind === 'grid') return <circle cx={x} cy={y} r={3} fill="var(--plan-selection)" />;
  return (
    <rect
      x={x - 5}
      y={y - 5}
      width={10}
      height={10}
      fill="none"
      stroke="var(--plan-selection)"
      strokeWidth={2}
      transform={kind === 'midpoint' || kind === 'edge' ? `rotate(45 ${x} ${y})` : undefined}
      data-testid="snap-marker"
    />
  );
}

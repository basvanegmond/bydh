import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { Vec2 } from '@/domain/schema';
import { formatLength } from '@/domain/units/format';
import { currentLocale } from '@/i18n';
import { useViewStore } from '@/store/viewStore';
import { Grid } from './Grid';
import { ScaleBar } from './ScaleBar';
import { centeredViewport, panBy, screenToPlan, zoomAt } from './viewport';
import type { Viewport } from './viewport';

const INITIAL_SCALE = 0.05; // 1 m = 50 px: a typical house fills the screen
const WHEEL_ZOOM = 1.0015;
const ORIGIN: Vec2 = { x: 0, y: 0 };

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

type UpdateView = (change: (view: Viewport) => Viewport) => void;

/** Pointer-driven pan and pinch-zoom. Middle mouse, space+drag or the pan tool pans. */
function usePanZoom(updateView: UpdateView) {
  const pointers = useRef(new Map<number, Vec2>());
  const spaceHeld = useRef(false);
  const tool = useViewStore((state) => state.tool);

  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === 'Space' && (spaceHeld.current = true);
    const up = (e: KeyboardEvent) => e.code === 'Space' && (spaceHeld.current = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const panning = tool === 'pan' || e.button === 1 || spaceHeld.current || e.pointerType === 'touch';
    if (!panning) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    const next = { x: e.clientX, y: e.clientY };
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
    const other = others[0]?.[1];
    if (other) {
      // Pinch: zoom by the change in finger distance around the midpoint.
      const rect = e.currentTarget.getBoundingClientRect();
      const factor =
        Math.hypot(next.x - other.x, next.y - other.y) /
        Math.hypot(previous.x - other.x, previous.y - other.y);
      const mid = { x: (next.x + other.x) / 2 - rect.left, y: (next.y + other.y) / 2 - rect.top };
      if (Number.isFinite(factor) && factor > 0) updateView((v) => zoomAt(v, factor, mid));
    } else {
      updateView((v) => panBy(v, next.x - previous.x, next.y - previous.y));
    }
    pointers.current.set(e.pointerId, next);
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}

export function PlanView() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useElementSize(containerRef);
  // null = the default view (origin centred); set once the user pans or zooms.
  const [userView, setUserView] = useState<Viewport | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  const updateView = useCallback<UpdateView>((change) => {
    setUserView((v) => change(v ?? centeredViewport(sizeRef.current, ORIGIN, INITIAL_SCALE)));
  }, []);
  const resetView = useCallback(() => setUserView(null), []);
  const panZoom = usePanZoom(updateView);
  const view = userView ?? (size.width > 0 ? centeredViewport(size, ORIGIN, INITIAL_SCALE) : null);

  // Native listener: React's onWheel is passive, so it cannot prevent page zoom/scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      updateView((v) => zoomAt(v, WHEEL_ZOOM ** -e.deltaY, anchor));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [updateView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '0' && !(e.target instanceof HTMLInputElement)) resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resetView]);

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    panZoom.onPointerMove(e);
    if (!view) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setCursor(screenToPlan(view, { x: e.clientX - rect.left, y: e.clientY - rect.top }));
  };

  const locale = currentLocale();
  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[var(--plan-paper)]">
      <svg
        ref={svgRef}
        role="img"
        aria-label={t('plan.label')}
        data-testid="plan-svg"
        width={size.width}
        height={size.height}
        className="block touch-none select-none"
        onPointerDown={panZoom.onPointerDown}
        onPointerMove={onMove}
        onPointerUp={panZoom.onPointerUp}
        onPointerCancel={panZoom.onPointerCancel}
        onPointerLeave={() => setCursor(null)}
      >
        {view && <Grid view={view} width={size.width} height={size.height} />}
      </svg>
      {view && <ScaleBar view={view} />}
      <div className="pointer-events-none absolute right-3 bottom-3 rounded bg-background/80 px-2 py-1 font-mono text-xs text-muted-foreground tabular-nums">
        {t('plan.cursor')}:{' '}
        {cursor ? `${formatLength(cursor.x, 'm', locale)}, ${formatLength(cursor.y, 'm', locale)}` : '–'}
      </div>
    </div>
  );
}

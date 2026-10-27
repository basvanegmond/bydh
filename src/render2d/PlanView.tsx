import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { boundingBox } from '@/domain/geometry/polygon';
import { imageToPlan } from '@/domain/model/underlay';
import type { Floor, Vec2 } from '@/domain/schema';
import { formatLength } from '@/domain/units/format';
import { currentLocale } from '@/i18n';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { Grid } from './Grid';
import { RoomLabels, WallDimensions } from './layers/Annotations';
import { RoomLayer, UnderlayLayer, WallLayer } from './layers/PlanLayers';
import { usePlanData } from './planData';
import { ScaleBar } from './ScaleBar';
import { ToolOptions } from './ToolOptions';
import { useCalibrateTool } from './tools/useCalibrateTool';
import { useSelectTool } from './tools/useSelectTool';
import { useWallTool } from './tools/useWallTool';
import type { ToolContext, ToolHandlers } from './tools/types';
import { centeredViewport, MAX_SCALE, MIN_SCALE, panBy, screenToPlan, zoomAt } from './viewport';
import type { Viewport } from './viewport';

const INITIAL_SCALE = 0.05; // 1 m = 50 px
const WHEEL_ZOOM = 1.0015;
const SNAP_RADIUS_PX = 10;
const FIT_PADDING_PX = 60;

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

/** Fits walls and background images, or centres the origin on an empty floor. */
function fitView(size: { width: number; height: number }, floor: Floor | undefined): Viewport {
  const points: Vec2[] = Object.values(floor?.wallNodes ?? {}).map((n) => n.position);
  for (const u of Object.values(floor?.underlays ?? {})) {
    points.push(imageToPlan(u, { x: 0, y: 0 }), imageToPlan(u, { x: u.imagePx.w, y: u.imagePx.h }));
  }
  const box = boundingBox(points);
  if (!box) return centeredViewport(size, { x: 0, y: 0 }, INITIAL_SCALE);
  const w = Math.max(box.max.x - box.min.x, 1000);
  const h = Math.max(box.max.y - box.min.y, 1000);
  const fit = Math.min((size.width - 2 * FIT_PADDING_PX) / w, (size.height - 2 * FIT_PADDING_PX) / h);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
  return centeredViewport(size, { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2 }, scale);
}

type UpdateView = (change: (view: Viewport) => Viewport) => void;

interface Camera {
  center: Vec2;
  scale: number;
}

const cameraOf = (view: Viewport, size: { width: number; height: number }): Camera => ({
  center: screenToPlan(view, { x: size.width / 2, y: size.height / 2 }),
  scale: view.scale,
});

/** Pan (middle mouse, space+drag, pan tool, one finger) and pinch zoom. */
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

  /** Returns true when the press starts a pan instead of a tool action. */
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): boolean => {
    const panning = tool === 'pan' || e.button === 1 || spaceHeld.current || e.pointerType === 'touch';
    if (!panning) return false;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    return true;
  };

  /** Returns true while panning. */
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): boolean => {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return false;
    const next = { x: e.clientX, y: e.clientY };
    const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (other) {
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
    return true;
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>): boolean => pointers.current.delete(e.pointerId);

  return { onPointerDown, onPointerMove, onPointerUp };
}

const IDLE_TOOL: ToolHandlers = {
  onPointerDown: () => undefined,
  onPointerMove: () => undefined,
  onPointerUp: () => undefined,
  onKeyDown: () => false,
  overlay: null,
  html: null,
  cursor: 'grab',
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function PlanView() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useElementSize(containerRef);
  const { floor, outlines, rooms } = usePlanData();
  const gridMm = useProjectStore((s) => s.project.settings.gridMm);
  const toolName = useViewStore((s) => s.tool);
  const selection = useViewStore((s) => s.selection);
  const showDimensions = useViewStore((s) => s.showDimensions);

  // null = fitted to the content; frozen as soon as the user interacts, so drawing never moves the view.
  // Stored as "plan point at the pane centre + zoom", so resizing the pane (e.g. split view) keeps
  // the plan centred instead of sliding it off-screen.
  const [camera, setCamera] = useState<Camera | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const fitted = size.width > 0 ? fitView(size, floor) : null;
  const view = size.width > 0 && camera ? centeredViewport(size, camera.center, camera.scale) : fitted;
  const liveRef = useRef({ size, fitted });
  useEffect(() => {
    liveRef.current = { size, fitted };
  });

  const updateView = useCallback<UpdateView>((change) => {
    setCamera((c) => {
      const { size: s, fitted: f } = liveRef.current;
      const base = c ? centeredViewport(s, c.center, c.scale) : f;
      return base ? cameraOf(change(base), s) : c;
    });
  }, []);
  const panZoom = usePanZoom(updateView);

  const ctx: ToolContext = {
    view: view ?? { scale: INITIAL_SCALE, offsetX: 0, offsetY: 0 },
    floor,
    floorId: floor?.id ?? null,
    toleranceMm: SNAP_RADIUS_PX / (view?.scale ?? INITIAL_SCALE),
    gridMm,
  };
  const selectTool = useSelectTool(ctx);
  const wallTool = useWallTool(ctx);
  const calibrateTool = useCalibrateTool(ctx);
  const tool = { select: selectTool, wall: wallTool, calibrate: calibrateTool, pan: IDLE_TOOL }[toolName];

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

  const toolRef = useRef(tool);
  useEffect(() => {
    toolRef.current = tool;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (toolRef.current.onKeyDown(e)) {
        e.preventDefault();
        return;
      }
      if (e.key === '0') setCamera(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toPlan = (e: ReactPointerEvent<SVGSVGElement>): Vec2 | null => {
    if (!view) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToPlan(view, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!camera && view) setCamera(cameraOf(view, size));
    if (panZoom.onPointerDown(e)) return;
    const p = toPlan(e);
    if (p) tool.onPointerDown(e, p);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (panZoom.onPointerMove(e)) return;
    const p = toPlan(e);
    setCursor(p);
    if (p) tool.onPointerMove(e, p);
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (panZoom.onPointerUp(e)) return;
    const p = toPlan(e);
    if (p) tool.onPointerUp(e, p);
  };

  const locale = currentLocale();
  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[var(--plan-paper)]">
      <svg
        ref={svgRef}
        role="application"
        aria-label={t('plan.label')}
        data-testid="plan-svg"
        width={size.width}
        height={size.height}
        className="block touch-none select-none"
        style={{ cursor: tool.cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={() => tool.onDoubleClick?.()}
      >
        {view && <Grid view={view} width={size.width} height={size.height} />}
        {view && floor && (
          <>
            <g transform={`matrix(${view.scale} 0 0 ${-view.scale} ${view.offsetX} ${view.offsetY})`}>
              <UnderlayLayer floor={floor} selection={selection} />
              <RoomLayer rooms={rooms} floor={floor} selection={selection} />
              <WallLayer outlines={outlines} floor={floor} selection={selection} />
            </g>
            <RoomLabels rooms={rooms} floor={floor} view={view} />
            <WallDimensions floor={floor} view={view} selection={selection} showAll={showDimensions} />
          </>
        )}
        {view && tool.overlay}
      </svg>
      {tool.html}
      <ToolOptions />
      {view && <ScaleBar view={view} />}
      <div className="pointer-events-none absolute right-3 bottom-3 rounded bg-background/80 px-2 py-1 font-mono text-xs text-muted-foreground tabular-nums">
        {t('plan.cursor')}:{' '}
        {cursor ? `${formatLength(cursor.x, 'm', locale)}, ${formatLength(cursor.y, 'm', locale)}` : '–'}
      </div>
    </div>
  );
}

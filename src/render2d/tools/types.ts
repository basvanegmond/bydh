import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Floor, Id, Vec2 } from '@/domain/schema';
import type { Viewport } from '../viewport';

export interface ToolContext {
  view: Viewport;
  floor: Floor | undefined;
  /** The floor below when the ghost is on: its nodes and walls are extra snap targets. */
  ghostFloor?: Floor | undefined;
  floorId: Id | null;
  /** Snap/capture radius in plan mm at the current zoom. */
  toleranceMm: number;
  gridMm: number;
}

export type PlanPointerEvent = ReactPointerEvent<SVGSVGElement>;

export interface ToolHandlers {
  onPointerDown: (e: PlanPointerEvent, p: Vec2) => void;
  onPointerMove: (e: PlanPointerEvent, p: Vec2) => void;
  onPointerUp: (e: PlanPointerEvent, p: Vec2) => void;
  onDoubleClick?: () => void;
  /** Returns true when the tool handled the key. */
  onKeyDown: (e: KeyboardEvent) => boolean;
  /** SVG drawn in screen pixels above the plan. */
  overlay: ReactNode;
  /** HTML drawn above the canvas (hints, inputs). */
  html: ReactNode;
  cursor: string;
}

/** The data-entity attribute ("wall:<id>") of the element under the pointer, if any. */
export function entityAt(e: { target: EventTarget | null }): { kind: string; id: string } | null {
  const element = e.target instanceof Element ? e.target.closest('[data-entity]') : null;
  const value = element?.getAttribute('data-entity');
  if (!value) return null;
  const [kind, id] = value.split(':');
  return kind && id ? { kind, id } : null;
}

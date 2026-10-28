import type { Id } from '@/domain/schema';

/** Which floors the 3D view draws: all, the active floor and those below it, or the active floor only. */
export const STACK_MODES = ['all', 'upTo', 'active'] as const;
export type StackMode = (typeof STACK_MODES)[number];
export const isStackMode = (value: string): value is StackMode =>
  (STACK_MODES as readonly string[]).includes(value);

/** Ids of the floors to draw, given the floor ids bottom to top. An unknown active floor shows everything. */
export function visibleFloorIds(floorIds: Id[], activeId: Id | null, mode: StackMode): Set<Id> {
  const activeIndex = activeId ? floorIds.indexOf(activeId) : -1;
  if (mode === 'all' || activeIndex < 0) return new Set(floorIds);
  return new Set(
    mode === 'upTo' ? floorIds.slice(0, activeIndex + 1) : floorIds.slice(activeIndex, activeIndex + 1),
  );
}

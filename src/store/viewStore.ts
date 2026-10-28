import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_DOOR, DEFAULT_WINDOW } from '@/domain/model/openings';
import type { Id } from '@/domain/schema';
import type { StackMode } from '@/render3d/stack';

export const VIEW_MODES = ['2d', '3d', 'split'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const isViewMode = (value: string): value is ViewMode =>
  (VIEW_MODES as readonly string[]).includes(value);
export type Tool = 'select' | 'pan' | 'wall' | 'calibrate' | 'door' | 'window' | 'ceiling' | 'stair';

export type Selection = {
  kind: 'wall' | 'room' | 'underlay' | 'opening' | 'ceilingPlane' | 'stair';
  id: Id;
} | null;

/** Wall thickness presets (mm): metal stud, light partition, block, cavity inner leaf, cavity wall. */
export const WALL_THICKNESSES = [70, 100, 150, 210, 300] as const;

/** Size the door and window tools place next, in mm. Per viewer; each opening stays editable afterwards. */
export interface OpeningSize {
  width: number;
  height: number;
  sillHeight: number;
}
export type OpeningDefaults = Record<'door' | 'window', OpeningSize>;

const sizeOf = ({ width, height, sillHeight }: OpeningSize): OpeningSize => ({ width, height, sillHeight });
const DEFAULT_OPENING_SIZES: OpeningDefaults = { door: sizeOf(DEFAULT_DOOR), window: sizeOf(DEFAULT_WINDOW) };

/** Defaults for the next ceiling plane, in mm and degrees. Per viewer; each plane stays editable. */
export interface CeilingDefaults {
  kneeHeight: number;
  slopeDeg: number;
}
export const DEFAULT_CEILING: CeilingDefaults = { kneeHeight: 1000, slopeDeg: 40 };

/** Headroom band limits in mm: below `low` is unusable, below `mid` is awkward. */
export interface HeadroomLimits {
  low: number;
  mid: number;
}
export const DEFAULT_HEADROOM: HeadroomLimits = { low: 1000, mid: 1800 };

interface ViewState {
  viewMode: ViewMode;
  tool: Tool;
  activeFloorId: Id | null;
  selection: Selection;
  wallThickness: number;
  showDimensions: boolean;
  openingDefaults: OpeningDefaults;
  ceilingDefaults: CeilingDefaults;
  /** Draw the headroom bands (hatched / shaded) on floors that have ceiling planes. */
  showHeadroom: boolean;
  headroomLimits: HeadroomLimits;
  /** Draw the floor below as a faint, snappable ghost in the 2D plan. */
  ghostFloor: boolean;
  /** Which floors the 3D view draws. */
  stackMode: StackMode;
  /** Lower the walls between the camera and the target in 3D so the interior is visible. */
  cutaway: boolean;
  /** 3D camera at eye height inside a room (not persisted). */
  insideView: boolean;
  /** Bumped by the "reset view" button; the 3D camera re-frames when it changes. */
  resetViewTick: number;
  setViewMode: (mode: ViewMode) => void;
  setTool: (tool: Tool) => void;
  setActiveFloor: (floorId: Id) => void;
  select: (selection: Selection) => void;
  setWallThickness: (mm: number) => void;
  toggleDimensions: () => void;
  setOpeningDefault: (kind: 'door' | 'window', change: Partial<OpeningSize>) => void;
  setCeilingDefault: (change: Partial<CeilingDefaults>) => void;
  /** Sets the headroom band limits; ignored unless 0 <= low <= mid after the change. */
  setHeadroomLimits: (change: Partial<HeadroomLimits>) => void;
  toggleHeadroom: () => void;
  toggleGhostFloor: () => void;
  setStackMode: (mode: StackMode) => void;
  toggleCutaway: () => void;
  toggleInsideView: () => void;
  resetView: () => void;
}

/** Per-viewer UI state: never part of the project file and never in undo history. */
export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      viewMode: '2d',
      tool: 'select',
      activeFloorId: null,
      selection: null,
      wallThickness: 100,
      showDimensions: true,
      openingDefaults: DEFAULT_OPENING_SIZES,
      ceilingDefaults: DEFAULT_CEILING,
      showHeadroom: true,
      headroomLimits: DEFAULT_HEADROOM,
      ghostFloor: true,
      stackMode: 'upTo',
      cutaway: true,
      insideView: false,
      resetViewTick: 0,
      setViewMode: (viewMode) => set({ viewMode }),
      setTool: (tool) => set({ tool }),
      setActiveFloor: (activeFloorId) => set({ activeFloorId, selection: null }),
      select: (selection) => set({ selection }),
      setWallThickness: (wallThickness) => set({ wallThickness }),
      toggleDimensions: () => set((state) => ({ showDimensions: !state.showDimensions })),
      setOpeningDefault: (kind, change) =>
        set((state) => ({
          openingDefaults: {
            ...state.openingDefaults,
            [kind]: { ...state.openingDefaults[kind], ...change },
          },
        })),
      setCeilingDefault: (change) =>
        set((state) => ({ ceilingDefaults: { ...state.ceilingDefaults, ...change } })),
      setHeadroomLimits: (change) =>
        set((state) => {
          const next = { ...state.headroomLimits, ...change };
          return next.low >= 0 && next.low <= next.mid ? { headroomLimits: next } : {};
        }),
      toggleHeadroom: () => set((state) => ({ showHeadroom: !state.showHeadroom })),
      toggleGhostFloor: () => set((state) => ({ ghostFloor: !state.ghostFloor })),
      setStackMode: (stackMode) => set({ stackMode }),
      toggleCutaway: () => set((state) => ({ cutaway: !state.cutaway })),
      toggleInsideView: () => set((state) => ({ insideView: !state.insideView })),
      resetView: () => set((state) => ({ insideView: false, resetViewTick: state.resetViewTick + 1 })),
    }),
    {
      name: `bydh.view.${__DEPLOY_CHANNEL__}`,
      // localStorage can be blocked or throw; persistence is a convenience only.
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        viewMode: state.viewMode,
        wallThickness: state.wallThickness,
        showDimensions: state.showDimensions,
        openingDefaults: state.openingDefaults,
        ceilingDefaults: state.ceilingDefaults,
        showHeadroom: state.showHeadroom,
        headroomLimits: state.headroomLimits,
        ghostFloor: state.ghostFloor,
        stackMode: state.stackMode,
        cutaway: state.cutaway,
      }),
    },
  ),
);

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_DOOR, DEFAULT_WINDOW } from '@/domain/model/openings';
import type { Id } from '@/domain/schema';
import type { StackMode } from '@/render3d/stack';

export const VIEW_MODES = ['2d', '3d', 'split'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const isViewMode = (value: string): value is ViewMode =>
  (VIEW_MODES as readonly string[]).includes(value);
export type Tool = 'select' | 'pan' | 'wall' | 'calibrate' | 'door' | 'window';

export type Selection = { kind: 'wall' | 'room' | 'underlay' | 'opening'; id: Id } | null;

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

interface ViewState {
  viewMode: ViewMode;
  tool: Tool;
  activeFloorId: Id | null;
  selection: Selection;
  wallThickness: number;
  showDimensions: boolean;
  openingDefaults: OpeningDefaults;
  /** Draw the floor below as a faint, snappable ghost in the 2D plan. */
  ghostFloor: boolean;
  /** Which floors the 3D view draws. */
  stackMode: StackMode;
  setViewMode: (mode: ViewMode) => void;
  setTool: (tool: Tool) => void;
  setActiveFloor: (floorId: Id) => void;
  select: (selection: Selection) => void;
  setWallThickness: (mm: number) => void;
  toggleDimensions: () => void;
  setOpeningDefault: (kind: 'door' | 'window', change: Partial<OpeningSize>) => void;
  toggleGhostFloor: () => void;
  setStackMode: (mode: StackMode) => void;
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
      ghostFloor: true,
      stackMode: 'all',
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
      toggleGhostFloor: () => set((state) => ({ ghostFloor: !state.ghostFloor })),
      setStackMode: (stackMode) => set({ stackMode }),
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
        ghostFloor: state.ghostFloor,
        stackMode: state.stackMode,
      }),
    },
  ),
);

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Id } from '@/domain/schema';

export const VIEW_MODES = ['2d', '3d', 'split'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const isViewMode = (value: string): value is ViewMode =>
  (VIEW_MODES as readonly string[]).includes(value);
export type Tool = 'select' | 'pan' | 'wall' | 'calibrate';

export type Selection = { kind: 'wall' | 'room' | 'underlay'; id: Id } | null;

/** Wall thickness presets (mm): metal stud, light partition, block, cavity inner leaf, cavity wall. */
export const WALL_THICKNESSES = [70, 100, 150, 210, 300] as const;

interface ViewState {
  viewMode: ViewMode;
  tool: Tool;
  activeFloorId: Id | null;
  selection: Selection;
  wallThickness: number;
  showDimensions: boolean;
  setViewMode: (mode: ViewMode) => void;
  setTool: (tool: Tool) => void;
  setActiveFloor: (floorId: Id) => void;
  select: (selection: Selection) => void;
  setWallThickness: (mm: number) => void;
  toggleDimensions: () => void;
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
      setViewMode: (viewMode) => set({ viewMode }),
      setTool: (tool) => set({ tool }),
      setActiveFloor: (activeFloorId) => set({ activeFloorId, selection: null }),
      select: (selection) => set({ selection }),
      setWallThickness: (wallThickness) => set({ wallThickness }),
      toggleDimensions: () => set((state) => ({ showDimensions: !state.showDimensions })),
    }),
    {
      name: `bydh.view.${__DEPLOY_CHANNEL__}`,
      // localStorage can be blocked or throw; persistence is a convenience only.
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        viewMode: state.viewMode,
        wallThickness: state.wallThickness,
        showDimensions: state.showDimensions,
      }),
    },
  ),
);

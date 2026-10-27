import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ViewMode = '2d' | '3d' | 'split';
export type Tool = 'select' | 'pan';

interface ViewState {
  viewMode: ViewMode;
  tool: Tool;
  activeFloorId: string | null;
  setViewMode: (mode: ViewMode) => void;
  setTool: (tool: Tool) => void;
  setActiveFloor: (floorId: string) => void;
}

/** Per-viewer UI state: never part of the project file and never in undo history. */
export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      viewMode: '2d',
      tool: 'select',
      activeFloorId: null,
      setViewMode: (viewMode) => set({ viewMode }),
      setTool: (tool) => set({ tool }),
      setActiveFloor: (activeFloorId) => set({ activeFloorId }),
    }),
    {
      name: `bydh.view.${__DEPLOY_CHANNEL__}`,
      // localStorage can be blocked or throw; persistence is a convenience only.
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ viewMode: state.viewMode }),
    },
  ),
);

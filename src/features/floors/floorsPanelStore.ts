import { create } from 'zustand';

export const useFloorsPanel = create<{ open: boolean }>()(() => ({ open: false }));
export const setFloorsPanelOpen = (open: boolean) => useFloorsPanel.setState({ open });

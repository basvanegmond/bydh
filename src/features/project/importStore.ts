import { create } from 'zustand';

export const useImportStore = create<{ open: boolean }>()(() => ({ open: false }));

export const openImportDialog = () => useImportStore.setState({ open: true });

import { create } from 'zustand';

export type DialogRequest =
  | { kind: 'prompt'; title: string; initial: string; resolve: (value: string | null) => void }
  | { kind: 'confirm'; title: string; message: string; resolve: (value: boolean) => void };

export const useDialogStore = create<{ request: DialogRequest | null }>()(() => ({ request: null }));

/** Asks for a name; resolves with the trimmed text, or null when cancelled or empty. */
export function promptText(title: string, initial = ''): Promise<string | null> {
  return new Promise((resolve) =>
    useDialogStore.setState({ request: { kind: 'prompt', title, initial, resolve } }),
  );
}

export function confirmAction(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) =>
    useDialogStore.setState({ request: { kind: 'confirm', title, message, resolve } }),
  );
}

export const closeDialog = () => useDialogStore.setState({ request: null });

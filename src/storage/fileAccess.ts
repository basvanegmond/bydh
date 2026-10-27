/** Minimal typings for the File System Access API (Chrome/Edge only, not in lib.dom). */
interface FileSystemWritable {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}
interface SaveFileHandle {
  name: string;
  createWritable(): Promise<FileSystemWritable>;
}
interface SavePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SaveFileHandle>;
}

const JSON_TYPES = [{ description: 'BYDH project', accept: { 'application/json': ['.json'] } }];

export const canSaveToFile = (): boolean =>
  typeof (window as SavePickerWindow).showSaveFilePicker === 'function';

/** Triggers a normal browser download. */
export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Saves to a file the user picks (e.g. in a shared OneDrive folder). Falls back to a download
 * where the File System Access API is missing. Returns false when the user cancels.
 */
export async function saveTextToFile(text: string, suggestedName: string): Promise<boolean> {
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (!picker) {
    downloadText(text, suggestedName);
    return true;
  }
  try {
    const handle = await picker({ suggestedName, types: JSON_TYPES });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}

/** Safe file name from a project name: "Ons huis B" → "ons-huis-b.bydh.json". */
export function projectFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `${slug || 'project'}.bydh.json`;
}

import { newId } from '@/domain/schema';
import type { Id, Vec2 } from '@/domain/schema';
import { primeAssetUrl } from '@/render2d/useAssetUrl';
import { repository } from '@/storage/session';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';

/** Until calibrated, assume 1 image pixel ≈ 1 cm: a typical floor plan export then has a plausible size. */
const DEFAULT_MM_PER_PX = 10;
const PDF_RENDER_SCALE = 2;

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      resolve({ w: image.naturalWidth || 1000, h: image.naturalHeight || 1000 });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The image could not be read.'));
    };
    image.src = url;
  });
}

/** Renders one PDF page to a PNG (pdf.js is loaded only when a PDF is imported). */
async function renderPdfPage(file: File, pageNumber: number): Promise<{ blob: Blob; w: number; h: number }> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await pdf.getPage(Math.min(pageNumber, pdf.numPages));
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PDF render failed.'))), 'image/png'),
  );
  return { blob, w: canvas.width, h: canvas.height };
}

/**
 * Stores the file as an asset and adds it to the floor as a semi-transparent background,
 * centred on `center` (plan mm). Returns the new underlay id.
 */
export async function importUnderlay(file: File, floorId: Id | null, center: Vec2): Promise<Id> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const rendered = isPdf ? await renderPdfPage(file, 1) : { blob: file as Blob, ...(await imageSize(file)) };
  const assetId = newId();
  const mime = isPdf ? 'image/png' : file.type || 'image/png';
  await repository.putAsset({ id: assetId, name: file.name, mime, blob: rendered.blob });
  primeAssetUrl(assetId, rendered.blob);
  const hash = await sha256(rendered.blob);
  const underlayId = newId();
  const { w, h } = rendered;

  useProjectStore.getState().edit('Import background', (project) => {
    project.library.assets[assetId] = {
      id: assetId,
      kind: 'image',
      name: file.name,
      mime,
      bytes: rendered.blob.size,
      sha256: hash,
    };
  });
  useProjectStore.getState().editFloor('Import background', floorId, (floor) => {
    floor.underlays[underlayId] = {
      id: underlayId,
      name: file.name,
      assetId,
      ...(isPdf ? { pdfPage: 1 } : {}),
      imagePx: { w, h },
      position: { x: center.x - (w * DEFAULT_MM_PER_PX) / 2, y: center.y + (h * DEFAULT_MM_PER_PX) / 2 },
      rotationDeg: 0,
      mmPerPx: DEFAULT_MM_PER_PX,
      opacity: 0.5,
    };
  });
  useViewStore.getState().select({ kind: 'underlay', id: underlayId });
  return underlayId;
}

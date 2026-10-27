import { useEffect, useState } from 'react';
import type { Id } from '@/domain/schema';
import { repository } from '@/storage/session';

/** Object URLs per asset id, shared across components and kept for the session. */
const cache = new Map<Id, Promise<string | null>>();

function loadUrl(id: Id): Promise<string | null> {
  let promise = cache.get(id);
  if (!promise) {
    promise = repository
      .getAsset(id)
      .then((asset) => (asset ? URL.createObjectURL(asset.blob) : null))
      .catch(() => null);
    cache.set(id, promise);
  }
  return promise;
}

/** Lets a just-imported asset show immediately without reloading it from storage. */
export function primeAssetUrl(id: Id, blob: Blob): void {
  cache.set(id, Promise.resolve(URL.createObjectURL(blob)));
}

export function useAssetUrl(id: Id | undefined): string | null {
  const [url, setUrl] = useState<{ id: Id; url: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void loadUrl(id).then((value) => alive && setUrl({ id, url: value }));
    return () => {
      alive = false;
    };
  }, [id]);
  return url && url.id === id ? url.url : null;
}

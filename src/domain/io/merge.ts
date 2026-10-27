import { newId } from '../schema/factories';
import type { Project, Variant } from '../schema/types';

/**
 * Import rules (ADR 0003): an import never overwrites. Either it becomes a separate project with
 * a fresh id, or its variants are appended to the open project with fresh variant ids.
 */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function asNewProject(imported: Project, existingNames: string[] = []): Project {
  const copy = clone(imported);
  copy.id = newId();
  copy.name = uniqueName(copy.name, existingNames);
  return copy;
}

function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} (${i})`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/** Adds source entries whose id is not yet in the target; existing entries are never touched. */
function addMissing<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) target[key] = clone(value);
  }
}

/**
 * Appends every variant of `source` to `target` under a new id, in place. `target` may be an
 * Immer draft: only new entries are added, nothing existing is replaced, so undo patches stay
 * small and concurrent edits are preserved. `basedOnVariantId` is remapped to the new ids of
 * imported variants, or dropped when it pointed outside the import.
 */
export function appendVariantsInto(target: Project, source: Project, suffix: string): Variant[] {
  const takenNames = Object.values(target.variants).map((v) => v.name);
  const idMap = new Map<string, string>();
  for (const variantId of source.variantOrder) idMap.set(variantId, newId());
  const added: Variant[] = [];
  for (const variantId of source.variantOrder) {
    const original = source.variants[variantId];
    const freshId = idMap.get(variantId);
    if (!original || !freshId) continue;
    const variant: Variant = {
      ...clone(original),
      id: freshId,
      name: uniqueName(`${original.name} ${suffix}`.trim(), takenNames),
    };
    const based = original.basedOnVariantId ? idMap.get(original.basedOnVariantId) : undefined;
    if (based) variant.basedOnVariantId = based;
    else delete variant.basedOnVariantId;
    takenNames.push(variant.name);
    target.variants[variant.id] = variant;
    target.variantOrder.push(variant.id);
    added.push(variant);
  }
  const lib = target.library;
  addMissing(lib.materials, source.library.materials);
  addMissing(lib.palettes, source.library.palettes);
  addMissing(lib.catalog, source.library.catalog);
  addMissing(lib.assets, source.library.assets);
  return added;
}

/** Returns a copy of `target` with every variant of `source` appended under a new id. */
export function addVariantsFrom(
  target: Project,
  source: Project,
  suffix: string,
): { project: Project; added: Variant[] } {
  const project = clone(target);
  const added = appendVariantsInto(project, source, suffix);
  return { project, added };
}

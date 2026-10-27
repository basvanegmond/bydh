import { newId } from '../schema/factories';
import type { Library, Project, Variant } from '../schema/types';

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

/** Library items are keyed by id; existing entries win so the open project is never changed. */
function mergeLibrary(target: Library, source: Library): Library {
  return {
    materials: { ...source.materials, ...target.materials },
    palettes: { ...source.palettes, ...target.palettes },
    catalog: { ...source.catalog, ...target.catalog },
    assets: { ...source.assets, ...target.assets },
  };
}

/** Returns a copy of `target` with every variant of `source` appended under a new id. */
export function addVariantsFrom(
  target: Project,
  source: Project,
  suffix: string,
): { project: Project; added: Variant[] } {
  const project = clone(target);
  const takenNames = Object.values(project.variants).map((v) => v.name);
  const added: Variant[] = [];
  for (const variantId of source.variantOrder) {
    const original = source.variants[variantId];
    if (!original) continue;
    const variant: Variant = {
      ...clone(original),
      id: newId(),
      name: uniqueName(`${original.name} ${suffix}`.trim(), takenNames),
    };
    takenNames.push(variant.name);
    project.variants[variant.id] = variant;
    project.variantOrder.push(variant.id);
    added.push(variant);
  }
  project.library = mergeLibrary(project.library, source.library);
  return { project, added };
}

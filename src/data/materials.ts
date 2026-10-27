import { z } from 'zod';
import { MaterialSchema } from '@/domain/schema';
import type { FloorFinish, Material, Project } from '@/domain/schema';
import raw from './materials.json';

/** Built-in material presets, stored as data and validated on load. */
export const PRESET_MATERIALS: Material[] = z.array(MaterialSchema).parse(raw);

export const FLOOR_MATERIALS = PRESET_MATERIALS.filter((m) => m.kind !== 'paint');

export const DEFAULT_WALL_COLOR = '#f4f1ea';

/** Project materials override presets with the same id. */
export function findMaterial(project: Project, id: string | undefined): Material | undefined {
  if (!id) return undefined;
  return project.library.materials[id] ?? PRESET_MATERIALS.find((m) => m.id === id);
}

/** A sensible floor pattern and module for a material. */
export function floorFinishFor(material: Material): FloorFinish {
  if (material.id.includes('herringbone')) {
    return {
      materialId: material.id,
      pattern: 'herringbone',
      module: { length: 600, width: 100 },
      rotationDeg: 0,
    };
  }
  switch (material.kind) {
    case 'wood':
      return {
        materialId: material.id,
        pattern: 'plank',
        module: { length: 1800, width: 190 },
        rotationDeg: 0,
      };
    case 'tile':
    case 'stone':
      return {
        materialId: material.id,
        pattern: 'tile',
        module: { length: 600, width: 600 },
        rotationDeg: 0,
      };
    default:
      return { materialId: material.id, pattern: 'seamless', rotationDeg: 0 };
  }
}

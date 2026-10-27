import type { Id, Project } from '../schema/types';

/** Every asset id a project refers to: the library index, textures, catalogue models, underlays. */
export function referencedAssetIds(project: Project): Set<Id> {
  const ids = new Set<Id>(Object.keys(project.library.assets));
  for (const material of Object.values(project.library.materials)) {
    if (material.texture) ids.add(material.texture.assetId);
  }
  for (const item of Object.values(project.library.catalog)) {
    if (item.model && 'assetId' in item.model) ids.add(item.model.assetId);
  }
  for (const variant of Object.values(project.variants)) {
    for (const building of Object.values(variant.scene.buildings)) {
      for (const floor of Object.values(building.floors)) {
        for (const underlay of Object.values(floor.underlays)) ids.add(underlay.assetId);
      }
    }
  }
  return ids;
}

/**
 * Returns a copy of `project` where asset ids are renamed per `mapping` (old id -> new id),
 * including the library index key and every reference to it.
 */
export function rekeyAssets(project: Project, mapping: Record<Id, Id>): Project {
  if (Object.keys(mapping).length === 0) return project;
  const copy = JSON.parse(JSON.stringify(project)) as Project;
  const to = (assetId: Id): Id => mapping[assetId] ?? assetId;
  const assets: Project['library']['assets'] = {};
  for (const [key, ref] of Object.entries(copy.library.assets)) {
    const next = to(key);
    assets[next] = { ...ref, id: next };
  }
  copy.library.assets = assets;
  for (const material of Object.values(copy.library.materials)) {
    if (material.texture) material.texture.assetId = to(material.texture.assetId);
  }
  for (const item of Object.values(copy.library.catalog)) {
    if (item.model && 'assetId' in item.model) item.model.assetId = to(item.model.assetId);
  }
  for (const variant of Object.values(copy.variants)) {
    for (const building of Object.values(variant.scene.buildings)) {
      for (const floor of Object.values(building.floors)) {
        for (const underlay of Object.values(floor.underlays)) underlay.assetId = to(underlay.assetId);
      }
    }
  }
  return copy;
}

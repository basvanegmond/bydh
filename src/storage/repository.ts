import type { Id, Project } from '@/domain/schema';

export interface ProjectSummary {
  id: Id;
  name: string;
  updatedAt: string;
}

export interface StoredAsset {
  id: Id;
  name: string;
  mime: string;
  blob: Blob;
}

/**
 * Every way of persisting projects goes through this interface (ADR 0003): IndexedDB today,
 * possibly Supabase later. Implementations validate and migrate what they load.
 */
export interface ProjectRepository {
  listProjects(): Promise<ProjectSummary[]>;
  loadProject(id: Id): Promise<Project | undefined>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: Id): Promise<void>;
  getAsset(id: Id): Promise<StoredAsset | undefined>;
  putAsset(asset: StoredAsset): Promise<void>;
}

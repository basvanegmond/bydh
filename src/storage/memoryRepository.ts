import type { Id, Project } from '@/domain/schema';
import type { ProjectRepository, ProjectSummary, StoredAsset } from './repository';

/** In-memory repository for tests and as a fallback when IndexedDB is unavailable. */
export class MemoryRepository implements ProjectRepository {
  private readonly projects = new Map<Id, Project>();
  private readonly assets = new Map<Id, StoredAsset>();

  async listProjects(): Promise<ProjectSummary[]> {
    return [...this.projects.values()]
      .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadProject(id: Id): Promise<Project | undefined> {
    const project = this.projects.get(id);
    return project && structuredClone(project);
  }

  async saveProject(project: Project): Promise<void> {
    this.projects.set(project.id, structuredClone(project));
  }

  async deleteProject(id: Id): Promise<void> {
    this.projects.delete(id);
  }

  async getAsset(id: Id): Promise<StoredAsset | undefined> {
    return this.assets.get(id);
  }

  async putAsset(asset: StoredAsset): Promise<void> {
    this.assets.set(asset.id, asset);
  }

  async deleteAsset(id: Id): Promise<void> {
    this.assets.delete(id);
  }
}

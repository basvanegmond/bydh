import Dexie from 'dexie';
import type { Table } from 'dexie';
import { parseProjectFile, toProjectFile } from '@/domain/schema';
import type { Id, Project, ProjectFile } from '@/domain/schema';
import type { ProjectRepository, ProjectSummary, StoredAsset } from './repository';

interface ProjectRow extends ProjectSummary {
  file: ProjectFile;
}

class BydhDatabase extends Dexie {
  projects!: Table<ProjectRow, Id>;
  assets!: Table<StoredAsset, Id>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ projects: 'id, updatedAt', assets: 'id' });
  }
}

/**
 * Browser storage. The database name includes the deploy channel, so a PR preview never reads
 * or migrates production data on the same origin (ADR 0004).
 */
export class IndexedDbRepository implements ProjectRepository {
  private readonly db: BydhDatabase;

  constructor(channel: string) {
    this.db = new BydhDatabase(`bydh-${channel}`);
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const rows = await this.db.projects.orderBy('updatedAt').reverse().toArray();
    return rows.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
  }

  async loadProject(id: Id): Promise<Project | undefined> {
    const row = await this.db.projects.get(id);
    if (!row) return undefined;
    // Stored files go through the same migration and validation as imported ones.
    const parsed = parseProjectFile(JSON.stringify(row.file));
    if (!parsed.ok) throw new Error(`Stored project "${row.name}" is invalid: ${parsed.message}`);
    return parsed.file.project;
  }

  async saveProject(project: Project): Promise<void> {
    await this.db.projects.put({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      file: toProjectFile(project),
    });
  }

  async deleteProject(id: Id): Promise<void> {
    await this.db.projects.delete(id);
  }

  async getAsset(id: Id): Promise<StoredAsset | undefined> {
    return this.db.assets.get(id);
  }

  async putAsset(asset: StoredAsset): Promise<void> {
    await this.db.assets.put(asset);
  }

  async deleteAsset(id: Id): Promise<void> {
    await this.db.assets.delete(id);
  }
}

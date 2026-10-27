// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addVariantsFrom, appendVariantsInto, asNewProject } from '@/domain/io/merge';
import { orderedFloors } from '@/domain/model/project';
import { syncRooms } from '@/domain/model/rooms';
import { createProject, parseProjectFile } from '@/domain/schema';
import type { Project } from '@/domain/schema';
import { IndexedDbRepository } from '@/storage/indexedDbRepository';
import { MemoryRepository } from '@/storage/memoryRepository';
import { deleteProjectWithAssets, exportProjectJson, importProjectJson } from '@/storage/projectFiles';
import { projectFileName } from '@/storage/fileAccess';
import { drawLoop, INTERIOR } from '../domain/fixtures';

function projectWithRoomAndUnderlay(): Project {
  const project = createProject('Synthetic house');
  const floor = orderedFloors(project)[0]!;
  drawLoop(
    floor,
    [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    INTERIOR,
  );
  syncRooms(floor);
  Object.values(floor.rooms)[0]!.name = 'Studio';
  project.library.assets['img1'] = {
    id: 'img1',
    kind: 'image',
    name: 'plan.png',
    mime: 'image/png',
    bytes: 4,
    sha256: 'x',
  };
  floor.underlays['u1'] = {
    id: 'u1',
    assetId: 'img1',
    imagePx: { w: 1000, h: 800 },
    position: { x: 0, y: 4000 },
    rotationDeg: 0,
    mmPerPx: 5,
    opacity: 0.5,
  };
  return project;
}

describe('IndexedDbRepository (fake-indexeddb)', () => {
  it('saves, lists newest first, loads and deletes projects', async () => {
    const repo = new IndexedDbRepository(`test-${Math.random()}`);
    const older = { ...createProject('Older'), updatedAt: '2026-01-01T00:00:00.000Z' };
    const newer = { ...projectWithRoomAndUnderlay(), updatedAt: '2026-02-01T00:00:00.000Z' };
    await repo.saveProject(older);
    await repo.saveProject(newer);
    expect((await repo.listProjects()).map((p) => p.name)).toEqual(['Synthetic house', 'Older']);
    expect(await repo.loadProject(newer.id)).toEqual(newer);
    await repo.deleteProject(older.id);
    expect(await repo.listProjects()).toHaveLength(1);
  });

  it('keeps deploy channels apart', async () => {
    const production = new IndexedDbRepository('production-test');
    const preview = new IndexedDbRepository('pr-7-test');
    await production.saveProject(createProject('Real'));
    expect(await preview.listProjects()).toEqual([]);
  });

  it('stores asset blobs', async () => {
    const repo = new IndexedDbRepository(`assets-${Math.random()}`);
    await repo.putAsset({
      id: 'a',
      name: 'a.png',
      mime: 'image/png',
      blob: new Blob([new Uint8Array([1, 2, 3])]),
    });
    const asset = await repo.getAsset('a');
    expect(new Uint8Array(await asset!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('JSON export and import', () => {
  it('round-trips a project with embedded assets into a new project', async () => {
    const source = new MemoryRepository();
    const project = projectWithRoomAndUnderlay();
    await source.putAsset({
      id: 'img1',
      name: 'plan.png',
      mime: 'image/png',
      blob: new Blob([new Uint8Array([137, 80, 78, 71])]),
    });
    const text = await exportProjectJson(project, source);
    expect(parseProjectFile(text).ok).toBe(true);

    const target = new MemoryRepository();
    const result = await importProjectJson(text, target, 'new-project', createProject('Other'), '(imported)');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.id).not.toBe(project.id);
    expect(result.project.variants).toEqual(project.variants);
    const asset = await target.getAsset('img1');
    expect(new Uint8Array(await asset!.blob.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it('adds imported variants to the open project without touching its own', async () => {
    const repo = new MemoryRepository();
    const current = createProject('Ours');
    const theirs = projectWithRoomAndUnderlay();
    const text = await exportProjectJson(theirs, repo);
    const result = await importProjectJson(text, repo, 'add-variants', current, '(imported)');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.id).toBe(current.id);
    expect(result.project.variantOrder).toHaveLength(2);
    expect(result.project.variants[current.activeVariantId]).toEqual(
      current.variants[current.activeVariantId],
    );
    const added = result.project.variants[result.project.variantOrder[1]!]!;
    expect(added.name).toBe('Current layout (imported)');
    expect(added.id).not.toBe(theirs.activeVariantId);
  });

  it('rejects invalid files with a readable message', async () => {
    const result = await importProjectJson(
      '{"hello":1}',
      new MemoryRepository(),
      'new-project',
      createProject('x'),
      '',
    );
    expect(result).toMatchObject({ ok: false });
  });
});

describe('merge helpers', () => {
  it('gives new projects a unique name', () => {
    const project = createProject('Home');
    expect(asNewProject(project, ['Home', 'Home (2)']).name).toBe('Home (3)');
  });

  it('numbers repeated variant names', () => {
    const ours = createProject('Ours');
    const theirs = createProject('Theirs');
    const once = addVariantsFrom(ours, theirs, '(imported)').project;
    const twice = addVariantsFrom(once, theirs, '(imported)').project;
    expect(Object.values(twice.variants).map((v) => v.name)).toEqual([
      'Current layout',
      'Current layout (imported)',
      'Current layout (imported) (2)',
    ]);
  });
});

describe('projectFileName', () => {
  it('makes a safe, readable file name', () => {
    expect(projectFileName('Ons Huis — variant B!')).toBe('ons-huis-variant-b.bydh.json');
    expect(projectFileName('')).toBe('project.bydh.json');
  });
});

describe('asset safety on import (ADR 0003)', () => {
  const bytes = (...n: number[]) => new Blob([new Uint8Array(n)], { type: 'image/png' });
  const read = async (repo: MemoryRepository, id: string) =>
    new Uint8Array(await (await repo.getAsset(id))!.blob.arrayBuffer());

  async function exported(data: Blob) {
    const source = new MemoryRepository();
    await source.putAsset({ id: 'img1', name: 'plan.png', mime: 'image/png', blob: data });
    return exportProjectJson(projectWithRoomAndUnderlay(), source);
  }

  it('skips an existing id with identical bytes', async () => {
    const target = new MemoryRepository();
    await target.putAsset({ id: 'img1', name: 'mine.png', mime: 'image/png', blob: bytes(1, 2) });
    const text = await exported(bytes(1, 2));
    const result = await importProjectJson(text, target, 'new-project', createProject('x'), '');
    expect(result.ok && Object.keys(result.imported.library.assets)).toEqual(['img1']);
    expect((await target.getAsset('img1'))!.name).toBe('mine.png');
  });

  it('re-keys an id whose bytes differ and rewrites references', async () => {
    const target = new MemoryRepository();
    await target.putAsset({ id: 'img1', name: 'mine.png', mime: 'image/png', blob: bytes(9, 9) });
    const text = await exported(bytes(1, 2));
    const result = await importProjectJson(text, target, 'new-project', createProject('x'), '');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await read(target, 'img1')).toEqual(new Uint8Array([9, 9]));
    const [newId] = Object.keys(result.imported.library.assets);
    expect(newId).not.toBe('img1');
    expect(result.imported.library.assets[newId!]!.id).toBe(newId);
    const floor = orderedFloors(result.project)[0]!;
    expect(Object.values(floor.underlays)[0]!.assetId).toBe(newId);
    expect(await read(target, newId!)).toEqual(new Uint8Array([1, 2]));
  });

  it('deletes only unreferenced images when a project is deleted', async () => {
    const repo = new MemoryRepository();
    const a = projectWithRoomAndUnderlay();
    const b = projectWithRoomAndUnderlay();
    b.id = 'other';
    b.library.assets['img2'] = { ...a.library.assets['img1']!, id: 'img2' };
    Object.values(orderedFloors(b)[0]!.underlays)[0]!.assetId = 'img2';
    delete b.library.assets['img1'];
    await repo.putAsset({ id: 'img1', name: 'p', mime: 'image/png', blob: bytes(1) });
    await repo.putAsset({ id: 'img2', name: 'p', mime: 'image/png', blob: bytes(2) });
    await repo.saveProject(a);
    await repo.saveProject(b);
    await deleteProjectWithAssets(repo, b.id);
    expect(await repo.getAsset('img1')).toBeDefined();
    expect(await repo.getAsset('img2')).toBeUndefined();
  });
});

describe('live-draft variant import', () => {
  it('only adds entries and clears dangling basedOnVariantId', () => {
    const ours = createProject('Ours');
    const theirs = createProject('Theirs');
    theirs.variants[theirs.activeVariantId]!.basedOnVariantId = 'not-in-this-project';
    theirs.library.materials['m'] = {
      id: 'm',
      name: 'Paint',
      kind: 'paint',
      color: '#ffffff',
      finish: 'matt',
    };
    ours.library.materials['m'] = { id: 'm', name: 'Mine', kind: 'paint', color: '#000000', finish: 'matt' };
    const before = structuredClone(ours.variants[ours.activeVariantId]);
    const added = appendVariantsInto(ours, theirs, '(imported)');
    expect(added[0]!.basedOnVariantId).toBeUndefined();
    expect(ours.library.materials['m']!.name).toBe('Mine');
    expect(ours.variants[ours.activeVariantId]).toEqual(before);
    expect(ours.variantOrder).toHaveLength(2);
  });
});

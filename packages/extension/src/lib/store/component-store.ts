import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ClonedComponent, ComponentVersion } from '../types';

interface CompliftDB extends DBSchema {
  components: {
    key: string;
    value: ClonedComponent;
  };
  versions: {
    key: string;
    value: ComponentVersion;
    indexes: { 'by-component': string };
  };
}

export interface CaptureMeta {
  name: string;
  sourceUrl: string;
  sourceSelector: string;
  width: number;
  height: number;
}

export interface VersionFiles {
  tsx: string;
  css: string;
}

export interface ComponentStore {
  createFromCapture(
    meta: CaptureMeta,
    files: VersionFiles,
  ): Promise<{ component: ClonedComponent; version: ComponentVersion }>;
  list(): Promise<ClonedComponent[]>;
  get(id: string): Promise<ClonedComponent>;
  getVersion(versionId: string): Promise<ComponentVersion>;
  history(componentId: string): Promise<ComponentVersion[]>;
  addVersion(
    componentId: string,
    files: VersionFiles,
    author: ComponentVersion['author'],
    message: string,
  ): Promise<ComponentVersion>;
  rollback(componentId: string, versionId: string): Promise<ComponentVersion>;
  remove(componentId: string): Promise<void>;
}

export function createComponentStore(dbName = 'complift'): ComponentStore {
  let dbPromise: Promise<IDBPDatabase<CompliftDB>> | null = null;

  function db(): Promise<IDBPDatabase<CompliftDB>> {
    dbPromise ??= openDB<CompliftDB>(dbName, 1, {
      upgrade(database) {
        database.createObjectStore('components', { keyPath: 'id' });
        const versions = database.createObjectStore('versions', { keyPath: 'id' });
        versions.createIndex('by-component', 'componentId');
      },
    });
    return dbPromise;
  }

  async function getComponent(id: string): Promise<ClonedComponent> {
    const component = await (await db()).get('components', id);
    if (!component) throw new Error(`Component not found: ${id}`);
    return component;
  }

  async function getVersion(versionId: string): Promise<ComponentVersion> {
    const version = await (await db()).get('versions', versionId);
    if (!version) throw new Error(`Version not found: ${versionId}`);
    return version;
  }

  async function appendVersion(
    componentId: string,
    files: VersionFiles,
    author: ComponentVersion['author'],
    message: string,
  ): Promise<ComponentVersion> {
    const component = await getComponent(componentId);
    const head = await getVersion(component.headVersionId);
    const version: ComponentVersion = {
      id: crypto.randomUUID(),
      componentId,
      seq: head.seq + 1,
      parentId: component.headVersionId,
      author,
      message,
      createdAt: Date.now(),
      files: { tsx: files.tsx, css: files.css },
    };
    const tx = (await db()).transaction(['components', 'versions'], 'readwrite');
    await tx.objectStore('versions').put(version);
    await tx
      .objectStore('components')
      .put({ ...component, headVersionId: version.id });
    await tx.done;
    return version;
  }

  return {
    async createFromCapture(meta, files) {
      const componentId = crypto.randomUUID();
      const version: ComponentVersion = {
        id: crypto.randomUUID(),
        componentId,
        seq: 1,
        parentId: null,
        author: 'capture',
        message: 'Captured from page',
        createdAt: Date.now(),
        files: { tsx: files.tsx, css: files.css },
      };
      const component: ClonedComponent = {
        id: componentId,
        name: meta.name,
        sourceUrl: meta.sourceUrl,
        sourceSelector: meta.sourceSelector,
        capturedAt: version.createdAt,
        width: meta.width,
        height: meta.height,
        headVersionId: version.id,
      };
      const tx = (await db()).transaction(['components', 'versions'], 'readwrite');
      await tx.objectStore('components').put(component);
      await tx.objectStore('versions').put(version);
      await tx.done;
      return { component, version };
    },

    async list() {
      return (await db()).getAll('components');
    },

    get: getComponent,

    getVersion,

    async history(componentId) {
      const versions = await (await db()).getAllFromIndex(
        'versions',
        'by-component',
        componentId,
      );
      return versions.sort((a, b) => a.seq - b.seq);
    },

    addVersion: appendVersion,

    async rollback(componentId, versionId) {
      const target = await getVersion(versionId);
      if (target.componentId !== componentId) {
        throw new Error(
          `Version ${versionId} does not belong to component ${componentId}`,
        );
      }
      return appendVersion(
        componentId,
        { ...target.files },
        'rollback',
        `Rollback to v${target.seq}`,
      );
    },

    async remove(componentId) {
      await getComponent(componentId);
      const database = await db();
      const tx = database.transaction(['components', 'versions'], 'readwrite');
      const versionStore = tx.objectStore('versions');
      const versionKeys = await versionStore
        .index('by-component')
        .getAllKeys(componentId);
      for (const key of versionKeys) {
        await versionStore.delete(key);
      }
      await tx.objectStore('components').delete(componentId);
      await tx.done;
    },
  };
}

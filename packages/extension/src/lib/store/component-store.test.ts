import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createComponentStore } from './component-store';

const meta = {
  name: 'PricingCard',
  sourceUrl: 'https://example.com/pricing',
  sourceSelector: 'main > div.card',
  width: 320,
  height: 480,
};
const files = { tsx: 'export const A = () => null;', css: '.a{}' };

let dbCounter = 0;
function freshStore() {
  dbCounter += 1;
  return createComponentStore(`complift-test-${Date.now()}-${dbCounter}`);
}

describe('createComponentStore', () => {
  it('createFromCapture creates component with head=v1 visible via list/get', async () => {
    const store = freshStore();
    const { component, version } = await store.createFromCapture(meta, files);

    expect(version.seq).toBe(1);
    expect(version.author).toBe('capture');
    expect(version.parentId).toBeNull();
    expect(version.componentId).toBe(component.id);
    expect(version.files).toEqual(files);
    expect(component.headVersionId).toBe(version.id);
    expect(component.name).toBe(meta.name);
    expect(component.sourceUrl).toBe(meta.sourceUrl);
    expect(component.sourceSelector).toBe(meta.sourceSelector);
    expect(component.width).toBe(meta.width);
    expect(component.height).toBe(meta.height);

    const listed = await store.list();
    expect(listed.map((c) => c.id)).toContain(component.id);
    const fetched = await store.get(component.id);
    expect(fetched).toEqual(component);
  });

  it('addVersion increments seq, moves head, sets parentId to previous head', async () => {
    const store = freshStore();
    const { component, version: v1 } = await store.createFromCapture(meta, files);

    const newFiles = { tsx: 'export const B = () => null;', css: '.b{}' };
    const v2 = await store.addVersion(component.id, newFiles, 'manual', 'tweak styles');

    expect(v2.seq).toBe(2);
    expect(v2.parentId).toBe(v1.id);
    expect(v2.author).toBe('manual');
    expect(v2.message).toBe('tweak styles');
    expect(v2.files).toEqual(newFiles);

    const updated = await store.get(component.id);
    expect(updated.headVersionId).toBe(v2.id);
  });

  it('rollback creates a NEW version with author rollback and copied files; original stays', async () => {
    const store = freshStore();
    const { component, version: v1 } = await store.createFromCapture(meta, files);
    const v2 = await store.addVersion(
      component.id,
      { tsx: 'changed', css: 'changed' },
      'agent',
      'agent edit',
    );

    const v3 = await store.rollback(component.id, v1.id);

    expect(v3.id).not.toBe(v1.id);
    expect(v3.seq).toBe(3);
    expect(v3.author).toBe('rollback');
    expect(v3.parentId).toBe(v2.id);
    expect(v3.files).toEqual(v1.files);

    // history is immutable: v1 and v2 still exist
    const all = await store.history(component.id);
    expect(all).toHaveLength(3);
    expect(await store.getVersion(v1.id)).toEqual(v1);
    expect(await store.getVersion(v2.id)).toEqual(v2);

    const updated = await store.get(component.id);
    expect(updated.headVersionId).toBe(v3.id);
  });

  it('history returns versions in ascending seq order', async () => {
    const store = freshStore();
    const { component } = await store.createFromCapture(meta, files);
    await store.addVersion(component.id, files, 'manual', 'v2');
    await store.addVersion(component.id, files, 'agent', 'v3');

    const hist = await store.history(component.id);
    expect(hist.map((v) => v.seq)).toEqual([1, 2, 3]);
  });

  it('get throws for unknown component id', async () => {
    const store = freshStore();
    await expect(store.get('no-such-id')).rejects.toThrow();
  });

  it('getVersion returns a stored version and throws for unknown id', async () => {
    const store = freshStore();
    const { version } = await store.createFromCapture(meta, files);
    expect(await store.getVersion(version.id)).toEqual(version);
    await expect(store.getVersion('no-such-version')).rejects.toThrow();
  });

  it('remove cascades: component gone and its versions unreachable', async () => {
    const store = freshStore();
    const { component, version } = await store.createFromCapture(meta, files);
    const v2 = await store.addVersion(component.id, files, 'manual', 'v2');

    await store.remove(component.id);

    await expect(store.get(component.id)).rejects.toThrow();
    await expect(store.getVersion(version.id)).rejects.toThrow();
    await expect(store.getVersion(v2.id)).rejects.toThrow();
    expect(await store.history(component.id)).toEqual([]);
  });

  it('multiple components keep independent histories', async () => {
    const store = freshStore();
    const a = await store.createFromCapture(meta, files);
    const b = await store.createFromCapture(
      { ...meta, name: 'NavBar' },
      { tsx: 'nav', css: 'nav{}' },
    );

    await store.addVersion(a.component.id, files, 'manual', 'a-v2');

    const histA = await store.history(a.component.id);
    const histB = await store.history(b.component.id);
    expect(histA).toHaveLength(2);
    expect(histB).toHaveLength(1);
    expect(histB[0]?.id).toBe(b.version.id);
    expect(histA.every((v) => v.componentId === a.component.id)).toBe(true);

    // removing a does not touch b
    await store.remove(a.component.id);
    expect(await store.history(b.component.id)).toHaveLength(1);
    expect((await store.get(b.component.id)).id).toBe(b.component.id);
  });

  it('concurrent addVersion calls serialize: seqs are exactly 2 and 3, head points at seq=3', async () => {
    const store = freshStore();
    const { component } = await store.createFromCapture(meta, files);

    const [a, b] = await Promise.all([
      store.addVersion(component.id, files, 'manual', 'first'),
      store.addVersion(component.id, files, 'agent', 'second'),
    ]);

    expect([a.seq, b.seq].sort((x, y) => x - y)).toEqual([2, 3]);
    const v3 = a.seq === 3 ? a : b;
    const updated = await store.get(component.id);
    expect(updated.headVersionId).toBe(v3.id);
    const hist = await store.history(component.id);
    expect(hist.map((v) => v.seq)).toEqual([1, 2, 3]);
  });

  it('addVersion throws for unknown component id', async () => {
    const store = freshStore();
    await expect(
      store.addVersion('no-such-id', files, 'manual', 'nope'),
    ).rejects.toThrow();
  });
});

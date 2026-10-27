import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3, type Material } from 'three';
import { batchStatic, mergeParts } from '../../src/scene/staticBatch';

const batched = (root: Group) => root.children.filter((c) => c.userData.batched) as Mesh[];

function scene() {
  const root = new Group();
  const steel = new MeshStandardMaterial();
  const paint = new MeshStandardMaterial();
  const glass = new MeshBasicMaterial({ transparent: true });
  const at = (x: number, material: Material = steel) => {
    const m = new Mesh(new BoxGeometry(1, 1, 1), material);
    m.position.x = x;
    root.add(m);
    return m;
  };
  return { root, steel, paint, glass, at };
}

describe('static batching', () => {
  it('draws same-material parts as one mesh in the same place, and hides the originals', () => {
    const { root, at } = scene();
    const a = at(-2);
    const b = at(2);
    const before = new Box3().setFromObject(root);
    const undo = batchStatic(root);
    const merged = batched(root);
    expect(merged).toHaveLength(1);
    expect(a.visible || b.visible).toBe(false);
    const box = new Box3().setFromObject(merged[0]!);
    expect(box.min.distanceTo(before.min)).toBeLessThan(1e-6);
    expect(box.max.distanceTo(before.max)).toBeLessThan(1e-6);
    undo();
    expect(batched(root)).toHaveLength(0);
    expect(a.visible && b.visible).toBe(true);
  });

  it('leaves transparent, dynamic, single and interactive parts alone', () => {
    const { root, glass, paint, at } = scene();
    at(0, glass);
    at(1, glass);
    at(2, paint);
    const live = at(3);
    live.userData.dynamic = true;
    const clickable = at(4);
    (clickable as unknown as { __r3f: unknown }).__r3f = { handlers: { onClick: () => {} } };
    batchStatic(root);
    expect(batched(root)).toHaveLength(0);
    expect(root.children.every((c) => c.visible)).toBe(true);
  });

  it('batches a moving group in its own space, so it can still move', () => {
    const { root, steel } = scene();
    const arm = new Group();
    arm.userData.batch = true;
    arm.position.set(5, 0, 0);
    for (const y of [0, 1]) {
      const m = new Mesh(new BoxGeometry(1, 1, 1), steel);
      m.position.y = y;
      arm.add(m);
    }
    root.add(arm);
    batchStatic(root);
    expect(batched(root)).toHaveLength(0);
    const inArm = batched(arm);
    expect(inArm).toHaveLength(1);
    // Moving the group after batching carries the merged mesh with it.
    arm.position.x = 9;
    arm.updateMatrixWorld(true);
    const centre = new Box3().setFromObject(inArm[0]!).getCenter(new Vector3());
    expect(centre.x).toBeCloseTo(9);
  });

  it('keeps a mirrored part facing outwards', () => {
    const flipped = mergeParts([{ geometry: new BoxGeometry(1, 1, 1), matrix: new Matrix4().makeScale(-1, 1, 1) }]);
    // Winding of the first triangle, against its (transformed) normal.
    const p = flipped.attributes.position!;
    const n = flipped.attributes.normal!;
    const i = flipped.index!;
    const v = (k: number) => new Vector3().fromBufferAttribute(p, i.getX(k));
    const face = new Vector3().subVectors(v(1), v(0)).cross(new Vector3().subVectors(v(2), v(0)));
    expect(face.dot(new Vector3().fromBufferAttribute(n, i.getX(0)))).toBeGreaterThan(0);
  });
});

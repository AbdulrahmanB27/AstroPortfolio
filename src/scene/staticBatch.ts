import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, Mesh, Vector3, type Material, type Object3D } from 'three';

/**
 * Draw-call batching for set pieces that never change shape.
 *
 * The cabin, the rocket and the suit are modelled the way the things are built — a rib is a
 * box, every bolt is a cylinder, every knee ring is a torus — and that is several hundred
 * meshes, each its own draw call, most of them a few pixels across. Measured in the cabin: 434
 * draw calls a frame, 113 of them the sun's shadow pass. On a phone the cost of a draw call is
 * mostly the CPU telling the GPU about it, so it does not matter how small the bolt is.
 *
 * So after mount, every opaque mesh under a batch root is copied into one mesh per material,
 * in the root's own space, and the originals are hidden. React still owns the originals; it
 * just never draws them. Nothing about what is on screen changes.
 *
 * Two markers, set in `userData` where the parts are authored:
 *  - `batch`: this group moves as a whole (an arm, the hatch, the head), so it is batched on
 *    its own and its parent's batch leaves it out.
 *  - `dynamic`: this changes by itself (scale, visibility, its own material, its size), so it
 *    is left as it is, with everything under it.
 *
 * Transparent meshes are always left alone: they are sorted per object, and merging them
 * would change what draws over what.
 */

/** `?nobatch` draws every part on its own, to compare a frame against the batched one. */
const DISABLED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nobatch');

type Part = { geometry: BufferGeometry; matrix: Matrix4 };
type Bucket = { material: Material; cast: boolean; receive: boolean; parts: Part[]; sources: Mesh[] };
type SingleMesh = Mesh & { material: Material };

function hasHandlers(o: Object3D): boolean {
  const r3f = (o as unknown as { __r3f?: { handlers?: Record<string, unknown> } }).__r3f;
  return !!r3f?.handlers && Object.keys(r3f.handlers).length > 0;
}

function batchable(o: Object3D): o is SingleMesh {
  const mesh = o as Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean };
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh) return false;
  if (Array.isArray(mesh.material) || mesh.material.transparent) return false;
  if (mesh.morphTargetInfluences?.length || mesh.renderOrder !== 0 || !mesh.frustumCulled) return false;
  if (!mesh.geometry.attributes.position || mesh.userData.dynamic || hasHandlers(mesh)) return false;
  return true;
}

/** Concatenate parts into one geometry with position, normal and uv, in the batch root's space. */
export function mergeParts(parts: Part[]): BufferGeometry {
  let vertices = 0;
  let indices = 0;
  for (const { geometry } of parts) {
    const n = geometry.attributes.position!.count;
    vertices += n;
    indices += geometry.index ? geometry.index.count : n;
  }
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  const v = new Vector3();
  const nm = new Matrix3();
  let vo = 0;
  let io = 0;
  for (const { geometry, matrix } of parts) {
    const pos = geometry.attributes.position!;
    const nor = geometry.attributes.normal;
    const tex = geometry.attributes.uv;
    nm.getNormalMatrix(matrix);
    for (let i = 0; i < pos.count; i++) {
      const o3 = (vo + i) * 3;
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      position[o3] = v.x;
      position[o3 + 1] = v.y;
      position[o3 + 2] = v.z;
      if (nor) {
        v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        normal[o3] = v.x;
        normal[o3 + 1] = v.y;
        normal[o3 + 2] = v.z;
      }
      if (tex) {
        uv[(vo + i) * 2] = tex.getX(i);
        uv[(vo + i) * 2 + 1] = tex.getY(i);
      }
    }
    // A mirrored part has its triangles wound the other way. Drawn on its own, three flips
    // the front face for it; inside a merged mesh nothing would, and it would render inside out.
    const flip = matrix.determinant() < 0;
    const src = geometry.index;
    const count = src ? src.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const a = src ? src.getX(i) : i;
      const b = src ? src.getX(i + 1) : i + 1;
      const c = src ? src.getX(i + 2) : i + 2;
      index[io + i] = vo + a;
      index[io + i + 1] = vo + (flip ? c : b);
      index[io + i + 2] = vo + (flip ? b : c);
    }
    vo += pos.count;
    io += count;
  }
  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(position, 3));
  merged.setAttribute('normal', new BufferAttribute(normal, 3));
  merged.setAttribute('uv', new BufferAttribute(uv, 2));
  merged.setIndex(new BufferAttribute(index, 1));
  // A part without normals of its own got zeros above. Nothing batched today lacks them; if
  // something ever does, smooth normals for the lot beat black faces.
  if (parts.some((p) => !p.geometry.attributes.normal)) merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

function batchOne(root: Object3D): () => void {
  const toRoot = new Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, Bucket>();
  const visit = (o: Object3D) => {
    if (o !== root && (o.userData.batch || o.userData.dynamic || !o.visible)) return;
    if (batchable(o)) {
      const key = `${o.material.uuid}:${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: o.material, cast: o.castShadow, receive: o.receiveShadow, parts: [], sources: [] };
        buckets.set(key, bucket);
      }
      bucket.parts.push({ geometry: o.geometry, matrix: new Matrix4().multiplyMatrices(toRoot, o.matrixWorld) });
      bucket.sources.push(o);
    }
    for (const child of o.children) visit(child);
  };
  visit(root);

  const added: Mesh[] = [];
  const hidden: Mesh[] = [];
  for (const bucket of buckets.values()) {
    // One mesh is already one draw call.
    if (bucket.sources.length < 2) continue;
    const mesh = new Mesh(mergeParts(bucket.parts), bucket.material);
    mesh.name = `batch:${bucket.material.name || bucket.material.type}`;
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    mesh.userData.batched = true;
    root.add(mesh);
    added.push(mesh);
    for (const src of bucket.sources) {
      src.visible = false;
      hidden.push(src);
    }
  }
  return () => {
    for (const mesh of added) {
      root.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const src of hidden) src.visible = true;
  };
}

/**
 * Batch `root` and every group under it marked `userData.batch`, each in its own space.
 * Returns the undo, for an effect's cleanup.
 */
export function batchStatic(root: Object3D): () => void {
  if (DISABLED) return () => {};
  root.updateWorldMatrix(true, true);
  const roots: Object3D[] = [root];
  root.traverse((o) => {
    if (o !== root && o.userData.batch) roots.push(o);
  });
  const undo = roots.map(batchOne);
  return () => undo.forEach((u) => u());
}

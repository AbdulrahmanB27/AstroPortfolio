// Draco-compress every GLB in public/models in place (idempotent). Run after the Blender build scripts:
//   node tools/assets/compress.mjs [name.glb ...]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions'
import { draco } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'models')
const only = process.argv.slice(2)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
})

for (const name of readdirSync(dir).filter((f) => f.endsWith('.glb') && (only.length === 0 || only.includes(f)))) {
  const file = join(dir, name)
  const before = statSync(file).size
  const doc = await io.read(file)
  if (doc.getRoot().listExtensionsUsed().some((e) => e instanceof KHRDracoMeshCompression)) {
    console.log(`${name.padEnd(22)} already compressed (${(before / 1024).toFixed(0)} KB)`)
    continue
  }
  await doc.transform(draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8, quantizeTexcoord: 13 }))
  await io.write(file, doc)
  const after = statSync(file).size
  console.log(`${name.padEnd(22)} ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`)
}

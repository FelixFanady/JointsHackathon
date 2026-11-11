import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const bundle = new URL(import.meta.resolve('@mediapipe/tasks-vision'));
const assets = new URL('../public/face-landmarker/', import.meta.url);

await mkdir(assets, { recursive: true });
await Promise.all([
  cp(bundle, new URL('vision_bundle.mjs', assets)),
  cp(fileURLToPath(new URL('wasm/', bundle)), fileURLToPath(new URL('wasm/', assets)), {
    recursive: true,
  }),
]);

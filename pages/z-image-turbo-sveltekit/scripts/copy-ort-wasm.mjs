import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'node_modules', 'onnxruntime-web', 'dist');
const targetDir = path.join(projectRoot, 'static', 'onnx');

if (!existsSync(sourceDir)) {
  console.error('onnxruntime-web dist folder was not found. Run npm install first.');
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
const files = readdirSync(sourceDir).filter((name) => name.endsWith('.wasm'));

if (files.length === 0) {
  console.error('No .wasm files found in onnxruntime-web/dist.');
  process.exit(1);
}

for (const name of files) {
  cpSync(path.join(sourceDir, name), path.join(targetDir, name));
}

console.log(`Copied ${files.length} ONNX Runtime wasm file(s) to static/onnx.`);

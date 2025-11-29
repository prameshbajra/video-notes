import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.join(__dirname, '..');
const distDir = path.join(extensionRoot, 'dist');

rmSync(distDir, { recursive: true, force: true });

const tscResult = spawnSync('npx', ['tsc', '--project', path.join(extensionRoot, 'tsconfig.json')], {
  stdio: 'inherit'
});

if (tscResult.status !== 0) {
  process.exit(tscResult.status ?? 1);
}

const staticAssets = ['manifest.json', 'icons', 'popup/popup.html', 'popup/popup.css'];

for (const asset of staticAssets) {
  const source = path.join(extensionRoot, asset);
  const destination = path.join(distDir, asset);

  if (!existsSync(source)) {
    process.stderr.write(`Skipping missing asset: ${asset}\n`);
    continue;
  }

  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

process.stdout.write('Extension build complete. Output ready at extension/dist\n');

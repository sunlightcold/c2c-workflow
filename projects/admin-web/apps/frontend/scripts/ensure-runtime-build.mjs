import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceDir = resolve(frontendDir, '../..');
const sharedDistDir = resolve(workspaceDir, 'packages/@core/base/shared/dist');
const expectedEntries = [
  'store.mjs',
  'global-state.mjs',
  'constants/index.mjs',
  'utils/index.mjs',
  'color/index.mjs',
  'cache/index.mjs',
];

const needsBuild = expectedEntries.some((entry) => {
  const file = resolve(sharedDistDir, entry);
  if (!existsSync(file)) return true;

  const content = readFileSync(file, 'utf8');
  return /node_modules[\\/]jiti|from ['"][^'"\n]*jiti/i.test(content);
});

if (needsBuild) {
  console.warn(
    'Building @vben-core/shared runtime artifacts before frontend build...',
  );
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(
    pnpm,
    ['--filter', '@vben-core/shared', 'run', 'build'],
    {
      cwd: workspaceDir,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `@vben-core/shared build failed with exit code ${result.status ?? 'unknown'}`,
    );
  }
}

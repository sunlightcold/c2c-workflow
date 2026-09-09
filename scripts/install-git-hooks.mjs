import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const huskyModule = resolve(
  repositoryRoot,
  'projects/admin-web/node_modules/husky/index.js',
);

process.chdir(repositoryRoot);
const { default: husky } = await import(pathToFileURL(huskyModule).href);
const output = husky('.husky');

if (output) {
  process.stdout.write(`${output}\n`);
}

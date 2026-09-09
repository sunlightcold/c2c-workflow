import type { CAC } from 'cac';

import { execaCommand } from '@vben/node-utils';

interface LintCommandOptions {
  /**
   * Format lint problem.
   */
  format?: boolean;
}

const lintEnv = {
  ...process.env,
  NODE_OPTIONS:
    `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=8192`.trim(),
};

async function runLint({ format }: LintCommandOptions) {
  // process.env.FORCE_COLOR = '3';

  if (format) {
    await execaCommand(`stylelint "**/*.{vue,css,less,scss}" --cache --fix`, {
      stdio: 'inherit',
    });
    await execaCommand(`eslint . --cache --fix`, {
      env: lintEnv,
      stdio: 'inherit',
    });
    await execaCommand(`prettier . --write --cache --log-level warn`, {
      stdio: 'inherit',
    });
    return;
  }
  await execaCommand(`eslint . --cache`, {
    env: lintEnv,
    stdio: 'inherit',
  });
  await execaCommand(`prettier . --ignore-unknown --check --cache`, {
    stdio: 'inherit',
  });
  await execaCommand(`stylelint "**/*.{vue,css,less,scss}" --cache`, {
    stdio: 'inherit',
  });
}

function defineLintCommand(cac: CAC) {
  cac
    .command('lint')
    .usage('Batch execute project lint check.')
    .option('--format', 'Format lint problem.')
    .action(runLint);
}

export { defineLintCommand };

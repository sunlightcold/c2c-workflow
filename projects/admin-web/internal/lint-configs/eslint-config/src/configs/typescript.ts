import type { Linter } from 'eslint';

import { interopDefault } from '../util';

export async function typescript(): Promise<Linter.Config[]> {
  const [pluginTs, parserTs] = await Promise.all([
    interopDefault(import('@typescript-eslint/eslint-plugin')),
    // @ts-expect-error missing types
    interopDefault(import('@typescript-eslint/parser')),
  ] as const);

  const files = ['**/*.?([cm])[jt]s?(x)'];
  const typedFiles = [
    'apps/*/src/**/*.?([cm])[jt]s?(x)',
    'apps/*/types/**/*.d.ts',
    'internal/*/src/**/*.?([cm])[jt]s?(x)',
    'libs/*/src/**/*.?([cm])[jt]s?(x)',
    'packages/**/src/**/*.?([cm])[jt]s?(x)',
    'scripts/*/src/**/*.?([cm])[jt]s?(x)',
  ];

  return [
    {
      files,
      languageOptions: {
        parser: parserTs,
        parserOptions: {
          createDefaultProgram: false,
          ecmaFeatures: {
            jsx: true,
          },
          ecmaVersion: 'latest',
          extraFileExtensions: ['.vue'],
          jsxPragma: 'React',
          sourceType: 'module',
        },
      },
      plugins: {
        '@typescript-eslint': pluginTs,
      },
      rules: {
        ...pluginTs.configs['eslint-recommended'].overrides?.[0].rules,
        ...pluginTs.configs.strict.rules,
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-check': false,
            'ts-expect-error': 'allow-with-description',
            'ts-ignore': 'allow-with-description',
            'ts-nocheck': 'allow-with-description',
          },
        ],

        // '@typescript-eslint/consistent-type-definitions': ['warn', 'interface'],
        '@typescript-eslint/consistent-type-definitions': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-empty-function': [
          'error',
          {
            allow: ['arrowFunctions', 'functions', 'methods'],
          },
        ],
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-namespace': 'off',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/no-unused-expressions': 'off',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
          },
        ],
        '@typescript-eslint/no-use-before-define': 'off',
        '@typescript-eslint/no-var-requires': 'error',
        'unused-imports/no-unused-vars': 'off',
      },
    },
    {
      files: typedFiles,
      languageOptions: {
        parserOptions: {
          project: true,
        },
      },
    },
  ];
}

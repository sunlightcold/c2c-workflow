// @ts-check
import eslint from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import alloyRules from './eslint-rules.mjs'

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'eslint-rules.mjs',
      'dist/**',
      'node_modules/**',
      '**/*.js',
      '**/*.mjs',
      'logs/**',
      'coverage/**',
      'test/e2e/**',
      '*.config.js',
      '*.config.mjs',
    ],
  },
  // ESLint 推荐配置
  eslint.configs.recommended,
  // TypeScript ESLint 推荐配置（包含类型检查）
  ...tseslint.configs.recommendedTypeChecked,
  // 引入基于 Alloy 的规则配置
  // @ts-expect-error - alloyRules 类型推断问题，但运行时正常
  alloyRules,
  // Prettier 集成
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        // @ts-ignore
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['apps/**/*.ts', 'common/**/*.ts'],
    ignores: [
      'common/time/**',
      'apps/admin/bootstrap/timezone.bootstrap.ts',
      'test/e2e/**',
      'dist/**',
      'node_modules/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['dayjs'],
              message:
                'Do not import dayjs in application code. Use @/common/time for business time, SQL time, TypeORM time ranges, or clock helpers.',
            },
            {
              group: ['dayjs/plugin/*'],
              message:
                'Do not import dayjs plugins in business code. Initialize timezone in bootstrap files only.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.object.name='dayjs'][callee.object.property.name='tz'][callee.property.name='setDefault']",
          message:
            'Do not call dayjs.tz.setDefault in business code. Initialize timezone in bootstrap files only.',
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      'max-params': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
)

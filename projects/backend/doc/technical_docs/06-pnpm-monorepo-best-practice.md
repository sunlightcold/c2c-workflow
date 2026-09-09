# PNPM Monorepo Best Practice (Applied)

## 1) Decisions applied in this repo

- Workspace root package name is `@tpl-backend/workspace` and is `private: true`.
- Backend app package name is `@tpl-backend/server-backend`.
- Root scripts now use path filters, for example:
  - `pnpm --filter ./server/backend run build`
- `pnpm-workspace.yaml` now defines `onlyBuiltDependencies` for native/binary deps:
  - `@swc/core`, `esbuild`, `sharp`

## 2) Why VSCode should use `server/backend` TypeScript

TypeScript is installed in `server/backend/node_modules/typescript`.
So `.vscode/settings.json` should point `typescript.tsdk` to that location, to keep IDE type checking aligned with backend build/runtime tooling.

## 3) Workspace command contract

- Dev backend: `pnpm run dev:server`
- Build backend: `pnpm run build:server`
- Build libs: `pnpm run build:libs`
- Typecheck backend: `pnpm run typecheck:server`
- Test backend: `pnpm run test:server`
- Catalog migrate: `pnpm run catalog`
- Catalog validate: `pnpm run catalog:check`
- Workspace validate: `pnpm run workspace:check`
- Full monorepo validate: `pnpm run monorepo:check`

## 4) New package rules

1. Place packages under `libs/*` or `server/*` (match `pnpm-workspace.yaml`).
2. Use unique scoped names: `@tpl-backend/<pkg-name>`.
3. Do not reuse root package name.
4. Prefer path filters in root scripts.
5. Keep `package.json` scripts limited to general engineering commands such as dev, build, lint, test, typecheck, format, and workspace validation. Data-maintenance commands such as `reset:*`, `backfill:*`, `seed:*`, `fix:*`, `migrate:*`, and `repair:*` must stay as explicit files under `server/backend/scripts/` and be run directly with `pnpm --dir server/backend exec cross-env NODE_ENV=development ts-node ...`.

## 5) External references used

- pnpm workspace docs: https://pnpm.io/pnpm-workspace_yaml
- pnpm filtering docs: https://pnpm.io/filtering
- Vue core repo: https://github.com/vuejs/core
- Element Plus repo: https://github.com/element-plus/element-plus
- Turborepo repo: https://github.com/vercel/turborepo

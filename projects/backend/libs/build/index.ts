import AdmZip from 'adm-zip'
import { cpSync } from 'node:fs'
import { basename, join } from 'path'
import Shell from 'shelljs'

const excludedBuildContextDirectories = new Set([
  'coverage',
  'dist',
  'logs',
  'node_modules',
  'pm2logs',
])

function copyBuildContextDirectory(source: string, destination: string) {
  cpSync(source, destination, {
    recursive: true,
    filter: (path) => !excludedBuildContextDirectories.has(basename(path)),
  })
}

async function handler() {
  // 获取工作区根目录
  const workspaceRootPath = join(process.cwd(), '../..')
  // 获取后端根目录
  const backendRootPath = join(workspaceRootPath, './server/backend')
  // 获取构建后的 dist 路径
  const distPath = join(backendRootPath, 'dist')
  // 获取 docker 路径
  const dockerPath = join(workspaceRootPath, './docker')

  // 获取输出路径
  const outPath = join(workspaceRootPath, 'output')
  // 获取 volumes 路径
  const volumesPath = join(outPath, 'volumes')
  // 获取应用配置路径
  const appConfigPath = join(volumesPath, 'config')
  const logsPath = join(volumesPath, 'logs')
  const initJsonSourcePath = join(backendRootPath, 'initJson')
  const initJsonPath = join(volumesPath, 'initJson')
  const appsPath = join(volumesPath, 'apps')

  // Build backend app with a custom webpack config so we can raise
  // ForkTsChecker memory limits for large local workspaces.
  const buildEnv = {
    ...process.env,
    NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=4096',
    FORK_TS_CHECKER_MEMORY_LIMIT: process.env.FORK_TS_CHECKER_MEMORY_LIMIT ?? '4096',
  }
  function runBuild(buildCommand: string) {
    if (Shell.exec(buildCommand, { cwd: backendRootPath, env: buildEnv }).code !== 0) {
      Shell.echo(`Error: ${buildCommand}`)
      Shell.exit(1)
    }
  }

  Shell.rm('-rf', outPath)
  // 创建输出目录
  Shell.mkdir(outPath, volumesPath, appConfigPath, logsPath, appsPath)

  runBuild('npx nest build --builder webpack --webpackPath webpack.build.config.js admin')
  Shell.cp('-R', join(distPath, 'apps/admin'), appsPath)

  runBuild('npx nest build --builder webpack --webpackPath webpack.build.config.js migrate')
  Shell.cp('-R', join(distPath, 'apps/migrate'), appsPath)

  runBuild(
    'npx tsc config/production.ts --target ES2022 --module CommonJS --moduleResolution Node --esModuleInterop --skipLibCheck --outDir dist/config',
  )

  // 复制配置文件
  Shell.cp('-R', join(distPath, 'config/production.js'), appConfigPath)
  // 复制数据库数据文件
  if (Shell.test('-d', initJsonSourcePath)) {
    Shell.cp('-R', initJsonSourcePath, initJsonPath)
  }
  // 复制 docker-compose
  Shell.cp('-R', join(dockerPath, 'compose.yaml'), outPath)
  Shell.cp('-R', join(dockerPath, 'Dockerfile'), outPath)
  Shell.cp('-R', join(workspaceRootPath, '.dockerignore'), join(outPath, '.dockerignore'))
  // Include the backend workspace as a self-contained Docker build context so
  // the server can build the image locally without GHCR access.
  Shell.cp('-R', join(workspaceRootPath, 'package.json'), outPath)
  Shell.cp('-R', join(workspaceRootPath, 'pnpm-workspace.yaml'), outPath)
  Shell.cp('-R', join(workspaceRootPath, 'pnpm-lock.yaml'), outPath)
  copyBuildContextDirectory(join(workspaceRootPath, 'libs'), join(outPath, 'libs'))
  copyBuildContextDirectory(join(workspaceRootPath, 'server'), join(outPath, 'server'))
  Shell.cp('-R', join(dockerPath, 'backup.sh'), outPath)
  Shell.cp('-R', join(dockerPath, 'diagnose-platform-confirmation.sh'), outPath)
  Shell.cp('-R', join(dockerPath, 'readme.md'), join(outPath, 'README.md'))
  // 复制服务器部署变量模板
  Shell.cp('-R', join(workspaceRootPath, '.env.docker.example'), join(outPath, '.env.example'))

  console.log('build nestjs success, output path: ./output')

  await new Promise((resolve) => setTimeout(resolve, 1000))
  const zip = new AdmZip()
  zip.addLocalFolder(outPath)
  zip.writeZip(join(workspaceRootPath, 'output.zip'))
  console.log('zip success, output path: ./output.zip')
}

async function build() {
  await handler()
}

build()

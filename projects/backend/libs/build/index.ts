import AdmZip from 'adm-zip'
import { join } from 'path'
import Shell from 'shelljs'

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
  const buildCommands = [
    'npx nest build --builder webpack --webpackPath webpack.build.config.js admin',
    'npx nest build --builder webpack --webpackPath webpack.build.config.js migrate',
  ]
  for (const buildCommand of buildCommands) {
    if (Shell.exec(buildCommand, { cwd: backendRootPath, env: buildEnv }).code !== 0) {
      Shell.echo(`Error: ${buildCommand}`)
      Shell.exit(1)
    }
  }

  Shell.rm('-rf', outPath)
  // 创建输出目录
  Shell.mkdir(outPath, volumesPath, appConfigPath, logsPath, appsPath)

  // 复制配置文件
  Shell.cp(
    '-R',
    join(backendRootPath, 'config/production.ts'),
    join(appConfigPath, 'production.js'),
  )
  // 复制数据库数据文件
  if (Shell.test('-d', initJsonSourcePath)) {
    Shell.cp('-R', initJsonSourcePath, initJsonPath)
  }
  // 复制应用构建代码
  Shell.cp('-R', join(distPath, 'apps'), volumesPath)
  // 复制 docker-compose
  Shell.cp('-R', join(dockerPath, 'compose.yaml'), outPath)
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

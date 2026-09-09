import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const workspaceYamlPath = path.join(rootDir, 'pnpm-workspace.yaml')
const rootPackageJsonPath = path.join(rootDir, 'package.json')
const vscodeSettingsPath = path.join(rootDir, '.vscode', 'settings.json')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function collectWorkspacePatterns(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  const patterns = []
  let inPackages = false

  for (const line of lines) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true
      continue
    }
    if (inPackages && /^\S/.test(line)) {
      break
    }
    if (!inPackages) continue

    const match = line.match(/^\s*-\s+(.+?)\s*$/)
    if (match) {
      patterns.push(match[1].replace(/^['"]|['"]$/g, ''))
    }
  }

  return patterns
}

function collectPackageJsonPaths(patterns) {
  const result = ['package.json']

  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const baseDir = path.join(rootDir, pattern.slice(0, -2))
      if (!fs.existsSync(baseDir)) continue

      for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const pkgPath = path.join(baseDir, entry.name, 'package.json')
        if (fs.existsSync(pkgPath)) {
          result.push(path.relative(rootDir, pkgPath).replace(/\\/g, '/'))
        }
      }
      continue
    }

    const pkgPath = path.join(rootDir, pattern, 'package.json')
    if (fs.existsSync(pkgPath)) {
      result.push(path.relative(rootDir, pkgPath).replace(/\\/g, '/'))
    }
  }

  return Array.from(new Set(result))
}

const rootPkg = readJson(rootPackageJsonPath)
const rootPm = rootPkg.packageManager
const workspacePatterns = collectWorkspacePatterns(workspaceYamlPath)
const packageJsonPaths = collectPackageJsonPaths(workspacePatterns)
const nameMap = new Map()
const violations = []
const forbiddenMaintenanceScriptPatterns = [
  /^(backfill|fix|reset|seed)(:|$)/,
  /^(migrate|repair)(:|$)/,
]

for (const pkgPath of packageJsonPaths) {
  const pkg = readJson(path.join(rootDir, pkgPath))

  if (!pkg.name || typeof pkg.name !== 'string') {
    violations.push(`${pkgPath}: missing package name`)
    continue
  }

  if (nameMap.has(pkg.name)) {
    violations.push(`${pkgPath}: duplicate package name "${pkg.name}" (already used by ${nameMap.get(pkg.name)})`)
  } else {
    nameMap.set(pkg.name, pkgPath)
  }

  if (pkgPath !== 'package.json' && pkg.packageManager !== rootPm) {
    violations.push(`${pkgPath}: packageManager must match root (${rootPm}), current=${pkg.packageManager ?? 'undefined'}`)
  }
}

for (const [scriptName, scriptBody] of Object.entries(rootPkg.scripts ?? {})) {
  if (typeof scriptBody !== 'string' || !scriptBody.includes('--filter')) continue
  const usesPathFilter = /--filter(\s|=)\.\//.test(scriptBody)
  if (!usesPathFilter) {
    violations.push(`package.json:scripts.${scriptName} should use path filter (./...), current="${scriptBody}"`)
  }
}

for (const pkgPath of packageJsonPaths) {
  const pkg = readJson(path.join(rootDir, pkgPath))
  for (const scriptName of Object.keys(pkg.scripts ?? {})) {
    if (!forbiddenMaintenanceScriptPatterns.some(pattern => pattern.test(scriptName))) {
      continue
    }

    violations.push(
      `${pkgPath}: scripts.${scriptName} is a data-maintenance command and must not be registered in package.json; run the script file directly instead`,
    )
  }
}

if (!fs.existsSync(vscodeSettingsPath)) {
  violations.push('.vscode/settings.json is missing')
} else {
  const vscodeSettings = readJson(vscodeSettingsPath)
  const tsdk =
    vscodeSettings['typescript.tsdk'] ??
    vscodeSettings['js/ts.tsdk.path']
  if (!tsdk || typeof tsdk !== 'string') {
    violations.push('.vscode/settings.json missing TS SDK config ("typescript.tsdk" or "js/ts.tsdk.path")')
  } else {
    const tsdkPath = path.join(rootDir, tsdk)
    if (!fs.existsSync(tsdkPath)) {
      violations.push(`.vscode/settings.json TS SDK path does not exist: ${tsdk}`)
    }
  }
}

if (violations.length > 0) {
  console.error('Workspace check failed:')
  for (const item of violations) {
    console.error(`- ${item}`)
  }
  process.exit(1)
}

console.log(`Workspace check passed for ${packageJsonPaths.length} package.json files.`)

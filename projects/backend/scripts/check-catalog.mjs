import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const workspaceFile = path.join(rootDir, 'pnpm-workspace.yaml')

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

    if (!inPackages) {
      continue
    }

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

function isAllowedSpec(spec) {
  return (
    spec.startsWith('catalog:') ||
    spec.startsWith('workspace:') ||
    spec.startsWith('file:') ||
    spec.startsWith('link:')
  )
}

const patterns = collectWorkspacePatterns(workspaceFile)
const packageJsonPaths = collectPackageJsonPaths(patterns)
const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
const violations = []

for (const pkgPath of packageJsonPaths) {
  const json = readJson(path.join(rootDir, pkgPath))
  for (const section of sections) {
    const deps = json[section]
    if (!deps || typeof deps !== 'object') continue

    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== 'string') continue
      if (!isAllowedSpec(spec)) {
        violations.push(`${pkgPath} -> ${section}.${name} = ${spec}`)
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Found non-catalog dependency specs:')
  for (const item of violations) {
    console.error(`- ${item}`)
  }
  process.exit(1)
}

console.log(`Catalog check passed for ${packageJsonPaths.length} package.json files.`)

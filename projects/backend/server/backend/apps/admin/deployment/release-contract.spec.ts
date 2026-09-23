import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('backend release contract', () => {
  const backendRoot = resolve(__dirname, '../../../../..')
  const deployScript = readFileSync(resolve(backendRoot, 'docker/deploy.sh'), 'utf8')
  const dockerfile = readFileSync(resolve(backendRoot, 'docker/Dockerfile'), 'utf8')
  const releaseBuilder = readFileSync(resolve(backendRoot, 'libs/build/index.ts'), 'utf8')

  it('packages precompiled applications and verifies the image before replacement', () => {
    expect(dockerfile).toContain('COPY --chown=node:node volumes/apps ./dist/apps')
    expect(releaseBuilder).toContain('requiredReleaseFiles')
    expect(releaseBuilder).toContain("localBin('nest')")
    expect(releaseBuilder).toContain("localBin('tsc')")
    expect(releaseBuilder).not.toContain('npx nest')
    expect(releaseBuilder).not.toContain('npx tsc')
    expect(deployScript).toContain('verify_image_bundle admin "$admin_bundle_hash"')
    expect(deployScript).toContain('verify_image_bundle migrate "$migrate_bundle_hash"')
    expect(deployScript).toContain('compose up -d --no-deps --remove-orphans --force-recreate app')
    expect(deployScript.indexOf('verify_image_bundle admin')).toBeLessThan(
      deployScript.indexOf('Starting PostgreSQL, Redis and database migration'),
    )
  })
})

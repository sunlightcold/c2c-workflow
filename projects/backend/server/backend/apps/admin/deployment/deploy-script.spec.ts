import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('local deployment script', () => {
  const script = readFileSync(resolve(__dirname, '../../../../../docker/deploy.sh'), 'utf8')

  it('replaces the application container with the exact precompiled release bundle', () => {
    expect(script).toMatch(
      /application_image="c2c-workflow-backend:app-\$\{application_bundle_hash:0:16\}"/,
    )
    expect(script).toContain('set_env_value C2C_BACKEND_IMAGE "$application_image"')
    expect(script).toContain('compose build --no-cache app')
    expect(script).toContain('compose up -d --no-deps --remove-orphans --force-recreate app')
    expect(script).toContain('running_bundle_hash=$(docker exec "$app_container"')
    expect(script).toContain('[[ "$running_bundle_hash" == "$application_bundle_hash" ]]')
  })
})

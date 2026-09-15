// Compatibility aliases. Secret resolution belongs to the shared credential boundary.
export {
  EnvironmentSecretResolver as EnvironmentC2cSecretResolver,
  SECRET_RESOLVER as C2C_SECRET_RESOLVER,
  type SecretResolver as C2cSecretResolver,
} from '../system/credential/secret-resolver'

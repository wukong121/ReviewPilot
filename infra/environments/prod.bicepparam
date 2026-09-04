using '../main.bicep'

param environmentName = 'prod'
param resourcePrefix = readEnvironmentVariable('RESOURCE_PREFIX')
param postgresAdministratorPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD')
param highAvailability = false
param acsCommunicationServiceName = readEnvironmentVariable('ACS_COMMUNICATION_SERVICE_NAME')
param applicationSecrets = {
  'auth-secret': readEnvironmentVariable('AUTH_SECRET')
  'entra-tenant-id': readEnvironmentVariable('ENTRA_TENANT_ID')
  'entra-client-id': readEnvironmentVariable('ENTRA_CLIENT_ID')
  'entra-client-secret': readEnvironmentVariable('ENTRA_CLIENT_SECRET')
  'bootstrap-admin-object-ids': readEnvironmentVariable('BOOTSTRAP_ADMIN_OBJECT_IDS')
  'apim-base-url': readEnvironmentVariable('APIM_BASE_URL')
  'apim-api-key': readEnvironmentVariable('APIM_API_KEY')
  'apim-deployment': readEnvironmentVariable('APIM_DEPLOYMENT')
  'acs-email-endpoint': readEnvironmentVariable('ACS_EMAIL_ENDPOINT')
  'acs-email-sender': readEnvironmentVariable('ACS_EMAIL_SENDER')
  'public-base-url': readEnvironmentVariable('PUBLIC_BASE_URL')
}

targetScope = 'resourceGroup'

param location string = resourceGroup().location
@allowed(['dev', 'prod'])
param environmentName string
param imageTag string = 'latest'
param postgresAdministratorLogin string = 'reviewpilotadmin'
@secure()
param postgresAdministratorPassword string
param highAvailability bool = false
param acsCommunicationServiceName string
@secure()
param applicationSecrets object
param tags object = { application: 'ReviewPilot', environment: environmentName }

var prefix = 'reviewpilot-${environmentName}'
var secretNames = {
  'database-url': 'database-url'
  'auth-secret': 'auth-secret'
  'entra-tenant-id': 'entra-tenant-id'
  'entra-client-id': 'entra-client-id'
  'entra-client-secret': 'entra-client-secret'
  'bootstrap-admin-object-ids': 'bootstrap-admin-object-ids'
  'apim-base-url': 'apim-base-url'
  'apim-api-key': 'apim-api-key'
  'apim-deployment': 'apim-deployment'
  'acs-email-endpoint': 'acs-email-endpoint'
  'acs-email-sender': 'acs-email-sender'
  'public-base-url': 'public-base-url'
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    prefix: prefix
    tags: tags
  }
}

module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    location: location
    prefix: prefix
    tags: tags
  }
}

module database 'modules/database.bicep' = {
  name: 'database'
  params: {
    location: location
    prefix: prefix
    administratorLogin: postgresAdministratorLogin
    administratorPassword: postgresAdministratorPassword
    highAvailability: highAvailability
    tags: tags
  }
}

module keyVault 'modules/key-vault.bicep' = {
  name: 'keyVault'
  params: {
    location: location
    prefix: prefix
    secretValues: union(applicationSecrets, {
      'database-url': 'postgresql://${postgresAdministratorLogin}:${uriComponent(postgresAdministratorPassword)}@${database.outputs.fqdn}:5432/${database.outputs.databaseName}?sslmode=require&schema=public'
    })
    tags: tags
  }
}

module networking 'modules/networking.bicep' = {
  name: 'networking'
  params: {
    location: location
    prefix: prefix
    keyVaultId: keyVault.outputs.id
    postgresServerId: database.outputs.serverId
    tags: tags
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-identity'
  location: location
  tags: tags
}

resource acs 'Microsoft.Communication/communicationServices@2023-04-01' existing = {
  name: acsCommunicationServiceName
}

resource acsContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acs.id, identity.name, 'Contributor')
  scope: acs
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, replace('${prefix}acr', '-', ''), identity.name, 'AcrPull')
  scope: resourceGroup()
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource keyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, take('${prefix}-kv', 24), identity.name, 'KeyVaultSecretsUser')
  scope: resourceGroup()
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

module containerApps 'modules/container-apps.bicep' = {
  name: 'containerApps'
  dependsOn: [acrPull, keyVaultSecretsUser, acsContributor]
  params: {
    location: location
    prefix: prefix
    workspaceId: monitoring.outputs.workspaceId
    registryServer: registry.outputs.loginServer
    identityId: identity.id
    identityClientId: identity.properties.clientId
    infrastructureSubnetId: networking.outputs.containerAppsSubnetId
    webImage: '${registry.outputs.loginServer}/reviewpilot-web:${imageTag}'
    workerImage: '${registry.outputs.loginServer}/reviewpilot-worker:${imageTag}'
    keyVaultUri: keyVault.outputs.uri
    secretNames: secretNames
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    tags: tags
  }
}

output webFqdn string = containerApps.outputs.webFqdn
output webContainerAppName string = containerApps.outputs.webName
output workerContainerAppName string = containerApps.outputs.workerName
output keyVaultName string = keyVault.outputs.name
output registryLoginServer string = registry.outputs.loginServer
output managedIdentityClientId string = identity.properties.clientId
output managedIdentityPrincipalId string = identity.properties.principalId
output postgresFqdn string = database.outputs.fqdn
output postgresServerName string = database.outputs.serverName
output environmentStaticIp string = containerApps.outputs.environmentStaticIp
output domainVerificationToken string = containerApps.outputs.domainVerificationToken

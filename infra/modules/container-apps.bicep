param location string
param prefix string
param workspaceId string
param registryServer string
param identityId string
param identityClientId string
param webImage string
param workerImage string
param keyVaultUri string
param secretNames object
param appInsightsConnectionString string
param tags object = {}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: last(split(workspaceId, '/'))
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-cae'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}

var commonSecrets = [for secret in items(secretNames): {
  name: secret.key
  keyVaultUrl: '${keyVaultUri}secrets/${secret.value}'
  identity: identityId
}]

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-web'
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false }
      registries: [{ server: registryServer, identity: identityId }]
      secrets: commonSecrets
    }
    template: {
      containers: [{
        name: 'web'
        image: webImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'NODE_ENV', value: 'production' }
          { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          { name: 'DATABASE_URL', secretRef: 'database-url' }
          { name: 'AUTH_SECRET', secretRef: 'auth-secret' }
          { name: 'AUTH_URL', secretRef: 'public-base-url' }
          { name: 'AUTH_TRUST_HOST', value: 'true' }
          { name: 'ENTRA_TENANT_ID', secretRef: 'entra-tenant-id' }
          { name: 'ENTRA_CLIENT_ID', secretRef: 'entra-client-id' }
          { name: 'ENTRA_CLIENT_SECRET', secretRef: 'entra-client-secret' }
          { name: 'BOOTSTRAP_ADMIN_OBJECT_IDS', secretRef: 'bootstrap-admin-object-ids' }
        ]
        probes: [{ type: 'Liveness', httpGet: { path: '/api/health', port: 3000 }, initialDelaySeconds: 20, periodSeconds: 30 }]
      }]
      scale: { minReplicas: 1, maxReplicas: 5 }
    }
  }
}

resource worker 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-worker'
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [{ server: registryServer, identity: identityId }]
      secrets: commonSecrets
    }
    template: {
      containers: [{
        name: 'worker'
        image: workerImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'NODE_ENV', value: 'production' }
          { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          { name: 'DATABASE_URL', secretRef: 'database-url' }
          { name: 'APIM_BASE_URL', secretRef: 'apim-base-url' }
          { name: 'APIM_API_KEY', secretRef: 'apim-api-key' }
          { name: 'APIM_DEPLOYMENT', secretRef: 'apim-deployment' }
          { name: 'MANAGED_IDENTITY_CLIENT_ID', value: identityClientId }
          { name: 'ACS_EMAIL_ENDPOINT', secretRef: 'acs-email-endpoint' }
          { name: 'ACS_EMAIL_SENDER', secretRef: 'acs-email-sender' }
          { name: 'PUBLIC_BASE_URL', secretRef: 'public-base-url' }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

output webName string = web.name
output workerName string = worker.name
output webFqdn string = web.properties.configuration.ingress.fqdn
output environmentId string = environment.id
output environmentStaticIp string = environment.properties.staticIp
output domainVerificationToken string = environment.properties.customDomainConfiguration.customDomainVerificationId

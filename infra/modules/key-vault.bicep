param location string
param prefix string
param tags object = {}
@secure()
param secretValues object

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: take('${prefix}-kv', 24)
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Disabled'
  }
}

resource secrets 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = [for secret in items(secretValues): {
  parent: vault
  name: secret.key
  properties: {
    value: secret.value
  }
}]

output id string = vault.id
output name string = vault.name
output uri string = vault.properties.vaultUri

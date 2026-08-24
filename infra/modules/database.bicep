param location string
param prefix string
param administratorLogin string
@secure()
param administratorPassword string
param highAvailability bool = false
param tags object = {}

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01' = {
  name: '${prefix}-pgsql'
  location: location
  tags: tags
  sku: { name: 'Standard_B2s', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    availabilityZone: '1'
    authConfig: { activeDirectoryAuth: 'Disabled', passwordAuth: 'Enabled' }
    backup: { backupRetentionDays: 14, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: highAvailability ? 'ZoneRedundant' : 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
    storage: { storageSizeGB: 64, autoGrow: 'Enabled' }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01' = {
  parent: server
  name: 'reviewpilot'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

output fqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
output serverName string = server.name

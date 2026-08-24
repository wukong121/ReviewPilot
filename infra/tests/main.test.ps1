BeforeAll { $source = Get-Content "$PSScriptRoot/../main.bicep" -Raw; $apps = Get-Content "$PSScriptRoot/../modules/container-apps.bicep" -Raw; $database = Get-Content "$PSScriptRoot/../modules/database.bicep" -Raw; $networking = Get-Content "$PSScriptRoot/../modules/networking.bicep" -Raw; $keyVault = Get-Content "$PSScriptRoot/../modules/key-vault.bicep" -Raw }
Describe 'ReviewPilot infrastructure' {
  It 'declares required modules without Service Bus' { $source | Should -Match 'modules/database.bicep'; $source | Should -Match 'modules/container-apps.bicep'; $source | Should -Not -Match 'Microsoft.ServiceBus' }
  It 'uses managed identity and Key Vault references' { $apps | Should -Match 'UserAssigned'; $apps | Should -Match 'keyVaultUrl'; $apps | Should -Match 'identityId' }
  It 'exposes only the Web app' { $apps | Should -Match "external: true"; $apps | Should -Not -Match "name: 'worker'[\s\S]*external: true" }
  It 'retains PostgreSQL backups for 14 days' { $database | Should -Match 'backupRetentionDays: 14' }
  It 'uses private networking for Key Vault references' { $apps | Should -Match 'infrastructureSubnetId'; $networking | Should -Match 'privateEndpoints'; $networking | Should -Match 'privatelink.vaultcore.azure.net'; $keyVault | Should -Match "publicNetworkAccess: 'Disabled'" }
  It 'does not place plaintext secrets in parameter files' { (Get-ChildItem "$PSScriptRoot/../environments/*.bicepparam" | Get-Content -Raw) | Should -Not -Match '(apiKey|clientSecret|password)\s*=\s*[''\"]' }
}

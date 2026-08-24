# Azure infrastructure

The supported deployment path is the manual GitHub Actions workflow. Configure the `dev` and `prod` GitHub Environments as documented in [the operations runbook](../docs/operations/runbook.md). The workflow creates the resource group when needed, and Bicep creates Key Vault secrets from secure deployment inputs. Do not create secret values manually in Azure or place them in parameter files.

## Custom domain and HTTPS

Do not configure DNS before the first deployment. The GitHub Actions run summary prints `webFqdn`, `environmentStaticIp`, and `domainVerificationToken` after Azure has created the Container Apps environment.

1. For a subdomain such as `reviews.company.com`, create CNAME `reviews` to `webFqdn` and TXT `asuid.reviews` with `domainVerificationToken`. No IP or A record is needed.
2. For an apex domain such as `company.com`, create A `@` to `environmentStaticIp` and TXT `asuid` with `domainVerificationToken`.
3. In the Web Container App, add the custom hostname and select the free Container Apps managed certificate.
4. Verify HTTP redirects to HTTPS and the certificate chain is valid.
5. Keep the GitHub Environment variable `PUBLIC_BASE_URL` set to the final HTTPS origin and rerun the workflow.
6. Add `https://<host>/api/auth/callback/microsoft-entra-id` to the Entra application redirect URIs.

The Worker has no ingress. APIM, ACS Email, Entra, Auth.js, and database values are Container Apps Key Vault references resolved through the user-assigned managed identity. Key Vault public access is disabled by policy, so Bicep creates a dedicated VNet, integrates the Container Apps environment, and resolves the vault through a private endpoint and `privatelink.vaultcore.azure.net` private DNS zone. The existing ACS Communication Services resource must be in the deployment resource group; Bicep grants the worker identity Contributor access scoped only to that resource.

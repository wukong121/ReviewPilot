# ReviewPilot Azure 环境清理手册

本文用于永久清理 ReviewPilot 测试环境。删除 PostgreSQL 会丢失业务数据；执行前先确认 subscription、Resource Group、`RESOURCE_PREFIX` 和环境名称。

## 清理范围

ReviewPilot Bicep 创建以下资源：

- Container Apps：Web、Worker 和 Container Apps Environment；
- PostgreSQL Flexible Server 和 `reviewpilot` 数据库；
- Azure Container Registry；
- Key Vault 和应用 secrets；
- User-assigned Managed Identity 和 RBAC assignments；
- VNet、两个 Private Endpoints、Private DNS links/zones；
- Log Analytics Workspace 和 Application Insights。

以下资源由部署前准备，默认不删除：

- APIM 和后端 AI model/deployment；
- ACS Communication Services、Email Service 和发件域；
- 员工登录使用的 Entra App Registration；
- GitHub Actions OIDC 使用的 Managed Identity；
- GitHub Environment Variables/Secrets 和公共 DNS 记录。

如果外部资源专用于本测试环境，可在完成主体清理后按“可选清理外部依赖”处理。

## 重要限制

1. 不要直接删除包含 APIM、ACS、AKS 或其他项目资源的共享 Resource Group。
2. Key Vault 启用了 purge protection 和 90 天 soft delete。删除后无法立即 purge，同名 Vault 在保留期内不能重建。
3. PostgreSQL 删除后不要依赖 Azure 自动保留可恢复备份。需要数据时先执行逻辑备份。
4. `RESOURCE_PREFIX` 必须与部署时 GitHub Environment Variable 完全一致；不要根据资源显示名猜测。
5. 清理过程中暂停 GitHub Actions 部署，避免资源被 workflow 重新创建。

## 1. 设置清理参数

登录 Azure 并设置目标环境：

```bash
az login --tenant '<azure-tenant-id>'
az account set --subscription '<azure-subscription-id>'

RESOURCE_GROUP='reviewpilot-prod-rg'
RESOURCE_PREFIX='reviewpilot314'
ENVIRONMENT='prod'
ACS_NAME='reviewpilot-prod-acs314'

DEPLOYMENT_PREFIX="${RESOURCE_PREFIX}-${ENVIRONMENT}"
ACR_NAME="${DEPLOYMENT_PREFIX//-/}acr"
KEY_VAULT_CANDIDATE="${DEPLOYMENT_PREFIX}-kv"
KEY_VAULT_NAME="${KEY_VAULT_CANDIDATE:0:24}"

echo "Subscription: $(az account show --query '{name:name,id:id,tenantId:tenantId}' -o json)"
echo "Resource Group: $RESOURCE_GROUP"
echo "Deployment prefix: $DEPLOYMENT_PREFIX"
echo "ACR: $ACR_NAME"
echo "Key Vault: $KEY_VAULT_NAME"

RESOURCE_GROUP_ID=$(az group show \
	--name "$RESOURCE_GROUP" \
	--query id -o tsv)

EXPECTED_CONFIRMATION="DELETE:${SUBSCRIPTION_ID:-$(az account show --query id -o tsv)}:${RESOURCE_GROUP}:${DEPLOYMENT_PREFIX}"
echo "Destructive cleanup requires this exact confirmation:"
echo "$EXPECTED_CONFIRMATION"
read -rp 'Confirmation: ' CONFIRM_CLEANUP
[[ "$CONFIRM_CLEANUP" == "$EXPECTED_CONFIRMATION" ]] || {
	echo 'Confirmation did not match. Cleanup aborted.'
	exit 1
}
export CONFIRM_CLEANUP EXPECTED_CONFIRMATION RESOURCE_GROUP_ID
```

示例中的值必须替换成实际 GitHub Environment 配置。`ACR_NAME` 会移除前缀中的连字符，`KEY_VAULT_NAME` 与 Bicep 一样截断到 24 个字符。

当前原始测试环境的已知命名是 `RESOURCE_GROUP=rg-wangpeter-2401-ai`、`RESOURCE_PREFIX=reviewpilot`、`ENVIRONMENT=prod`。该 Resource Group 同时包含 APIM、AI 和其他工作负载，必须使用方式 B，严禁整组删除。

后续删除命令必须在完成上述确认的同一个 shell 中执行。关闭终端或环境变量丢失后，需要重新执行本节并再次确认。

## 2. 盘点并备份

先导出资源清单。该文件不包含 Key Vault secret value，但仍应作为内部运维数据保管：

```bash
az resource list \
	--resource-group "$RESOURCE_GROUP" \
	--output json > "reviewpilot-${ENVIRONMENT}-resource-inventory.json"

az resource list \
	--resource-group "$RESOURCE_GROUP" \
	--query "[?starts_with(name, '${DEPLOYMENT_PREFIX}') || tags.application == 'ReviewPilot'].{name:name,type:type,location:location}" \
	--output table
```

检查输出中是否存在其他环境或其他应用。Private DNS zone 名称没有部署前缀，可能被 `dev`、`prod` 或其他 VNet 共享。

需要保留数据库时，在删除前使用 `pg_dump`。下面的操作会临时允许当前公网 IP：

```bash
POSTGRES_SERVER="${DEPLOYMENT_PREFIX}-pgsql"
POSTGRES_FQDN=$(az postgres flexible-server show \
	--resource-group "$RESOURCE_GROUP" \
	--name "$POSTGRES_SERVER" \
	--query fullyQualifiedDomainName -o tsv)

az postgres flexible-server start \
	--resource-group "$RESOURCE_GROUP" \
	--name "$POSTGRES_SERVER"

CLIENT_IP=$(curl --fail --silent https://api.ipify.org)
BACKUP_RULE="cleanup-backup-$(date +%s)"

az postgres flexible-server firewall-rule create \
	--resource-group "$RESOURCE_GROUP" \
	--server-name "$POSTGRES_SERVER" \
	--name "$BACKUP_RULE" \
	--start-ip-address "$CLIENT_IP" \
	--end-ip-address "$CLIENT_IP" \
	--output none

cleanup_backup_access() {
	unset PGPASSWORD
	az postgres flexible-server firewall-rule delete \
		--resource-group "$RESOURCE_GROUP" \
		--server-name "$POSTGRES_SERVER" \
		--name "$BACKUP_RULE" \
		--yes \
		--output none 2>/dev/null || true
}
trap cleanup_backup_access EXIT

read -rsp 'PostgreSQL administrator password: ' PGPASSWORD
echo
export PGPASSWORD
pg_dump \
	--host "$POSTGRES_FQDN" \
	--port 5432 \
	--username reviewpilotadmin \
	--dbname reviewpilot \
	--format custom \
	--file "reviewpilot-${ENVIRONMENT}-$(date +%Y%m%d).dump"
cleanup_backup_access
trap - EXIT
```

确认 dump 文件存在且非空。不要把数据库 dump 提交到 Git。

## 3. 选择删除方式

### 方式 A：Resource Group 仅包含本测试环境

先再次检查资源清单。只有确认 Resource Group 内没有共享的 APIM、ACS、AI、AKS、DNS 或其他项目资源时，才执行：

```bash
[[ "${CONFIRM_CLEANUP:-}" == "$EXPECTED_CONFIRMATION" ]] || {
	echo 'Cleanup confirmation is missing.'
	exit 1
}

az group delete \
	--name "$RESOURCE_GROUP" \
	--yes \
	--no-wait

az group wait \
	--name "$RESOURCE_GROUP" \
	--deleted \
	--timeout 3600
```

该方式会删除 Resource Group 内所有资源，包括预先创建的 ACS。随后跳到“可选清理外部依赖”。

### 方式 B：共享 Resource Group 中定向清理

你当前的 Resource Group 如果还包含 APIM、AI、AKS 或其他工作负载，必须使用此方式。

先定义通用删除函数：

```bash
require_cleanup_confirmation() {
	[[ "${CONFIRM_CLEANUP:-}" == "${EXPECTED_CONFIRMATION:-}" && -n "${CONFIRM_CLEANUP:-}" ]] || {
		echo 'Cleanup confirmation is missing. Run section 1 again.' >&2
		return 1
	}
}

delete_resource() {
	local resource_type="$1"
	local resource_name="$2"
	local resource_id
	local application_tag
	local environment_tag

	require_cleanup_confirmation || return 1

	case "$resource_name" in
		"$DEPLOYMENT_PREFIX"*|"$ACR_NAME"|"$KEY_VAULT_NAME") ;;
		*)
			echo "Refuse name outside ReviewPilot allowlist: $resource_name" >&2
			return 1
			;;
	esac

	resource_id=$(az resource show \
		--resource-group "$RESOURCE_GROUP" \
		--resource-type "$resource_type" \
		--name "$resource_name" \
		--query id -o tsv 2>/dev/null || true)

	if [[ -z "$resource_id" ]]; then
		echo "Skip missing: $resource_type/$resource_name"
		return
	fi

	case "$resource_id" in
		"$RESOURCE_GROUP_ID"/providers/*) ;;
		*)
			echo "Refuse resource outside target Resource Group: $resource_id" >&2
			return 1
			;;
	esac

	application_tag=$(az resource show --ids "$resource_id" --query tags.application -o tsv)
	environment_tag=$(az resource show --ids "$resource_id" --query tags.environment -o tsv)
	if [[ "$application_tag" != 'ReviewPilot' || "$environment_tag" != "$ENVIRONMENT" ]]; then
		echo "Refuse resource without matching ReviewPilot tags: $resource_id" >&2
		return 1
	fi

	echo "Delete: $resource_type/$resource_name"
	az resource delete --ids "$resource_id"
	az resource wait --ids "$resource_id" --deleted --timeout 3600 || true
}
```

#### 3.1 删除 Container Apps

先删除应用，再删除 Environment。Environment 删除可能需要数分钟：

```bash
delete_resource 'Microsoft.App/containerApps' "${DEPLOYMENT_PREFIX}-web"
delete_resource 'Microsoft.App/containerApps' "${DEPLOYMENT_PREFIX}-worker"
delete_resource 'Microsoft.App/managedEnvironments' "${DEPLOYMENT_PREFIX}-cae"
```

手工创建的 Container Apps managed certificate 会随 Environment 删除。

#### 3.2 删除 Private Endpoints 和 VNet links

```bash
require_cleanup_confirmation

delete_resource 'Microsoft.Network/privateEndpoints' "${DEPLOYMENT_PREFIX}-kv-pe"
delete_resource 'Microsoft.Network/privateEndpoints' "${DEPLOYMENT_PREFIX}-pgsql-pe"

az network private-dns link vnet delete \
	--resource-group "$RESOURCE_GROUP" \
	--zone-name 'privatelink.vaultcore.azure.net' \
	--name "${DEPLOYMENT_PREFIX}-vault-link" \
	--yes 2>/dev/null || true

az network private-dns link vnet delete \
	--resource-group "$RESOURCE_GROUP" \
	--zone-name 'privatelink.postgres.database.azure.com' \
	--name "${DEPLOYMENT_PREFIX}-postgres-link" \
	--yes 2>/dev/null || true

delete_resource 'Microsoft.Network/virtualNetworks' "${DEPLOYMENT_PREFIX}-vnet"
```

不要直接删除 Private DNS zones。先检查剩余 VNet links：

```bash
for zone in \
	'privatelink.vaultcore.azure.net' \
	'privatelink.postgres.database.azure.com'
do
	link_count=$(az network private-dns link vnet list \
		--resource-group "$RESOURCE_GROUP" \
		--zone-name "$zone" \
		--query 'length(@)' -o tsv 2>/dev/null || echo 0)

	if [[ "$link_count" == '0' ]]; then
		echo "No VNet links remain. Review before deleting Private DNS zone: $zone"
	else
		echo "Keep shared Private DNS zone $zone ($link_count link(s) remain)"
	fi
done
```

只有确认 zone 不再被任何环境使用时，才手工执行：

```bash
require_cleanup_confirmation

az network private-dns zone delete \
	--resource-group "$RESOURCE_GROUP" \
	--name '<private-dns-zone-name>' \
	--yes
```

#### 3.3 删除数据库、Vault、监控和 ACR

```bash
delete_resource 'Microsoft.DBforPostgreSQL/flexibleServers' "${DEPLOYMENT_PREFIX}-pgsql"
delete_resource 'Microsoft.KeyVault/vaults' "$KEY_VAULT_NAME"

delete_resource 'Microsoft.Insights/components' "${DEPLOYMENT_PREFIX}-appi"
delete_resource 'Microsoft.OperationalInsights/workspaces' "${DEPLOYMENT_PREFIX}-logs"
delete_resource 'Microsoft.ContainerRegistry/registries' "$ACR_NAME"
```

Key Vault 删除后应出现在 soft-deleted 列表中：

```bash
az keyvault list-deleted \
	--query "[?name == '${KEY_VAULT_NAME}'].{name:name,location:properties.location,deletionDate:properties.deletionDate}" \
	--output table
```

由于启用了 purge protection，不要尝试 `az keyvault purge`。

#### 3.4 清理应用 Managed Identity 和 RBAC

删除 identity 前先删除该 identity 的 role assignments，包括 Resource Group 上的 ACR Pull/Key Vault 权限和 ACS 上的 Contributor：

```bash
require_cleanup_confirmation

APP_IDENTITY_NAME="${DEPLOYMENT_PREFIX}-identity"
APP_PRINCIPAL_ID=$(az identity show \
	--resource-group "$RESOURCE_GROUP" \
	--name "$APP_IDENTITY_NAME" \
	--query principalId -o tsv 2>/dev/null || true)

if [[ -n "$APP_PRINCIPAL_ID" ]]; then
	IDENTITY_APPLICATION_TAG=$(az identity show \
		--resource-group "$RESOURCE_GROUP" \
		--name "$APP_IDENTITY_NAME" \
		--query tags.application -o tsv)
	IDENTITY_ENVIRONMENT_TAG=$(az identity show \
		--resource-group "$RESOURCE_GROUP" \
		--name "$APP_IDENTITY_NAME" \
		--query tags.environment -o tsv)
	[[ "$IDENTITY_APPLICATION_TAG" == 'ReviewPilot' && "$IDENTITY_ENVIRONMENT_TAG" == "$ENVIRONMENT" ]] || {
		echo 'Refuse identity without matching ReviewPilot tags.' >&2
		exit 1
	}

	mapfile -t ROLE_ASSIGNMENT_IDS < <(az role assignment list \
		--assignee "$APP_PRINCIPAL_ID" \
		--all \
		--query '[].id' -o tsv)

	if (( ${#ROLE_ASSIGNMENT_IDS[@]} > 0 )); then
		az role assignment delete --ids "${ROLE_ASSIGNMENT_IDS[@]}"
	fi

	az identity delete \
		--resource-group "$RESOURCE_GROUP" \
		--name "$APP_IDENTITY_NAME"
fi
```

该应用 identity 由单个环境专用，可以删除其全部 assignments。不要把这里的 identity 与 GitHub OIDC 部署 identity 混淆。

## 4. 可选清理外部依赖

只有确认资源不被其他应用或环境使用时才执行。

### ACS Email

主体清理已经移除了 ReviewPilot identity 在 ACS 上的角色。若 Communication Services 和 Email Service 专用于测试，可在 Portal 中删除，或先列出资源再用完整 resource ID 删除：

```bash
az resource list \
	--resource-group "$RESOURCE_GROUP" \
	--namespace Microsoft.Communication \
	--output table
```

不要删除共享发件域或其他应用正在使用的 ACS。

### 员工登录 Entra App Registration

若 App Registration 专用于已删除环境：

```bash
ENTRA_CLIENT_ID='<employee-login-application-client-id>'
read -rp "Type the Entra Client ID to confirm deletion ($ENTRA_CLIENT_ID): " CONFIRM_ENTRA_APP
[[ "$CONFIRM_ENTRA_APP" == "$ENTRA_CLIENT_ID" ]] || {
	echo 'Entra application deletion aborted.'
	exit 1
}
az ad app delete --id "$ENTRA_CLIENT_ID"
```

删除前确认没有 `dev`、其他域名或其他应用仍使用该 Client ID。

### GitHub OIDC Managed Identity

OIDC identity 可能同时部署 `dev`、`prod` 或其他仓库。只有所有部署均已清理时，才删除它及其 subscription role assignments。删除步骤与上面的应用 identity 相同，但应使用 OIDC identity 所在的 bootstrap Resource Group 和 principal ID。

### DNS 和 Entra Redirect URI

删除公共 DNS 中指向 Container App 的记录：

- Web 域名的 CNAME 或 A 记录；
- `asuid.<host>` TXT 验证记录。

同时从 Entra App Registration 删除对应回调地址：

```text
https://<deleted-host>/api/auth/callback/microsoft-entra-id
```

### GitHub Environment 配置

在仓库 **Settings → Environments** 中删除已废弃的 `dev`/`prod` Environment，或至少删除其中的 Variables、Secrets、deployment protection rules。删除 GitHub 配置可以防止误触 workflow 后重建环境。

## 5. 验证清理结果

共享 Resource Group 中不应再存在该部署前缀资源：

```bash
az resource list \
	--resource-group "$RESOURCE_GROUP" \
	--query "[?starts_with(name, '${DEPLOYMENT_PREFIX}')].{name:name,type:type}" \
	--output table
```

确认 ACR 和 PostgreSQL 已不存在：

```bash
az resource show \
	--resource-group "$RESOURCE_GROUP" \
	--resource-type 'Microsoft.ContainerRegistry/registries' \
	--name "$ACR_NAME" 2>/dev/null || echo 'ACR deleted'

az resource show \
	--resource-group "$RESOURCE_GROUP" \
	--resource-type 'Microsoft.DBforPostgreSQL/flexibleServers' \
	--name "${DEPLOYMENT_PREFIX}-pgsql" 2>/dev/null || echo 'PostgreSQL deleted'
```

最后检查：

- ReviewPilot URL 已无法访问且 DNS 不再指向 Azure；
- GitHub Actions 不再有进行中的部署；
- Private DNS zones 中没有孤立的 ReviewPilot A records/links；
- ACS、APIM、AI 和共享 Resource Group 中的其他工作负载仍正常；
- Azure Cost Management 中不再产生 PostgreSQL、Container Apps、ACR、Log Analytics 等项目费用。

资源删除和 Cost Management 数据更新可能有延迟。Key Vault 出现在 soft-deleted 列表属于预期结果。
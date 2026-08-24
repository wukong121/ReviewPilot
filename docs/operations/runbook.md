# ReviewPilot 运行手册

## 配置放在哪里

正式部署配置不写入仓库文件，也不需要提前手工创建 Key Vault secret。请在 GitHub 仓库进入：

`Settings` → `Environments` → 新建 `dev` 和 `prod`

然后分别在两个 Environment 中配置 Variables 和 Secrets。`.bicepparam` 文件只读取这些环境变量，GitHub Actions 会把值作为 Bicep secure 参数传入；Bicep 随后自动创建 Key Vault 并写入 secret。

### Environment Variables

| 名称 | 示例/说明 |
|---|---|
| `AZURE_CLIENT_ID` | GitHub OIDC 部署用 User-assigned Managed Identity 的 Client ID |
| `AZURE_TENANT_ID` | Azure subscription 所在 tenant ID |
| `AZURE_SUBSCRIPTION_ID` | 目标 Azure subscription ID |
| `AZURE_RESOURCE_GROUP` | 例如 `reviewpilot-dev-rg`；不存在时 workflow 自动创建 |
| `AZURE_LOCATION` | 例如 `eastasia` 或 `southeastasia` |
| `ENTRA_TENANT_ID` | 员工登录使用的公司 tenant ID，通常与 `AZURE_TENANT_ID` 相同 |
| `ENTRA_CLIENT_ID` | ReviewPilot 登录应用的 Client ID |
| `BOOTSTRAP_ADMIN_OBJECT_IDS` | 首位管理员 Entra Object ID；多个值用英文逗号分隔 |
| `APIM_BASE_URL` | 现有 APIM 地址，例如 `https://company-apim.azure-api.net` |
| `APIM_DEPLOYMENT` | APIM 后端 AI deployment/model 标识 |
| `ACS_COMMUNICATION_SERVICE_NAME` | ACS Communication Services 资源名，例如 `reviewpilot-prod-acs`；必须位于 `AZURE_RESOURCE_GROUP` 中 |
| `ACS_EMAIL_ENDPOINT` | ACS endpoint，例如 `https://reviewpilot-prod-acs.unitedstates.communication.azure.com` |
| `ACS_EMAIL_SENDER` | 已验证域名的完整 MailFrom 地址 |
| `PUBLIC_BASE_URL` | 最终 HTTPS 地址，例如 `https://reviews.company.com` |

### 当前 Tenant 选择

当前采用 non-production tenant 中的 App Registration 和 Client Secret。Azure 资源与登录应用位于同一个 tenant：

```text
AZURE_TENANT_ID=16b3c013-d300-468d-ac64-7eda0820b6d3
ENTRA_TENANT_ID=16b3c013-d300-468d-ac64-7eda0820b6d3
```

`ENTRA_CLIENT_ID` 填 non-production tenant 中 ReviewPilot App Registration 的 **Application (client) ID**。

只有在该 non-production tenant 中存在用户对象的人才能登录。用户可以是：

- tenant 的 Member；
- 已邀请并完成兑换的 Guest。

因此所有员工和经理必须先在该 tenant 中存在。`BOOTSTRAP_ADMIN_OBJECT_IDS` 也必须填写你本人在 **non-production tenant** 中的用户 Object ID，而不是 corporate tenant 中的 Object ID。

### Environment Secrets

| 名称 | 说明 |
|---|---|
| `POSTGRES_ADMIN_PASSWORD` | PostgreSQL 管理员强密码 |
| `AUTH_SECRET` | Auth.js 会话密钥；可用 `openssl rand -base64 32` 生成 |
| `ENTRA_CLIENT_SECRET` | non-production tenant 中 ReviewPilot App Registration 创建的 Client Secret **Value** |
| `APIM_API_KEY` | APIM subscription/API key |

不需要配置 `DATABASE_URL`。Bicep 会根据创建出的 PostgreSQL FQDN、数据库名和 `POSTGRES_ADMIN_PASSWORD` 自动生成，并写入 Key Vault。

## 获取 APIM 配置值

ReviewPilot 调用的是 APIM 后面的 OpenAI v1 Chat Completions 接口。APIM API 名称、Base path 和模型标识是三个不同概念：

- API 名称，例如 `wangpeter-2027-audio-resource`，只是 APIM 中的管理名称；
- Base path，例如 `codex`，是公开 URL 的路径前缀；
- Model，例如 `gpt-5.5`，才是 `APIM_DEPLOYMENT`。

在 APIM 的 API **Settings** 页面看到 Backend URL 为空时，说明仅凭该页面无法确定模型 deployment；应先确认 API 已配置 Backend/Policy 和 Chat Completions operation。

### 需要向 APIM/AI 平台管理员确认的值

| GitHub 配置 | 获取方式 |
|---|---|
| `APIM_BASE_URL` | APIM 的实际 Gateway URL 加 API Base path，例如 `https://<gateway-host>/codex`。不要使用 Portal 示例中的 `example.azure-api.net`。 |
| `APIM_DEPLOYMENT` | APIM 后端接受的 model/deployment 名称，例如 `gpt-5.5`。不是 API 名称或 Base path。 |
| `APIM_API_KEY` | 有权调用该 API 的 APIM subscription key；保存在 GitHub Secret，不要使用 Azure OpenAI 后端 Key。 |

在 APIM 中进入 **APIs** → 目标 API → **Operations/Test**，找到 Chat Completions operation。一个与当前 Worker 兼容的请求 URL 应类似：

```text
https://<gateway-host>/<api-base-path>/openai/v1/chat/completions
```

模型通过请求 body 的 `model` 字段发送；该 v1 operation 不使用 `api-version` query parameter。如果 APIM 使用其他 URL template 或 subscription key header，需要同步调整 Worker 适配器。

### 当前 `ai-gateway-peterwang` 实测配置

2026-08-24 通过 Azure CLI 和最小 data-plane 请求验证：

| GitHub 配置 | 应填写的值 |
|---|---|
| `APIM_BASE_URL` | `https://ai-gateway-peterwang.azure-api.net/wangpeter-2401-ai-resource` |
| `APIM_DEPLOYMENT` | `gpt-5.5` |
| `APIM_API_KEY` | APIM active subscription 的 primary 或 secondary key；不要填写 Azure AI 后端 key |

`gpt-5.5` 通过 `/openai/v1/chat/completions` 和 JSON response format 实测返回 HTTP 200。该模型不接受 `temperature: 0.2`，Worker 已省略此参数。

APIM API 当前配置为：

- API ID/path：`wangpeter-2401-ai-resource`；
- subscription key header：`api-key`；
- Chat Completions operation：`POST /openai/v1/chat/completions`；
- backend entity：`wangpeter-2401-ai-resource`；
- backend URL：`https://wangpeter-2401-ai-resource.services.ai.azure.com/`。

当前 APIM 路由和后端已可用。可在 APIM Test 页面使用以下 operation 验证：

```text
POST https://ai-gateway-peterwang.azure-api.net/wangpeter-2401-ai-resource/openai/v1/chat/completions
```

## Bicep 自动创建的资源

手动运行部署 workflow 后，Bicep/Actions 会创建或更新：

- Resource Group（若不存在）；
- Azure Container Registry；
- Log Analytics 和 Application Insights；
- Key Vault 及应用所需 secret；
- PostgreSQL Flexible Server、数据库和 14 天备份策略；
- User-assigned Managed Identity 和 RBAC；
- Container Apps Environment；
- Web 和 Worker Container Apps；
- Web/Worker 镜像、数据库 migration 和初始 Azure SS 模板 seed。

这些资源不需要在 Azure Portal 中逐项手工创建。

## 必须预先存在的外部依赖

以下项目不能由同一次 Bicep 部署自举，或者本身属于 Azure Resource Manager 之外的系统，因此需要一次性准备：

1. **GitHub OIDC 部署身份**：它必须先存在，workflow 才能登录 Azure。当前使用 User-assigned Managed Identity `github-developer`，该身份需要在目标 subscription 上具备创建资源组、资源和 RBAC assignment 的权限，例如 `Contributor` 加 `Role Based Access Control Administrator`。
2. **ReviewPilot Entra 登录应用**：使用 non-production tenant 中的单租户 App Registration 和 Client Secret。它只负责员工登录。
3. **ACS Email**：Communication Services、已连接的 Email Service 和已验证发件域名必须预先存在。Communication Services 资源必须与 ReviewPilot 部署位于同一个 Resource Group；Bicep 会把 Worker Managed Identity 的 `Contributor` 权限限制在该单个 ACS resource。
4. **现有 APIM AI 接口**：本项目按需求调用现有 APIM，不创建 APIM 或模型 deployment。
5. **公司域名和 DNS 管理权限**：部署前只需要确定计划使用的域名，不需要知道 IP，也不需要先创建解析记录。首次部署后，GitHub Actions 会显示默认 FQDN、静态 IP 和 TXT 验证值，再由域名管理员配置 DNS。

workflow 的 deploy job 绑定 GitHub Environment，因此 federated credential 必须按环境创建，`subject` 要与 Actions OIDC token 完全一致。当前仓库使用 GitHub 返回的 immutable owner/repository ID 格式：

```text
prod: repo:wukong121@79131635/ReviewPilot@1342422898:environment:prod
dev:  repo:wukong121@79131635/ReviewPilot@1342422898:environment:dev
```

不要改用 branch subject（例如 `ref:refs/heads/master`）或传统的 `repo:wukong121/ReviewPilot:environment:prod`。Issuer 为 `https://token.actions.githubusercontent.com`，audience 为 `api://AzureADTokenExchange`。当前 prod credential 名为 `github-reviewpilot-prod`。

## 创建 ReviewPilot Entra 登录应用

执行者需要在公司 tenant 中拥有创建 App Registration 的权限，例如 `Application Developer`、`Cloud Application Administrator` 或更高权限。以下步骤只需执行一次；建议 dev 和 prod 分别创建应用。

### 1. 创建应用注册

1. 打开 [Microsoft Entra admin center](https://entra.microsoft.com)。
2. 进入 **Identity** → **Applications** → **App registrations**。
3. 选择 **New registration**。
4. Name 填写 `ReviewPilot-prod`，dev 环境可填写 `ReviewPilot-dev`。
5. Supported account types 选择 **Accounts in this organizational directory only (Single tenant)**。
6. Redirect URI 的平台选择 **Web**，填写最终计划使用的回调地址：

	```text
	https://reviews.company.com/api/auth/callback/microsoft-entra-id
	```

	此时 DNS 和证书尚未就绪也没关系，Entra 允许提前保存回调地址。将 `reviews.company.com` 替换为你的最终域名。
7. 选择 **Register**。

本地开发可以在同一应用的 **Authentication** → **Web** → **Redirect URIs** 中额外添加：

```text
http://localhost:3000/api/auth/callback/microsoft-entra-id
```

生产应用建议不要保留 localhost 回调；更推荐 dev/prod 使用两个独立应用注册。

### 2. 记录 Tenant ID 和 Client ID

在新应用的 **Overview** 页面记录：

| Entra 页面字段 | GitHub Environment Variable |
|---|---|
| **Directory (tenant) ID** | `ENTRA_TENANT_ID` |
| **Application (client) ID** | `ENTRA_CLIENT_ID` |

不要把 **Object ID** 当成 `ENTRA_CLIENT_ID`。

### 3. 创建 Client Secret

1. 在 non-production tenant 打开 ReviewPilot App Registration。
2. 进入 **Certificates & secrets** → **Client secrets**。
3. 选择 **New client secret**，填写说明并按 tenant policy 选择有效期。
4. 创建后立即复制 **Value**。不要复制 **Secret ID**。
5. 将 Value 保存为 GitHub Environment Secret `ENTRA_CLIENT_SECRET`。

Secret Value 只显示一次，不得写入仓库、Issue、聊天或文档。dev/prod 建议使用不同 App Registration 或至少使用不同 Secret。

### 4. 检查认证和权限

1. 进入 **Authentication**，确认 Redirect URI 的平台是 **Web**，且路径完全为 `/api/auth/callback/microsoft-entra-id`。
2. 不要启用 Implicit grant；本项目使用 authorization code flow。
3. 登录应用不需要 Application `Mail.Send` 权限。邮件发送由 Worker Managed Identity 访问 ACS，与登录应用分离。
4. 默认 OpenID Connect 登录范围即可；如果 Portal 自动保留 delegated `User.Read`，可以保留。
5. Enterprise Application 的 **Assignment required?** 默认可保持 `No`。即使用户能通过 Entra 认证，ReviewPilot 数据库仍会拒绝未授权用户。若公司要求双重准入，可设为 `Yes` 并在 Entra 中额外分配允许登录的用户/组。

### 5. 获取首位管理员 Object ID

1. 在 Entra admin center 进入 **Identity** → **Users** → **All users**。
2. 打开首位 ReviewPilot 管理员账号。
3. 复制该用户的 **Object ID**，填入 GitHub Environment Variable `BOOTSTRAP_ADMIN_OBJECT_IDS`。
4. 多位引导管理员使用英文逗号分隔，不要添加引号，例如：

	```text
	11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222
	```

系统只在数据库中尚无 ACTIVE 管理员时使用该列表。首位管理员登录后，应在 ReviewPilot 管理页面维护其他用户、角色和审批经理关系。

普通员工和经理不需要管理员收集 Object ID。在 **用户与角色** 页面填写公司邮箱并分配角色即可，姓名可以留空；用户首次通过当前 tenant 的 Entra SSO 登录时，系统会用 token 中的邮箱匹配预授权记录，更新 Entra 显示名称，并一次性绑定不可变的 Entra Object ID。后续登录只按该 Object ID 识别，不能用相同邮箱改绑其他账号。

如果历史记录绑定了错误的 Object ID，编辑该用户并选择 **重置 SSO 绑定**，再让用户本人重新登录。不要为普通用户修改 `BOOTSTRAP_ADMIN_OBJECT_IDS`；它只用于系统中尚无管理员时的首次引导。

删除用户采用可审计的软删除：在 **用户与角色** 页面选择 **停用**，用户会立即失去登录权限，当前员工/经理关系会结束，但历史评审、审批和审计记录继续保留。管理员不能停用自己或最后一个 ACTIVE 管理员。恢复用户后需要重新指定审批经理关系。

### 6. 最终需要填写的值

在 GitHub `dev` 或 `prod` Environment 中填写：

| 类型 | 名称 | 值来源 |
|---|---|---|
| Variable | `ENTRA_TENANT_ID` | App Registration Overview 的 Directory (tenant) ID |
| Variable | `ENTRA_CLIENT_ID` | App Registration Overview 的 Application (client) ID |
| Secret | `ENTRA_CLIENT_SECRET` | Certificates & secrets 创建后显示的 Client Secret Value |
| Variable | `BOOTSTRAP_ADMIN_OBJECT_IDS` | 管理员用户页面的 Object ID |
| Variable | `PUBLIC_BASE_URL` | 计划使用的最终 HTTPS 地址，不含末尾 `/` |

第一次部署前只要确定最终域名并登记回调地址即可，不需要 DNS 已经生效。DNS 和 Container Apps 托管证书在第一次部署完成后配置；在此之前登录不会成功，但资源部署和 `/api/health` 检查不受影响。

## ACS Email 配置

当前已验证配置：

| GitHub 配置 | 值 |
|---|---|
| `ACS_COMMUNICATION_SERVICE_NAME` | `reviewpilot-prod-acs` |
| `ACS_EMAIL_ENDPOINT` | `https://reviewpilot-prod-acs.unitedstates.communication.azure.com` |
| `ACS_EMAIL_SENDER` | `DoNotReply@74442879-26be-48bd-b8af-2145769811d0.azurecomm.net` |

Email Service 为 `reviewpilot-prod-email`，连接域为 `AzureManagedDomain`。部署时 Bicep 自动把内置 `Contributor` 角色（`b24988ac-6180-42a0-ab88-20f7382dd24c`）授予 Worker identity，scope 仅为 `reviewpilot-prod-acs`。执行部署的 GitHub OIDC 身份必须有创建 role assignment 的权限。

部署后检查 Worker revision 的环境变量包含 `MANAGED_IDENTITY_CLIENT_ID`、`ACS_EMAIL_ENDPOINT` 和 `ACS_EMAIL_SENDER`。发送提醒后，Worker 会等待 ACS 长轮询返回 `Succeeded` 才把 Notification 标记为 `SENT`。

## 本地开发配置

只有本地运行时才复制示例文件：

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.env.example apps/worker/.env
```

这两个文件已被 `.gitignore` 忽略，不得提交。正式部署不读取它们。

## 发布

在 GitHub Actions 中手动运行 **Deploy employee review**，选择 `dev` 或 `prod`。workflow 将：

1. 执行 lint、类型检查、测试和构建；
2. 使用 GitHub OIDC 登录 Azure；
3. 自动创建 Resource Group 和 ACR；
4. 构建并推送 Web/Worker 镜像；
5. 执行 Bicep what-if 和正式部署；
6. 临时放行当前 GitHub runner IP，执行 Prisma migration 和模板 seed，然后删除防火墙规则；
7. 更新 Container Apps revision 并检查 `/api/health`。

workflow 没有 push、pull request 或 schedule 部署触发器。建议在 `prod` Environment 启用 required reviewers。

## 域名：先部署，再配置 DNS

部署前不需要知道 Container Apps IP。请先在 GitHub Environment 中把 `PUBLIC_BASE_URL` 填成计划使用的最终地址，例如 `https://reviews.company.com`，然后运行第一次部署。

第一次部署成功后，打开该次 GitHub Actions Run 的 **Summary**。其中会显示：

- `Container App default FQDN`：Web Container App 的默认 Azure 域名；
- `Container Apps environment static IP`：仅根域名解析需要；
- `Domain verification TXT value`：Azure 自定义域名所有权验证值。

### 推荐：使用子域名

例如最终地址为 `https://reviews.company.com`，在 `company.com` 的 DNS 管理平台创建：

| 类型 | 主机记录 | 记录值 |
|---|---|---|
| `CNAME` | `reviews` | Actions Summary 中的 `Container App default FQDN` |
| `TXT` | `asuid.reviews` | Actions Summary 中的 `Domain verification TXT value` |

子域名不使用 IP，也不需要 A 记录。

### 使用根域名

例如最终地址为 `https://company.com`，创建：

| 类型 | 主机记录 | 记录值 |
|---|---|---|
| `A` | `@` | Actions Summary 中的 `Container Apps environment static IP` |
| `TXT` | `asuid` | Actions Summary 中的 `Domain verification TXT value` |

根域名不能使用普通 CNAME，因此才需要部署后取得静态 IP。

### DNS 生效后的操作

1. 在 Azure Portal 打开 Web Container App → **Custom domains**。
2. 添加最终域名，选择免费的 Container Apps managed certificate。
3. 在 Entra 登录应用中添加回调地址，例如 `https://reviews.company.com/api/auth/callback/microsoft-entra-id`。
4. 等待证书状态变为有效，然后重新运行一次部署 workflow，使 Web/Worker 使用最终 `PUBLIC_BASE_URL` 创建新 revision。

更详细的 Azure 操作说明见 [infra/README.md](../../infra/README.md)。

## 失败任务

1. 在 `/admin/jobs` 查看 `DEAD` 任务的稳定错误码和尝试次数。
2. 修复 APIM、ACS、收件人或配置问题。
3. 通过 `POST /api/admin/jobs/{jobId}/retry` 重试。操作会归零尝试次数、保留旧错误码并写入审计日志。
4. 不直接修改 review 状态或 AI/Notification 记录。

如果 ACS 已完成邮件发送而 Worker 在本地标记 `SENT` 前崩溃，自动重试可能产生一封重复邮件。遇到该极小窗口时以 ACS 日志、审计时间和 Notification 记录核对，不手工重放同一任务。

## 凭据轮换

Entra Client Secret 到期前，在 App Registration 创建新 Secret，更新 GitHub Secret `ENTRA_CLIENT_SECRET` 并重新运行部署。验证登录成功后再删除旧 Secret。ACS 使用 Managed Identity，没有邮件访问密钥需要轮换。APIM Key 轮换时更新 `APIM_API_KEY` 后重新部署。不要把 Secret Value、token、API key 或邮件正文放入工单。

## 数据库恢复

生产保留 14 天 PITR。先将 Web/Worker min replicas 调为 0，恢复到新 PostgreSQL server，验证迁移版本和抽样历史记录，再更新 `database-url` secret 并恢复 revision。目标 RTO 为 4 小时，每季度执行一次演练。

## 回滚

Container Apps 保留历史 revision。应用回滚时将流量切回上一健康 revision；数据库迁移只允许前滚，因此发布前必须确认迁移兼容旧/新两个应用版本。回滚后检查 `/api/health`、Entra 登录、Worker 心跳和 DEAD 任务数。

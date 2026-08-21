# 员工自评与经理审批系统 Spec

- 文档状态：评审稿
- 版本：0.1
- 日期：2026-07-30
- 输入模板：`template.docx`（Azure SS 自评 Checklist）
- 目标部署平台：Microsoft Azure

## 1. 产品概述

本系统用于将员工周期性自评、AI 总结、经理审批和团队绩效分析整合到一个 Web 应用中。

员工按照管理员发布的评审模板填写自评并提交。系统随后异步调用现有 APIM AI 接口生成结构化总结，通过 Microsoft Graph 从指定共享邮箱把总结和审批链接发送给该员工的指定审批经理。经理可在审批页同时查看员工原始自评和 AI 总结，并填写评论后通过或驳回。被驳回的自评进入新版本草稿，员工修改并重新走完整流程。

经理和管理员可查看所有员工的自评与团队比较图表。员工只能查看自己的自评、AI 总结和经理审批结果。

## 2. 产品目标

### 2.1 业务目标

1. 将 Word 自评模板转化为结构化、可版本化的在线表单。
2. 缩短经理阅读自评和准备 1:1 谈话的时间。
3. 保留每次提交、AI 总结、审批评论和重新提交的完整历史。
4. 让经理通过多维图表快速比较员工表现和识别团队短板。
5. 通过 Azure IaC 实现可重复、可审计的部署和域名绑定。

### 2.2 成功标准

1. 员工能够在 30–45 分钟内完成模板自评，刷新或重新登录后草稿不丢失。
2. 提交成功后，AI 总结任务自动创建；成功生成后，指定经理收到总结邮件和审批链接。
3. 经理在同一审批页面看到原始详细内容和 AI 总结，并能通过或驳回。
4. 驳回后自动生成下一版本草稿，历史版本保持不可修改。
5. 任何员工都无法通过界面或 API 读取其他员工数据。
6. 经理和管理员能够按周期、状态和员工筛选比较图表。
7. Azure 环境可由 Bicep 创建，应用可由 GitHub Actions 手动触发部署。

## 3. 范围

### 3.1 首版包含

- Microsoft Entra ID 单租户单点登录。
- 管理员维护授权用户、角色和员工—审批经理关系。
- 管理员创建、编辑、发布和归档评审模板。
- 管理员创建、开放、关闭和归档评审周期。
- 员工在线填写、自评草稿自动保存、提交和驳回后重提。
- 确定性评分计算和结构化 AI 总结。
- Microsoft Graph 共享邮箱通知。
- 经理查看所有员工自评；指定审批经理执行通过或驳回。
- 管理员查看全量数据和审计信息，但不代替经理审批。
- 经理/管理员团队比较看板。
- Azure 部署、域名、HTTPS、监控和手动发布流程。

### 3.2 首版不包含

- Service Bus、AKS 或微服务拆分。
- 薪酬、晋升和奖金决策。
- 360 度评价、同事互评或客户评价。
- 从 HR 系统或 Entra ID 自动同步完整组织架构。
- 将 AI 结果用于自动通过、自动驳回或员工排名决策。
- 原生 iOS/Android App。
- 多租户 SaaS。
- 自动数据删除策略；首版保留历史并支持管理员归档。

## 4. 用户、角色和权限

### 4.1 身份与授权模型

- Entra ID 只负责认证和提供稳定用户标识 `oid`、姓名及邮箱。
- 应用数据库负责授权角色和员工—经理关系。
- 用户可同时拥有多个角色，例如经理也可作为员工填写自己的自评。
- 未被管理员加入授权用户列表的同租户账号登录后显示“无系统访问权限”。
- 首位管理员通过部署参数 `BOOTSTRAP_ADMIN_OBJECT_IDS` 引导创建；完成引导后由管理员在系统内维护用户。

### 4.2 权限矩阵

| 能力 | 员工 | 经理 | 管理员 |
|---|---|---|---|
| 查看本人自评及历史 | 是 | 若同时为员工则是 | 是 |
| 编辑/提交本人草稿 | 是 | 若同时为员工则是 | 否 |
| 查看所有员工自评 | 否 | 是 | 是 |
| 查看团队员工比较图表 | 否 | 是 | 是 |
| 审批员工自评 | 否 | 仅指定审批经理 | 否，只有审计权限 |
| 管理用户/角色/上下级 | 否 | 否 | 是 |
| 管理模板和评审周期 | 否 | 否 | 是 |
| 重试失败的 AI/邮件任务 | 否 | 否 | 是 |
| 查看审计日志 | 否 | 否 | 是 |

### 4.3 经理可见性和审批权

- 所有拥有经理角色的用户都能只读查看全部员工自评和 AI 总结。
- 每个员工在周期开始时快照一个 `approverManagerId`。
- 只有该指定审批经理能通过或驳回；其他经理只读，避免并发审批冲突。
- 管理员可在审批完成前重新指定审批经理，变更必须写入审计日志。

## 5. 核心业务流程

### 5.1 模板与周期

1. 管理员创建模板草稿。
2. 管理员配置分组、题目、权重、评分范围、必填规则和显示顺序。
3. 管理员发布模板。已发布版本不可修改；任何调整创建新版本。
4. 管理员创建评审周期，选择一个已发布模板版本，配置名称、覆盖日期、开放时间和截止时间。
5. 周期开放时，系统为授权员工创建初始草稿，并快照员工的指定审批经理。
6. 周期关闭后不再允许新提交；管理员可临时重新开放。

### 5.2 员工填写与提交

1. 员工进入当前周期，系统展示分章节表单和完成度。
2. 文本输入失焦后自动保存；评分和勾选项变更后立即保存。
3. 员工只能编辑当前 `DRAFT` 或驳回后生成的 `REVISION_DRAFT`。
4. 提交前执行完整校验：必填项、评分范围、模板版本和周期状态。
5. 员工确认提交后，当前版本冻结，状态变为 `AI_PROCESSING`。
6. 同一数据库事务写入提交快照和 AI 后台任务，确保不会出现“已提交但无任务”。
7. 员工提交后不能撤回或修改；只有经理驳回后才能修改下一版本。

### 5.3 AI 总结与经理邮件

1. Worker 从 PostgreSQL 任务表领取 AI 总结任务并加锁。
2. Worker 读取冻结的自评版本和系统确定性计算结果。
3. Worker 通过 APIM 调用 AI，解析并验证结构化 JSON。
4. 成功后保存 AI 总结，版本状态变为 `PENDING_REVIEW`。
5. 系统创建邮件任务，通过 Microsoft Graph 从指定共享邮箱向审批经理发送：
   - 员工姓名和评审周期；
   - 系统计算的加权总分和四大维度分数；
   - AI 总体总结、优势和改进建议；
   - 进入系统查看原始详细自评并审批的深链接。
6. 邮件不包含全部原始自评正文，减少敏感绩效数据在邮箱中的扩散。

### 5.4 经理审批

1. 经理从待办或邮件链接进入审批页。
2. 审批页并列展示：
   - 原始模板问题、员工评分和文字回答；
   - 确定性统计；
   - AI 总结及证据引用；
   - 历史版本和历史经理评论。
3. 经理选择“通过”或“驳回”，两种操作均要求填写评论。
4. 服务端再次校验操作者是当前指定审批经理且版本仍为 `PENDING_REVIEW`。
5. 使用乐观并发控制防止重复审批。

### 5.5 通过

1. 当前版本状态变为 `APPROVED`，记录审批人、评论和时间。
2. 员工收到通过通知邮件，可登录查看详细结果。
3. 版本永久只读。

### 5.6 驳回与重新提交

1. 当前版本状态变为 `REJECTED`，记录审批人、评论和时间。
2. 系统复制该版本答案生成版本号加一的 `REVISION_DRAFT`。
3. 员工收到驳回邮件，邮件包含经理评论和新草稿链接。
4. 员工修改后重新提交，再次执行 AI 总结、经理邮件和审批全流程。
5. 新 AI 总结只基于新版本内容，但经理能查看所有历史版本。

### 5.7 状态机

`DRAFT / REVISION_DRAFT → AI_PROCESSING → PENDING_REVIEW → APPROVED | REJECTED`

`REJECTED → REVISION_DRAFT（新版本）`

后台任务状态独立为：`QUEUED → PROCESSING → SUCCEEDED | RETRY_WAIT | DEAD`。

## 6. 模板表单需求

### 6.1 通用字段

- 填写人：从登录用户自动带入，不可修改。
- 填写日期：首次正式提交时间。
- 覆盖周期：来自评审周期，例如 FY27 Q1 和起止日期。
- 每个评分项：1–5 分，分数必填，具体事例/数据选填。
- 评分定义：1 远低于预期；2 低于预期；3 符合预期；4 超出预期；5 卓越。
- 每个加权维度包含“做得最好的一件事”和“最需要改进的一件事”，默认必填。

### 6.2 四个加权维度

| 维度 | 权重 | 题目数 |
|---|---:|---:|
| 业绩与管线管理 | 40% | 5 |
| 客户高层关系与解决方案构建 | 30% | 5 |
| 跨团队协同与资源调度 | 20% | 5 |
| 技术专精与持续学习 | 10% | 5 |

### 6.3 七项关键能力

每项使用 1–5 分，全部必填，但不计入四维加权总分：

1. Solution Selling（方案销售）
2. Executive Presence（高层对话）
3. Orchestration（资源调度）
4. Business Acumen（商业敏感度）
5. Technical Depth（技术深度）
6. Sales Discipline（销售纪律）
7. Growth Mindset（成长心态）

### 6.4 行为对照自查

- 9 个布尔勾选项，未勾选是有效答案。
- 系统自动计算勾选总数 `/ 9`。
- 页面提示模板参考值“7 项以上为合格 SS 水平”，但系统不得据此自动审批。

### 6.5 开放问题

模板中的 6 个开放问题默认必填，每题支持多行文本，单题上限 10,000 个字符。

### 6.6 谈话前准备

模板末尾的 4 个准备项使用布尔勾选，不影响评分：

1. 完成以上自评。
2. 准备 2–3 个最近的客户案例（成功和受挫案例）。
3. 想清楚 1 件希望 Manager 帮助移除的障碍。
4. 想清楚 1 件未来 90 天可以承诺改变的事。

## 7. 评分与统计规则

### 7.1 确定性计算

- 单维度分数 = 该维度有效题目分数的算术平均值。
- 加权总分 = `维度1 × 40% + 维度2 × 30% + 维度3 × 20% + 维度4 × 10%`。
- 七项能力均分单独计算，不进入加权总分。
- 行为得分仅显示勾选数量和比例，不进入加权总分。
- 所有提交所需评分均为必填，因此正式版本不存在缺失分数。
- 数据库存储原始值；界面显示保留一位小数。
- AI 只能解释这些结果，不能改写、补全或重新计算员工分数。

### 7.2 团队看板指标

仅经理和管理员可访问：

1. 参与员工数、已提交数、待审批数、已通过数、被驳回数。
2. 团队加权平均分和分数分布。
3. 员工 × 四大维度热力图。
4. 七项能力团队雷达图。
5. 行为勾选率对比。
6. 按周期的团队维度趋势。
7. 员工状态及维度明细表，可排序和进入详情。
8. 筛选条件：周期、提交状态、员工和指定审批经理。

员工端 API 不提供任何团队聚合或其他员工的数据。

## 8. 页面信息架构

### 8.1 公共

- Entra ID 登录页/跳转。
- 无权限页。
- 个人资料、角色切换和退出。

### 8.2 员工

- 个人首页：当前周期、完成度、状态、最近经理结果和历史周期。
- 自评编辑页：章节导航、自动保存、校验、提交确认。
- 个人结果页：原始自评、确定性得分、AI 总结和经理评论。
- 版本历史页：只展示本人历次版本。

### 8.3 经理

- 团队看板：首页展示多维图表、待办和异常。
- 全部员工列表：按状态、周期和姓名筛选。
- 员工详情：原始自评、AI 总结、历史版本。
- 审批页：指定审批经理可通过/驳回，其他经理只读。

### 8.4 管理员

- 用户与角色管理。
- 员工—审批经理关系管理。
- 模板列表、模板编辑器和版本发布。
- 评审周期管理。
- 后台任务与失败重试。
- 审计日志。
- 团队看板和全量只读详情。

## 9. AI 总结设计

### 9.1 输入

- 评审周期信息。
- 模板版本、维度名称、权重和问题文本。
- 员工提交的所有分数、事例、维度反思、能力评分、行为勾选和开放问题。
- 系统计算的维度分、加权总分、能力均分和行为计数。
- 不发送与评审无关的个人资料。

### 9.2 输出契约

AI 必须返回符合 JSON Schema 的对象：

- `overallSummary`：总体评价，建议 150–300 个中文字。
- `dimensionSummaries[]`：四个维度逐项总结，包含维度 ID、结论和证据引用。
- `strengths[]`：最多 3 项，每项包含标题、说明和引用的问题 ID。
- `improvements[]`：最多 3 项，每项包含改进点、建议动作和引用的问题 ID。
- `managerDiscussionTopics[]`：建议 1:1 讨论的主题。
- `supportNeeds[]`：员工明确表达的支持需求。
- `caveats[]`：证据不足或自评分与文字证据不一致的提示。

### 9.3 AI 安全约束

- 不推断性别、年龄、健康、家庭、政治观点等敏感属性。
- 不生成薪酬、晋升、裁员或纪律处分结论。
- 不引用输入中不存在的事实。
- 每个优势和改进项必须引用具体问题 ID；无法举证时写入 `caveats`。
- 提示词、输出 Schema、APIM 模型标识和生成时间随总结保存，保证可追溯。
- AI 结果明确标注为辅助总结，最终判断由经理完成。

### 9.4 APIM 适配

- Web/Worker 通过内部 `AiSummaryProvider` 接口调用 APIM。
- APIM Base URL、模型/部署标识和 API 版本为部署配置。
- APIM API Key 存储在 Key Vault，通过 Container Apps Key Vault 引用注入。
- 单次请求超时 60 秒；网络错误、429 和 5xx 使用指数退避重试。
- JSON 解析或 Schema 校验失败视为可重试错误，并记录不含员工正文的诊断信息。

## 10. 邮件通知

### 10.1 发送方式

- 使用 Microsoft Graph `sendMail`。
- 发送人是指定公司共享邮箱，例如 `employee-review@company-domain`。
- Graph 应用权限通过管理员同意，并在 Exchange Online 中限制到该共享邮箱。
- Graph 客户端凭据存入 Key Vault，并设置轮换流程。

### 10.2 邮件事件

| 事件 | 收件人 | 内容 |
|---|---|---|
| AI 总结成功 | 指定审批经理 | 摘要、关键分数、优势、改进项、审批链接 |
| 经理通过 | 员工 | 结果、经理评论、详情链接 |
| 经理驳回 | 员工 | 结果、经理评论、新草稿链接 |
| AI/邮件任务进入 DEAD | 管理员 | 任务类型、关联版本、错误类别、重试入口 |

所有深链接都必须再次经过 Entra ID 登录和服务端权限校验，不能依靠 URL 保密。

## 11. 数据模型

### 11.1 核心实体

| 实体 | 关键字段 |
|---|---|
| `User` | id, entraObjectId, email, displayName, status |
| `UserRole` | userId, role（EMPLOYEE/MANAGER/ADMIN） |
| `EmployeeManager` | employeeId, managerId, effectiveFrom, effectiveTo |
| `Template` | id, name, status |
| `TemplateVersion` | id, templateId, version, schemaJson, publishedAt |
| `ReviewCycle` | id, name, templateVersionId, periodStart, periodEnd, dueAt, status |
| `Review` | id, cycleId, employeeId, approverManagerId, currentVersionId |
| `ReviewVersion` | id, reviewId, version, status, submittedAt, immutableSnapshotJson |
| `ReviewAnswer` | reviewVersionId, questionId, numericValue, booleanValue, textValue |
| `ComputedScore` | reviewVersionId, dimensionScoresJson, weightedScore, capabilityAverage, behaviorCount |
| `AiSummary` | reviewVersionId, schemaVersion, promptVersion, modelId, summaryJson, createdAt |
| `Approval` | reviewVersionId, managerId, decision, comment, decidedAt |
| `BackgroundJob` | id, type, payloadJson, status, attempts, runAfter, lockedAt, lastErrorCode |
| `Notification` | id, jobId, recipient, type, status, sentAt |
| `AuditEvent` | id, actorId, action, entityType, entityId, metadataJson, createdAt |

### 11.2 数据不变式

- 一个周期中每位员工最多有一个 `Review`。
- 一个 `Review` 同时最多有一个可编辑版本。
- 已提交版本的答案和模板快照不可修改。
- 每个版本最多有一条最终审批记录。
- AI 总结只能关联冻结版本。
- 所有跨用户查询在服务端应用角色和所有权过滤。

## 12. API 与服务边界

Next.js Route Handlers 提供 JSON API；页面不可直接访问数据库。

### 12.1 主要接口

- `GET /api/me`
- `GET /api/my/reviews`
- `GET /api/my/reviews/{reviewId}`
- `PATCH /api/my/reviews/{reviewId}/draft`
- `POST /api/my/reviews/{reviewId}/submit`
- `GET /api/manager/dashboard`
- `GET /api/manager/reviews`
- `GET /api/manager/reviews/{reviewId}`
- `POST /api/manager/review-versions/{versionId}/approve`
- `POST /api/manager/review-versions/{versionId}/reject`
- `GET/POST/PATCH /api/admin/users`
- `GET/POST/PATCH /api/admin/templates`
- `POST /api/admin/templates/{templateId}/publish`
- `GET/POST/PATCH /api/admin/cycles`
- `GET /api/admin/jobs`
- `POST /api/admin/jobs/{jobId}/retry`
- `GET /api/admin/audit-events`

### 12.2 模块边界

- `identity`：Entra 会话、授权用户和角色。
- `templates`：模板草稿、版本与发布。
- `reviews`：草稿、提交、版本和状态机。
- `scoring`：确定性评分。
- `ai-summary`：APIM 适配、Schema 验证和总结保存。
- `approvals`：经理权限、通过、驳回和并发控制。
- `notifications`：Graph 邮件模板和发送。
- `analytics`：经理/管理员聚合查询。
- `jobs`：PostgreSQL 任务领取、重试和死信状态。
- `audit`：安全与业务关键操作记录。

## 13. 技术架构

### 13.1 应用技术栈

- 全栈语言：TypeScript。
- Web：Next.js App Router。
- UI：Tailwind CSS、shadcn/ui。
- 图表：Apache ECharts。
- 表单：React Hook Form + Zod。
- 数据库：Azure Database for PostgreSQL Flexible Server。
- ORM/迁移：Prisma。
- Worker：独立 Node.js TypeScript 进程，与 Web 共享领域包。
- 测试：Vitest、Playwright。

### 13.2 仓库结构

```text
apps/
  web/
  worker/
packages/
  domain/
  db/
  ui/
  config/
infra/
  modules/
  main.bicep
docs/
```

### 13.3 Azure 资源

- Azure Container Registry：保存 Web 和 Worker 镜像。
- Azure Container Apps Environment。
- Container App `web`：公开 HTTPS Ingress。
- Container App `worker`：无公开 Ingress，按任务轮询运行。
- Azure Database for PostgreSQL Flexible Server。
- Azure Key Vault：APIM、Entra、Graph 和数据库机密。
- Application Insights + Log Analytics Workspace。
- User-assigned 或 system-assigned managed identity：访问 ACR 和 Key Vault。

首版不创建 Service Bus。后台任务与业务提交共享 PostgreSQL，通过事务、行锁、`runAfter` 和重试次数保证可靠性。任务量或跨系统集成显著增加后，再将 `jobs` 模块替换为 Service Bus，领域接口不变。

## 14. IaC、域名与发布

### 14.1 Bicep

Bicep 必须创建或配置：资源组内的 ACR、Container Apps 环境、Web/Worker、PostgreSQL、Key Vault、Application Insights、Log Analytics、托管身份、RBAC 和应用配置。

环境参数分为 `dev` 和 `prod`。机密值不写入 Bicep 参数文件或仓库，由部署人员写入 Key Vault。

### 14.2 域名与 HTTPS

1. Web Container App 获得默认域名。
2. 在域名提供商配置 Container Apps 要求的 CNAME/A 和 TXT 验证记录。
3. 绑定用户已有域名。
4. 使用 Azure Container Apps 免费托管证书并自动续期。
5. 强制 HTTPS，HTTP 重定向到 HTTPS。
6. Entra 应用注册中加入生产域名回调地址。

### 14.3 GitHub Actions

首版工作流仅支持 `workflow_dispatch` 手动触发，不在 push 或合并后自动上线。

手动工作流依次执行：

1. lint、类型检查和测试；
2. 构建 Web/Worker 镜像；
3. 通过 GitHub OIDC 登录 Azure，不保存长期 Azure 密钥；
4. 推送镜像到 ACR；
5. 执行 Bicep 部署；
6. 执行数据库迁移；
7. 更新 Container Apps revision；
8. 运行健康检查和登录页冒烟测试。

## 15. 安全与隐私

- 仅允许指定 Entra tenant 登录。
- 所有授权在服务端执行，客户端隐藏不构成权限控制。
- 绩效正文、AI 总结和经理评论视为敏感内部数据。
- 全链路 HTTPS，Azure 托管服务启用静态加密。
- Key Vault 使用 RBAC 和最小权限；应用日志不得记录 API Key、令牌或完整绩效正文。
- 防护 CSRF、XSS、开放重定向、IDOR 和批量赋值。
- 审计登录、角色变更、上下级变更、模板发布、周期状态、提交、审批、任务重试和管理员数据访问。
- Graph 权限限制到指定共享邮箱。
- 管理员不能修改已提交内容或经理审批记录。

## 16. 可靠性与异常处理

### 16.1 草稿

- 自动保存失败时保留页面内容，显示明确错误并允许重试。
- 使用 `updatedAt` 或版本号防止多标签页覆盖新内容。

### 16.2 AI 和邮件任务

- Worker 使用数据库行锁，避免同一任务被并发处理。
- 每个任务使用幂等键，重复执行不会生成重复总结、审批记录或邮件。
- 可重试错误最多自动尝试 5 次，采用指数退避。
- 超过次数后任务进入 `DEAD`，管理员收到告警并可手动重试。
- AI 总结完成前版本保持 `AI_PROCESSING`，不能审批，也不会向经理发送不完整通知。
- 邮件失败不回滚已经保存的 AI 总结；管理员修复后单独重试邮件。

### 16.3 数据库

- 生产环境启用自动备份，保留 14 天并支持时间点恢复。
- 高可用作为 Bicep 参数，首版默认关闭以控制成本，生产关键期可开启。
- 每季度至少执行一次恢复演练。

## 17. 可观测性

- 所有请求使用 correlation ID。
- AI 和邮件链路记录 `reviewVersionId`、`jobId`、耗时、尝试次数和错误类别，不记录完整正文。
- 指标：HTTP 5xx、登录失败、AI 成功率/耗时、邮件成功率、DEAD 任务数、待审批数量。
- 告警：连续 5xx、AI/邮件 DEAD 任务、Worker 无心跳、数据库容量阈值。
- Application Insights 提供请求追踪、依赖调用和异常诊断。

## 18. 非功能需求

- 设计目标：最多 500 名员工、20 个历史周期。
- 常规页面 P95 响应时间小于 2 秒；团队看板 P95 小于 3 秒，不包含首次登录跳转。
- 草稿保存正常网络下 1 秒内给出成功反馈。
- 响应式支持桌面和主流平板；员工表单支持手机浏览器基本填写。
- 目标达到 WCAG 2.1 AA：键盘操作、可见焦点、颜色对比和图表文本替代。
- 中文为首版界面语言，数据库和组件为后续国际化预留消息键。
- 生产故障恢复目标 RTO 4 小时。

## 19. 测试策略

### 19.1 单元测试

- 四维加权、能力均分和行为计数。
- 状态机合法/非法迁移。
- 角色、所有权和指定审批经理授权。
- AI JSON Schema 验证和证据引用校验。
- 邮件模板不包含全部原始自评。

### 19.2 集成测试

- PostgreSQL 事务同时保存提交和后台任务。
- Worker 锁、重试、幂等和 DEAD 状态。
- APIM 与 Graph 使用测试替身验证成功、限流、超时和无效响应。
- 模板发布后不可修改。
- 驳回生成新版本并保留旧版本。

### 19.3 端到端测试

- 员工填写、自动保存、提交和查看状态。
- 指定经理收到待办、查看详情、通过和驳回。
- 被驳回员工修改并重新提交。
- 非指定经理只读。
- 员工尝试读取他人数据得到 403/404。
- 经理/管理员可见比较图表，员工不可见且 API 不返回比较数据。
- 管理员发布模板、开放周期和重试任务。

### 19.4 部署验证

- Bicep lint 和 what-if。
- 容器健康检查。
- 数据库迁移可前滚，生产迁移先备份。
- 自定义域名、HTTPS、Entra 回调和 Graph 邮件冒烟测试。

## 20. 验收标准

1. 三类角色使用公司 Entra ID 成功登录，未授权用户无法进入系统。
2. 管理员能发布不可变模板版本并用其创建评审周期。
3. 网页表单完整覆盖 `template.docx` 的 20 个四维评分项、8 个维度反思字段、7 个能力项、9 个行为项、6 个开放问题和 4 个谈话前准备项。
4. 员工只能读取和修改自己的可编辑草稿。
5. 员工提交后版本冻结，AI 任务自动创建。
6. AI 总结通过 Schema 校验并包含可追溯证据引用。
7. AI 成功后指定经理收到共享邮箱发送的总结邮件。
8. 经理审批页同时展示原始详情和 AI 总结。
9. 只有指定审批经理能通过或驳回，且评论必填。
10. 驳回后生成新版本草稿，历史版本、总结和评论不可修改。
11. 经理和管理员能查看员工比较图表；员工端页面和 API 均不能访问。
12. AI 或邮件失败能自动重试，最终失败可由管理员查看和重试。
13. Azure 资源能通过 Bicep 重建，GitHub Actions 只能手动触发生产发布。
14. 已有域名通过 HTTPS 正常访问，Entra 回调和邮件深链接可用。

## 21. 实施阶段建议

1. 基础工程、数据库、Entra 登录和角色授权。
2. 模板/周期管理和 Word 模板数据初始化。
3. 员工表单、自动保存、评分和版本状态机。
4. Worker、APIM AI 总结和 Graph 邮件。
5. 经理审批、驳回重提和审计。
6. 团队看板和管理员任务中心。
7. Bicep、手动 GitHub Actions、域名、监控和生产验收。

## 22. 官方技术参考

- Azure Container Apps 自定义域名与免费托管证书：<https://learn.microsoft.com/azure/container-apps/custom-domains-managed-certificates>
- Azure Container Apps 证书选项：<https://learn.microsoft.com/azure/container-apps/certificates-overview>
- Microsoft Graph 权限参考：<https://learn.microsoft.com/graph/permissions-reference>
- Microsoft Graph 代表其他用户/共享邮箱发信：<https://learn.microsoft.com/graph/outlook-send-mail-from-other-user>
- Entra ID 应用角色与角色声明：<https://learn.microsoft.com/entra/identity-platform/howto-add-app-roles-in-apps>
- Azure Database for PostgreSQL Flexible Server：<https://learn.microsoft.com/azure/postgresql/overview>
- Azure Key Vault 管理 API Key：<https://learn.microsoft.com/azure/key-vault/general/apps-api-keys-secrets>

## 附录 A：`template.docx` 字段清单

### A.1 业绩与管线管理（40%）

1. 本季度 ACR 完成率达到或超过目标。
2. 当前 Pipeline Coverage ≥ 3x 季度目标。
3. MSX 中所有 pipeline/milestone、Rev size、due date 在过去 30 天内更新。
4. 季度 Forecast 误差控制在 ±10% 以内。
5. 主动跟进和处理 stuck/slipped deals。

### A.2 客户高层关系与解决方案构建（30%）

1. 每个 Top Account 已建立至少 2 位 C-level 关系（CTO/CIO 必备）。
2. 过去 90 天内主导过至少 1 次客户 Envisioning Workshop 或 EBC。
3. 能独立输出 Solution Brief（痛点 → 架构 → ROI → 路径）。
4. 有清晰的 6–18 个月 Account Plan，并作为实际推进依据。
5. 在客户面前能用业务语言（ROI/TCO）讲 Azure 价值，而非堆技术名词。

### A.3 跨团队协同与资源调度（20%）

1. 在所负责的 pipeline 中，我是 Deal Captain。
2. 主动调动 SE/CSA/GBB/Partner，而非等待 Manager 分配。
3. 与 AE 有明确分工和定期同步节奏。
4. 在 Team Sync/QBR 中主动分享打法或客户洞察。
5. 在 Azure 机会中识别并引入 Security/MW 同事的跨产品机会。

### A.4 技术专精与持续学习（10%）

1. 当前持有 AZ-900 + AZ-305（或同等）认证。
2. 能独立画 Azure 架构草图并回应 80% 客户技术追问。
3. 熟悉 Azure 四大主推场景（AI/Data/Migration/Modernization）。
4. 能说清 Azure 与 AWS/GCP/Ali Cloud 在关键场景下的差异。
5. 过去 90 天完成至少 1 个 Learning Path 或 Azure 新功能学习。

### A.5 行为对照自查（9 项）

1. 在 key pipeline/project 中主动召集 v-team。
2. 能用架构和数据当场回应客户技术质疑。
3. 每周主动更新 MSX，不等到月末。
4. 能在客户决策前提前介入竞争对手出现的场景。
5. 主动在 Team Weekly Sharing 分享打法或客户洞察。
6. 帮同事 review 机会或方案。
7. 能识别 Azure 单子中的跨产品机会并引入对应 SS。
8. 过去一年有新增认证或新增能力。
9. 能在季度复盘中主动提出明年策略调整，而非由 Manager push。

### A.6 开放问题（6 项）

1. 过去 90 天最有成就感的一件事是什么，为什么？
2. 过去 90 天最想推倒重来的一个决定或动作是什么？
3. 作为 Azure SS，最大的差异化优势是什么？
4. 目前最大的瓶颈是什么，需要经理或团队提供什么支持？
5. 未来 12 个月希望在 Azure SS 角色上达到什么程度，或是否考虑其他方向？
6. 如果重新选择负责的客户/行业，会怎么选？

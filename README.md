# ReviewPilot

员工自评、AI 辅助总结、经理审批和团队分析系统。应用为 TypeScript npm-workspaces monorepo，Web 使用 Next.js App Router，Worker 使用 PostgreSQL 后台任务，数据由 Prisma/PostgreSQL 保存。

## 本地开发

要求 Node.js 22、npm 和 PostgreSQL 16。

```bash
npm ci
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.env.example apps/worker/.env
npm run generate -w @employee-review/db
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
npm run seed -w @employee-review/db
npm run dev
```

Web 默认地址为 <http://localhost:3000>，健康检查为 `/api/health`。Worker 使用 `npm start -w @employee-review/worker` 单独启动。

## 验证

```bash
npm run lint
npm run typecheck
npm test
npm run e2e
npm run build
az bicep build --file infra/main.bicep
```

## 目录

- `apps/web`：角色保护页面、JSON API、Entra ID 登录。
- `apps/worker`：AI、ACS Email 提醒和任务重试。
- `packages/domain`：模板、评分、状态机和 AI Schema。
- `packages/db`：Prisma schema、迁移、seed 和 repositories。
- `packages/config`：运行时配置校验和日志脱敏。
- `infra`：Azure Container Apps、PostgreSQL、ACR、Key Vault 与监控。

生产发布只能手动触发 `.github/workflows/deploy.yml`。正式配置填写在 GitHub `dev`/`prod` Environment，不写入仓库，也不需要手工创建 Key Vault secret。完整配置项见 [运行手册](docs/operations/runbook.md)。

# Employee Review System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a production-ready TypeScript web system for employee self-review, AI summarization, manager approval, team analytics, and Azure operations.

**Architecture:** Use an npm-workspaces monorepo containing a Next.js web app, a Node.js worker, and focused shared packages for domain rules, persistence, UI, and configuration. PostgreSQL stores business records and transactional background jobs; the worker calls APIM and Microsoft Graph. Azure Container Apps hosts Web and Worker, with Bicep creating PostgreSQL, ACR, Key Vault, Application Insights, managed identities, domain configuration, and manually triggered GitHub deployment.

**Tech Stack:** TypeScript, Node.js 22+, npm workspaces, Next.js App Router, React, Tailwind CSS, shadcn/ui conventions, ECharts, React Hook Form, Zod, Prisma, PostgreSQL, Auth.js with Microsoft Entra ID, Vitest, Playwright, Azure Container Apps, Bicep, GitHub Actions.

## Global Constraints

- Entra ID is single-tenant authentication; application database roles and employee-manager relationships control authorization.
- Roles are `EMPLOYEE`, `MANAGER`, and `ADMIN`; a user may have multiple roles.
- Managers and admins can see all employee reviews; only the snapshotted approver manager can approve or reject.
- Employees can access only their own review data and never receive team-comparison API payloads.
- Submitted review versions are immutable; rejected reviews produce a copied, editable next version.
- AI summarizes evidence but never changes scores or makes approval, compensation, promotion, or disciplinary decisions.
- APIM and Graph credentials live in Key Vault; full review text must not be written to application logs.
- PostgreSQL is the first-release job queue; do not add Service Bus.
- GitHub Actions production deployment uses `workflow_dispatch` only.
- The UI language is Chinese and must meet WCAG 2.1 AA for keyboard focus, labels, contrast, and chart alternatives.
- Design capacity is 500 employees and 20 historical cycles.
- Use strict TypeScript, Zod validation at external boundaries, UTC database timestamps, and deterministic score calculations.
- Follow TDD: failing test, observed failure, minimal implementation, passing test, then commit.

## Target File Map

```text
.
├─ apps/
│  ├─ web/
│  │  ├─ app/
│  │  │  ├─ (auth)/unauthorized/page.tsx
│  │  │  ├─ (employee)/my-reviews/...
│  │  │  ├─ (manager)/manager/...
│  │  │  ├─ (admin)/admin/...
│  │  │  └─ api/...
│  │  ├─ components/
│  │  ├─ lib/
│  │  └─ tests/
│  └─ worker/
│     ├─ src/handlers/
│     ├─ src/index.ts
│     └─ tests/
├─ packages/
│  ├─ domain/src/
│  ├─ db/prisma/
│  ├─ db/src/
│  ├─ config/src/
│  └─ ui/src/
├─ infra/
│  ├─ modules/
│  ├─ environments/
│  └─ main.bicep
├─ e2e/
├─ .github/workflows/deploy.yml
├─ package.json
└─ tsconfig.base.json
```

---

### Task 1: Bootstrap the monorepo and executable Web/Worker skeleton

**Files:**
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/api/health/route.ts`
- Create: `apps/web/tests/health.test.ts`
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/tests/worker.test.ts`
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: approved design spec only.
- Produces: npm workspace scripts `dev`, `build`, `test`, `typecheck`, `lint`; Web `/api/health`; Worker `startWorker()`.

- [ ] **Step 1: Initialize Git and add repository exclusions**

Run:

```powershell
git init
```

Create `.gitignore` with:

```gitignore
node_modules/
.next/
dist/
coverage/
.env
.env.*
!.env.example
playwright-report/
test-results/
.superpowers/
*.tsbuildinfo
```

Expected: `git status --short` shows the existing specification files and new bootstrap files, never `.superpowers/`.

- [ ] **Step 2: Write failing Web and Worker smoke tests**

Create `apps/web/tests/health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GET } from "../app/api/health/route";

describe("health route", () => {
  it("returns an OK payload", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
```

Create `apps/worker/tests/worker.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { startWorker } from "../src/index";

describe("startWorker", () => {
  it("polls once when configured for a single run", async () => {
    const poll = vi.fn().mockResolvedValue(undefined);
    await startWorker({ poll, once: true });
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run tests and observe the missing-module failures**

Run:

```powershell
npm test
```

Expected: FAIL because the workspace and `GET`/`startWorker` implementations do not exist.

- [ ] **Step 4: Add workspace configuration and minimal implementations**

Root `package.json` must expose:

```json
{
  "name": "employee-review",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm run dev -w @employee-review/web",
    "build": "npm run build --workspaces --if-present",
    "test": "vitest run --workspace vitest.workspace.ts",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

Create workspace manifests with these names and scripts:

```json
// apps/web/package.json
{"name":"@employee-review/web","private":true,"scripts":{"dev":"next dev","build":"next build","typecheck":"tsc --noEmit","lint":"next lint"}}

// apps/worker/package.json
{"name":"@employee-review/worker","private":true,"type":"module","scripts":{"build":"tsc -p tsconfig.json","typecheck":"tsc --noEmit","test":"vitest run"}}

// packages/domain/package.json
{"name":"@employee-review/domain","private":true,"type":"module","exports":{".":"./src/index.ts"},"scripts":{"typecheck":"tsc --noEmit","test":"vitest run"}}
```

Create the health route:

```ts
export async function GET(): Promise<Response> {
  return Response.json({ status: "ok" });
}
```

Create the Worker entry:

```ts
export interface WorkerOptions {
  poll: () => Promise<void>;
  once?: boolean;
}

export async function startWorker(options: WorkerOptions): Promise<void> {
  do {
    await options.poll();
  } while (!options.once);
}
```

- [ ] **Step 5: Install dependencies and verify the skeleton**

Run:

```powershell
npm install --save-dev typescript vitest @types/node
npm install -w @employee-review/web next react react-dom
npm install -w @employee-review/web --save-dev @types/react @types/react-dom
npm install
npm test
npm run typecheck
npm run build
```

Expected: all smoke tests pass and both workspaces compile.

- [ ] **Step 6: Commit the bootstrap**

```powershell
git add .gitignore .nvmrc package.json package-lock.json tsconfig.base.json vitest.workspace.ts apps packages docs template.docx
git commit -m "chore: bootstrap employee review monorepo"
```

---

### Task 2: Implement domain scoring and review state transitions

**Files:**
- Create: `packages/domain/src/reviews/types.ts`
- Create: `packages/domain/src/reviews/scoring.ts`
- Create: `packages/domain/src/reviews/state-machine.ts`
- Create: `packages/domain/src/reviews/scoring.test.ts`
- Create: `packages/domain/src/reviews/state-machine.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: none.
- Produces: `computeScores(input: ScoreInput): ComputedScores`, `assertTransition(from, to): void`, `ReviewVersionStatus`.

- [ ] **Step 1: Write failing deterministic-score tests**

```ts
import { describe, expect, it } from "vitest";
import { computeScores } from "./scoring";

describe("computeScores", () => {
  it("uses the template's 40/30/20/10 weights", () => {
    const result = computeScores({
      dimensions: [
        { id: "performance", weight: 0.4, scores: [5, 4, 4, 4, 3] },
        { id: "customer", weight: 0.3, scores: [4, 4, 4, 4, 4] },
        { id: "collaboration", weight: 0.2, scores: [3, 3, 3, 3, 3] },
        { id: "technical", weight: 0.1, scores: [5, 5, 5, 5, 5] }
      ],
      capabilityScores: [4, 4, 3, 4, 5, 3, 4],
      behaviorChecks: [true, true, true, true, true, true, true, false, false]
    });
    expect(result.weightedScore).toBe(3.9);
    expect(result.capabilityAverage).toBe(3.9);
    expect(result.behaviorCount).toBe(7);
  });

  it("rejects missing and out-of-range scores", () => {
    expect(() => computeScores({ dimensions: [], capabilityScores: [0], behaviorChecks: [] }))
      .toThrow("score must be between 1 and 5");
  });
});
```

- [ ] **Step 2: Run the score test and verify failure**

Run: `npm test -- scoring.test.ts`

Expected: FAIL because `computeScores` is missing.

- [ ] **Step 3: Add score types and the minimal pure implementation**

```ts
export type DimensionId = "performance" | "customer" | "collaboration" | "technical";

export interface ScoreInput {
  dimensions: Array<{ id: DimensionId; weight: number; scores: number[] }>;
  capabilityScores: number[];
  behaviorChecks: boolean[];
}

export interface ComputedScores {
  dimensionScores: Record<DimensionId, number>;
  weightedScore: number;
  capabilityAverage: number;
  behaviorCount: number;
}
```

`computeScores` must validate every numeric score, calculate raw averages, and round returned values to one decimal without altering stored answers.

- [ ] **Step 4: Write failing state-machine tests**

```ts
import { describe, expect, it } from "vitest";
import { assertTransition } from "./state-machine";

describe("review state machine", () => {
  it.each([
    ["DRAFT", "AI_PROCESSING"],
    ["REVISION_DRAFT", "AI_PROCESSING"],
    ["AI_PROCESSING", "PENDING_REVIEW"],
    ["PENDING_REVIEW", "APPROVED"],
    ["PENDING_REVIEW", "REJECTED"]
  ] as const)("allows %s to %s", (from, to) => {
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it("rejects editing an approved version", () => {
    expect(() => assertTransition("APPROVED", "DRAFT")).toThrow("invalid review transition");
  });
});
```

- [ ] **Step 5: Implement and verify the state machine**

Use the exact union:

```ts
export type ReviewVersionStatus =
  | "DRAFT"
  | "REVISION_DRAFT"
  | "AI_PROCESSING"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED";
```

Run: `npm test -- scoring.test.ts state-machine.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit domain rules**

```powershell
git add packages/domain
git commit -m "feat: add review scoring and state machine"
```

---

### Task 3: Model persistence and transactional job records with Prisma

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/review-repository.ts`
- Create: `packages/db/src/job-repository.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/tests/schema.test.ts`
- Create: `packages/db/tests/review-repository.test.ts`
- Create: `packages/db/.env.example`

**Interfaces:**
- Consumes: domain statuses and roles.
- Produces: `prisma`, `ReviewRepository`, `JobRepository`, `enqueueInTransaction(tx, job)`.

- [ ] **Step 1: Write a failing schema-contract test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Prisma schema", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

  it.each(["User", "UserRole", "EmployeeManager", "TemplateVersion", "ReviewCycle", "Review", "ReviewVersion", "ReviewAnswer", "ComputedScore", "AiSummary", "Approval", "BackgroundJob", "Notification", "AuditEvent"])
    ("defines model %s", (model) => expect(schema).toContain(`model ${model} {`));
});
```

- [ ] **Step 2: Run the test and verify the missing schema failure**

Run: `npm test -- schema.test.ts`

Expected: FAIL with file-not-found.

- [ ] **Step 3: Add Prisma models and invariants**

Install the database dependencies after creating `packages/db/package.json` with name `@employee-review/db`:

```powershell
npm install -w @employee-review/db @prisma/client
npm install -w @employee-review/db --save-dev prisma vitest-mock-extended
```

The schema must use PostgreSQL, UUID primary keys, `DateTime @db.Timestamptz`, JSON snapshots, and these uniqueness rules:

```prisma
model Review {
  id                String @id @default(uuid()) @db.Uuid
  cycleId           String @db.Uuid
  employeeId        String @db.Uuid
  approverManagerId String @db.Uuid
  currentVersionId  String? @db.Uuid
  createdAt         DateTime @default(now()) @db.Timestamptz
  updatedAt         DateTime @updatedAt @db.Timestamptz

  @@unique([cycleId, employeeId])
  @@index([approverManagerId])
}

model ReviewVersion {
  id                    String @id @default(uuid()) @db.Uuid
  reviewId              String @db.Uuid
  version               Int
  status                ReviewVersionStatus
  immutableSnapshotJson Json?
  submittedAt           DateTime? @db.Timestamptz
  lockVersion           Int @default(0)

  @@unique([reviewId, version])
}

model BackgroundJob {
  id            String @id @default(uuid()) @db.Uuid
  type          JobType
  idempotencyKey String @unique
  payloadJson   Json
  status        JobStatus @default(QUEUED)
  attempts      Int @default(0)
  runAfter      DateTime @default(now()) @db.Timestamptz
  lockedAt      DateTime? @db.Timestamptz
  lastErrorCode String?
  createdAt     DateTime @default(now()) @db.Timestamptz
  updatedAt     DateTime @updatedAt @db.Timestamptz
}
```

Define all remaining entities and relations from Spec section 11, including cascade restrictions that prevent deleting submitted review history.

- [ ] **Step 4: Validate and generate Prisma Client**

Run:

```powershell
npx prisma format --schema packages/db/prisma/schema.prisma
npx prisma validate --schema packages/db/prisma/schema.prisma
npx prisma generate --schema packages/db/prisma/schema.prisma
npx prisma migrate diff --from-empty --to-schema packages/db/prisma/schema.prisma --script --output packages/db/prisma/migrations/0001_init/migration.sql
npm test -- schema.test.ts
```

Expected: schema validation and tests pass without a live database.

- [ ] **Step 5: Write and satisfy repository transaction tests**

Test the repository through a mocked Prisma transaction object:

```ts
it("freezes the version and enqueues AI in the same transaction", async () => {
  const tx = fakeTransaction();
  await repository.submitVersion(tx, { reviewVersionId: "v1", expectedLockVersion: 2 });
  expect(tx.reviewVersion.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "v1", lockVersion: 2 },
    data: expect.objectContaining({ status: "AI_PROCESSING", lockVersion: 3 })
  }));
  expect(tx.backgroundJob.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ type: "GENERATE_AI_SUMMARY", idempotencyKey: "ai:v1" })
  }));
});
```

Implement `submitVersion`, `claimNext`, `complete`, `retry`, and `markDead` with focused repository methods.

- [ ] **Step 6: Commit persistence contracts**

```powershell
git add packages/db
git commit -m "feat: add review persistence and job schema"
```

---

### Task 4: Encode and seed the approved Word template

**Files:**
- Create: `packages/domain/src/templates/template-schema.ts`
- Create: `packages/domain/src/templates/azure-ss-v1.ts`
- Create: `packages/domain/src/templates/azure-ss-v1.test.ts`
- Create: `packages/db/prisma/seed.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/db/package.json`

**Interfaces:**
- Consumes: the `template.docx` inventory in the approved spec.
- Produces: `TemplateDefinition`, `azureSsTemplateV1`, idempotent seed key `azure-ss-v1`.

- [ ] **Step 1: Write failing template-count and weight tests**

```ts
import { describe, expect, it } from "vitest";
import { azureSsTemplateV1 } from "./azure-ss-v1";

describe("Azure SS template v1", () => {
  it("matches the source document", () => {
    expect(azureSsTemplateV1.dimensions).toHaveLength(4);
    expect(azureSsTemplateV1.dimensions.flatMap((x) => x.questions)).toHaveLength(20);
    expect(azureSsTemplateV1.dimensions.reduce((sum, x) => sum + x.weight, 0)).toBe(1);
    expect(azureSsTemplateV1.capabilities).toHaveLength(7);
    expect(azureSsTemplateV1.behaviors).toHaveLength(9);
    expect(azureSsTemplateV1.openQuestions).toHaveLength(6);
    expect(azureSsTemplateV1.preparationChecks).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run and observe failure**

Run: `npm test -- azure-ss-v1.test.ts`

Expected: FAIL because the template module is missing.

- [ ] **Step 3: Define the Zod-validated template schema and all source fields**

Use stable IDs such as `performance.acr-target`, `capability.solution-selling`, `behavior.weekly-msx`, and `open.biggest-bottleneck`. Each dimension must include `bestThingQuestion` and `improvementQuestion`. Set all 20 score fields, 7 capability ratings, 8 reflections, and 6 open answers as required; evidence text and checkbox values remain optional/false-valid as specified.

Install the schema dependency:

```powershell
npm install -w @employee-review/domain zod
```

- [ ] **Step 4: Add an idempotent Prisma seed**

The seed must upsert `Template`, `TemplateVersion`, and the initial `DRAFT` template without opening a review cycle. It must serialize the validated definition to `schemaJson` and never mutate a published version.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm test -- azure-ss-v1.test.ts
npm run typecheck
git add packages/domain packages/db
git commit -m "feat: encode Azure SS review template"
```

Expected: tests and typecheck pass.

---

### Task 5: Add Entra ID login, authorized-user onboarding, and server-side RBAC

**Files:**
- Create: `apps/web/auth.ts`
- Create: `apps/web/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/lib/auth/session-user.ts`
- Create: `apps/web/lib/auth/permissions.ts`
- Create: `apps/web/lib/auth/require-permission.ts`
- Create: `apps/web/lib/auth/permissions.test.ts`
- Create: `apps/web/app/(auth)/unauthorized/page.tsx`
- Create: `apps/web/types/next-auth.d.ts`
- Create: `apps/web/.env.example`

**Interfaces:**
- Consumes: `User`, `UserRole`, and Entra claims `oid`, `name`, `preferred_username`.
- Produces: `getSessionUser()`, `requirePermission(permission, resource?)`, `Permission` union.

- [ ] **Step 1: Write failing policy tests**

```ts
import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("authorization policy", () => {
  it("prevents an employee from reading a coworker's review", () => {
    expect(can({ id: "e1", roles: ["EMPLOYEE"] }, "review:read", { employeeId: "e2" })).toBe(false);
  });

  it("lets managers read every review but only the approver decide", () => {
    const manager = { id: "m1", roles: ["MANAGER"] as const };
    expect(can(manager, "review:read", { employeeId: "e2", approverManagerId: "m2" })).toBe(true);
    expect(can(manager, "review:decide", { employeeId: "e2", approverManagerId: "m2" })).toBe(false);
  });

  it("never exposes analytics to employees", () => {
    expect(can({ id: "e1", roles: ["EMPLOYEE"] }, "analytics:read")).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- permissions.test.ts`

Expected: FAIL because `can` does not exist.

- [ ] **Step 3: Implement the pure permission matrix**

Define explicit permissions:

```ts
export type Permission =
  | "review:read"
  | "review:edit-own"
  | "review:decide"
  | "analytics:read"
  | "admin:manage-users"
  | "admin:manage-templates"
  | "admin:manage-cycles"
  | "admin:retry-jobs"
  | "admin:read-audit";
```

Do not infer permission from UI routes. Every route handler must call `requirePermission` before repository access.

- [ ] **Step 4: Configure Auth.js Microsoft Entra ID provider**

Install Web authentication and validation dependencies:

```powershell
npm install -w @employee-review/web next-auth zod
```

Map the Entra `oid` to the local authorized user. Reject wrong-tenant tokens and inactive/unknown users. Permit bootstrap admin object IDs from a comma-separated environment setting only when no active admin exists. Add session fields `userId`, `roles`, and `entraObjectId`.

- [ ] **Step 5: Verify auth code and commit**

Run:

```powershell
npm test -- permissions.test.ts
npm run typecheck
git add apps/web
git commit -m "feat: add Entra authentication and RBAC"
```

Expected: permission tests pass; missing environment values cause a clear startup validation error in production mode.

---

### Task 6: Build administrator user, template, and cycle services

**Files:**
- Create: `apps/web/lib/admin/user-service.ts`
- Create: `apps/web/lib/admin/template-service.ts`
- Create: `apps/web/lib/admin/cycle-service.ts`
- Create: `apps/web/lib/admin/admin-services.test.ts`
- Create: `apps/web/app/api/admin/users/route.ts`
- Create: `apps/web/app/api/admin/templates/route.ts`
- Create: `apps/web/app/api/admin/templates/[templateId]/publish/route.ts`
- Create: `apps/web/app/api/admin/cycles/route.ts`
- Create: `apps/web/app/(admin)/admin/users/page.tsx`
- Create: `apps/web/app/(admin)/admin/templates/page.tsx`
- Create: `apps/web/app/(admin)/admin/cycles/page.tsx`

**Interfaces:**
- Consumes: RBAC, Prisma repositories, `TemplateDefinition`.
- Produces: `authorizeUser`, `publishTemplate`, `openCycle`, admin JSON APIs.

- [ ] **Step 1: Write failing service tests for immutability and cycle creation**

```ts
it("publishes a validated template exactly once", async () => {
  const result = await service.publishTemplate("tv1", adminActor);
  expect(result.status).toBe("PUBLISHED");
  await expect(service.updateTemplate("tv1", validDefinition, adminActor))
    .rejects.toThrow("published templates are immutable");
});

it("opens a cycle with one review per active employee and snapshots each approver", async () => {
  await cycleService.openCycle("c1", adminActor);
  expect(repository.createReviews).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ employeeId: "e1", approverManagerId: "m1", version: 1 })
  ]));
});
```

- [ ] **Step 2: Observe failures, then implement transactional services**

Run: `npm test -- admin-services.test.ts`

Expected first run: FAIL. Add Zod input schemas, audit events, immutable publish, cycle status transitions, and review creation in transactions. Re-run until PASS.

- [ ] **Step 3: Add role-protected route handlers**

Each handler follows this shape:

```ts
export async function POST(request: Request): Promise<Response> {
  const actor = await requirePermission("admin:manage-cycles");
  const input = CreateCycleSchema.parse(await request.json());
  return Response.json(await cycleService.create(input, actor), { status: 201 });
}
```

Return 400 for validation, 401 for no session, 403 for role denial, 409 for state conflicts, and 500 with a correlation ID for unexpected errors.

- [ ] **Step 4: Build functional admin pages**

Create accessible tables/forms for authorized users, multi-role assignment, approver manager mapping, template versions, and cycle status. Require a confirmation dialog for template publish and cycle open/close.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm test -- admin-services.test.ts
npm run typecheck
npm run build
git add apps/web
git commit -m "feat: add admin users templates and cycles"
```

---

### Task 7: Build employee draft, autosave, validation, scoring, and submission

**Files:**
- Create: `apps/web/lib/reviews/review-service.ts`
- Create: `apps/web/lib/reviews/review-service.test.ts`
- Create: `apps/web/app/api/my/reviews/route.ts`
- Create: `apps/web/app/api/my/reviews/[reviewId]/route.ts`
- Create: `apps/web/app/api/my/reviews/[reviewId]/draft/route.ts`
- Create: `apps/web/app/api/my/reviews/[reviewId]/submit/route.ts`
- Create: `apps/web/app/(employee)/my-reviews/page.tsx`
- Create: `apps/web/app/(employee)/my-reviews/[reviewId]/page.tsx`
- Create: `apps/web/components/reviews/review-form.tsx`
- Create: `apps/web/components/reviews/section-nav.tsx`
- Create: `apps/web/components/reviews/submit-dialog.tsx`
- Create: `apps/web/components/reviews/review-form.test.tsx`

**Interfaces:**
- Consumes: template definition, scoring, state machine, `ReviewRepository`, RBAC.
- Produces: `saveDraft`, `submitReview`, employee review APIs and form UI.

- [ ] **Step 1: Write failing service tests**

```ts
it("saves only the employee's editable draft with optimistic locking", async () => {
  await service.saveDraft({ actorId: "e1", reviewId: "r1", lockVersion: 4, answers });
  expect(repository.saveAnswers).toHaveBeenCalledWith(expect.objectContaining({
    employeeId: "e1", reviewId: "r1", expectedLockVersion: 4
  }));
});

it("submits a complete review, stores scores, and enqueues AI atomically", async () => {
  const result = await service.submitReview({ actorId: "e1", reviewId: "r1", lockVersion: 5 });
  expect(result.status).toBe("AI_PROCESSING");
  expect(result.scores.weightedScore).toBeGreaterThanOrEqual(1);
});

it("rejects a missing required open answer", async () => {
  await expect(service.submitReview({ actorId: "e1", reviewId: "r1", lockVersion: 5 }))
    .rejects.toThrow("open.biggest-bottleneck is required");
});
```

- [ ] **Step 2: Run, observe failure, and implement review services**

Run: `npm test -- review-service.test.ts`

Expected first run: FAIL. Implement ownership checks before data loading, template-driven answer validation, computed-score persistence, immutable snapshot creation, and transactionally enqueued `GENERATE_AI_SUMMARY` job. Re-run until PASS.

- [ ] **Step 3: Add employee-only APIs**

The list and detail repositories must require `employeeId = actor.id` in their query criteria. A guessed coworker ID must return 404, not reveal record existence with 403.

- [ ] **Step 4: Write failing form tests**

```tsx
it("shows all template sections and announces autosave failure", async () => {
  render(<ReviewForm review={draftFixture} saveDraft={vi.fn().mockRejectedValue(new Error())} />);
  expect(screen.getByRole("navigation", { name: "自评章节" })).toBeVisible();
  await userEvent.selectOptions(screen.getByLabelText("本季度 ACR 完成率达到或超过目标"), "4");
  expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
});
```

- [ ] **Step 5: Build the accessible form and pass tests**

Install form and component-test dependencies:

```powershell
npm install -w @employee-review/web react-hook-form @hookform/resolvers
npm install --save-dev @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Use React Hook Form with Zod, debounced autosave, a visible save state, section completion counts, score radio/select controls, character counts, and a final validation summary linking to each invalid field. Disable editing once status is not `DRAFT` or `REVISION_DRAFT`.

- [ ] **Step 6: Verify and commit**

```powershell
npm test -- review-service.test.ts review-form.test.tsx
npm run typecheck
npm run build
git add apps/web
git commit -m "feat: add employee self review workflow"
```

---

### Task 8: Implement PostgreSQL job processing and APIM AI summaries

**Files:**
- Create: `packages/domain/src/ai/summary-schema.ts`
- Create: `packages/domain/src/ai/summary-schema.test.ts`
- Create: `apps/worker/src/job-runner.ts`
- Create: `apps/worker/src/job-runner.test.ts`
- Create: `apps/worker/src/handlers/generate-ai-summary.ts`
- Create: `apps/worker/src/handlers/generate-ai-summary.test.ts`
- Create: `apps/worker/src/adapters/apim-ai-provider.ts`
- Create: `apps/worker/src/adapters/apim-ai-provider.test.ts`
- Modify: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: `JobRepository`, frozen review snapshot, APIM configuration.
- Produces: `AiSummarySchema`, `AiSummaryProvider.generate`, `runNextJob`, `handleGenerateAiSummary`.

- [ ] **Step 1: Define the failing AI output-contract tests**

```ts
it("requires evidence IDs for strengths and improvements", () => {
  expect(() => AiSummarySchema.parse({
    overallSummary: "总体表现稳定。",
    dimensionSummaries: [],
    strengths: [{ title: "推进能力", description: "主动推进", evidenceQuestionIds: [] }],
    improvements: [], managerDiscussionTopics: [], supportNeeds: [], caveats: []
  })).toThrow();
});
```

The valid fixture must include exactly four dimension summaries and 1–3 evidence-linked strengths/improvements.

- [ ] **Step 2: Implement and verify the Zod schema**

Run: `npm test -- summary-schema.test.ts`

Expected first run: FAIL, final run: PASS.

- [ ] **Step 3: Write failing APIM adapter tests**

```ts
it("retries 429 and validates the final JSON response", async () => {
  fetchMock.mockResponses(
    [JSON.stringify({ error: "rate limited" }), { status: 429 }],
    [JSON.stringify(validApimResponse), { status: 200 }]
  );
  await expect(provider.generate(input)).resolves.toEqual(validSummary);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
```

Also test a 60-second abort, malformed JSON, 5xx retry, and non-retryable 4xx.

- [ ] **Step 4: Implement the APIM provider**

Install Worker validation and fetch-test dependencies:

```powershell
npm install -w @employee-review/worker zod
npm install -w @employee-review/worker --save-dev fetch-mock
```

Build a prompt that includes deterministic scores, question IDs, employee evidence, prohibited inferences, and the JSON contract. Send no unrelated user metadata. Map errors to stable codes: `AI_RATE_LIMIT`, `AI_TIMEOUT`, `AI_UPSTREAM`, `AI_INVALID_RESPONSE`, `AI_AUTH`.

- [ ] **Step 5: Write and satisfy job-runner tests**

```ts
it("marks the fifth retryable failure DEAD", async () => {
  repository.claimNext.mockResolvedValue(jobFixture({ attempts: 4 }));
  handler.run.mockRejectedValue(new RetryableJobError("AI_TIMEOUT"));
  await runner.runOnce();
  expect(repository.markDead).toHaveBeenCalledWith(job.id, "AI_TIMEOUT");
});
```

Implement exponential delays of 1, 5, 15, and 60 minutes before the fifth failed attempt becomes `DEAD`.

- [ ] **Step 6: Complete the AI handler transaction**

On success, upsert one `AiSummary` by `reviewVersionId`, transition `AI_PROCESSING → PENDING_REVIEW`, enqueue `SEND_MANAGER_SUMMARY` with key `manager-summary:{versionId}`, and append an audit event. Repeated execution must not duplicate the summary or mail job.

- [ ] **Step 7: Verify and commit**

```powershell
npm test -- summary-schema.test.ts apim-ai-provider.test.ts job-runner.test.ts generate-ai-summary.test.ts
npm run typecheck
git add packages/domain apps/worker
git commit -m "feat: add AI summary worker"
```

---

### Task 9: Send scoped shared-mailbox notifications through Microsoft Graph

**Files:**
- Create: `apps/worker/src/adapters/graph-mail-provider.ts`
- Create: `apps/worker/src/adapters/graph-mail-provider.test.ts`
- Create: `apps/worker/src/handlers/send-notification.ts`
- Create: `apps/worker/src/handlers/send-notification.test.ts`
- Create: `apps/worker/src/templates/manager-summary-email.ts`
- Create: `apps/worker/src/templates/decision-email.ts`
- Create: `apps/worker/src/templates/email-templates.test.ts`

**Interfaces:**
- Consumes: Graph tenant/client credentials, shared mailbox, `AiSummary`, approval result.
- Produces: `MailProvider.send`, manager summary and employee decision handlers.

- [ ] **Step 1: Write failing email privacy tests**

```ts
it("includes the AI summary and deep link but not full raw answers", () => {
  const html = renderManagerSummaryEmail(managerMailFixture);
  expect(html).toContain("团队协同表现突出");
  expect(html).toContain("/manager/reviews/r1");
  expect(html).not.toContain(managerMailFixture.rawOpenAnswer);
});
```

- [ ] **Step 2: Implement accessible Chinese email templates**

Use semantic headings, text fallbacks, escaped employee content, absolute HTTPS deep links, and no approve/reject action that bypasses logged-in Web authorization.

- [ ] **Step 3: Write failing Graph adapter tests**

Assert `POST /users/{sharedMailbox}/sendMail`, recipient email normalization, `saveToSentItems: true`, retry classification for 429/5xx, and permanent classification for invalid-recipient responses.

- [ ] **Step 4: Implement Graph client-credential sending**

Install the Graph authentication dependencies:

```powershell
npm install -w @employee-review/worker @azure/identity @microsoft/microsoft-graph-client
```

Use `ClientSecretCredential` and Graph `Mail.Send`. Read `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, and `GRAPH_SHARED_MAILBOX` only from validated runtime configuration. Do not log access tokens or message bodies.

- [ ] **Step 5: Complete notification handlers and verify**

Create one `Notification` per idempotency key, send, mark `SENT`, and audit. On retryable failure keep the notification record and let the job runner retry without duplicate successful mail.

Run:

```powershell
npm test -- graph-mail-provider.test.ts email-templates.test.ts send-notification.test.ts
npm run typecheck
git add apps/worker
git commit -m "feat: add Graph email notifications"
```

---

### Task 10: Implement manager review, approval, rejection, and version copying

**Files:**
- Create: `apps/web/lib/approvals/approval-service.ts`
- Create: `apps/web/lib/approvals/approval-service.test.ts`
- Create: `apps/web/app/api/manager/reviews/route.ts`
- Create: `apps/web/app/api/manager/reviews/[reviewId]/route.ts`
- Create: `apps/web/app/api/manager/review-versions/[versionId]/approve/route.ts`
- Create: `apps/web/app/api/manager/review-versions/[versionId]/reject/route.ts`
- Create: `apps/web/app/(manager)/manager/reviews/page.tsx`
- Create: `apps/web/app/(manager)/manager/reviews/[reviewId]/page.tsx`
- Create: `apps/web/components/approvals/approval-panel.tsx`
- Create: `apps/web/components/approvals/approval-panel.test.tsx`

**Interfaces:**
- Consumes: RBAC, state machine, review data, AI summary, job repository.
- Produces: `approve`, `reject`, manager list/detail APIs and decision UI.

- [ ] **Step 1: Write failing approval service tests**

```ts
it("requires a comment and the snapshotted approver", async () => {
  await expect(service.approve({ actorId: "m2", versionId: "v1", comment: "" }))
    .rejects.toThrow("comment is required");
  await expect(service.approve({ actorId: "m2", versionId: "v1", comment: "通过" }))
    .rejects.toThrow("only the assigned manager can decide");
});

it("rejects and creates a copied revision draft", async () => {
  const result = await service.reject({ actorId: "m1", versionId: "v1", comment: "补充客户证据" });
  expect(result.rejectedVersion.status).toBe("REJECTED");
  expect(result.newVersion).toMatchObject({ version: 2, status: "REVISION_DRAFT" });
  expect(result.newVersion.answers).toEqual(result.rejectedVersion.answers);
});
```

- [ ] **Step 2: Implement transactional decisions**

Require status `PENDING_REVIEW`, non-empty trimmed comment, matching `approverManagerId`, and expected `lockVersion`. Approve enqueues `SEND_APPROVED`; reject copies answers into a new editable version and enqueues `SEND_REJECTED`. Record one immutable `Approval` and an audit event.

- [ ] **Step 3: Add manager read APIs with separate read/decide authorization**

All managers can list and read all employees. Detail responses include template snapshot, answers, scores, AI summary, approvals, and version history. Only the assigned manager receives `canDecide: true`.

- [ ] **Step 4: Build and test the decision panel**

Render original detail and AI summary with evidence links that scroll to the referenced question. Both buttons open a dialog with required comment. Disable decisions for non-approvers or stale versions and announce server conflicts.

- [ ] **Step 5: Verify and commit**

```powershell
npm test -- approval-service.test.ts approval-panel.test.tsx
npm run typecheck
npm run build
git add apps/web
git commit -m "feat: add manager approval workflow"
```

---

### Task 11: Build manager/admin analytics without employee data leakage

**Files:**
- Create: `apps/web/lib/analytics/analytics-service.ts`
- Create: `apps/web/lib/analytics/analytics-service.test.ts`
- Create: `apps/web/app/api/manager/dashboard/route.ts`
- Create: `apps/web/app/(manager)/manager/page.tsx`
- Create: `apps/web/components/dashboard/kpi-cards.tsx`
- Create: `apps/web/components/dashboard/dimension-heatmap.tsx`
- Create: `apps/web/components/dashboard/score-distribution.tsx`
- Create: `apps/web/components/dashboard/capability-radar.tsx`
- Create: `apps/web/components/dashboard/cycle-trend.tsx`
- Create: `apps/web/components/dashboard/review-status-table.tsx`
- Create: `apps/web/components/dashboard/dashboard.test.tsx`

**Interfaces:**
- Consumes: submitted computed scores and role authorization.
- Produces: `getDashboard(filters)`, manager/admin dashboard payload and accessible charts.

- [ ] **Step 1: Write failing aggregation and authorization tests**

```ts
it("returns weighted metrics and four-dimensional employee heatmap rows", async () => {
  const dashboard = await service.getDashboard({ cycleId: "c1" }, managerActor);
  expect(dashboard.kpis).toMatchObject({ participantCount: 18, pendingReviewCount: 6 });
  expect(dashboard.heatmap[0].dimensions).toEqual(expect.objectContaining({
    performance: expect.any(Number), customer: expect.any(Number),
    collaboration: expect.any(Number), technical: expect.any(Number)
  }));
});

it("denies employee analytics before querying", async () => {
  await expect(service.getDashboard({ cycleId: "c1" }, employeeActor)).rejects.toThrow("forbidden");
  expect(repository.aggregateDashboard).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Implement bounded aggregation queries**

Support cycle, review status, employee, and approver filters. Return KPIs, 1-point-decimal heatmap values, distribution buckets, capability averages, behavior rates, cycle trends, and a paginated status table. Exclude drafts from performance averages.

- [ ] **Step 3: Add a manager/admin-only route**

Call `requirePermission("analytics:read")` before parsing filters or accessing repositories. Add a route-level test confirming employee sessions receive 403 and no analytics payload.

- [ ] **Step 4: Build ECharts components with accessible alternatives**

Install chart dependencies:

```powershell
npm install -w @employee-review/web echarts echarts-for-react
```

Each chart must render a textual heading, summary sentence, and hidden/expandable data table. Heatmap cells and status table rows link to review detail. Filters update the URL query string for shareable manager views.

- [ ] **Step 5: Verify and commit**

```powershell
npm test -- analytics-service.test.ts dashboard.test.tsx
npm run typecheck
npm run build
git add apps/web
git commit -m "feat: add role-protected team analytics"
```

---

### Task 12: Add audit log, failed-job operations, and operational safeguards

**Files:**
- Create: `apps/web/lib/admin/job-service.ts`
- Create: `apps/web/lib/admin/job-service.test.ts`
- Create: `apps/web/app/api/admin/jobs/route.ts`
- Create: `apps/web/app/api/admin/jobs/[jobId]/retry/route.ts`
- Create: `apps/web/app/api/admin/audit-events/route.ts`
- Create: `apps/web/app/(admin)/admin/jobs/page.tsx`
- Create: `apps/web/app/(admin)/admin/audit/page.tsx`
- Create: `packages/config/src/env.ts`
- Create: `packages/config/src/env.test.ts`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `apps/web/instrumentation.ts`
- Create: `apps/worker/src/telemetry.ts`

**Interfaces:**
- Consumes: job/audit repositories, admin RBAC, Azure Monitor connection string.
- Produces: `retryDeadJob`, paginated audit API, validated environment config, telemetry initialization.

- [ ] **Step 1: Write failing retry and secret-redaction tests**

```ts
it("allows an admin to retry only DEAD jobs", async () => {
  await service.retry("j1", adminActor);
  expect(repository.requeue).toHaveBeenCalledWith("j1", expect.objectContaining({ attempts: 0 }));
  await expect(service.retry("processing", adminActor)).rejects.toThrow("job is not DEAD");
});

it("redacts credential-shaped fields", () => {
  expect(redact({ apiKey: "secret", reviewVersionId: "v1" }))
    .toEqual({ apiKey: "[REDACTED]", reviewVersionId: "v1" });
});
```

- [ ] **Step 2: Implement admin operations and audit pagination**

Requeue with a new audit event; never edit the original error history. Audit filters support actor, action, entity type, and date range. UI displays error code and correlation ID, never employee answers or credentials.

- [ ] **Step 3: Validate all runtime configuration**

Create `packages/config/package.json` with name `@employee-review/config`, then install:

```powershell
npm install -w @employee-review/config zod
npm install -w @employee-review/worker @azure/monitor-opentelemetry
```

Create Zod schemas for Web and Worker variables. Required production variables include database URL, Auth.js/Entra settings, APIM URL/key/deployment/API version, Graph settings, shared mailbox, public base URL, and Application Insights connection string.

- [ ] **Step 4: Initialize privacy-safe telemetry**

Attach correlation IDs, route names, job IDs, durations, attempt counts, and stable error codes. Explicitly filter request bodies, prompt text, AI output, access tokens, cookies, and mail bodies.

- [ ] **Step 5: Verify and commit**

```powershell
npm test -- job-service.test.ts env.test.ts
npm run typecheck
git add apps packages/config
git commit -m "feat: add operations audit and telemetry"
```

---

### Task 13: Apply responsive visual system and accessibility checks

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/button.tsx`
- Create: `packages/ui/src/card.tsx`
- Create: `packages/ui/src/dialog.tsx`
- Create: `packages/ui/src/form-field.tsx`
- Create: `packages/ui/src/status-badge.tsx`
- Create: `packages/ui/src/data-table.tsx`
- Create: `packages/ui/src/index.ts`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/components/app-shell.tsx`
- Create: `apps/web/components/role-navigation.tsx`
- Create: `apps/web/tests/accessibility.test.tsx`
- Modify: all role page layouts to use the shared shell.

**Interfaces:**
- Consumes: completed page functionality and role-aware routes.
- Produces: reusable accessible components, consistent responsive navigation, polished Chinese UI.

- [ ] **Step 1: Write failing accessibility tests**

```tsx
it("has no critical axe violations on employee and manager landing pages", async () => {
  const { container } = render(<AppShellFixture />);
  expect(await axe(container)).toHaveNoViolations();
});
```

Also assert a skip link, one `h1`, named navigation, visible focus ring classes, labeled chart regions, and keyboard-operable dialogs.

- [ ] **Step 2: Implement design tokens and shared components**

Create `packages/ui/package.json` with name `@employee-review/ui`, React peer dependencies, and the `./src/index.ts` export. Install styling dependencies:

```powershell
npm install -w @employee-review/ui class-variance-authority clsx tailwind-merge lucide-react
npm install -w @employee-review/web tailwindcss postcss autoprefixer
npm install --save-dev vitest-axe
```

Use neutral slate surfaces, Azure blue primary actions, semantic success/warning/error colors that meet AA contrast, 8px spacing rhythm, 12px card radius, and restrained shadows. Support `prefers-reduced-motion` and never convey score/status by color alone.

- [ ] **Step 3: Apply responsive role shells**

Desktop uses left navigation and a top identity/role control; tablet/mobile use a drawer. Employee navigation excludes manager/admin destinations. Manager/admin navigation exposes dashboard only to authorized roles.

- [ ] **Step 4: Verify visual and accessibility quality**

Run:

```powershell
npm test -- accessibility.test.tsx
npm run typecheck
npm run build
git add packages/ui apps/web
git commit -m "feat: polish responsive accessible UI"
```

Expected: accessibility tests pass and pages build at 320px, 768px, and 1440px viewport configurations.

---

### Task 14: Containerize and define Azure infrastructure with Bicep

**Files:**
- Create: `apps/web/Containerfile`
- Create: `apps/worker/Containerfile`
- Create: `infra/main.bicep`
- Create: `infra/modules/monitoring.bicep`
- Create: `infra/modules/registry.bicep`
- Create: `infra/modules/database.bicep`
- Create: `infra/modules/key-vault.bicep`
- Create: `infra/modules/container-apps.bicep`
- Create: `infra/environments/dev.bicepparam`
- Create: `infra/environments/prod.bicepparam`
- Create: `infra/README.md`
- Create: `infra/tests/main.test.ps1`

**Interfaces:**
- Consumes: Web/Worker build commands and validated runtime settings.
- Produces: OCI images and repeatable Azure resources/outputs for custom-domain setup.

- [ ] **Step 1: Write failing static IaC tests**

```powershell
Describe 'main.bicep' {
  It 'declares required modules without Service Bus' {
    $source = Get-Content "$PSScriptRoot/../main.bicep" -Raw
    $source | Should -Match 'modules/database.bicep'
    $source | Should -Match 'modules/container-apps.bicep'
    $source | Should -Not -Match 'Microsoft.ServiceBus'
  }
}
```

Add assertions for Key Vault references, system/user-assigned identity, Web external ingress, Worker no external ingress, Application Insights, PostgreSQL 14-day backup retention, optional HA parameter defaulting false, and output of Container App FQDN/domain verification token.

- [ ] **Step 2: Run and observe the missing-file failures**

Run:

```powershell
Invoke-Pester infra/tests/main.test.ps1
```

Expected: FAIL because the Bicep files do not exist.

- [ ] **Step 3: Add multi-stage Containerfiles**

Use `node:22-alpine`, `npm ci`, non-root runtime users, Next.js standalone output, explicit health checks, and separate Web/Worker entry commands. Do not copy `.env`, docs, tests, or source credentials into runtime images.

- [ ] **Step 4: Implement Bicep modules**

Create ACR, Log Analytics, Application Insights, Key Vault RBAC, PostgreSQL Flexible Server, Container Apps Environment, Web/Worker apps, identities, registry pull permissions, Key Vault secret references, revision mode, scaling limits, and outputs. Accept secret names/URIs as parameters, never plaintext secret values.

- [ ] **Step 5: Validate Bicep and static policy**

Run:

```powershell
az bicep build --file infra/main.bicep
az bicep lint --file infra/main.bicep
Invoke-Pester infra/tests/main.test.ps1
```

Expected: all commands pass.

- [ ] **Step 6: Document exact domain binding steps**

`infra/README.md` must list the FQDN output, required CNAME or apex A record, `asuid` TXT record, Container Apps managed-certificate command/portal step, HTTPS verification, and Entra redirect URI update.

- [ ] **Step 7: Commit infrastructure**

```powershell
git add apps/web/Containerfile apps/worker/Containerfile infra
git commit -m "feat: add Azure infrastructure as code"
```

---

### Task 15: Add manually triggered GitHub deployment and end-to-end acceptance tests

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `playwright.config.ts`
- Create: `e2e/fixtures/auth.ts`
- Create: `e2e/employee-submit.spec.ts`
- Create: `e2e/manager-approve.spec.ts`
- Create: `e2e/reject-resubmit.spec.ts`
- Create: `e2e/authorization.spec.ts`
- Create: `e2e/dashboard.spec.ts`
- Create: `docs/operations/runbook.md`
- Create: `README.md`

**Interfaces:**
- Consumes: complete application, Bicep, images, test identities/fixtures.
- Produces: `workflow_dispatch` deployment, acceptance suite, operational handoff.

- [ ] **Step 1: Write end-to-end acceptance tests**

Install Playwright before writing the fixtures:

```powershell
npm install --save-dev @playwright/test
npx playwright install chromium
```

```ts
test("employee submit generates summary and assigned manager can approve", async ({ employeePage, managerPage }) => {
  await completeRequiredReview(employeePage);
  await employeePage.getByRole("button", { name: "提交自评" }).click();
  await expect(employeePage.getByText("AI 总结处理中")).toBeVisible();
  await runWorkerFixtures();
  await managerPage.goto("/manager/reviews/r1");
  await expect(managerPage.getByRole("heading", { name: "AI 总结" })).toBeVisible();
  await managerPage.getByLabel("经理评论").fill("目标完成，继续加强客户证据沉淀。");
  await managerPage.getByRole("button", { name: "通过" }).click();
  await expect(employeePage.getByText("已通过")).toBeVisible();
});
```

Add explicit tests for rejection/version 2, non-approver read-only access, employee coworker-ID denial, employee analytics denial, admin template/cycle flow, and DEAD job retry.

- [ ] **Step 2: Run E2E and observe failures before fixture wiring**

Run: `npx playwright test`

Expected: FAIL until authenticated fixtures, database reset, worker fixtures, and the complete app are wired.

- [ ] **Step 3: Complete deterministic E2E fixtures and pass the suite**

Use local test-session injection only when `NODE_ENV=test`; production must reject the header/cookie. Seed fixed employee, assigned manager, second manager, admin, published template, and open cycle. Stub APIM and Graph at adapter boundaries without bypassing job processing.

- [ ] **Step 4: Create a manual-only GitHub Actions workflow**

The top of `.github/workflows/deploy.yml` must be:

```yaml
name: Deploy employee review
on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [dev, prod]
        required: true
permissions:
  id-token: write
  contents: read
```

Jobs must run `npm ci`, lint, typecheck, unit/integration/E2E tests, build/push both images, Bicep what-if, environment approval for prod, Bicep deploy, Prisma migration, Container Apps update, and `/api/health` smoke check. Do not add `push`, `pull_request`, or `schedule` deployment triggers.

- [ ] **Step 5: Write operations documentation**

Document bootstrap admin, Key Vault secret names, Entra registration/redirect URIs, Graph `Mail.Send` admin consent and shared-mailbox restriction, APIM configuration, first deploy, DNS, failed-job recovery, database restore, credential rotation, and rollback to a previous Container Apps revision.

- [ ] **Step 6: Run the complete verification gate**

Run:

```powershell
npm run lint
npm run typecheck
npm test
npx playwright test
npm run build
az bicep build --file infra/main.bicep
Invoke-Pester infra/tests/main.test.ps1
git status --short
```

Expected: every command passes; `git status --short` contains only intentional documentation/plan tracking updates.

- [ ] **Step 7: Commit the delivery workflow and acceptance suite**

```powershell
git add .github playwright.config.ts e2e docs/operations README.md
git commit -m "feat: add manual deployment and acceptance tests"
```

## Plan Self-Review Record

- Spec coverage: all role, template, state-machine, AI, mail, analytics, admin, security, observability, Azure, domain, and manual-deployment requirements map to Tasks 2–15.
- Placeholder scan: the plan contains no deferred implementation markers; every test and implementation step names exact files, interfaces, commands, and expected outcomes.
- Type consistency: review statuses, role names, job names, permission names, score types, and AI schema names remain consistent across producer and consumer tasks.
- Scope: each task ends with a testable increment and commit; Service Bus, compensation, 360 feedback, HR sync, mobile apps, and multi-tenancy remain excluded.

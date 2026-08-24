import { Prisma, Role, TemplateStatus, UserStatus, prisma } from "@employee-review/db";
import { TemplateDefinitionSchema, type TemplateDefinition } from "@employee-review/domain";

import { normalizeEntraEmail } from "../auth/entra-email";

interface AdminActor { id: string }

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { displayName: "asc" },
    include: {
      roles: true,
      employeeManagers: { where: { effectiveTo: null }, include: { manager: { select: { id: true, displayName: true } } } },
    },
  });
}

export async function authorizeUser(input: {
  id?: string;
  email: string;
  displayName?: string;
  roles: Role[];
  managerId?: string;
  resetEntraBinding?: boolean;
}, actor: AdminActor) {
  return prisma.$transaction(async (tx) => {
    const email = normalizeEntraEmail(input.email);
    if (!email) throw Object.assign(new Error("email or Guest UPN is invalid"), { status: 400 });
    const displayName = input.displayName?.trim() || email.split("@")[0];
    const target = input.id
      ? await tx.user.findUnique({ where: { id: input.id }, select: { id: true } })
      : await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (input.id && !target) {
      throw Object.assign(new Error("user not found"), { status: 404 });
    }
    const conflict = await tx.user.findFirst({
      where: {
        email,
        ...(target ? { NOT: { id: target.id } } : {}),
      },
      select: { email: true },
    });
    if (conflict) {
      throw Object.assign(new Error("email already belongs to another user"), { status: 409 });
    }

    const data = {
      email,
      displayName,
      status: UserStatus.ACTIVE,
      ...(input.resetEntraBinding ? { entraObjectId: null } : {}),
      roles: { deleteMany: {}, create: [...new Set(input.roles)].map((role) => ({ role })) },
    };
    const user = target
      ? await tx.user.update({ where: { id: target.id }, data })
      : await tx.user.create({
        data: {
          email,
          displayName,
          roles: { create: [...new Set(input.roles)].map((role) => ({ role })) },
        },
      });
    await tx.employeeManager.updateMany({
      where: { employeeId: user.id, effectiveTo: null },
      data: { effectiveTo: new Date() },
    });
    if (input.managerId) {
      const manager = await tx.user.findFirst({
        where: {
          id: input.managerId,
          status: UserStatus.ACTIVE,
          roles: { some: { role: Role.MANAGER } },
        },
        select: { id: true },
      });
      if (!manager) {
        throw Object.assign(new Error("approver must be an active manager"), { status: 409 });
      }
      await tx.employeeManager.create({
        data: { employeeId: user.id, managerId: input.managerId, effectiveFrom: new Date() },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "USER_AUTHORIZED",
        entityType: "User",
        entityId: user.id,
        metadataJson: { roles: input.roles, managerId: input.managerId ?? null, resetEntraBinding: input.resetEntraBinding ?? false },
      },
    });
    return user;
  });
}

export async function setUserActiveState(userId: string, active: boolean, actor: AdminActor) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, roles: { select: { role: true } } },
    });
    if (!user) throw Object.assign(new Error("user not found"), { status: 404 });

    if (!active) {
      if (user.id === actor.id) {
        throw Object.assign(new Error("you cannot deactivate your own account"), { status: 409 });
      }
      if (user.roles.some(({ role }) => role === Role.ADMIN)) {
        const otherActiveAdmins = await tx.user.count({
          where: { id: { not: user.id }, status: UserStatus.ACTIVE, roles: { some: { role: Role.ADMIN } } },
        });
        if (otherActiveAdmins === 0) {
          throw Object.assign(new Error("the last active administrator cannot be deactivated"), { status: 409 });
        }
      }
      await tx.employeeManager.updateMany({
        where: { OR: [{ employeeId: user.id }, { managerId: user.id }], effectiveTo: null },
        data: { effectiveTo: new Date() },
      });
    }

    const status = active ? UserStatus.ACTIVE : UserStatus.INACTIVE;
    const updated = await tx.user.update({ where: { id: user.id }, data: { status } });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
        entityType: "User",
        entityId: user.id,
        metadataJson: { previousStatus: user.status, status },
      },
    });
    return updated;
  });
}

export async function listTemplates() {
  return prisma.template.findMany({ orderBy: { createdAt: "desc" }, include: { versions: { orderBy: { version: "desc" } } } });
}

export async function createTemplate(input: { name: string; definition: TemplateDefinition }, actor: AdminActor) {
  const definition = TemplateDefinitionSchema.parse(input.definition);
  return prisma.$transaction(async (tx) => {
    const template = await tx.template.create({ data: { name: input.name } });
    const version = await tx.templateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        schemaJson: definition as unknown as Prisma.InputJsonObject,
      },
    });
    await tx.auditEvent.create({
      data: { actorId: actor.id, action: "TEMPLATE_CREATED", entityType: "Template", entityId: template.id, metadataJson: { versionId: version.id } },
    });
    return { template, version };
  });
}

export async function saveTemplateDraft(templateId: string, input: { name: string; definition: TemplateDefinition }, actor: AdminActor) {
  const definition = TemplateDefinitionSchema.parse(input.definition);
  return prisma.$transaction(async (tx) => {
    const template = await tx.template.findUnique({
      where: { id: templateId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!template) throw Object.assign(new Error("template not found"), { status: 404 });

    const latest = template.versions[0];
    const version = latest?.status === TemplateStatus.DRAFT ? latest.version : (latest?.version ?? 0) + 1;
    const schemaJson = { ...definition, version } as unknown as Prisma.InputJsonObject;
    const draft = latest?.status === TemplateStatus.DRAFT
      ? await tx.templateVersion.update({ where: { id: latest.id }, data: { schemaJson } })
      : await tx.templateVersion.create({ data: { templateId, version, schemaJson } });

    await tx.template.update({ where: { id: templateId }, data: { name: input.name, status: TemplateStatus.DRAFT } });
    await tx.auditEvent.create({
      data: { actorId: actor.id, action: "TEMPLATE_DRAFT_SAVED", entityType: "TemplateVersion", entityId: draft.id, metadataJson: { version } },
    });
    return draft;
  });
}

export async function publishTemplate(templateId: string, actor: AdminActor) {
  return prisma.$transaction(async (tx) => {
    const version = await tx.templateVersion.findFirst({
      where: { templateId, status: TemplateStatus.DRAFT },
      orderBy: { version: "desc" },
    });
    if (!version) throw Object.assign(new Error("no draft template version to publish"), { status: 409 });
    TemplateDefinitionSchema.parse(version.schemaJson);
    const published = await tx.templateVersion.update({
      where: { id: version.id },
      data: { status: TemplateStatus.PUBLISHED, publishedAt: new Date() },
    });
    await tx.template.update({ where: { id: templateId }, data: { status: TemplateStatus.PUBLISHED } });
    await tx.auditEvent.create({
      data: { actorId: actor.id, action: "TEMPLATE_PUBLISHED", entityType: "TemplateVersion", entityId: version.id, metadataJson: { version: version.version } },
    });
    return published;
  });
}

export async function listCycles() {
  return prisma.reviewCycle.findMany({
    orderBy: { periodStart: "desc" },
    include: { templateVersion: { include: { template: true } }, _count: { select: { reviews: true } } },
  });
}

export async function createCycle(input: {
  name: string;
  templateVersionId: string;
  periodStart: Date;
  periodEnd: Date;
  opensAt: Date;
  dueAt: Date;
}, actor: AdminActor) {
  const template = await prisma.templateVersion.findFirst({ where: { id: input.templateVersionId, status: TemplateStatus.PUBLISHED } });
  if (!template) throw Object.assign(new Error("cycle requires a published template"), { status: 409 });
  const cycle = await prisma.reviewCycle.create({ data: input });
  await prisma.auditEvent.create({
    data: { actorId: actor.id, action: "CYCLE_CREATED", entityType: "ReviewCycle", entityId: cycle.id, metadataJson: { templateVersionId: input.templateVersionId } },
  });
  return cycle;
}

export async function updateCycleSchedule(cycleId: string, opensAt: Date, dueAt: Date, actor: AdminActor) {
  if (opensAt > dueAt) throw Object.assign(new Error("open time must be before the due time"), { status: 400 });
  return prisma.$transaction(async (tx) => {
    const cycle = await tx.reviewCycle.findUnique({
      where: { id: cycleId },
      select: { id: true, status: true, opensAt: true, dueAt: true },
    });
    if (!cycle) throw Object.assign(new Error("cycle not found"), { status: 404 });
    if (cycle.status === "CLOSED" || cycle.status === "ARCHIVED") {
      throw Object.assign(new Error("closed or archived cycle schedule cannot be changed"), { status: 409 });
    }

    const updated = await tx.reviewCycle.update({ where: { id: cycle.id }, data: { opensAt, dueAt } });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "CYCLE_SCHEDULE_UPDATED",
        entityType: "ReviewCycle",
        entityId: cycle.id,
        metadataJson: {
          previousOpensAt: cycle.opensAt.toISOString(),
          previousDueAt: cycle.dueAt.toISOString(),
          opensAt: opensAt.toISOString(),
          dueAt: dueAt.toISOString(),
        },
      },
    });
    return updated;
  });
}

export async function openCycle(cycleId: string, actor: AdminActor) {
  return prisma.$transaction(async (tx) => {
    const cycle = await tx.reviewCycle.findUnique({ where: { id: cycleId }, include: { templateVersion: true } });
    if (!cycle || cycle.templateVersion.status !== TemplateStatus.PUBLISHED) {
      throw Object.assign(new Error("cycle or published template not found"), { status: 409 });
    }
    const employees = await tx.user.findMany({
      where: { status: UserStatus.ACTIVE, roles: { some: { role: Role.EMPLOYEE } } },
      include: {
        employeeManagers: {
          where: {
            effectiveFrom: { lte: new Date() },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
            manager: {
              status: UserStatus.ACTIVE,
              roles: { some: { role: Role.MANAGER } },
            },
          },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
        },
      },
    });
    const assignedEmployees = employees.filter((employee) => employee.employeeManagers[0]);

    const updated = await tx.reviewCycle.updateMany({
      where: { id: cycleId, status: { in: ["DRAFT", "CLOSED"] } },
      data: { status: "OPEN" },
    });
    if (updated.count !== 1) throw Object.assign(new Error("cycle cannot be opened from its current status"), { status: 409 });

    for (const employee of assignedEmployees) {
      const review = await tx.review.upsert({
        where: { cycleId_employeeId: { cycleId, employeeId: employee.id } },
        create: { cycleId, employeeId: employee.id, approverManagerId: employee.employeeManagers[0].managerId },
        update: {},
      });
      if (!review.currentVersionId) {
        const version = await tx.reviewVersion.create({ data: { reviewId: review.id, version: 1, status: "DRAFT" } });
        await tx.review.update({ where: { id: review.id }, data: { currentVersionId: version.id } });
      }
    }
    await tx.auditEvent.create({
      data: { actorId: actor.id, action: "CYCLE_OPENED", entityType: "ReviewCycle", entityId: cycleId, metadataJson: { employeeCount: assignedEmployees.length, skippedWithoutManager: employees.length - assignedEmployees.length } },
    });
    return { id: cycleId, status: "OPEN" as const, reviewCount: assignedEmployees.length, skippedWithoutManager: employees.length - assignedEmployees.length };
  });
}

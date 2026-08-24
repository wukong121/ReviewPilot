import { Prisma, Role, TemplateStatus, UserStatus, prisma } from "@employee-review/db";
import { TemplateDefinitionSchema, type TemplateDefinition } from "@employee-review/domain";

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
  entraObjectId: string;
  email: string;
  displayName: string;
  roles: Role[];
  managerId?: string;
}, actor: AdminActor) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { entraObjectId: input.entraObjectId },
      create: {
        entraObjectId: input.entraObjectId,
        email: input.email.toLowerCase(),
        displayName: input.displayName,
        roles: { create: [...new Set(input.roles)].map((role) => ({ role })) },
      },
      update: {
        email: input.email.toLowerCase(),
        displayName: input.displayName,
        status: UserStatus.ACTIVE,
        roles: { deleteMany: {}, create: [...new Set(input.roles)].map((role) => ({ role })) },
      },
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
      await tx.employeeManager.updateMany({
        where: { employeeId: user.id, effectiveTo: null },
        data: { effectiveTo: new Date() },
      });
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
        metadataJson: { roles: input.roles, managerId: input.managerId ?? null },
      },
    });
    return user;
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
    const missingManager = employees.find((employee) => !employee.employeeManagers[0]);
    if (missingManager) throw Object.assign(new Error(`employee ${missingManager.id} has no active manager`), { status: 409 });

    const updated = await tx.reviewCycle.updateMany({
      where: { id: cycleId, status: { in: ["DRAFT", "CLOSED"] } },
      data: { status: "OPEN" },
    });
    if (updated.count !== 1) throw Object.assign(new Error("cycle cannot be opened from its current status"), { status: 409 });

    for (const employee of employees) {
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
      data: { actorId: actor.id, action: "CYCLE_OPENED", entityType: "ReviewCycle", entityId: cycleId, metadataJson: { employeeCount: employees.length } },
    });
    return { id: cycleId, status: "OPEN" as const, reviewCount: employees.length };
  });
}

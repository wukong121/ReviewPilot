import { azureSsTemplateV1 } from "@employee-review/domain";
import { PrismaClient, TemplateStatus } from "@prisma/client";

const prisma = new PrismaClient();
const TEMPLATE_ID = "a0000000-0000-4000-8000-000000000001";
const TEMPLATE_VERSION_ID = "a0000000-0000-4000-8000-000000000002";

async function seed(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.template.upsert({
      where: { id: TEMPLATE_ID },
      create: {
        id: TEMPLATE_ID,
        name: azureSsTemplateV1.name,
        status: TemplateStatus.DRAFT,
      },
      update: {},
    });

    const existing = await tx.templateVersion.findUnique({ where: { id: TEMPLATE_VERSION_ID } });
    if (existing?.status === TemplateStatus.PUBLISHED) {
      return;
    }

    await tx.templateVersion.upsert({
      where: { id: TEMPLATE_VERSION_ID },
      create: {
        id: TEMPLATE_VERSION_ID,
        templateId: TEMPLATE_ID,
        version: azureSsTemplateV1.version,
        status: TemplateStatus.DRAFT,
        schemaJson: azureSsTemplateV1,
      },
      update: { schemaJson: azureSsTemplateV1 },
    });
  });
}

seed()
  .catch((error: unknown) => {
    console.error("Template seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

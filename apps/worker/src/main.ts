import { JobRepository, prisma } from "@employee-review/db";
import { z } from "zod";

import { createAcsMailProvider } from "./adapters/acs-mail-provider";
import { ApimAiProvider } from "./adapters/apim-ai-provider";
import { GenerateAiSummaryHandler, PrismaAiSummaryStore } from "./handlers/generate-ai-summary";
import { PrismaNotificationStore, SendNotificationHandler } from "./handlers/send-notification";
import { JobRunner } from "./job-runner";
import { startWorker } from "./index";

const EnvSchema = z.object({
  APIM_BASE_URL: z.string().url(),
  APIM_API_KEY: z.string().min(1),
  APIM_DEPLOYMENT: z.string().min(1),
  MANAGED_IDENTITY_CLIENT_ID: z.string().uuid(),
  ACS_EMAIL_ENDPOINT: z.string().url().refine((value) => value.startsWith("https://"), "must use HTTPS"),
  ACS_EMAIL_SENDER: z.string().email(),
  PUBLIC_BASE_URL: z.string().url().refine((value) => value.startsWith("https://"), "must use HTTPS"),
});

async function main(): Promise<void> {
  const env = EnvSchema.parse(process.env);
  const repository = new JobRepository(prisma);
  const aiHandler = new GenerateAiSummaryHandler(
    new ApimAiProvider({
      baseUrl: env.APIM_BASE_URL,
      apiKey: env.APIM_API_KEY,
      deployment: env.APIM_DEPLOYMENT,
    }),
    new PrismaAiSummaryStore(),
    { modelId: env.APIM_DEPLOYMENT, promptVersion: "azure-ss-summary-v1", schemaVersion: "v1" },
  );
  const notificationHandler = new SendNotificationHandler(
    createAcsMailProvider({
      endpoint: env.ACS_EMAIL_ENDPOINT,
      senderAddress: env.ACS_EMAIL_SENDER,
      managedIdentityClientId: env.MANAGED_IDENTITY_CLIENT_ID,
    }),
    new PrismaNotificationStore(),
    env.PUBLIC_BASE_URL,
  );
  const runner = new JobRunner(repository, {
    GENERATE_AI_SUMMARY: aiHandler,
    SEND_MANAGER_SUMMARY: notificationHandler,
    SEND_APPROVED: notificationHandler,
    SEND_REJECTED: notificationHandler,
  });

  await startWorker({
    poll: async () => {
      if (!(await runner.runOnce())) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    },
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof z.ZodError ? "Invalid Worker configuration" : "Worker stopped unexpectedly");
  process.exitCode = 1;
});

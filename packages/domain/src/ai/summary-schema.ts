import { z } from "zod";

const EvidenceIdsSchema = z.array(z.string().min(3)).min(1);

const DimensionSummarySchema = z.object({
  dimensionId: z.enum(["performance", "customer", "collaboration", "technical"]),
  conclusion: z.string().min(1).max(2_000),
  evidenceQuestionIds: EvidenceIdsSchema,
}).strict();

export const AiSummarySchema = z.object({
  overallSummary: z.string().min(1).max(3_000),
  dimensionSummaries: z.array(DimensionSummarySchema).length(4),
  strengths: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(1_000),
    evidenceQuestionIds: EvidenceIdsSchema,
  }).strict()).max(3),
  improvements: z.array(z.object({
    title: z.string().min(1).max(200),
    action: z.string().min(1).max(1_000),
    evidenceQuestionIds: EvidenceIdsSchema,
  }).strict()).max(3),
  managerDiscussionTopics: z.array(z.string().min(1).max(500)).max(10),
  supportNeeds: z.array(z.string().min(1).max(500)).max(10),
  caveats: z.array(z.string().min(1).max(500)).max(10),
}).strict().superRefine((summary, context) => {
  const dimensions = summary.dimensionSummaries.map(({ dimensionId }) => dimensionId);
  if (new Set(dimensions).size !== 4) {
    context.addIssue({ code: "custom", message: "dimension summaries must be unique", path: ["dimensionSummaries"] });
  }
});

export type AiSummary = z.infer<typeof AiSummarySchema>;

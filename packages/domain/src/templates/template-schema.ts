import { z } from "zod";

const StableIdSchema = z.string().min(3).regex(/^[a-z]+(?:[.-][a-z0-9]+)+$/);

const TextFieldSchema = z.object({
  id: StableIdSchema,
  label: z.string().min(1),
  required: z.boolean(),
  maxLength: z.number().int().positive(),
});

const RatingFieldSchema = z.object({
  id: StableIdSchema,
  label: z.string().min(1),
  required: z.literal(true),
  evidenceOptional: z.boolean().default(true),
});

const CheckFieldSchema = z.object({
  id: StableIdSchema,
  label: z.string().min(1),
});

export const TemplateDefinitionSchema = z.object({
  id: StableIdSchema,
  name: z.string().min(1),
  version: z.number().int().positive(),
  ratingScale: z.object({ min: z.literal(1), max: z.literal(5), labels: z.record(z.string(), z.string()) }),
  dimensions: z.array(z.object({
    id: z.enum(["performance", "customer", "collaboration", "technical"]),
    name: z.string().min(1),
    weight: z.number().positive().max(1),
    questions: z.array(RatingFieldSchema).length(5),
    bestThingQuestion: TextFieldSchema.extend({ required: z.literal(true) }),
    improvementQuestion: TextFieldSchema.extend({ required: z.literal(true) }),
  })).length(4),
  capabilities: z.array(RatingFieldSchema).length(7),
  behaviors: z.array(CheckFieldSchema).length(9),
  openQuestions: z.array(TextFieldSchema.extend({ required: z.literal(true) })).length(6),
  preparationChecks: z.array(CheckFieldSchema).length(4),
}).superRefine((template, context) => {
  const weight = template.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (Math.abs(weight - 1) > Number.EPSILON) {
    context.addIssue({ code: "custom", message: "dimension weights must total 1", path: ["dimensions"] });
  }

  const ids = [
    ...template.dimensions.flatMap((dimension) => [
      ...dimension.questions.map((field) => field.id),
      dimension.bestThingQuestion.id,
      dimension.improvementQuestion.id,
    ]),
    ...template.capabilities.map((field) => field.id),
    ...template.behaviors.map((field) => field.id),
    ...template.openQuestions.map((field) => field.id),
    ...template.preparationChecks.map((field) => field.id),
  ];
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "field identifiers must be unique" });
  }
});

export type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema>;

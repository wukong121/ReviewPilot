import { z } from "zod";

import { requireOwnReviewAccess } from "../../../../../../lib/auth/require-own-review";
import { errorResponse } from "../../../../../../lib/http/error-response";
import { reviewService } from "../../../../../../lib/reviews/review-service";

const DraftPatchSchema = z.object({
  lockVersion: z.number().int().nonnegative(),
  answers: z.record(z.string(), z.object({
    numericValue: z.number().int().min(1).max(5).optional(),
    booleanValue: z.boolean().optional(),
    textValue: z.string().max(10_000).optional(),
  })),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
): Promise<Response> {
  try {
    const actor = await requireOwnReviewAccess();
    const input = DraftPatchSchema.parse(await request.json());
    const { reviewId } = await context.params;
    return Response.json(await reviewService.saveDraft({
      actorId: actor.id,
      reviewId,
      lockVersion: input.lockVersion,
      answers: input.answers,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}

import { z } from "zod";

import { requireOwnReviewAccess } from "../../../../../../lib/auth/require-own-review";
import { errorResponse } from "../../../../../../lib/http/error-response";
import { reviewService } from "../../../../../../lib/reviews/review-service";

const SubmitSchema = z.object({ lockVersion: z.number().int().nonnegative() });

export async function POST(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
): Promise<Response> {
  try {
    const actor = await requireOwnReviewAccess();
    const input = SubmitSchema.parse(await request.json());
    const { reviewId } = await context.params;
    return Response.json(await reviewService.submitReview({
      actorId: actor.id,
      reviewId,
      lockVersion: input.lockVersion,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}

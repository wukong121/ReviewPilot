import { requireOwnReviewAccess } from "../../../../../lib/auth/require-own-review";
import { errorResponse } from "../../../../../lib/http/error-response";
import { getMyReview } from "../../../../../lib/reviews/review-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ reviewId: string }> },
): Promise<Response> {
  try {
    const actor = await requireOwnReviewAccess();
    const { reviewId } = await context.params;
    return Response.json(await getMyReview(actor.id, reviewId));
  } catch (error) {
    return errorResponse(error);
  }
}

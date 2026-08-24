import { requireOwnReviewAccess } from "../../../../lib/auth/require-own-review";
import { errorResponse } from "../../../../lib/http/error-response";
import { listMyReviews } from "../../../../lib/reviews/review-service";

export async function GET(): Promise<Response> {
  try {
    const actor = await requireOwnReviewAccess();
    return Response.json(await listMyReviews(actor.id));
  } catch (error) {
    return errorResponse(error);
  }
}

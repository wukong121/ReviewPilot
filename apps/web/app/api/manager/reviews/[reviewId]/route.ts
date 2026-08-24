import { requirePermission } from "../../../../../lib/auth/require-permission";
import { errorResponse } from "../../../../../lib/http/error-response";
import { getManagerReview } from "../../../../../lib/manager/reviews";

export async function GET(
  _request: Request,
  context: { params: Promise<{ reviewId: string }> },
): Promise<Response> {
  try {
    const actor = await requirePermission("review:read");
    const { reviewId } = await context.params;
    return Response.json(await getManagerReview(reviewId, actor.id));
  } catch (error) {
    return errorResponse(error);
  }
}

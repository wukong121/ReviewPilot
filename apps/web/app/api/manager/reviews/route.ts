import { z } from "zod";

import { requirePermission } from "../../../../lib/auth/require-permission";
import { errorResponse } from "../../../../lib/http/error-response";
import { listManagerReviews } from "../../../../lib/manager/reviews";

const FiltersSchema = z.object({
  cycleId: z.string().uuid().optional(),
  status: z.string().optional(),
  employeeId: z.string().uuid().optional(),
  approverManagerId: z.string().uuid().optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    await requirePermission("review:read");
    const url = new URL(request.url);
    const filters = FiltersSchema.parse(Object.fromEntries(url.searchParams));
    return Response.json(await listManagerReviews(filters));
  } catch (error) {
    return errorResponse(error);
  }
}

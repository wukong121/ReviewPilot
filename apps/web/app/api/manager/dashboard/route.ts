import { z } from "zod";

import { analyticsService } from "../../../../lib/analytics/analytics-service";
import { requirePermission } from "../../../../lib/auth/require-permission";
import { errorResponse } from "../../../../lib/http/error-response";

const FiltersSchema = z.object({
  cycleId: z.string().uuid().optional(),
  status: z.string().optional(),
  employeeId: z.string().uuid().optional(),
  approverManagerId: z.string().uuid().optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePermission("analytics:read");
    const filters = FiltersSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await analyticsService.getDashboard(filters, actor));
  } catch (error) {
    return errorResponse(error);
  }
}

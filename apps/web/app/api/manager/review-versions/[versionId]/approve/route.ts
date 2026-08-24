import { z } from "zod";

import { approvalService } from "../../../../../../lib/approvals/approval-service";
import { requirePermission } from "../../../../../../lib/auth/require-permission";
import { errorResponse } from "../../../../../../lib/http/error-response";

const DecisionSchema = z.object({
  comment: z.string().trim().min(1).max(10_000),
  lockVersion: z.number().int().nonnegative(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
): Promise<Response> {
  try {
    const actor = await requirePermission("review:read");
    const { versionId } = await context.params;
    const input = DecisionSchema.parse(await request.json());
    return Response.json(await approvalService.approve({ actorId: actor.id, versionId, ...input }));
  } catch (error) {
    return errorResponse(error);
  }
}

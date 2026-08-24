import { publishTemplate } from "../../../../../../lib/admin/admin-service";
import { requirePermission } from "../../../../../../lib/auth/require-permission";
import { errorResponse } from "../../../../../../lib/http/error-response";

export async function POST(_request: Request, context: { params: Promise<{ templateId: string }> }): Promise<Response> {
  try { const actor = await requirePermission("admin:manage-templates"); const { templateId } = await context.params; return Response.json(await publishTemplate(templateId, actor)); } catch (error) { return errorResponse(error); }
}

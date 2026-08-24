import { jobService } from "../../../../../../lib/admin/job-service";
import { requirePermission } from "../../../../../../lib/auth/require-permission";
import { errorResponse } from "../../../../../../lib/http/error-response";
export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> { try { const actor = await requirePermission("admin:retry-jobs"); const { jobId } = await context.params; await jobService.retry(jobId, actor); return Response.json({ status: "QUEUED" }); } catch (error) { return errorResponse(error); } }

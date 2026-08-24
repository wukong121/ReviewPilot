import { listJobs } from "../../../../lib/admin/job-service";
import { requirePermission } from "../../../../lib/auth/require-permission";
import { errorResponse } from "../../../../lib/http/error-response";
export async function GET(): Promise<Response> { try { await requirePermission("admin:retry-jobs"); return Response.json(await listJobs()); } catch (error) { return errorResponse(error); } }

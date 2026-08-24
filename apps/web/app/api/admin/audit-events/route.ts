import { z } from "zod";
import { listAuditEvents } from "../../../../lib/admin/job-service";
import { requirePermission } from "../../../../lib/auth/require-permission";
import { errorResponse } from "../../../../lib/http/error-response";
const FiltersSchema = z.object({ actorId: z.string().uuid().optional(), action: z.string().optional(), entityType: z.string().optional(), cursor: z.string().uuid().optional() });
export async function GET(request: Request): Promise<Response> { try { await requirePermission("admin:read-audit"); const filters = FiltersSchema.parse(Object.fromEntries(new URL(request.url).searchParams)); return Response.json(await listAuditEvents(filters)); } catch (error) { return errorResponse(error); } }

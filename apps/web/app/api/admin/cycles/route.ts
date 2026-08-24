import { z } from "zod";

import { createCycle, listCycles, openCycle, updateCycleSchedule } from "../../../../lib/admin/admin-service";
import { requirePermission } from "../../../../lib/auth/require-permission";
import { errorResponse } from "../../../../lib/http/error-response";

const CreateCycleSchema = z.object({
  name: z.string().trim().min(1), templateVersionId: z.string().uuid(),
  periodStart: z.coerce.date(), periodEnd: z.coerce.date(), opensAt: z.coerce.date(), dueAt: z.coerce.date(),
}).refine((value) => value.periodStart <= value.periodEnd && value.opensAt <= value.dueAt, "invalid cycle dates");
const UpdateCycleSchema = z.discriminatedUnion("action", [
  z.object({ id: z.string().uuid(), action: z.literal("OPEN") }),
  z.object({ id: z.string().uuid(), action: z.literal("UPDATE_SCHEDULE"), opensAt: z.coerce.date(), dueAt: z.coerce.date() })
    .refine((value) => value.opensAt <= value.dueAt, "open time must be before the due time"),
]);

export async function GET(): Promise<Response> { try { await requirePermission("admin:manage-cycles"); return Response.json(await listCycles()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request): Promise<Response> { try { const actor = await requirePermission("admin:manage-cycles"); return Response.json(await createCycle(CreateCycleSchema.parse(await request.json()), actor), { status: 201 }); } catch (error) { return errorResponse(error); } }
export async function PATCH(request: Request): Promise<Response> { try { const actor = await requirePermission("admin:manage-cycles"); const input = UpdateCycleSchema.parse(await request.json()); return Response.json(input.action === "OPEN" ? await openCycle(input.id, actor) : await updateCycleSchedule(input.id, input.opensAt, input.dueAt, actor)); } catch (error) { return errorResponse(error); } }

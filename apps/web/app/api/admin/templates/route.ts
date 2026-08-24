import { z } from "zod";

import { createTemplate, listTemplates, saveTemplateDraft } from "../../../../lib/admin/admin-service";
import { requirePermission } from "../../../../lib/auth/require-permission";
import { errorResponse } from "../../../../lib/http/error-response";

const TemplateInputSchema = z.object({ name: z.string().trim().min(1), definition: z.unknown() });
const UpdateTemplateSchema = TemplateInputSchema.extend({ id: z.string().uuid() });
export async function GET(): Promise<Response> { try { await requirePermission("admin:manage-templates"); return Response.json(await listTemplates()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request): Promise<Response> { try { const actor = await requirePermission("admin:manage-templates"); const input = TemplateInputSchema.parse(await request.json()); return Response.json(await createTemplate(input as never, actor), { status: 201 }); } catch (error) { return errorResponse(error); } }
export async function PATCH(request: Request): Promise<Response> { try { const actor = await requirePermission("admin:manage-templates"); const input = UpdateTemplateSchema.parse(await request.json()); return Response.json(await saveTemplateDraft(input.id, input as never, actor)); } catch (error) { return errorResponse(error); } }

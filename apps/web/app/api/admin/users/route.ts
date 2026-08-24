import { z } from "zod";

import { authorizeUser, listUsers } from "../../../../lib/admin/admin-service";
import { requirePermission } from "../../../../lib/auth/require-permission";
import { errorResponse } from "../../../../lib/http/error-response";

const UserSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email(), displayName: z.string().trim().optional(),
  roles: z.array(z.enum(["EMPLOYEE", "MANAGER", "ADMIN"])).min(1), managerId: z.string().uuid().optional(),
  resetEntraBinding: z.boolean().optional(),
});

export async function GET(): Promise<Response> { try { await requirePermission("admin:manage-users"); return Response.json(await listUsers()); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request): Promise<Response> { try { const actor = await requirePermission("admin:manage-users"); const input = UserSchema.parse(await request.json()); return Response.json(await authorizeUser(input, actor), { status: input.id ? 200 : 201 }); } catch (error) { return errorResponse(error); } }

import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { UserManager } from "../../../../components/admin/user-manager";
import { listUsers } from "../../../../lib/admin/admin-service";
export default async function AdminUsersPage() { const session = await auth(); if (!session?.user.roles.includes("ADMIN")) redirect("/unauthorized"); const users = await listUsers(); return <main className="page-container"><header className="page-header"><div><span className="eyebrow">系统管理</span><h1>用户与角色</h1><p>授权公司账号、分配角色并维护员工的审批经理。</p></div></header><UserManager initialUsers={users.map((user) => ({ id: user.id, entraObjectId: user.entraObjectId, email: user.email, displayName: user.displayName, status: user.status, roles: user.roles.map(({ role }) => role), managerId: user.employeeManagers[0]?.manager.id, managerName: user.employeeManagers[0]?.manager.displayName }))} /></main>; }

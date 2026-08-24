"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserCheck, UserX } from "lucide-react";

type Role = "EMPLOYEE" | "MANAGER" | "ADMIN";
interface UserRow {
  id: string;
  entraObjectId: string | null;
  email: string;
  displayName: string;
  status: string;
  roles: Role[];
  managerId?: string;
  managerName?: string;
}

const ROLE_LABELS: Record<Role, string> = { EMPLOYEE: "员工", MANAGER: "经理", ADMIN: "管理员" };

export function UserManager({ initialUsers, currentUserId }: { initialUsers: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string>();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<Role[]>(["EMPLOYEE"]);
  const [managerId, setManagerId] = useState("");
  const [resetEntraBinding, setResetEntraBinding] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  const managers = initialUsers.filter((user) => user.status === "ACTIVE" && user.roles.includes("MANAGER"));

  function reset() {
    setEditingId(undefined);
    setEmail("");
    setDisplayName("");
    setRoles(["EMPLOYEE"]);
    setManagerId("");
    setResetEntraBinding(false);
  }

  function edit(user: UserRow) {
    setEditingId(user.id);
    setEmail(user.email);
    setDisplayName(user.displayName);
    setRoles(user.roles);
    setManagerId(user.managerId ?? "");
    setResetEntraBinding(false);
    setMessage(undefined);
  }

  function toggleRole(role: Role) {
    setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editingId, email, displayName, roles, managerId: managerId || undefined, resetEntraBinding }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "保存用户失败");
      setMessage(editingId ? "用户已更新。" : "用户已添加。对方现在可以登录 ReviewPilot。");
      reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存用户失败");
    } finally {
      setPending(false);
    }
  }

  async function changeActiveState(user: UserRow) {
    const activate = user.status !== "ACTIVE";
    if (!activate && !window.confirm(`停用 ${user.displayName}？该用户将立即无法登录，历史评审仍会保留。`)) return;
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: user.id, action: activate ? "ACTIVATE" : "DEACTIVATE" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? (activate ? "恢复用户失败" : "停用用户失败"));
      setMessage(activate ? "用户已恢复。请重新配置需要的审批经理关系。" : "用户已停用，历史数据已保留。");
      if (editingId === user.id) reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "用户状态更新失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className="admin-panel" aria-labelledby="user-form-title">
        <div className="section-heading"><div><h2 id="user-form-title">{editingId ? "更新用户" : "添加用户"}</h2><p>只需填写公司邮箱。用户首次通过 Entra SSO 登录时，系统会自动绑定其 Object ID。</p></div></div>
        <form className="admin-form" onSubmit={(event) => void submit(event)}>
          <label>姓名（可选）<input type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label>邮箱<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <fieldset><legend>角色</legend><div className="role-options">{(["EMPLOYEE", "MANAGER", "ADMIN"] as Role[]).map((role) => <label className="check-row" key={role}><input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />{ROLE_LABELS[role]}</label>)}</div></fieldset>
          <label>审批经理<select value={managerId} onChange={(event) => setManagerId(event.target.value)}><option value="">暂不指定</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.displayName}</option>)}</select></label>
          {editingId && initialUsers.find((user) => user.id === editingId)?.entraObjectId && <label className="check-row"><input type="checkbox" checked={resetEntraBinding} onChange={(event) => setResetEntraBinding(event.target.checked)} />重置 SSO 绑定，由该邮箱下次登录时重新绑定</label>}
          <div className="button-row">{editingId && <button className="secondary-button" type="button" onClick={reset}>取消</button>}<button className="primary-button" disabled={pending || roles.length === 0} type="submit">{pending ? "保存中..." : "保存用户"}</button></div>
        </form>
        {message && <p className={message.includes("失败") || message.includes("not") || message.includes("must") || message.includes("already") || message.includes("cannot") ? "error-message" : "notice"}>{message}</p>}
      </section>
      <div className="table-wrap"><table><thead><tr><th>用户</th><th>邮箱</th><th>SSO</th><th>角色</th><th>审批经理</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{initialUsers.map((user) => <tr key={user.id}><td>{user.displayName}</td><td>{user.email}</td><td>{user.entraObjectId ? "已绑定" : "待首次登录"}</td><td>{user.roles.map((role) => ROLE_LABELS[role]).join(" / ")}</td><td>{user.managerName ?? "--"}</td><td>{user.status}</td><td><div className="inline-actions"><button className="secondary-button compact-button" type="button" onClick={() => edit(user)}>编辑</button><button className={user.status === "ACTIVE" ? "secondary-button compact-button danger" : "secondary-button compact-button"} disabled={pending || user.id === currentUserId} type="button" title={user.id === currentUserId ? "不能停用当前账号" : user.status === "ACTIVE" ? "停用用户" : "恢复用户"} onClick={() => void changeActiveState(user)}>{user.status === "ACTIVE" ? <UserX size={15} aria-hidden /> : <UserCheck size={15} aria-hidden />}{user.status === "ACTIVE" ? "停用" : "恢复"}</button></div></td></tr>)}</tbody></table></div>
    </>
  );
}
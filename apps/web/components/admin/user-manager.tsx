"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

export function UserManager({ initialUsers }: { initialUsers: UserRow[] }) {
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
        {message && <p className={message.includes("失败") || message.includes("not") || message.includes("must") || message.includes("already") ? "error-message" : "notice"}>{message}</p>}
      </section>
      <div className="table-wrap"><table><thead><tr><th>用户</th><th>邮箱</th><th>SSO</th><th>角色</th><th>审批经理</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{initialUsers.map((user) => <tr key={user.id}><td>{user.displayName}</td><td>{user.email}</td><td>{user.entraObjectId ? "已绑定" : "待首次登录"}</td><td>{user.roles.map((role) => ROLE_LABELS[role]).join(" / ")}</td><td>{user.managerName ?? "--"}</td><td>{user.status}</td><td><button className="secondary-button compact-button" type="button" onClick={() => edit(user)}>编辑</button></td></tr>)}</tbody></table></div>
    </>
  );
}
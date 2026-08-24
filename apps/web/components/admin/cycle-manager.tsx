"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface TemplateOption { id: string; label: string }
interface CycleRow { id: string; name: string; template: string; period: string; opensAt: string; dueAt: string; status: string; reviewCount: number }

function dateTimeInput(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CycleManager({ cycles, templates }: { cycles: CycleRow[]; templates: TemplateOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [templateVersionId, setTemplateVersionId] = useState(templates[0]?.id ?? "");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, setPending] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [editingCycleId, setEditingCycleId] = useState<string>();
  const [editingOpensAt, setEditingOpensAt] = useState("");
  const [editingDueAt, setEditingDueAt] = useState("");

  async function request(method: "POST" | "PATCH", body: object, key: string) {
    setPending(key);
    setMessage(undefined);
    try {
      const response = await fetch("/api/admin/cycles", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string; reviewCount?: number; skippedWithoutManager?: number };
      if (!response.ok) throw new Error(result.error ?? "周期操作失败");
      setMessage(method === "POST" ? "评审周期已创建，请确认员工经理关系后开启。" : "周期操作已完成。");
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "周期操作失败");
      return false;
    } finally {
      setPending(undefined);
    }
  }

  async function open(id: string) {
    setPending(id);
    setMessage(undefined);
    try {
      const response = await fetch("/api/admin/cycles", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "OPEN" }) });
      const result = await response.json() as { error?: string; reviewCount?: number; skippedWithoutManager?: number };
      if (!response.ok) throw new Error(result.error ?? "开启周期失败");
      setMessage(`周期已开启，已生成 ${result.reviewCount ?? 0} 份员工自评；${result.skippedWithoutManager ?? 0} 位未配置经理的员工已跳过。`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "开启周期失败");
    } finally {
      setPending(undefined);
    }
  }

  function editSchedule(cycle: CycleRow) {
    setEditingCycleId(cycle.id);
    setEditingOpensAt(dateTimeInput(cycle.opensAt));
    setEditingDueAt(dateTimeInput(cycle.dueAt));
    setMessage(undefined);
  }

  async function saveSchedule(event: React.FormEvent) {
    event.preventDefault();
    if (!editingCycleId) return;
    const saved = await request("PATCH", { id: editingCycleId, action: "UPDATE_SCHEDULE", opensAt: editingOpensAt, dueAt: editingDueAt }, `schedule-${editingCycleId}`);
    if (saved) setEditingCycleId(undefined);
  }

  return (
    <>
      <section className="admin-panel" aria-labelledby="cycle-form-title">
        <div className="section-heading"><div><h2 id="cycle-form-title">创建评审周期</h2><p>开启周期时会为每位 ACTIVE EMPLOYEE 创建自评，并锁定其当前审批经理。</p></div></div>
        {templates.length === 0 ? <p className="notice">请先在“评审模板”中发布一个模板。</p> : <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void request("POST", { name, templateVersionId, periodStart, periodEnd, opensAt, dueAt }, "create"); }}>
          <label>周期名称<input type="text" required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>已发布模板<select required value={templateVersionId} onChange={(event) => setTemplateVersionId(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>
          <label>评审开始日期<input type="date" required value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
          <label>评审结束日期<input type="date" required value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
          <label>开放时间<input type="datetime-local" required value={opensAt} onChange={(event) => setOpensAt(event.target.value)} /></label>
          <label>截止时间<input type="datetime-local" required value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
          <div className="button-row"><button className="primary-button" disabled={pending !== undefined} type="submit">{pending === "create" ? "创建中..." : "创建周期"}</button></div>
        </form>}
        {message && <p className={message.includes("失败") || message.includes("requires") || message.includes("no active manager") ? "error-message" : "notice"}>{message}</p>}
      </section>
      {editingCycleId && <section className="admin-panel" aria-labelledby="schedule-title"><div className="section-heading"><div><h2 id="schedule-title">修改开放与截止时间</h2><p>开放中的周期可以延长或调整截止时间；关闭或归档后不可修改。</p></div></div><form className="admin-form" onSubmit={(event) => void saveSchedule(event)}><label>开放时间<input type="datetime-local" required value={editingOpensAt} onChange={(event) => setEditingOpensAt(event.target.value)} /></label><label>截止时间<input type="datetime-local" required value={editingDueAt} onChange={(event) => setEditingDueAt(event.target.value)} /></label><div className="button-row"><button className="secondary-button" type="button" onClick={() => setEditingCycleId(undefined)}>取消</button><button className="primary-button" disabled={pending !== undefined} type="submit">保存时间</button></div></form></section>}
      <div className="table-wrap"><table><thead><tr><th>周期</th><th>模板</th><th>日期</th><th>开放 / 截止</th><th>状态</th><th>参与人数</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{cycles.map((cycle) => <tr key={cycle.id}><td>{cycle.name}</td><td>{cycle.template}</td><td>{cycle.period}</td><td>{new Date(cycle.opensAt).toLocaleString("zh-CN")}<br />{new Date(cycle.dueAt).toLocaleString("zh-CN")}</td><td><span className="status-badge">{cycle.status}</span></td><td>{cycle.reviewCount}</td><td><div className="inline-actions">{cycle.status !== "CLOSED" && cycle.status !== "ARCHIVED" && <button className="secondary-button compact-button" disabled={pending !== undefined} type="button" onClick={() => editSchedule(cycle)}>修改时间</button>}{cycle.status !== "OPEN" && cycle.status !== "ARCHIVED" && <button className="primary-button compact-button" disabled={pending !== undefined} type="button" onClick={() => void open(cycle.id)}>开启周期</button>}</div></td></tr>)}</tbody></table></div>
    </>
  );
}
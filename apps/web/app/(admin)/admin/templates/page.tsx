import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { listTemplates } from "../../../../lib/admin/admin-service";
export default async function AdminTemplatesPage() { const session = await auth(); if (!session?.user.roles.includes("ADMIN")) redirect("/unauthorized"); const templates = await listTemplates(); return <main className="page-container"><header className="page-header"><div><span className="eyebrow">系统管理</span><h1>评审模板</h1></div></header>{templates.map((template) => <article className="review-card" key={template.id}><div><span className="status-badge">{template.status}</span><h2>{template.name}</h2><p>{template.versions.length} 个版本</p></div><span>最新 v{template.versions[0]?.version ?? 0}</span></article>)}</main>; }

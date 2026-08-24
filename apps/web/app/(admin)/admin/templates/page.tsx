import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { TemplateManager } from "../../../../components/admin/template-manager";
import { listTemplates } from "../../../../lib/admin/admin-service";
export default async function AdminTemplatesPage() { const session = await auth(); if (!session?.user.roles.includes("ADMIN")) redirect("/unauthorized"); const templates = await listTemplates(); return <main className="page-container"><header className="page-header"><div><span className="eyebrow">系统管理</span><h1>评审模板</h1><p>查看定义、保存版本草稿并发布供评审周期使用。</p></div></header><TemplateManager initialTemplates={templates.map((template) => ({ id: template.id, name: template.name, status: template.status, versions: template.versions.map((version) => ({ id: version.id, version: version.version, status: version.status, schemaJson: version.schemaJson })) }))} /></main>; }

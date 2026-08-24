"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface TemplateVersionRow { id: string; version: number; status: string; schemaJson: unknown }
interface TemplateRow { id: string; name: string; status: string; versions: TemplateVersionRow[] }

export function TemplateManager({ initialTemplates }: { initialTemplates: TemplateRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialTemplates[0]?.id ?? "");
  const selected = initialTemplates.find((template) => template.id === selectedId);
  const [name, setName] = useState(selected?.name ?? "");
  const [definition, setDefinition] = useState(selected?.versions[0] ? JSON.stringify(selected.versions[0].schemaJson, null, 2) : "{}");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  function choose(id: string) {
    const template = initialTemplates.find((item) => item.id === id);
    setSelectedId(id);
    setName(template?.name ?? "");
    setDefinition(template?.versions[0] ? JSON.stringify(template.versions[0].schemaJson, null, 2) : "{}");
    setMessage(undefined);
  }

  function createNew() {
    setSelectedId("");
    setName("");
    setDefinition("{\n  \"id\": \"template.new-v1\",\n  \"name\": \"新评审模板\",\n  \"version\": 1\n}");
    setMessage(undefined);
  }

  async function save() {
    setPending(true);
    setMessage(undefined);
    try {
      const parsed = JSON.parse(definition) as unknown;
      const response = await fetch("/api/admin/templates", {
        method: selectedId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selectedId || undefined, name, definition: parsed }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "保存模板失败");
      setMessage("草稿已保存。已发布模板会自动生成新的草稿版本。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "模板定义不是有效 JSON。" : error instanceof Error ? error.message : "保存模板失败");
    } finally {
      setPending(false);
    }
  }

  async function publish() {
    if (!selectedId) return;
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/admin/templates/${selectedId}/publish`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "发布模板失败");
      setMessage("模板已发布，可以用于创建评审周期。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布模板失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-split">
      <nav className="admin-list" aria-label="模板列表"><button className="secondary-button" type="button" onClick={createNew}>新建模板</button>{initialTemplates.map((template) => <button className={template.id === selectedId ? "selected" : ""} key={template.id} type="button" onClick={() => choose(template.id)}><strong>{template.name}</strong><span>{template.status} · 最新 v{template.versions[0]?.version ?? 0}</span></button>)}</nav>
      <section className="admin-panel template-editor" aria-labelledby="template-editor-title">
        <div className="section-heading"><div><h2 id="template-editor-title">{selectedId ? "查看与修改模板" : "新建模板"}</h2><p>定义使用严格 JSON 格式；发布后的版本不会被原地覆盖。</p></div></div>
        <label>模板名称<input type="text" required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>模板定义<textarea className="json-editor" spellCheck={false} value={definition} onChange={(event) => setDefinition(event.target.value)} /></label>
        <div className="button-row"><button className="secondary-button" disabled={pending || !selectedId} type="button" onClick={() => void publish()}>发布草稿</button><button className="primary-button" disabled={pending || !name.trim()} type="button" onClick={() => void save()}>{pending ? "处理中..." : "保存草稿"}</button></div>
        {message && <p className={message.includes("失败") || message.includes("不是") || message.includes("required") ? "error-message" : "notice"}>{message}</p>}
      </section>
    </div>
  );
}
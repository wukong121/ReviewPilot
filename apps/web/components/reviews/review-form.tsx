"use client";

import { useRef, useState } from "react";

import type { ReviewAnswerInput } from "../../lib/reviews/review-service";
import type { TemplateDefinition } from "@employee-review/domain";

interface ReviewFormProps {
  reviewId: string;
  initialLockVersion: number;
  editable: boolean;
  template: TemplateDefinition;
  initialAnswers: Record<string, ReviewAnswerInput>;
}

export function ReviewForm({
  reviewId,
  initialLockVersion,
  editable,
  template,
  initialAnswers,
}: ReviewFormProps) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const lockVersion = useRef(initialLockVersion);

  function update(id: string, answer: ReviewAnswerInput) {
    setAnswers((current) => ({ ...current, [id]: { ...current[id], ...answer } }));
  }

  async function save(id: string, value = answers[id]): Promise<void> {
    if (!editable) return;
    setSaveState("saving");
    const response = await fetch(`/api/my/reviews/${reviewId}/draft`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lockVersion: lockVersion.current, answers: { [id]: value } }),
    });
    if (!response.ok) {
      setSaveState("error");
      return;
    }
    const result = await response.json() as { lockVersion: number };
    lockVersion.current = result.lockVersion;
    setSaveState("saved");
  }

  async function submit(): Promise<void> {
    setSubmitError(null);
    const response = await fetch(`/api/my/reviews/${reviewId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lockVersion: lockVersion.current }),
    });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      setSubmitError(result.error ?? "提交失败，请检查必填项。");
      return;
    }
    window.location.reload();
  }

  const ratingField = (id: string, label: string) => (
    <div className="question" key={id} id={id}>
      <label htmlFor={`${id}-rating`}>{label}</label>
      <select
        id={`${id}-rating`}
        value={answers[id]?.numericValue ?? ""}
        disabled={!editable}
        onChange={(event) => update(id, { numericValue: Number(event.target.value) })}
        onBlur={() => void save(id)}
        required
      >
        <option value="">请选择</option>
        {Object.entries(template.ratingScale.labels).map(([value, text]) => (
          <option value={value} key={value}>{value} - {text}</option>
        ))}
      </select>
      <label htmlFor={`${id}-evidence`} className="secondary-label">具体事例或数据（选填）</label>
      <textarea
        id={`${id}-evidence`}
        value={answers[id]?.textValue ?? ""}
        disabled={!editable}
        maxLength={10_000}
        onChange={(event) => update(id, { textValue: event.target.value })}
        onBlur={() => void save(id)}
      />
    </div>
  );

  const textField = (id: string, label: string) => (
    <div className="question" key={id} id={id}>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={answers[id]?.textValue ?? ""}
        disabled={!editable}
        required
        maxLength={10_000}
        onChange={(event) => update(id, { textValue: event.target.value })}
        onBlur={() => void save(id)}
      />
      <span className="character-count">{answers[id]?.textValue?.length ?? 0} / 10000</span>
    </div>
  );

  return (
    <div className="review-layout">
      <nav aria-label="自评章节" className="section-nav">
        {template.dimensions.map((dimension) => <a key={dimension.id} href={`#${dimension.id}`}>{dimension.name}</a>)}
        <a href="#capabilities">关键能力</a>
        <a href="#behaviors">行为自查</a>
        <a href="#open-questions">开放问题</a>
        <a href="#preparation">谈话准备</a>
      </nav>
      <div className="review-sections">
        <div className="save-status" role={saveState === "error" ? "alert" : "status"}>
          {saveState === "saving" && "正在保存..."}
          {saveState === "saved" && "已保存"}
          {saveState === "error" && "保存失败，请重试"}
        </div>
        {template.dimensions.map((dimension) => (
          <section id={dimension.id} key={dimension.id}>
            <div className="section-heading">
              <div><span className="eyebrow">权重 {dimension.weight * 100}%</span><h2>{dimension.name}</h2></div>
              <span>{dimension.questions.length} 个评分项</span>
            </div>
            {dimension.questions.map((question) => ratingField(question.id, question.label))}
            {textField(dimension.bestThingQuestion.id, dimension.bestThingQuestion.label)}
            {textField(dimension.improvementQuestion.id, dimension.improvementQuestion.label)}
          </section>
        ))}
        <section id="capabilities"><h2>七项关键能力</h2>{template.capabilities.map((field) => ratingField(field.id, field.label))}</section>
        <section id="behaviors"><h2>行为对照自查</h2><p>参考值：勾选 7 项以上为合格 SS 水平，此项不用于自动审批。</p>{template.behaviors.map((field) => (
          <label className="check-row" key={field.id}><input type="checkbox" checked={answers[field.id]?.booleanValue === true} disabled={!editable} onChange={(event) => { const value = { ...answers[field.id], booleanValue: event.target.checked }; update(field.id, value); void save(field.id, value); }} />{field.label}</label>
        ))}</section>
        <section id="open-questions"><h2>开放问题</h2>{template.openQuestions.map((field) => textField(field.id, field.label))}</section>
        <section id="preparation"><h2>谈话前准备</h2>{template.preparationChecks.map((field) => (
          <label className="check-row" key={field.id}><input type="checkbox" checked={answers[field.id]?.booleanValue === true} disabled={!editable} onChange={(event) => { const value = { ...answers[field.id], booleanValue: event.target.checked }; update(field.id, value); void save(field.id, value); }} />{field.label}</label>
        ))}</section>
        {submitError && <p role="alert" className="error-message">{submitError}</p>}
        {editable && <button type="button" className="primary-button" onClick={() => void submit()}>提交自评</button>}
      </div>
    </div>
  );
}

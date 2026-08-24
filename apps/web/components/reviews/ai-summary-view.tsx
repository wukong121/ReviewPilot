import type { AiSummary } from "@employee-review/domain";

import { aiSummaryPresentation } from "../../lib/reviews/review-presenters";

function TextList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="muted-text">无</p>;
  return <ul className="summary-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export function AiSummaryView({ summary }: { summary: AiSummary }) {
  const content = aiSummaryPresentation(summary);
  return (
    <div className="ai-summary" aria-label="AI 辅助总结">
      <section><h3>总体总结</h3><p>{content.overall}</p></section>
      <div className="summary-columns">
        <section><h3>优势</h3>{content.strengths.length === 0 ? <p className="muted-text">无</p> : content.strengths.map((item) => <article key={item.title}><strong>{item.title}</strong><p>{item.text}</p></article>)}</section>
        <section><h3>改进建议</h3>{content.improvements.length === 0 ? <p className="muted-text">无</p> : content.improvements.map((item) => <article key={item.title}><strong>{item.title}</strong><p>{item.text}</p></article>)}</section>
      </div>
      <section><h3>维度结论</h3><div className="dimension-summary-grid">{content.dimensions.map((item) => <article key={item.label}><strong>{item.label}</strong><p>{item.conclusion}</p></article>)}</div></section>
      <div className="summary-columns">
        <section><h3>经理讨论议题</h3><TextList items={content.discussionTopics} /></section>
        <section><h3>需要的支持</h3><TextList items={content.supportNeeds} /></section>
      </div>
      {content.caveats.length > 0 && <section className="summary-caveats"><h3>注意事项</h3><TextList items={content.caveats} /></section>}
      <p className="summary-disclaimer">AI 总结仅供辅助，最终判断由经理完成。</p>
    </div>
  );
}
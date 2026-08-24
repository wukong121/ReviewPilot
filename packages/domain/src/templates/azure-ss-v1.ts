import { TemplateDefinitionSchema } from "./template-schema";

const requiredReflection = (id: string, label: string) => ({ id, label, required: true as const, maxLength: 10_000 });
const rating = (id: string, label: string) => ({ id, label, required: true as const, evidenceOptional: true });

export const azureSsTemplateV1 = TemplateDefinitionSchema.parse({
  id: "template.azure-ss-v1",
  name: "Azure SS 自评 Checklist",
  version: 1,
  ratingScale: {
    min: 1,
    max: 5,
    labels: { "1": "远低于预期", "2": "低于预期", "3": "符合预期", "4": "超出预期", "5": "卓越" },
  },
  dimensions: [
    {
      id: "performance",
      name: "业绩与管线管理",
      weight: 0.4,
      questions: [
        rating("performance.acr-target", "本季度 ACR 完成率达到或超过目标。"),
        rating("performance.pipeline-coverage", "当前 Pipeline Coverage >= 3x 季度目标。"),
        rating("performance.msx-freshness", "MSX 中所有 pipeline/milestone、Rev size、due date 在过去 30 天内更新。"),
        rating("performance.forecast-accuracy", "季度 Forecast 误差控制在 +/-10% 以内。"),
        rating("performance.stuck-deals", "主动跟进和处理 stuck/slipped deals。"),
      ],
      bestThingQuestion: requiredReflection("performance.best-thing", "在业绩与管线管理方面做得最好的一件事"),
      improvementQuestion: requiredReflection("performance.improvement", "在业绩与管线管理方面最需要改进的一件事"),
    },
    {
      id: "customer",
      name: "客户高层关系与解决方案构建",
      weight: 0.3,
      questions: [
        rating("customer.c-level-relations", "每个 Top Account 已建立至少 2 位 C-level 关系（CTO/CIO 必备）。"),
        rating("customer.workshop", "过去 90 天内主导过至少 1 次客户 Envisioning Workshop 或 EBC。"),
        rating("customer.solution-brief", "能独立输出 Solution Brief（痛点 -> 架构 -> ROI -> 路径）。"),
        rating("customer.account-plan", "有清晰的 6-18 个月 Account Plan，并作为实际推进依据。"),
        rating("customer.business-language", "在客户面前能用业务语言（ROI/TCO）讲 Azure 价值，而非堆技术名词。"),
      ],
      bestThingQuestion: requiredReflection("customer.best-thing", "在客户关系与方案构建方面做得最好的一件事"),
      improvementQuestion: requiredReflection("customer.improvement", "在客户关系与方案构建方面最需要改进的一件事"),
    },
    {
      id: "collaboration",
      name: "跨团队协同与资源调度",
      weight: 0.2,
      questions: [
        rating("collaboration.deal-captain", "在所负责的 pipeline 中，我是 Deal Captain。"),
        rating("collaboration.orchestrate", "主动调动 SE/CSA/GBB/Partner，而非等待 Manager 分配。"),
        rating("collaboration.ae-rhythm", "与 AE 有明确分工和定期同步节奏。"),
        rating("collaboration.share-insights", "在 Team Sync/QBR 中主动分享打法或客户洞察。"),
        rating("collaboration.cross-solution", "在 Azure 机会中识别并引入 Security/MW 同事的跨产品机会。"),
      ],
      bestThingQuestion: requiredReflection("collaboration.best-thing", "在跨团队协同方面做得最好的一件事"),
      improvementQuestion: requiredReflection("collaboration.improvement", "在跨团队协同方面最需要改进的一件事"),
    },
    {
      id: "technical",
      name: "技术专精与持续学习",
      weight: 0.1,
      questions: [
        rating("technical.certifications", "当前持有 AZ-900 + AZ-305（或同等）认证。"),
        rating("technical.architecture", "能独立画 Azure 架构草图并回应 80% 客户技术追问。"),
        rating("technical.scenarios", "熟悉 Azure 四大主推场景（AI/Data/Migration/Modernization）。"),
        rating("technical.competition", "能说清 Azure 与 AWS/GCP/Ali Cloud 在关键场景下的差异。"),
        rating("technical.learning", "过去 90 天完成至少 1 个 Learning Path 或 Azure 新功能学习。"),
      ],
      bestThingQuestion: requiredReflection("technical.best-thing", "在技术专精与学习方面做得最好的一件事"),
      improvementQuestion: requiredReflection("technical.improvement", "在技术专精与学习方面最需要改进的一件事"),
    },
  ],
  capabilities: [
    rating("capability.solution-selling", "Solution Selling（方案销售）"),
    rating("capability.executive-presence", "Executive Presence（高层对话）"),
    rating("capability.orchestration", "Orchestration（资源调度）"),
    rating("capability.business-acumen", "Business Acumen（商业敏感度）"),
    rating("capability.technical-depth", "Technical Depth（技术深度）"),
    rating("capability.sales-discipline", "Sales Discipline（销售纪律）"),
    rating("capability.growth-mindset", "Growth Mindset（成长心态）"),
  ],
  behaviors: [
    { id: "behavior.v-team", label: "在 key pipeline/project 中主动召集 v-team。" },
    { id: "behavior.handle-objections", label: "能用架构和数据当场回应客户技术质疑。" },
    { id: "behavior.weekly-msx", label: "每周主动更新 MSX，不等到月末。" },
    { id: "behavior.competitor-early", label: "能在客户决策前提前介入竞争对手出现的场景。" },
    { id: "behavior.team-sharing", label: "主动在 Team Weekly Sharing 分享打法或客户洞察。" },
    { id: "behavior.peer-review", label: "帮同事 review 机会或方案。" },
    { id: "behavior.cross-product", label: "能识别 Azure 单子中的跨产品机会并引入对应 SS。" },
    { id: "behavior.new-capability", label: "过去一年有新增认证或新增能力。" },
    { id: "behavior.strategy-adjustment", label: "能在季度复盘中主动提出明年策略调整，而非由 Manager push。" },
  ],
  openQuestions: [
    requiredReflection("open.achievement", "过去 90 天最有成就感的一件事是什么，为什么？"),
    requiredReflection("open.redo-decision", "过去 90 天最想推倒重来的一个决定或动作是什么？"),
    requiredReflection("open.differentiator", "作为 Azure SS，最大的差异化优势是什么？"),
    requiredReflection("open.biggest-bottleneck", "目前最大的瓶颈是什么，需要经理或团队提供什么支持？"),
    requiredReflection("open.twelve-month-goal", "未来 12 个月希望在 Azure SS 角色上达到什么程度，或是否考虑其他方向？"),
    requiredReflection("open.account-choice", "如果重新选择负责的客户/行业，会怎么选？"),
  ],
  preparationChecks: [
    { id: "preparation.self-review", label: "完成以上自评。" },
    { id: "preparation.customer-cases", label: "准备 2-3 个最近的客户案例（成功和受挫案例）。" },
    { id: "preparation.manager-blocker", label: "想清楚 1 件希望 Manager 帮助移除的障碍。" },
    { id: "preparation.ninety-day-change", label: "想清楚 1 件未来 90 天可以承诺改变的事。" },
  ],
});

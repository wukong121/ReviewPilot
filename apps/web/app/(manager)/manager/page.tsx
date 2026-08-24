import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "../../../auth";
import { DashboardCharts } from "../../../components/dashboard/dashboard-charts";
import { analyticsService } from "../../../lib/analytics/analytics-service";

export default async function ManagerDashboardPage() {
  const session = await auth();
  if (!session?.user.roles.some((role) => role === "MANAGER" || role === "ADMIN")) redirect("/unauthorized");
  const dashboard = await analyticsService.getDashboard({}, { id: session.user.userId, roles: session.user.roles });
  const kpis = [
    ["参与员工", dashboard.kpis.participantCount],
    ["已提交", dashboard.kpis.submittedCount],
    ["待审批", dashboard.kpis.pendingReviewCount],
    ["已通过", dashboard.kpis.approvedCount],
    ["被驳回", dashboard.kpis.rejectedCount],
  ];

  return (
    <main className="page-container">
      <header className="page-header"><div><span className="eyebrow">团队洞察</span><h1>绩效看板</h1><p>团队加权平均分 {dashboard.teamWeightedAverage?.toFixed(1) ?? "--"}</p></div><Link className="primary-link" href="/manager/reviews">全部自评</Link></header>
      <section className="kpi-grid" aria-label="团队关键指标">{kpis.map(([label, value]) => <article className="kpi" key={label}><strong>{value}</strong><span>{label}</span></article>)}</section>
      <section><h2>员工 × 四大维度</h2><p>仅包含已经提交并计算分数的版本。</p><div className="table-wrap"><table><thead><tr><th>员工</th><th>业绩</th><th>客户</th><th>协同</th><th>技术</th></tr></thead><tbody>{dashboard.heatmap.map((row) => <tr key={row.reviewId}><td><Link href={`/manager/reviews/${row.reviewId}`}>{row.employeeName}</Link></td><td>{row.dimensions.performance.toFixed(1)}</td><td>{row.dimensions.customer.toFixed(1)}</td><td>{row.dimensions.collaboration.toFixed(1)}</td><td>{row.dimensions.technical.toFixed(1)}</td></tr>)}</tbody></table></div></section>
      <DashboardCharts distribution={dashboard.distribution} capabilityAverages={dashboard.capabilityAverages} cycleTrends={dashboard.cycleTrends} />
      <section><h2>员工状态明细</h2><div className="table-wrap"><table><thead><tr><th>员工</th><th>周期</th><th>状态</th><th>加权分</th></tr></thead><tbody>{dashboard.statusTable.map((row) => <tr key={row.reviewId}><td><Link href={`/manager/reviews/${row.reviewId}`}>{row.employeeName}</Link></td><td>{row.cycleName}</td><td><span className="status-badge">{row.status}</span></td><td>{row.weightedScore?.toFixed(1) ?? "--"}</td></tr>)}</tbody></table></div></section>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "../../../../auth";
import { listManagerReviews } from "../../../../lib/manager/reviews";

export default async function ManagerReviewsPage() {
  const session = await auth();
  if (!session?.user.roles.some((role) => role === "MANAGER" || role === "ADMIN")) redirect("/unauthorized");
  const reviews = await listManagerReviews();
  return (
    <main className="page-container">
      <header className="page-header"><div><span className="eyebrow">经理工作台</span><h1>员工自评</h1></div><span>{reviews.length} 条记录</span></header>
      <div className="table-wrap"><table><thead><tr><th>员工</th><th>周期</th><th>状态</th><th>审批经理</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{reviews.map((review) => (
        <tr key={review.id}><td><strong>{review.employee.displayName}</strong><br /><span>{review.employee.email}</span></td><td>{review.cycle.name}</td><td><span className="status-badge">{review.currentVersion?.status ?? "未开始"}</span></td><td>{review.approverManager.displayName}</td><td><Link href={`/manager/reviews/${review.id}`}>查看</Link></td></tr>
      ))}</tbody></table></div>
    </main>
  );
}

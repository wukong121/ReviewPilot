import { ArrowRight, BarChart3, ClipboardCheck, Settings2 } from "lucide-react";
import Link from "next/link";

import { auth, signIn } from "../auth";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <main className="login-page" id="main-content">
        <div className="login-mark">RP</div>
        <h1>ReviewPilot</h1>
        <p>使用公司 Microsoft Entra ID 登录员工自评与经理审批系统。</p>
        <form action={async () => { "use server"; await signIn("microsoft-entra-id", { redirectTo: "/" }); }}>
          <button className="primary-button login-button" type="submit">使用公司账号登录 <ArrowRight size={18} aria-hidden /></button>
        </form>
      </main>
    );
  }

  const destinations = [
    session.user.roles.includes("EMPLOYEE") && { href: "/my-reviews", title: "我的自评", description: "填写当前周期、查看 AI 总结和经理结果", icon: ClipboardCheck },
    session.user.roles.includes("MANAGER") && { href: "/manager", title: "团队看板", description: "比较团队表现、处理待审批自评", icon: BarChart3 },
    session.user.roles.includes("ADMIN") && { href: "/admin/users", title: "系统管理", description: "维护用户、模板、周期和后台任务", icon: Settings2 },
  ].filter((item): item is Exclude<typeof item, false> => Boolean(item));

  return (
    <main className="page-container" id="main-content">
      <header className="welcome-header"><span className="eyebrow">工作台</span><h1>{session.user.name ?? "你好"}</h1><p>选择当前要处理的工作区域。</p></header>
      <div className="destination-grid">{destinations.map(({ href, title, description, icon: Icon }) => (
        <Link className="destination" href={href} key={href}><Icon size={24} aria-hidden /><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={19} aria-hidden /></Link>
      ))}</div>
    </main>
  );
}

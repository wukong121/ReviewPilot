import { Activity, BarChart3, ClipboardCheck, FileStack, House, ListChecks, LogOut, Settings2, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { auth, signOut } from "../auth";

export async function AppShell({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) return <>{children}</>;

  const links = [
    { href: "/", label: "首页", icon: House, show: true },
    { href: "/my-reviews", label: "我的自评", icon: ClipboardCheck, show: session.user.roles.includes("EMPLOYEE") },
    { href: "/manager", label: "团队看板", icon: BarChart3, show: session.user.roles.includes("MANAGER") || session.user.roles.includes("ADMIN") },
    { href: "/manager/reviews", label: "全部员工", icon: Users, show: session.user.roles.includes("MANAGER") || session.user.roles.includes("ADMIN") },
    { href: "/admin/users", label: "用户管理", icon: Settings2, show: session.user.roles.includes("ADMIN") },
    { href: "/admin/templates", label: "模板", icon: FileStack, show: session.user.roles.includes("ADMIN") },
    { href: "/admin/cycles", label: "评审周期", icon: ListChecks, show: session.user.roles.includes("ADMIN") },
    { href: "/admin/jobs", label: "后台任务", icon: Activity, show: session.user.roles.includes("ADMIN") },
  ].filter(({ show }) => show);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="app-sidebar">
        <Link href="/" className="brand"><span className="brand-mark">RP</span><span><strong>ReviewPilot</strong><small>员工评审</small></span></Link>
        <nav aria-label="主导航">{links.map(({ href, label, icon: Icon }) => <Link href={href} key={href}><Icon size={18} aria-hidden />{label}</Link>)}</nav>
        <div className="sidebar-user"><div className="avatar" aria-hidden>{(session.user.name ?? session.user.email ?? "U").slice(0, 1).toUpperCase()}</div><span><strong>{session.user.name}</strong><small>{session.user.roles.join(" / ")}</small></span><form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button className="icon-button" type="submit" title="退出登录" aria-label="退出登录"><LogOut size={18} /></button></form></div>
      </aside>
      <header className="mobile-header"><Link href="/" className="brand"><span className="brand-mark">RP</span><strong>ReviewPilot</strong></Link><nav aria-label="移动端主导航">{links.slice(0, 4).map(({ href, label }) => <Link href={href} key={href}>{label}</Link>)}</nav></header>
      <div className="app-content">{children}</div>
    </div>
  );
}

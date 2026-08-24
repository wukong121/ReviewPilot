import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main>
      <h1>无系统访问权限</h1>
      <p>此公司账号尚未被管理员加入 ReviewPilot，请联系系统管理员。</p>
      <Link href="/">返回首页</Link>
    </main>
  );
}

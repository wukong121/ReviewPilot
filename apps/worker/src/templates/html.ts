export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

export function assertHttpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("email links must use HTTPS");
  return escapeHtml(url.toString());
}

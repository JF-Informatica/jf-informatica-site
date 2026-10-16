import { requireAdmin } from "../_lib/auth.js";

export async function onRequest(context) {
  const auth = await requireAdmin(context);

  if (auth.response) {
    return new Response("Acesso não autorizado", {
      status: auth.response.status || 401,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive"
      }
    });
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

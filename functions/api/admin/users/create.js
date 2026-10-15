import { requireAdmin } from "../../../_lib/auth.js";
import { hashPassword } from "../../../_lib/password.js";

function jsonResponse(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function isSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

export async function onRequestPost(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;

    if (!isSameOrigin(context.request)) {
      return jsonResponse({ status: "error", message: "Forbidden origin" }, 403);
    }

    const body = await context.request.json();
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role === "admin" ? "admin" : "user";

    if (!username || !name || !email || !password) return jsonResponse({ status: "error", message: "username, name, email and password are required" }, 400);
    if (!/^[a-z0-9._-]{3,64}$/.test(username)) return jsonResponse({ status: "error", message: "Invalid username" }, 400);
    if (!email.includes("@") || email.length > 254) return jsonResponse({ status: "error", message: "Invalid email" }, 400);
    if (password.length < 12) return jsonResponse({ status: "error", message: "Password must contain at least 12 characters" }, 400);

    const existingUser = await context.env.DB.prepare("SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1").bind(username, email).first();
    if (existingUser) return jsonResponse({ status: "error", message: "Username or email already exists" }, 409);

    const passwordHash = await hashPassword(password);
    const result = await context.env.DB.prepare(`INSERT INTO users (username, password_hash, name, email, active, role) VALUES (?, ?, ?, ?, 1, ?)`).bind(username, passwordHash, name, email, role).run();

    return jsonResponse({ status: "ok", user: { id: result.meta.last_row_id, username, name, email, role, active: true } }, 201);
  } catch {
    return jsonResponse({ status: "error", message: "Unable to create user" }, 500);
  }
}

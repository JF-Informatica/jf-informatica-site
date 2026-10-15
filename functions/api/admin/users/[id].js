import { requireAdmin } from "../../../_lib/auth.js";
import { hashPassword } from "../../../_lib/password.js";

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function validUsername(value) {
  return /^[a-z0-9._-]{3,64}$/.test(value);
}

export async function onRequestPatch(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;

    const id = Number.parseInt(context.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return jsonResponse({ status: "error", message: "Invalid user id" }, 400);
    }

    const current = await context.env.DB
      .prepare(`SELECT id, username, name, email, role, active FROM users WHERE id = ? LIMIT 1`)
      .bind(id)
      .first();

    if (!current) {
      return jsonResponse({ status: "error", message: "User not found" }, 404);
    }

    let body;
    try {
      body = await context.request.json();
    } catch {
      return jsonResponse({ status: "error", message: "Invalid request" }, 400);
    }

    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : current.username;
    const name = typeof body.name === "string" ? body.name.trim() : current.name;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : current.email;
    const role = body.role === undefined ? current.role : body.role;
    const active = body.active === undefined ? current.active : (body.active === true ? 1 : 0);
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !validUsername(username) || !email.includes("@") || email.length > 254) {
      return jsonResponse({ status: "error", message: "Invalid user data" }, 400);
    }

    if (role !== "user" && role !== "admin") {
      return jsonResponse({ status: "error", message: "Invalid role" }, 400);
    }

    if (password && password.length < 12) {
      return jsonResponse({ status: "error", message: "Password must contain at least 12 characters" }, 400);
    }

    if (id === auth.user.id && (active !== 1 || role !== "admin")) {
      return jsonResponse({ status: "error", message: "You cannot block or downgrade your own administrator account" }, 409);
    }

    const duplicate = await context.env.DB
      .prepare(`SELECT id FROM users WHERE id <> ? AND (username = ? OR email = ?) LIMIT 1`)
      .bind(id, username, email)
      .first();

    if (duplicate) {
      return jsonResponse({ status: "error", message: "Username or email already exists" }, 409);
    }

    if (password) {
      const passwordHash = await hashPassword(password);
      await context.env.DB
        .prepare(`UPDATE users SET username = ?, name = ?, email = ?, role = ?, active = ?, password_hash = ? WHERE id = ?`)
        .bind(username, name, email, role, active, passwordHash, id)
        .run();
    } else {
      await context.env.DB
        .prepare(`UPDATE users SET username = ?, name = ?, email = ?, role = ?, active = ? WHERE id = ?`)
        .bind(username, name, email, role, active, id)
        .run();
    }

    if (active !== 1) {
      await context.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
    }

    return jsonResponse({
      status: "ok",
      user: { id, username, name, email, role, active: active === 1 }
    });
  } catch {
    return jsonResponse({ status: "error", message: "Unable to update user" }, 500);
  }
}

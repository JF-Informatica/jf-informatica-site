import { requireAdmin } from "../../_lib/auth.js";

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestGet(context) {
  try {
    const auth = await requireAdmin(context);

    if (auth.response) {
      return auth.response;
    }

    const result = await context.env.DB
      .prepare(
        `SELECT
           id,
           username,
           name,
           email,
           role,
           active,
           created_at
         FROM users
         ORDER BY name COLLATE NOCASE ASC, username ASC`
      )
      .all();

    const users = (result.results || []).map((user) => ({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active === 1,
      created_at: user.created_at
    }));

    return jsonResponse({
      status: "ok",
      count: users.length,
      users
    });
  } catch {
    return jsonResponse(
      {
        status: "error",
        message: "Unable to load users"
      },
      500
    );
  }
}

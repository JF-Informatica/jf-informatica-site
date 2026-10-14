import { hashPassword } from "../_lib/password.js";

function jsonResponse(data, status = 200) {
  return Response.json(data, { status });
}

export async function onRequestPost(context) {
  try {
    const authorization = context.request.headers.get("Authorization");
    const expectedAuthorization = `Bearer ${context.env.ADMIN_API_SECRET}`;

    if (!context.env.ADMIN_API_SECRET || authorization !== expectedAuthorization) {
      return jsonResponse(
        { status: "error", message: "Unauthorized" },
        401
      );
    }

    const body = await context.request.json();

    const username =
      typeof body.username === "string"
        ? body.username.trim().toLowerCase()
        : "";

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!username || !name || !email || !password) {
      return jsonResponse(
        {
          status: "error",
          message: "username, name, email and password are required"
        },
        400
      );
    }

    if (password.length < 12) {
      return jsonResponse(
        {
          status: "error",
          message: "Password must contain at least 12 characters"
        },
        400
      );
    }

    const existingUser = await context.env.DB
      .prepare(
        "SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1"
      )
      .bind(username, email)
      .first();

    if (existingUser) {
      return jsonResponse(
        {
          status: "error",
          message: "Username or email already exists"
        },
        409
      );
    }

    const passwordHash = await hashPassword(password);

    const result = await context.env.DB
      .prepare(
        `INSERT INTO users
          (username, password_hash, name, email, active)
         VALUES (?, ?, ?, ?, 1)`
      )
      .bind(username, passwordHash, name, email)
      .run();

    return jsonResponse(
      {
        status: "ok",
        user: {
          id: result.meta.last_row_id,
          username,
          name,
          email,
          active: true
        }
      },
      201
    );
  } catch (error) {
    return jsonResponse(
      {
        status: "error",
        message: "Unable to create user"
      },
      500
    );
  }
}

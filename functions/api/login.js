import { verifyPassword } from "../_lib/password.js";

const SESSION_HOURS = 8;

function jsonResponse(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers
  });
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return bytesToHex(new Uint8Array(digest));
}

export async function onRequestPost(context) {
  try {
    let body;

    try {
      body = await context.request.json();
    } catch {
      return jsonResponse(
        { status: "error", message: "Invalid request" },
        400
      );
    }

    const username =
      typeof body.username === "string"
        ? body.username.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!username || !password) {
      return jsonResponse(
        { status: "error", message: "Username and password are required" },
        400
      );
    }

    const user = await context.env.DB
      .prepare(
        `SELECT id, username, password_hash, name, email, role, active
         FROM users
         WHERE username = ?
         LIMIT 1`
      )
      .bind(username)
      .first();

    if (!user || user.active !== 1) {
      return jsonResponse(
        { status: "error", message: "Invalid username or password" },
        401
      );
    }

    const passwordValid = await verifyPassword(
      password,
      user.password_hash
    );

    if (!passwordValid) {
      return jsonResponse(
        { status: "error", message: "Invalid username or password" },
        401
      );
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const sessionToken = bytesToBase64Url(tokenBytes);
    const tokenHash = await sha256(sessionToken);

    const expiresAt = new Date(
      Date.now() + SESSION_HOURS * 60 * 60 * 1000
    );

    await context.env.DB
      .prepare(
        `INSERT INTO sessions
          (user_id, token_hash, expires_at)
         VALUES (?, ?, ?)`
      )
      .bind(
        user.id,
        tokenHash,
        expiresAt.toISOString()
      )
      .run();

    const cookie = [
      `jf_session=${sessionToken}`,
      "Path=/",
      `Max-Age=${SESSION_HOURS * 60 * 60}`,
      "HttpOnly",
      "Secure",
      "SameSite=Strict"
    ].join("; ");

    return jsonResponse(
      {
        status: "ok",
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          role: user.role
        }
      },
      200,
      {
        "Set-Cookie": cookie,
        "Cache-Control": "no-store"
      }
    );
  } catch {
    return jsonResponse(
      { status: "error", message: "Unable to login" },
      500,
      {
        "Cache-Control": "no-store"
      }
    );
  }
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const cookieName = part.slice(0, separator).trim();
    const cookieValue = part.slice(separator + 1).trim();

    if (cookieName === name) {
      return cookieValue || null;
    }
  }

  return null;
}

export async function getAuthenticatedUser(context) {
  const sessionToken = getCookie(context.request, "jf_session");

  if (!sessionToken) {
    return null;
  }

  const tokenHash = await sha256(sessionToken);

  const session = await context.env.DB
    .prepare(
      `SELECT
         s.id AS session_id,
         s.expires_at,
         u.id,
         u.username,
         u.name,
         u.email,
         u.role,
         u.active
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
       LIMIT 1`
    )
    .bind(tokenHash)
    .first();

  if (!session) {
    return null;
  }

  const expired =
    new Date(session.expires_at).getTime() <= Date.now();

  if (session.active !== 1 || expired) {
    await context.env.DB
      .prepare("DELETE FROM sessions WHERE id = ?")
      .bind(session.session_id)
      .run();

    return null;
  }

  return {
    id: session.id,
    username: session.username,
    name: session.name,
    email: session.email,
    role: session.role
  };
}

export async function requireAuth(context) {
  const user = await getAuthenticatedUser(context);

  if (!user) {
    return {
      user: null,
      response: Response.json(
        {
          status: "error",
          authenticated: false,
          message: "Unauthorized"
        },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" }
        }
      )
    };
  }

  return { user, response: null };
}

export async function requireAdmin(context) {
  const auth = await requireAuth(context);

  if (auth.response) {
    return auth;
  }

  if (auth.user.role !== "admin") {
    return {
      user: auth.user,
      response: Response.json(
        {
          status: "error",
          message: "Forbidden"
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" }
        }
      )
    };
  }

  return auth;
}

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
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
    const [cookieName, ...cookieValue] = part.trim().split("=");

    if (cookieName === name) {
      return cookieValue.join("=");
    }
  }

  return null;
}

export async function onRequestGet(context) {
  try {
    const sessionToken = getCookie(
      context.request,
      "jf_session"
    );

    if (!sessionToken) {
      return jsonResponse(
        { status: "error", message: "Unauthorized" },
        401
      );
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
           u.active
         FROM sessions s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?
         LIMIT 1`
      )
      .bind(tokenHash)
      .first();

    if (
      !session ||
      session.active !== 1 ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      if (session) {
        await context.env.DB
          .prepare("DELETE FROM sessions WHERE id = ?")
          .bind(session.session_id)
          .run();
      }

      return jsonResponse(
        { status: "error", message: "Unauthorized" },
        401
      );
    }

    return jsonResponse({
      status: "ok",
      authenticated: true,
      user: {
        id: session.id,
        username: session.username,
        name: session.name,
        email: session.email
      }
    });
  } catch {
    return jsonResponse(
      { status: "error", message: "Unable to validate session" },
      500
    );
  }
}

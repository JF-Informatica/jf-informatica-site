function jsonResponse(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers
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

export async function onRequestPost(context) {
  try {
    const sessionToken = getCookie(
      context.request,
      "jf_session"
    );

    let sessionRevoked = false;

    if (sessionToken) {
      const tokenHash = await sha256(sessionToken);

      const result = await context.env.DB
        .prepare(
          "DELETE FROM sessions WHERE token_hash = ?"
        )
        .bind(tokenHash)
        .run();

      sessionRevoked = result.meta.changes > 0;
    }

    const cookie = [
      "jf_session=",
      "Path=/",
      "Max-Age=0",
      "HttpOnly",
      "Secure",
      "SameSite=Strict"
    ].join("; ");

    return jsonResponse(
      {
        status: "ok",
        authenticated: false,
        session_revoked: sessionRevoked
      },
      200,
      {
        "Set-Cookie": cookie
      }
    );
  } catch {
    return jsonResponse(
      {
        status: "error",
        message: "Unable to logout"
      },
      500
    );
  }
}

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
    const [cookieName, ...cookieValue] = part.trim().split("=");

    if (cookieName === name) {
      return cookieValue.join("=");
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

    if (sessionToken) {
      const tokenHash = await sha256(sessionToken);

      await context.env.DB
        .prepare(
          "DELETE FROM sessions WHERE token_hash = ?"
        )
        .bind(tokenHash)
        .run();
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
        authenticated: false
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

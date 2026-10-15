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

  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) continue;

    const cookieName = part.slice(0, separator).trim();
    const cookieValue = part.slice(separator + 1).trim();

    if (cookieName === name) {
      return cookieValue || null;
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
        {
          status: "error",
          authenticated: false,
          message: "Unauthorized"
        },
        401
      );
    }

    const tokenHash = await sha256(sessionToken);

    const session = await context.env.DB
      .prepare(
        `SELECT
           s.id AS session_id,
           s.expires_at,
           u.id AS user_id,
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
          .prepare(
            "DELETE FROM sessions WHERE id = ?"
          )
          .bind(session.session_id)
          .run();
      }

      return jsonResponse(
        {
          status: "error",
          authenticated: false,
          message: "Unauthorized"
        },
        401
      );
    }

    const result = await context.env.DB
      .prepare(
        `SELECT
           id,
           object_key,
           name,
           description,
           category,
           version,
           file_size
         FROM downloads
         WHERE active = 1
         ORDER BY sort_order ASC, name ASC`
      )
      .all();

    const downloads = (result.results || []).map(
      (item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        version: item.version,
        file_size: item.file_size,
        download_url:
          `/api/downloads/${encodeURIComponent(item.object_key)}`
      })
    );

    return jsonResponse({
      status: "ok",
      authenticated: true,
      count: downloads.length,
      downloads
    });
  } catch {
    return jsonResponse(
      {
        status: "error",
        message: "Unable to load downloads"
      },
      500
    );
  }
}

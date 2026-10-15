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
    const [cookieName, ...cookieValue] = part.trim().split("=");

    if (cookieName === name) {
      return cookieValue.join("=");
    }
  }

  return null;
}

export async function onRequestGet(context) {
  try {
    const sessionToken = getCookie(context.request, "jf_session");

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
          .prepare("DELETE FROM sessions WHERE id = ?")
          .bind(session.session_id)
          .run();
      }

      return jsonResponse(
        { status: "error", message: "Unauthorized" },
        401
      );
    }

    const file = context.params.file;

    if (
      typeof file !== "string" ||
      !file ||
      file.includes("/") ||
      file.includes("\\") ||
      file.includes("..")
    ) {
      return jsonResponse(
        { status: "error", message: "Invalid file" },
        400
      );
    }

    const object = await context.env.DOWNLOADS.get(file);

    if (!object) {
      return jsonResponse(
        { status: "error", message: "File not found" },
        404
      );
    }

    const headers = new Headers();

    object.writeHttpMetadata(headers);

    headers.set(
      "Content-Disposition",
      `attachment; filename="${file.replace(/"/g, "")}"`
    );

    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    if (object.httpEtag) {
      headers.set("ETag", object.httpEtag);
    }

    return new Response(object.body, {
      status: 200,
      headers
    });
  } catch {
    return jsonResponse(
      { status: "error", message: "Unable to download file" },
      500
    );
  }
}

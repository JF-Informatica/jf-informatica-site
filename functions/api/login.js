import { verifyPassword } from "../_lib/password.js";

const SESSION_HOURS = 8;
const RATE_WINDOW_MINUTES = 15;
const RATE_MAX_FAILURES = 5;
const RATE_BLOCK_MINUTES = 15;

function jsonResponse(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

function clientAddress(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

async function rateKey(request, username) {
  return sha256(`${clientAddress(request)}\n${username}`);
}

async function getRateState(db, keyHash) {
  return db.prepare(
    `SELECT failures, window_started_at, blocked_until
     FROM login_attempts WHERE key_hash = ? LIMIT 1`
  ).bind(keyHash).first();
}

function isBlocked(state, now) {
  return state?.blocked_until && new Date(state.blocked_until).getTime() > now.getTime();
}

async function recordFailure(db, keyHash, state, now) {
  const windowMs = RATE_WINDOW_MINUTES * 60 * 1000;
  const started = state?.window_started_at ? new Date(state.window_started_at) : null;
  const withinWindow = started && !Number.isNaN(started.getTime()) && now.getTime() - started.getTime() < windowMs;
  const failures = withinWindow ? Number(state.failures || 0) + 1 : 1;
  const windowStartedAt = withinWindow ? started.toISOString() : now.toISOString();
  const blockedUntil = failures >= RATE_MAX_FAILURES
    ? new Date(now.getTime() + RATE_BLOCK_MINUTES * 60 * 1000).toISOString()
    : null;

  await db.prepare(
    `INSERT INTO login_attempts (key_hash, failures, window_started_at, blocked_until, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key_hash) DO UPDATE SET
       failures = excluded.failures,
       window_started_at = excluded.window_started_at,
       blocked_until = excluded.blocked_until,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(keyHash, failures, windowStartedAt, blockedUntil).run();
}

async function clearRateState(db, keyHash) {
  await db.prepare("DELETE FROM login_attempts WHERE key_hash = ?").bind(keyHash).run();
}

export async function onRequestPost(context) {
  try {
    let body;
    try { body = await context.request.json(); }
    catch { return jsonResponse({ status: "error", message: "Invalid request" }, 400); }

    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) return jsonResponse({ status: "error", message: "Username and password are required" }, 400);

    const now = new Date();
    const keyHash = await rateKey(context.request, username);
    const rateState = await getRateState(context.env.DB, keyHash);

    if (isBlocked(rateState, now)) {
      return jsonResponse(
        { status: "error", message: "Too many login attempts. Try again later." },
        429,
        { "Retry-After": String(RATE_BLOCK_MINUTES * 60) }
      );
    }

    const user = await context.env.DB.prepare(
      `SELECT id, username, password_hash, name, email, role, active
       FROM users WHERE username = ? LIMIT 1`
    ).bind(username).first();

    const passwordValid = user && user.active === 1
      ? await verifyPassword(password, user.password_hash)
      : false;

    if (!passwordValid) {
      await recordFailure(context.env.DB, keyHash, rateState, now);
      return jsonResponse({ status: "error", message: "Invalid username or password" }, 401);
    }

    await clearRateState(context.env.DB, keyHash);
    await context.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()).run();

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const sessionToken = bytesToBase64Url(tokenBytes);
    const tokenHash = await sha256(sessionToken);
    const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);

    await context.env.DB.prepare(
      `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
    ).bind(user.id, tokenHash, expiresAt.toISOString()).run();

    const cookie = [
      `jf_session=${sessionToken}`,
      "Path=/",
      `Max-Age=${SESSION_HOURS * 60 * 60}`,
      "HttpOnly",
      "Secure",
      "SameSite=Strict"
    ].join("; ");

    return jsonResponse({
      status: "ok",
      user: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role }
    }, 200, { "Set-Cookie": cookie });
  } catch {
    return jsonResponse({ status: "error", message: "Unable to login" }, 500);
  }
}

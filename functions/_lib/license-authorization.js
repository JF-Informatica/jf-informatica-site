import { signLicenseAuthorization } from "./license-signing.js";

const PRODUCT_ID = "center-backup";
const PRODUCTION_OFFLINE_MS = 72 * 60 * 60 * 1000;
const DEMO_OFFLINE_MS = 24 * 60 * 60 * 1000;

function normalizeExpiration(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Invalid license expiration");
  return new Date(timestamp).toISOString();
}

export async function createSignedAuthorization(env, {
  licenseId,
  customerName,
  environment,
  expiresAt,
  activationId,
  installationId,
  fingerprintVersion,
  fingerprint,
}) {
  if (!licenseId) throw new Error("Missing public license id");

  const now = Date.now();
  const issuedAt = new Date(now).toISOString();
  const normalizedExpiration = normalizeExpiration(expiresAt);
  const expirationMs = normalizedExpiration ? Date.parse(normalizedExpiration) : null;
  const offlineWindowMs = environment === "demo" ? DEMO_OFFLINE_MS : PRODUCTION_OFFLINE_MS;
  const offlineUntilMs = expirationMs === null
    ? now + offlineWindowMs
    : Math.min(now + offlineWindowMs, expirationMs);

  if (offlineUntilMs <= now) throw new Error("License authorization already expired");

  const payload = {
    schema_version: 2,
    license_id: licenseId,
    activation_id: activationId,
    product_id: PRODUCT_ID,
    customer_name: customerName,
    environment,
    status: "released",
    installation_id: installationId,
    fingerprint_version: fingerprintVersion,
    fingerprint,
    issued_at: issuedAt,
    expires_at: normalizedExpiration,
    offline_until: new Date(offlineUntilMs).toISOString(),
    features: [],
  };

  return signLicenseAuthorization(env, payload);
}

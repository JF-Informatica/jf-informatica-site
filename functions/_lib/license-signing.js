const KEY_ID = "jf-licensing-2026-01";

function base64ToBytes(value) {
  const normalized = String(value || "").replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

async function importPrivateKey(env) {
  const encoded = env?.LICENSE_SIGNING_PRIVATE_KEY_PKCS8;
  if (!encoded) throw new Error("LICENSE_SIGNING_PRIVATE_KEY_PKCS8 is not configured");
  return crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(encoded),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
}

export async function signLicenseAuthorization(env, payload) {
  const privateKey = await importPrivateKey(env);
  const canonicalPayload = canonicalize(payload);
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    new TextEncoder().encode(canonicalPayload),
  ));

  return {
    algorithm: "Ed25519",
    key_id: KEY_ID,
    payload,
    signature: bytesToBase64(signature),
  };
}

export function authorizationKeyId() {
  return KEY_ID;
}

import test from "node:test";
import assert from "node:assert/strict";
import { createEnv, context, submission } from "./support-env.mjs";
import { onRequestPost as submit } from "../functions/api/tickets.js";
import { onRequestPost as lookup } from "../functions/api/client/tickets/lookup.js";
import { onRequestGet as download } from "../functions/api/client/tickets/[id]/attachments/[attachment].js";
import { onRequestPost as comment } from "../functions/api/admin/tickets/[id]/history.js";
import { onRequestPatch as update } from "../functions/api/admin/tickets/[id].js";

async function fixture(t) {
  const env = await createEnv();
  t.after(() => env.close());
  const response = await submit(
    context(env, "/api/tickets", { body: submission() }),
  );
  assert.equal(response.status, 201);
  const ticket = env.sqlite.prepare("SELECT * FROM support_tickets").get();
  return { env, ticket };
}
const query = (env, identifier, options = {}) =>
  lookup(
    context(env, "/api/client/tickets/lookup", {
      token: "client-test-token",
      body: JSON.stringify({ identifier }),
      ...options,
    }),
  );
const change = (env, id, status) =>
  update(
    context(env, "/api/admin/tickets/" + id, {
      method: "PATCH",
      token: "admin-test-token",
      params: { id },
      body: JSON.stringify({ status }),
    }),
  );
const publish = (env, id, text, key = crypto.randomUUID(), options = {}) =>
  comment(
    context(env, "/api/admin/tickets/" + id + "/history", {
      token: "admin-test-token",
      params: { id },
      body: JSON.stringify({ body: text, request_id: key }),
      ...options,
    }),
  );
test("authenticated client can consult by protocol or UUID without private fields", async (t) => {
  const { env, ticket } = await fixture(t);
  for (const identifier of [
    ticket.protocol,
    ticket.id,
    ticket.protocol.toLowerCase(),
  ]) {
    const result = await query(env, identifier);
    assert.equal(result.status, 200);
    assert.match(result.headers.get("Cache-Control"), /no-store/);
    const data = await result.json();
    assert.equal(data.ticket.protocol, ticket.protocol);
    assert.equal(data.timeline[0].kind, "opened");
    assert.equal(data.ticket.closed_at, null);
    for (const field of [
      "email",
      "phone",
      "full_name",
      "department",
      "request_hash",
      "submission_id",
    ])
      assert.ok(!Object.hasOwn(data.ticket, field));
  }
  env.sqlite
    .prepare("UPDATE users SET email=' CLIENTE@EXAMPLE.INVALID ' WHERE id=2")
    .run();
  assert.equal((await query(env, ticket.protocol)).status, 200);
});
test("ticket existence and attachments cannot be probed through another client account", async (t) => {
  const { env, ticket } = await fixture(t);
  assert.equal(
    (await query(env, ticket.protocol, { token: undefined })).status,
    401,
  );
  env.sqlite
    .prepare("UPDATE users SET email='other@example.invalid' WHERE id=2")
    .run();
  const other = await query(env, ticket.protocol),
    missing = await query(env, "JF-20261030-000000000000");
  assert.equal(other.status, 404);
  assert.deepEqual(await other.json(), await missing.json());
  assert.equal(
    (await query(env, ticket.protocol, { token: "admin-test-token" })).status,
    404,
  );
  assert.equal(
    (await query(env, ticket.protocol, { origin: "https://evil.invalid" }))
      .status,
    403,
  );
  assert.equal((await query(env, "' OR 1=1 --")).status, 404);
});
test("client downloads require ownership and exact attachment-ticket binding", async (t) => {
  const { env, ticket } = await fixture(t),
    attachment = crypto.randomUUID();
  await env.DOWNLOADS.put("private-key", new TextEncoder().encode("evidence"));
  env.sqlite
    .prepare("INSERT INTO support_attachments VALUES(?,?,?,?,?,?)")
    .run(
      attachment,
      ticket.id,
      "private-key",
      "evidência.txt",
      "text/plain",
      8,
    );
  const params = { id: ticket.id, attachment },
    get = (token = "client-test-token", p = params) =>
      download(
        context(
          env,
          "/api/client/tickets/" + ticket.id + "/attachments/" + attachment,
          { method: "GET", token, params: p },
        ),
      );
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "evidence");
  assert.match(response.headers.get("Content-Disposition"), /^attachment/);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.equal((await get("")).status, 401);
  assert.equal(
    (
      await get("client-test-token", {
        ...params,
        attachment: crypto.randomUUID(),
      })
    ).status,
    404,
  );
  const data = await (await query(env, ticket.protocol)).json();
  assert.ok(!JSON.stringify(data).includes("private-key"));
  assert.equal(data.attachments[0].name, "evidência.txt");
  env.sqlite
    .prepare("UPDATE users SET email='different@example.invalid' WHERE id=2")
    .run();
  assert.equal((await get()).status, 404);
});
test("status changes build a timeline and closing dates reset when reopened", async (t) => {
  const { env, ticket } = await fixture(t);
  for (const status of ["em_atendimento", "resolvido", "encerrado"])
    assert.equal((await change(env, ticket.id, status)).status, 200);
  let data = await (await query(env, ticket.protocol)).json();
  assert.deepEqual(
    data.timeline.filter((e) => e.kind === "status").map((e) => e.status),
    ["em_atendimento", "resolvido", "encerrado"],
  );
  assert.ok(data.ticket.closed_at);
  const count = data.timeline.length;
  assert.equal((await change(env, ticket.id, "encerrado")).status, 200);
  data = await (await query(env, ticket.protocol)).json();
  assert.equal(data.timeline.length, count);
  assert.equal((await change(env, ticket.id, "em_atendimento")).status, 200);
  data = await (await query(env, ticket.protocol)).json();
  assert.equal(data.ticket.closed_at, null);
  assert.ok(data.timeline.some((e) => e.status === "encerrado"));
});
test("legacy closed ticket never receives a fabricated closing date", async (t) => {
  const { env, ticket } = await fixture(t);
  env.sqlite
    .prepare("UPDATE support_tickets SET status='encerrado' WHERE id=?")
    .run(ticket.id);
  const data = await (await query(env, ticket.protocol)).json();
  assert.equal(data.ticket.closed_at, null);
  assert.equal(data.timeline.length, 1);
  assert.match(data.history_note, /anteriores/);
});
test("public comments require admin, validate input and preserve retry idempotency", async (t) => {
  const { env, ticket } = await fixture(t),
    key = crypto.randomUUID(),
    text = "Orientação ao cliente: verificar o cabo. <script>alert(1)</script>";
  assert.equal(
    (await publish(env, ticket.id, text, key, { token: "client-test-token" }))
      .status,
    403,
  );
  assert.equal(
    (
      await publish(env, ticket.id, text, key, {
        origin: "https://evil.invalid",
      })
    ).status,
    403,
  );
  assert.equal((await publish(env, ticket.id, "x")).status, 400);
  assert.equal((await publish(env, ticket.id, "x".repeat(4001))).status, 400);
  for (let n = 0; n < 2; n++)
    assert.equal((await publish(env, ticket.id, text, key)).status, 200);
  const data = await (await query(env, ticket.protocol)).json();
  assert.equal(data.timeline.filter((e) => e.kind === "comment").length, 1);
  assert.equal(data.timeline.find((e) => e.kind === "comment").body, text);
  assert.equal(
    (await publish(env, ticket.id, "Changed text", key)).status,
    409,
  );
});
test("oversized lookup cannot bypass body limits", async (t) => {
  const { env } = await fixture(t);
  assert.equal(
    (
      await lookup(
        context(env, "/api/client/tickets/lookup", {
          token: "client-test-token",
          body: "x".repeat(513),
        }),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await lookup(
        context(env, "/api/client/tickets/lookup", {
          token: "client-test-token",
          body: "{",
        }),
      )
    ).status,
    400,
  );
});
test("history failure rolls back both status and its notification", async (t) => {
  const { env, ticket } = await fixture(t);
  await query(env, ticket.protocol);
  const before = env.sqlite
    .prepare("SELECT COUNT(*) n FROM support_email_outbox")
    .get().n;
  env.sqlite.exec(
    "CREATE TRIGGER reject_history BEFORE INSERT ON support_ticket_history BEGIN SELECT RAISE(ABORT,'synthetic failure'); END",
  );
  assert.equal((await change(env, ticket.id, "encerrado")).status, 503);
  assert.equal(
    env.sqlite
      .prepare("SELECT status FROM support_tickets WHERE id=?")
      .get(ticket.id).status,
    "novo",
  );
  assert.equal(
    env.sqlite.prepare("SELECT COUNT(*) n FROM support_email_outbox").get().n,
    before,
  );
});

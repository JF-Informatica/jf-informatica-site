export function onRequestGet() {
  return Response.json({
    status: "ok",
    application: "JF Informatica",
    service: "downloads-api",
    version: "v5"
  });
}

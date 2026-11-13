// Export only the customer-facing license data, never activation tokens,
// fingerprints, internal notes or session information.
export function licenseDocument(license) {
  return {
    format: "jf-portal-license-export",
    schema_version: 1,
    license_id: license.public_id,
    customer_name: license.customer_name,
    product_name: license.product_name,
    license_key: license.license_key,
    environment: license.environment,
    active: license.active,
    expires_at: license.expires_at || null,
    equipment_name: license.equipment_name || null,
    activated_at: license.activated_at || null,
  };
}

export function downloadLicenseJson(license) {
  const document = licenseDocument(license);
  const blob = new Blob([JSON.stringify(document, null, 2) + "\n"], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `licenca-${String(license.public_id || license.id).replace(/[^a-zA-Z0-9-]/g, "")}.json`;
  window.document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { getNotificaSmtpConfig } from "../src/lib/notifica-smtp";
import { createNotificaTransporter } from "../src/lib/notifica-smtp";

const config = getNotificaSmtpConfig();

if (!config) {
  console.log("SMTP: NOT CONFIGURED (missing host/user/pass/from)");
  process.exit(1);
}

const pass = config.auth.pass;

console.log("=== Config (sin clave) ===");
console.log("host:", config.host);
console.log("port:", config.port);
console.log("secure:", config.port === 465);
console.log("user:", config.auth.user);
console.log("from:", config.from);
console.log("credential source:", (config as { source?: string }).source ?? "unknown");
console.log("pass length:", pass.length);
console.log("pass trimmed ok:", pass === pass.trim());
console.log("pass looks quoted:", /^['"].*['"]$/.test(pass));
console.log("pass has newline:", /[\r\n]/.test(pass));

console.log("\n=== Env vars present ===");
for (const key of [
  "CITAS_SMTP_HOST",
  "CITAS_SMTP_PORT",
  "CITAS_SMTP_USER",
  "CITAS_SMTP_PASSWORD",
  "NOTIFICA_SMTP_HOST",
  "NOTIFICA_SMTP_USER",
  "NOTIFICA_SMTP_PASSWORD",
  "SMTP_PASSWORD",
  "SMTP_PASS",
  "CITAS_EMAIL_FROM",
]) {
  const val = process.env[key];
  console.log(`${key}:`, val ? `set (${val.length} chars)` : "not set");
}

console.log("\n=== Verify ===");
createNotificaTransporter()
  .verify()
  .then(() => {
    console.log("OK - credenciales válidas");
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.log("FAILED:", message);
    if (message.includes("535")) {
      console.log("\nDiagnóstico 535:");
      console.log("- Usuario debe ser el correo completo: cita@transporteapoquindo.cl");
      console.log("- Clave = la de cPanel > Email Accounts > cita@... > Manage > Password");
      console.log("- En Vercel, variable CITAS_SMTP_PASSWORD sin comillas ni espacios extra");
      console.log("- Si cambiaste la clave en cPanel, actualiza Vercel y redeploy");
    }
  });

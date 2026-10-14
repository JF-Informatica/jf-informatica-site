import { hashPassword, verifyPassword } from "../_lib/password.js";

export async function onRequestGet() {
  try {
    const testPassword = "JF-Teste-Interno-2026!";

    const hash = await hashPassword(testPassword);

    const correctPasswordAccepted = await verifyPassword(
      testPassword,
      hash
    );

    const wrongPasswordRejected = !await verifyPassword(
      "senha-incorreta",
      hash
    );

    return Response.json({
      status:
        correctPasswordAccepted && wrongPasswordRejected
          ? "ok"
          : "error",
      algorithm: "PBKDF2-HMAC-SHA-256",
      iterations: 600000,
      correct_password_accepted: correctPasswordAccepted,
      wrong_password_rejected: wrongPasswordRejected
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error.message
      },
      { status: 500 }
    );
  }
}

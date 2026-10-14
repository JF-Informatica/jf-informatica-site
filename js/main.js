const menu = document.querySelector("#menu");
const nav = document.querySelector(".nav nav");

menu?.addEventListener("click", () => nav?.classList.toggle("open"));

document.querySelectorAll("nav a").forEach((link) => {
  link.addEventListener("click", () => nav?.classList.remove("open"));
});

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

const loginForm = document.querySelector("#login-form");
const usernameInput = document.querySelector("#login-username");
const passwordInput = document.querySelector("#login-password");
const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");
const authMessage = document.querySelector("#auth-message");
const authSession = document.querySelector("#auth-session");

function showMessage(message, isError = false) {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.style.color = isError ? "#ff9b9b" : "#91e5b1";
}

function showAuthenticated(user) {
  if (loginForm) loginForm.hidden = true;
  if (authSession) authSession.hidden = false;
  showMessage(`Acesso autenticado: ${user.name}`);
}

function showLoggedOut() {
  if (loginForm) loginForm.hidden = false;
  if (authSession) authSession.hidden = true;
}

async function checkSession() {
  if (!loginForm) return;

  try {
    const response = await fetch("/api/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });

    if (!response.ok) {
      showLoggedOut();
      return;
    }

    const data = await response.json();

    if (data.status === "ok" && data.authenticated && data.user) {
      showAuthenticated(data.user);
    } else {
      showLoggedOut();
    }
  } catch {
    showMessage("Não foi possível verificar sua sessão.", true);
  }
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");

  if (loginButton) loginButton.disabled = true;

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        password: passwordInput.value
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.status !== "ok" || !data.user) {
      showMessage(
        response.status === 401
          ? "Usuário ou senha inválidos."
          : "Não foi possível entrar. Tente novamente.",
        true
      );
      return;
    }

    loginForm.reset();
    passwordInput.value = "";
    showAuthenticated(data.user);
  } catch {
    showMessage("Falha de comunicação. Tente novamente.", true);
  } finally {
    if (loginButton) loginButton.disabled = false;
  }
});

logoutButton?.addEventListener("click", async () => {
  logoutButton.disabled = true;
  showMessage("");

  try {
    const response = await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store"
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.status !== "ok") {
      showMessage("Não foi possível encerrar a sessão.", true);
      return;
    }

    showLoggedOut();
    loginForm?.reset();
    showMessage("Sessão encerrada com sucesso.");
  } catch {
    showMessage("Falha de comunicação ao encerrar a sessão.", true);
  } finally {
    logoutButton.disabled = false;
  }
});

checkSession();

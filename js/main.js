const menu = document.querySelector("#menu");
const nav = document.querySelector(".nav nav");

menu?.addEventListener("click", () => nav?.classList.toggle("open"));
document.querySelectorAll("nav a").forEach(link => link.addEventListener("click", () => nav?.classList.remove("open")));

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

const loginForm = document.querySelector("#login-form");
const usernameInput = document.querySelector("#login-username");
const passwordInput = document.querySelector("#login-password");
const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");
const authMessage = document.querySelector("#auth-message");
const authSession = document.querySelector("#auth-session");
const authTitle = document.querySelector("#auth-title");

function showMessage(message, isError = false) {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.classList.toggle("error", isError);
}

function updateAdminAccess(user) {
  const existing = document.querySelector("#admin-portal-link");
  if (user?.role !== "admin") { existing?.remove(); return; }
  if (existing || !authSession) return;
  const actions = authSession.querySelector(".portal-actions") || authSession;
  const link = document.createElement("a");
  link.id = "admin-portal-link";
  link.className = "portal-admin-link";
  link.href = "/admin.html";
  link.textContent = "Abrir Administrativo";
  actions.insertBefore(link, logoutButton);
}

function showAuthenticated(user) {
  if (loginForm) loginForm.hidden = true;
  if (authSession) authSession.hidden = false;
  if (authTitle) authTitle.textContent = "Downloads disponíveis";
  showMessage(`Conectado como ${user.name}`);
  updateAdminAccess(user);
  loadDownloads();
}

function showLoggedOut() {
  if (loginForm) loginForm.hidden = false;
  if (authSession) authSession.hidden = true;
  if (authTitle) authTitle.textContent = "Acesso ao portal";
  document.querySelector("#admin-portal-link")?.remove();
}

async function checkSession() {
  if (!loginForm) return;
  try {
    const response = await fetch("/api/me", {method:"GET",credentials:"same-origin",cache:"no-store"});
    if (!response.ok) { showLoggedOut(); return; }
    const data = await response.json();
    if (data.status === "ok" && data.authenticated && data.user) showAuthenticated(data.user); else showLoggedOut();
  } catch { showMessage("Não foi possível verificar sua sessão.", true); }
}

loginForm?.addEventListener("submit", async event => {
  event.preventDefault(); showMessage(""); if (loginButton) loginButton.disabled = true;
  try {
    const response = await fetch("/api/login", {method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({username:usernameInput.value.trim(),password:passwordInput.value})});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== "ok" || !data.user) { showMessage(response.status === 401 ? "Usuário ou senha inválidos." : "Não foi possível entrar. Tente novamente.", true); return; }
    loginForm.reset(); passwordInput.value = ""; showAuthenticated(data.user);
  } catch { showMessage("Falha de comunicação. Tente novamente.", true); }
  finally { if (loginButton) loginButton.disabled = false; }
});

logoutButton?.addEventListener("click", async () => {
  logoutButton.disabled = true; showMessage("");
  try {
    const response = await fetch("/api/logout", {method:"POST",credentials:"same-origin",cache:"no-store"});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== "ok") { showMessage("Não foi possível encerrar a sessão.", true); return; }
    showLoggedOut(); loginForm?.reset(); showMessage("Sessão encerrada com sucesso.");
  } catch { showMessage("Falha de comunicação ao encerrar a sessão.", true); }
  finally { logoutButton.disabled = false; }
});

checkSession();

function formatFileSize(bytes) {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) < 0) return "";
  const size = Number(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

async function loadDownloads() {
  const container = document.querySelector("#downloads-list");
  if (!container) return;
  container.textContent = "Carregando arquivos disponíveis...";
  try {
    const response = await fetch("/api/downloads", {method:"GET",credentials:"same-origin",cache:"no-store"});
    if (response.status === 401) { showLoggedOut(); return; }
    const data = await response.json();
    if (!response.ok || data.status !== "ok") throw new Error("Unable to load downloads");
    container.replaceChildren();
    if (!data.downloads.length) { const empty=document.createElement("p"); empty.textContent="Nenhum arquivo disponível."; container.appendChild(empty); return; }
    for (const item of data.downloads) {
      const card=document.createElement("article"); card.className="download-item";
      const content=document.createElement("div"); content.className="download-content";
      const heading=document.createElement("div"); heading.className="download-heading";
      const title=document.createElement("strong"); title.textContent=item.name;
      const badge=document.createElement("span"); badge.className="download-badge"; badge.textContent="Disponível";
      heading.append(title,badge);
      const description=document.createElement("p"); description.textContent=item.description || "";
      const meta=document.createElement("div"); meta.className="download-meta";
      [item.category,item.version?`Versão ${item.version}`:null,item.file_size?formatFileSize(item.file_size):null].filter(Boolean).forEach(value=>{const span=document.createElement("span");span.textContent=value;meta.appendChild(span);});
      content.append(heading,description,meta);
      if (item.sha256) { const hash=document.createElement("div"); hash.className="download-hash"; const label=document.createElement("span"); label.textContent="SHA-256"; const code=document.createElement("code"); code.textContent=item.sha256; hash.append(label,code); content.appendChild(hash); }
      const link=document.createElement("a"); link.className="download-button"; link.href=item.download_url; link.textContent="Baixar";
      card.append(content,link);
      container.appendChild(card);
    }
  } catch { container.textContent="Não foi possível carregar os arquivos disponíveis."; }
}

const adminContent = document.querySelector("#admin-content");
const accessDenied = document.querySelector("#access-denied");
const adminUser = document.querySelector("#admin-user");
const logoutButton = document.querySelector("#admin-logout");
const usersTableBody = document.querySelector("#users-table-body");
const adminMessage = document.querySelector("#admin-message");
const newUserButton = document.querySelector("#new-user-button");
const userFormPanel = document.querySelector("#user-form-panel");
const closeUserForm = document.querySelector("#close-user-form");
const userForm = document.querySelector("#user-form");
const saveUserButton = document.querySelector("#save-user-button");

function showAdminMessage(message, isError = false) {
  if (!adminMessage) return;
  adminMessage.textContent = message;
  adminMessage.classList.toggle("error", isError);
}

function showDenied() {
  if (adminContent) adminContent.hidden = true;
  if (accessDenied) accessDenied.hidden = false;
  if (adminUser) adminUser.textContent = "Acesso restrito";
}

function createCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text ?? "";
  return cell;
}

async function loadUsers() {
  if (!usersTableBody) return;

  try {
    const response = await fetch("/api/admin/users", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });

    if (response.status === 401 || response.status === 403) {
      showDenied();
      return;
    }

    const data = await response.json();

    if (!response.ok || data.status !== "ok") {
      throw new Error("Unable to load users");
    }

    usersTableBody.replaceChildren();

    if (!data.users.length) {
      const row = document.createElement("tr");
      const cell = createCell("Nenhum usuário cadastrado.");
      cell.colSpan = 5;
      row.appendChild(cell);
      usersTableBody.appendChild(row);
      return;
    }

    for (const user of data.users) {
      const row = document.createElement("tr");
      row.appendChild(createCell(user.name));
      row.appendChild(createCell(user.username));
      row.appendChild(createCell(user.email));

      const roleCell = document.createElement("td");
      const roleBadge = document.createElement("span");
      roleBadge.className = "admin-badge role";
      roleBadge.textContent = user.role === "admin" ? "Administrador" : "Usuário";
      roleCell.appendChild(roleBadge);
      row.appendChild(roleCell);

      const statusCell = document.createElement("td");
      const statusBadge = document.createElement("span");
      statusBadge.className = `admin-badge ${user.active ? "active" : "blocked"}`;
      statusBadge.textContent = user.active ? "Ativo" : "Bloqueado";
      statusCell.appendChild(statusBadge);
      row.appendChild(statusCell);

      usersTableBody.appendChild(row);
    }
  } catch {
    showAdminMessage("Não foi possível carregar os usuários.", true);
  }
}

async function validateAdmin() {
  try {
    const response = await fetch("/api/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });

    if (!response.ok) {
      showDenied();
      return;
    }

    const data = await response.json();
    const user = data.user;

    if (!user || user.role !== "admin") {
      showDenied();
      return;
    }

    if (adminUser) adminUser.textContent = `${user.name} • Administrador`;
    if (accessDenied) accessDenied.hidden = true;
    if (adminContent) adminContent.hidden = false;
    await loadUsers();
  } catch {
    showDenied();
  }
}

newUserButton?.addEventListener("click", () => {
  userFormPanel.hidden = false;
  showAdminMessage("");
  document.querySelector("#user-name")?.focus();
});

closeUserForm?.addEventListener("click", () => {
  userFormPanel.hidden = true;
  userForm?.reset();
});

userForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAdminMessage("");

  if (saveUserButton) saveUserButton.disabled = true;

  const payload = {
    name: document.querySelector("#user-name").value.trim(),
    username: document.querySelector("#user-username").value.trim(),
    email: document.querySelector("#user-email").value.trim(),
    role: document.querySelector("#user-role").value,
    password: document.querySelector("#user-password").value
  };

  try {
    const response = await fetch("/api/admin/users/create", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.status !== "ok") {
      const messages = {
        400: "Confira os dados informados. A senha deve ter no mínimo 12 caracteres.",
        401: "Sua sessão expirou. Entre novamente.",
        403: "Sua conta não possui permissão administrativa.",
        409: "Já existe um usuário com esse nome de usuário ou e-mail."
      };
      showAdminMessage(messages[response.status] || "Não foi possível cadastrar o usuário.", true);
      return;
    }

    userForm.reset();
    userFormPanel.hidden = true;
    showAdminMessage(`Usuário ${data.user.username} cadastrado com sucesso.`);
    await loadUsers();
  } catch {
    showAdminMessage("Falha de comunicação ao cadastrar o usuário.", true);
  } finally {
    if (saveUserButton) saveUserButton.disabled = false;
  }
});

logoutButton?.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store"
    });
  } finally {
    window.location.href = "/#downloads";
  }
});

validateAdmin();

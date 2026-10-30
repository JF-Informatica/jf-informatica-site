(() => {
  const dialog = document.getElementById("ticket-detail");
  if (!dialog) return;
  let selected = null,
    requestId = crypto.randomUUID(),
    sending = false;
  const section = document.createElement("section");
  section.className = "ticket-history-panel";
  section.innerHTML =
    '<h3>Atualizações visíveis ao cliente</h3><p>Publique apenas informações que podem ser compartilhadas com o solicitante. Não inclua senhas ou notas internas.</p><ol class="lookup-timeline" id="admin-history-list"></ol><form id="admin-comment-form"><label for="admin-comment-body">Comentário para o cliente</label><textarea id="admin-comment-body" rows="4" minlength="3" maxlength="4000" required placeholder="Descreva o andamento ou a orientação ao cliente."></textarea><button class="admin-primary" type="submit">Publicar comentário</button></form><p id="admin-history-message" role="status" aria-live="polite"></p>';
  document.getElementById("ticket-status-form").before(section);
  const form = section.querySelector("form"),
    field = section.querySelector("textarea"),
    list = section.querySelector("ol"),
    message = section.querySelector('[role="status"]');
  const statuses = {
    novo: "Novo",
    em_atendimento: "Em atendimento",
    aguardando_cliente: "Aguardando cliente",
    resolvido: "Resolvido",
    encerrado: "Encerrado",
  };
  function node(tag, text) {
    const e = document.createElement(tag);
    e.textContent = text;
    return e;
  }
  async function api(id, options = {}) {
    const response = await fetch("/api/admin/tickets/" + id + "/history", {
        cache: "no-store",
        credentials: "same-origin",
        ...options,
      }),
      data = await response.json();
    if (!response.ok)
      throw Error(data.message || "Não foi possível carregar o histórico.");
    return data;
  }
  function render(data) {
    list.replaceChildren();
    for (const item of data.entries) {
      const li = node("li", "");
      li.append(
        node(
          "strong",
          item.kind === "status"
            ? "Status: " + (statuses[item.status] || item.status)
            : "Comentário da equipe",
        ),
        node(
          "time",
          new Date(item.created_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          }),
        ),
      );
      if (item.body) li.append(node("p", item.body));
      list.append(li);
    }
    if (!data.entries.length)
      list.append(
        node(
          "li",
          "Nenhuma atualização registrada desde a implantação do histórico.",
        ),
      );
  }
  async function load(id) {
    try {
      const data = await api(id);
      if (selected === id) render(data);
    } catch (error) {
      if (selected === id) message.textContent = error.message;
    }
  }
  document.addEventListener("ticket:opened", (event) => {
    selected = event.detail.id;
    form.reset();
    requestId = crypto.randomUUID();
    list.replaceChildren();
    message.textContent = "";
    load(selected);
  });
  document.addEventListener("ticket:status-saved", (event) => {
    if (selected === event.detail.id) load(selected);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    sending = true;
    const id = selected,
      button = form.querySelector("button");
    button.disabled = true;
    field.disabled = true;
    message.textContent = "Publicando...";
    try {
      const data = await api(id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: field.value, request_id: requestId }),
      });
      if (selected === id) {
        render(data);
        form.reset();
        requestId = crypto.randomUUID();
        message.textContent =
          "Comentário publicado. Disponível na consulta do cliente.";
      }
    } catch (error) {
      if (selected === id) message.textContent = error.message;
    } finally {
      sending = false;
      button.disabled = false;
      field.disabled = false;
    }
  });
  field.addEventListener("input", () => {
    requestId = crypto.randomUUID();
  });
})();

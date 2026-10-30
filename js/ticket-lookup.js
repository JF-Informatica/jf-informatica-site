(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    statuses = {
      novo: "Novo",
      em_atendimento: "Em atendimento",
      aguardando_cliente: "Aguardando cliente",
      resolvido: "Resolvido",
      encerrado: "Encerrado",
    },
    priorities = { baixa: "Baixa", media: "Média", alta: "Alta / Crítica" };
  let searchVersion = 0;
  const date = (value) =>
    value
      ? new Date(value).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        })
      : "—";
  // All ticket contents use textContent, never HTML supplied by customers.
  function node(tag, text) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function message(id, text, error = false) {
    $(id).textContent = text;
    $(id).classList.toggle("lookup-error", error);
  }
  function session(user) {
    $("lookup-login-panel").hidden = !!user;
    $("lookup-session").hidden = !user;
    $("lookup-submit").disabled = !user;
    $("lookup-user").textContent = user?.name || "Cliente";
    if (!user) {
      $("lookup-result").hidden = true;
      $("lookup-facts").replaceChildren();
      $("lookup-timeline").replaceChildren();
      $("lookup-files").replaceChildren();
      $("lookup-description").textContent = "";
    }
    message(
      "lookup-message",
      user
        ? "Acesso validado. Informe o protocolo para consultar."
        : "Entre na sua conta para consultar seus chamados.",
    );
  }
  async function api(url, options = {}) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          ...options,
        }),
        data = await response.json().catch(() => ({}));
      if (response.status === 401) session(null);
      if (!response.ok)
        throw Error(
          response.status === 401
            ? url === "/api/login"
              ? "Usuário ou senha inválidos."
              : "Sua sessão expirou. Entre novamente."
            : data.message || "Não foi possível concluir a solicitação.",
        );
      return data;
    } catch (error) {
      if (error.name === "AbortError")
        throw Error("O servidor demorou para responder. Tente novamente.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  function render(data) {
    const t = data.ticket;
    $("lookup-title").textContent = t.protocol;
    $("lookup-status").textContent = statuses[t.status] || t.status;
    $("lookup-status").dataset.status = t.status;
    $("lookup-description").textContent = t.description;
    const facts = $("lookup-facts");
    facts.replaceChildren();
    for (const [label, value] of [
      ["Prioridade", priorities[t.urgency] || t.urgency],
      ["Abertura", date(t.created_at)],
      [
        "Encerramento",
        t.closed_at
          ? date(t.closed_at)
          : t.status === "encerrado"
            ? "Não registrado no histórico"
            : "Ainda não encerrado",
      ],
      ["Última mudança de status", date(t.updated_at)],
    ]) {
      const group = node("div");
      group.append(node("dt", label), node("dd", value));
      facts.append(group);
    }
    $("lookup-history-note").textContent = data.history_note;
    const timeline = $("lookup-timeline");
    timeline.replaceChildren();
    for (const item of data.timeline) {
      const li = node("li"),
        time = node("time", date(item.created_at));
      time.dateTime = item.created_at;
      li.append(
        node(
          "strong",
          item.kind === "opened"
            ? "Abertura do chamado"
            : item.kind === "status"
              ? "Status: " + (statuses[item.status] || item.status)
              : "Comentário da equipe",
        ),
        time,
      );
      if (item.body) li.append(node("p", item.body));
      timeline.append(li);
    }
    const files = $("lookup-files");
    files.replaceChildren();
    for (const file of data.attachments) {
      const li = node("li"),
        a = node("a", file.name + " ↓");
      a.href = file.download_url;
      a.download = file.name;
      li.append(
        a,
        node(
          "small",
          (file.size < 1024
            ? file.size + " B"
            : (file.size / 1024).toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              }) + " KB") + " · Download",
        ),
      );
      files.append(li);
    }
    if (!data.attachments.length)
      files.append(node("li", "Nenhum anexo disponível neste chamado."));
    $("lookup-result").hidden = false;
    $("lookup-result").focus();
    message("lookup-message", "Chamado carregado.");
  }
  $("lookup-search").addEventListener("submit", async (event) => {
    event.preventDefault();
    const version = ++searchVersion;
    $("lookup-result").hidden = true;
    $("lookup-submit").disabled = true;
    message("lookup-message", "Consultando chamado...");
    try {
      const data = await api("/api/client/tickets/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: $("lookup-identifier").value.trim(),
        }),
      });
      if (version === searchVersion) render(data);
    } catch (error) {
      if (version === searchVersion)
        message("lookup-message", error.message, true);
    } finally {
      if (version === searchVersion)
        $("lookup-submit").disabled = !$("lookup-login-panel").hidden;
    }
  });
  $("lookup-login").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      button = form.querySelector("button");
    button.disabled = true;
    message("lookup-login-message", "Entrando...");
    try {
      const data = await api("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.elements.username.value.trim(),
          password: form.elements.password.value,
        }),
      });
      form.reset();
      session(data.user);
      message("lookup-login-message", "");
      $("lookup-identifier").focus();
    } catch (error) {
      message("lookup-login-message", error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $("lookup-logout").onclick = async () => {
    ++searchVersion;
    try {
      await api("/api/logout", { method: "POST" });
      session(null);
    } catch (error) {
      message("lookup-message", error.message, true);
    }
  };
  (async () => {
    try {
      const data = await api("/api/me");
      session(data.user);
    } catch {
      session(null);
    }
  })();
})();

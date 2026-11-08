(function () {
  const form = document.getElementById("idea-form");
  const nameInput = document.getElementById("idea-name");
  const textInput = document.getElementById("idea-text");
  const statusEl = document.getElementById("idea-status");
  const adminBox = document.getElementById("ideas-admin");
  const ideasList = document.getElementById("ideas-list");

  function setStatus(text, isError) {
    statusEl.textContent = text || "";
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadAdminIdeas() {
    const user = window.RifmaryAuth && window.RifmaryAuth.getUser();
    if (!user || !user.admin) {
      adminBox.hidden = true;
      return;
    }
    adminBox.hidden = false;
    const data = await window.RifmaryAuth.api("/api/suggestions");
    const list = Array.isArray(data.suggestions) ? data.suggestions : [];
    if (!list.length) {
      ideasList.innerHTML = `<li class="chat-empty">Пока нет предложений.</li>`;
      return;
    }
    ideasList.innerHTML = list
      .map(
        (s) => `<li>
          <h3>${escapeHtml(s.name || "Гость")}${s.email ? " · " + escapeHtml(s.email) : ""}</h3>
          <p>${escapeHtml(s.text || "")}</p>
        </li>`
      )
      .join("");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const text = textInput.value.trim();
    try {
      setStatus("Отправляем…");
      const headers = { "Content-Type": "application/json" };
      if (window.RifmaryAuth && window.RifmaryAuth.getToken()) {
        headers.Authorization = "Bearer " + window.RifmaryAuth.getToken();
      }
      const base = window.RIFMARY_API || "";
      const res = await fetch(base + "/api/suggestions", {
        method: "POST",
        headers,
        body: JSON.stringify({ name, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      textInput.value = "";
      setStatus(data.message || "Спасибо!");
      if (window.RifmaryAuth && window.RifmaryAuth.getUser() && window.RifmaryAuth.getUser().admin) {
        await loadAdminIdeas();
      }
    } catch (err) {
      setStatus(err.message || "Не удалось отправить.", true);
    }
  });

  document.addEventListener("click", (event) => {
    const go = event.target.closest("[data-go]");
    if (go) window.location.href = go.getAttribute("data-go");
  });

  function boot() {
    if (window.RifmaryAuth) {
      window.RifmaryAuth.onAuth((user) => {
        if (user && !nameInput.value.trim()) {
          nameInput.value = user.displayName || user.email.split("@")[0];
        }
        loadAdminIdeas().catch(() => {});
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 40));
  } else {
    setTimeout(boot, 40);
  }
})();

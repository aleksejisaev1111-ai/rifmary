(function () {
  const guest = document.getElementById("support-guest");
  const userBox = document.getElementById("support-user");
  const adminBox = document.getElementById("support-admin");
  const userLog = document.getElementById("user-chat-log");
  const adminLog = document.getElementById("admin-chat-log");
  const inboxList = document.getElementById("inbox-list");
  const userStatus = document.getElementById("user-chat-status");
  const adminStatus = document.getElementById("admin-chat-status");
  const adminTitle = document.getElementById("admin-chat-title");
  const adminForm = document.getElementById("admin-chat-form");

  let activeThreadId = "";
  let pollTimer = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", Boolean(isError));
  }

  function renderMessages(container, messages, meIsAdminView) {
    const list = Array.isArray(messages) ? messages : [];
    if (!list.length) {
      container.innerHTML = `<p class="chat-empty">Пока пусто — напишите первое сообщение.</p>`;
      return;
    }
    container.innerHTML = list
      .map((m) => {
        const mine = meIsAdminView ? m.from === "admin" : m.from === "user";
        const who = m.from === "admin" ? m.byName || "Поддержка" : m.byName || "Вы";
        return `<article class="chat-bubble ${mine ? "is-mine" : "is-admin"}">
          <strong>${escapeHtml(who)}</strong>
          <p>${escapeHtml(m.text || "")}</p>
        </article>`;
      })
      .join("");
    container.scrollTop = container.scrollHeight;
  }

  async function loadUserChat() {
    const data = await window.RifmaryAuth.api("/api/support");
    renderMessages(userLog, data.thread && data.thread.messages, false);
  }

  async function loadInbox() {
    const data = await window.RifmaryAuth.api("/api/support/inbox");
    const threads = Array.isArray(data.threads) ? data.threads : [];
    if (!threads.length) {
      inboxList.innerHTML = `<li class="chat-empty">Пока нет обращений.</li>`;
      return;
    }
    inboxList.innerHTML = threads
      .map((t) => {
        const active = t.userId === activeThreadId ? "is-active" : "";
        const unread = t.unreadForAdmin ? "is-unread" : "";
        return `<li>
          <button type="button" class="inbox-item ${active} ${unread}" data-thread="${escapeHtml(t.userId)}">
            <strong>${escapeHtml(t.userName || t.userEmail || "Пользователь")}</strong>
            <span>${escapeHtml((t.preview || "").slice(0, 80))}</span>
          </button>
        </li>`;
      })
      .join("");
  }

  async function openThread(userId) {
    activeThreadId = userId;
    const data = await window.RifmaryAuth.api("/api/support/thread/" + encodeURIComponent(userId));
    const thread = data.thread;
    adminTitle.textContent = (thread.userName || "Диалог") + (thread.userEmail ? " · " + thread.userEmail : "");
    adminForm.hidden = false;
    renderMessages(adminLog, thread.messages, true);
    await loadInbox();
  }

  async function bootSupport() {
    const logged = window.RifmaryAuth && window.RifmaryAuth.isLoggedIn();
    guest.hidden = logged;
    userBox.hidden = true;
    adminBox.hidden = true;
    if (!logged) return;

    const user = window.RifmaryAuth.getUser();
    if (user && user.admin) {
      adminBox.hidden = false;
      await loadInbox();
      if (activeThreadId) await openThread(activeThreadId);
    } else {
      userBox.hidden = false;
      await loadUserChat();
    }
  }

  document.getElementById("user-chat-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("user-chat-input");
    const text = input.value.trim();
    try {
      setStatus(userStatus, "Отправляем…");
      await window.RifmaryAuth.api("/api/support", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      input.value = "";
      setStatus(userStatus, "Отправлено.");
      await loadUserChat();
    } catch (err) {
      setStatus(userStatus, err.message || "Не удалось отправить.", true);
    }
  });

  document.getElementById("admin-chat-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeThreadId) return;
    const input = document.getElementById("admin-chat-input");
    const text = input.value.trim();
    try {
      setStatus(adminStatus, "Отправляем…");
      await window.RifmaryAuth.api(
        "/api/support/thread/" + encodeURIComponent(activeThreadId) + "/reply",
        { method: "POST", body: JSON.stringify({ text }) }
      );
      input.value = "";
      setStatus(adminStatus, "Ответ отправлен.");
      await openThread(activeThreadId);
    } catch (err) {
      setStatus(adminStatus, err.message || "Не удалось ответить.", true);
    }
  });

  document.addEventListener("click", async (event) => {
    const go = event.target.closest("[data-go]");
    if (go) {
      window.location.href = go.getAttribute("data-go");
      return;
    }
    const item = event.target.closest("[data-thread]");
    if (item) {
      try {
        await openThread(item.getAttribute("data-thread"));
      } catch (err) {
        setStatus(adminStatus, err.message || "Не удалось открыть диалог.", true);
      }
    }
  });

  document.getElementById("support-login").onclick = () =>
    window.RifmaryAuth && window.RifmaryAuth.openLogin();
  document.getElementById("support-register").onclick = () =>
    window.RifmaryAuth && window.RifmaryAuth.openRegister();

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) return;
      const user = window.RifmaryAuth.getUser();
      if (user && user.admin) {
        loadInbox().catch(() => {});
        if (activeThreadId) openThread(activeThreadId).catch(() => {});
      } else {
        loadUserChat().catch(() => {});
      }
    }, 8000);
  }

  function boot() {
    if (!window.RifmaryAuth) return;
    window.RifmaryAuth.onAuth(() => {
      bootSupport().catch((err) => console.error(err));
    });
    startPoll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 40));
  } else {
    setTimeout(boot, 40);
  }
})();

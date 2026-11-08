(function () {
  const TOKEN_KEY = "rifmary-token-v1";
  const API_BASE = window.RIFMARY_API || "";

  let currentUser = null;
  const listeners = new Set();

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(currentUser);
      } catch (_) {}
    });
    renderHeader();
  }

  function onAuth(fn) {
    listeners.add(fn);
    fn(currentUser);
    return () => listeners.delete(fn);
  }

  function getUser() {
    return currentUser;
  }

  function isLoggedIn() {
    return Boolean(currentUser && currentUser.email);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function api(path, options = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) throw new Error(data.error || "Ошибка сервера.");
    return data;
  }

  async function register(email, password, displayName, age) {
    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName, age }),
    });
    setToken(data.token);
    currentUser = data.user;
    notify();
    return data;
  }

  async function login(email, password) {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    currentUser = data.user;
    notify();
    return data;
  }

  async function logout() {
    try {
      await api("/api/logout", { method: "POST" });
    } catch (_) {}
    setToken("");
    currentUser = null;
    notify();
  }

  async function refreshMe() {
    if (!getToken()) {
      currentUser = null;
      notify();
      return null;
    }
    try {
      const data = await api("/api/me");
      currentUser = data.user;
      notify();
      return currentUser;
    } catch (_) {
      setToken("");
      currentUser = null;
      notify();
      return null;
    }
  }

  function ensureModal() {
    if (document.getElementById("auth-backdrop")) return;

    const wrap = document.createElement("div");
    wrap.id = "auth-backdrop";
    wrap.className = "auth-backdrop";
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div class="auth-modal-head">
          <h2 id="auth-title">Вход</h2>
          <button type="button" class="panel-close" id="auth-close" aria-label="Закрыть">×</button>
        </div>
        <div class="auth-tabs">
          <button type="button" class="auth-tab is-active" data-auth-tab="login">Вход</button>
          <button type="button" class="auth-tab" data-auth-tab="register">Регистрация</button>
        </div>
        <form class="auth-form" id="auth-form" autocomplete="on">
          <label data-auth-name hidden>
            <span>Имя или псевдоним</span>
            <input id="auth-name" name="name" type="text" maxlength="40" placeholder="Как к вам обращаться" />
          </label>
          <label data-auth-age hidden>
            <span>Сколько лет</span>
            <input id="auth-age" name="age" type="number" min="5" max="120" placeholder="Например: 24" />
          </label>
          <label>
            <span>Email</span>
            <input id="auth-email" name="email" type="email" required placeholder="you@email.com" />
          </label>
          <label>
            <span>Пароль</span>
            <input id="auth-password" name="password" type="password" required minlength="6" placeholder="Минимум 6 символов" />
          </label>
          <button class="auth-submit" type="submit" id="auth-submit">Войти</button>
          <p class="auth-status" id="auth-status" role="status"></p>
        </form>
        <p class="auth-note">Регистрация по email. После входа можно публиковать стихи.</p>
      </div>`;
    document.body.appendChild(wrap);

    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) closeModal();
    });
    document.getElementById("auth-close").addEventListener("click", closeModal);
    wrap.querySelectorAll("[data-auth-tab]").forEach((btn) => {
      btn.addEventListener("click", () => setTab(btn.getAttribute("data-auth-tab")));
    });
    document.getElementById("auth-form").addEventListener("submit", onSubmit);
  }

  let activeTab = "login";

  function setTab(tab) {
    activeTab = tab === "register" ? "register" : "login";
    document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-auth-tab") === activeTab);
    });
    const title = document.getElementById("auth-title");
    const submit = document.getElementById("auth-submit");
    const nameWrap = document.querySelector("[data-auth-name]");
    const ageWrap = document.querySelector("[data-auth-age]");
    const ageInput = document.getElementById("auth-age");
    const status = document.getElementById("auth-status");
    if (title) title.textContent = activeTab === "register" ? "Регистрация" : "Вход";
    if (submit) submit.textContent = activeTab === "register" ? "Создать аккаунт" : "Войти";
    if (nameWrap) nameWrap.hidden = activeTab !== "register";
    if (ageWrap) ageWrap.hidden = activeTab !== "register";
    if (ageInput) ageInput.required = activeTab === "register";
    if (status) {
      status.textContent = "";
      status.classList.remove("is-error");
    }
  }

  function openModal(tab) {
    ensureModal();
    setTab(tab || "login");
    document.getElementById("auth-backdrop").hidden = false;
    const email = document.getElementById("auth-email");
    if (email) setTimeout(() => email.focus(), 50);
  }

  function closeModal() {
    const backdrop = document.getElementById("auth-backdrop");
    if (backdrop) backdrop.hidden = true;
  }

  function setStatus(text, isError) {
    const status = document.getElementById("auth-status");
    if (!status) return;
    status.textContent = text;
    status.classList.toggle("is-error", Boolean(isError));
  }

  async function onSubmit(event) {
    event.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const name = document.getElementById("auth-name").value.trim();
    const ageRaw = document.getElementById("auth-age").value.trim();
    const submit = document.getElementById("auth-submit");
    submit.disabled = true;
    setStatus(activeTab === "register" ? "Создаём аккаунт…" : "Входим…");
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Введите корректный email.");
      }
      if (password.length < 6) throw new Error("Пароль должен быть не короче 6 символов.");
      let result;
      if (activeTab === "register") {
        const age = Number(ageRaw);
        if (!Number.isInteger(age) || age < 5 || age > 120) {
          throw new Error("Укажите возраст от 5 до 120 лет.");
        }
        result = await register(email, password, name, age);
      } else {
        result = await login(email, password);
      }
      setStatus(result.message || "Готово.", false);
      setTimeout(closeModal, 600);
    } catch (err) {
      setStatus(err.message || "Не удалось выполнить действие.", true);
    } finally {
      submit.disabled = false;
    }
  }

  function requireAuth() {
    if (isLoggedIn()) return Promise.resolve(currentUser);
    openModal("register");
    return Promise.reject(new Error("Нужна авторизация."));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  function renderHeader() {
    const nav = document.querySelector(".top-nav");
    if (!nav) return;
    let slot = document.getElementById("auth-slot");
    if (!slot) {
      slot = document.createElement("div");
      slot.id = "auth-slot";
      slot.className = "auth-slot";
      nav.appendChild(slot);
    }

    if (isLoggedIn()) {
      const label = currentUser.displayName || currentUser.email;
      const onProfile = /profile\.html$/i.test(location.pathname);
      slot.innerHTML = `
        <a class="auth-user ${onProfile ? "is-current" : ""}" href="profile.html" title="Профиль">${escapeHtml(label)}</a>`;
    } else {
      slot.innerHTML = `
        <button type="button" class="nav-pill" id="auth-login-btn">Войти</button>
        <button type="button" class="nav-pill" id="auth-register-btn">Регистрация</button>`;
      document.getElementById("auth-login-btn").onclick = () => openModal("login");
      document.getElementById("auth-register-btn").onclick = () => openModal("register");
    }
  }

  async function boot() {
    ensureModal();
    renderHeader();
    await refreshMe();
  }

  window.RifmaryAuth = {
    boot,
    onAuth,
    getUser,
    isLoggedIn,
    requireAuth,
    openLogin: () => openModal("login"),
    openRegister: () => openModal("register"),
    logout,
    refreshMe,
    api,
    getToken,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

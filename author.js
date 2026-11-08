(function () {
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || "";
  let lastPoems = [];
  let following = false;
  let authorData = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function yearsWord(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "год";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "года";
    return "лет";
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function meIsMod() {
    const me = window.RifmaryAuth && window.RifmaryAuth.getUser();
    return Boolean(me && (me.moderator || me.admin));
  }

  function meIsAdmin() {
    const me = window.RifmaryAuth && window.RifmaryAuth.getUser();
    return Boolean(me && me.admin);
  }

  function updateFollowBtn() {
    const btn = document.getElementById("follow-btn");
    if (!btn) return;
    btn.textContent = following ? "Отписаться" : "Подписаться";
    btn.classList.toggle("btn-ghost", following);
    btn.classList.toggle("btn-primary", !following);
  }

  function updateModUi() {
    const warnBtn = document.getElementById("warn-btn");
    const banBtn = document.getElementById("ban-btn");
    const unbanBtn = document.getElementById("unban-btn");
    const promoteBtn = document.getElementById("promote-btn");
    const demoteBtn = document.getElementById("demote-btn");
    const note = document.getElementById("author-mod-note");
    const me = window.RifmaryAuth && window.RifmaryAuth.getUser();
    const isSelf = me && authorData && me.uid === authorData.uid;
    const showMod = meIsMod() && authorData && !isSelf;
    const targetIsAdmin = Boolean(authorData && authorData.admin);
    const targetIsMod = Boolean(authorData && (authorData.moderator || authorData.admin));
    const canPunish = showMod && (!targetIsMod || (meIsAdmin() && !targetIsAdmin));

    warnBtn.hidden = !canPunish;
    banBtn.hidden = !canPunish || Boolean(authorData && authorData.banned);
    unbanBtn.hidden = !showMod || !(authorData && authorData.banned);
    promoteBtn.hidden = !meIsAdmin() || isSelf || !authorData || targetIsMod || Boolean(authorData.banned);
    demoteBtn.hidden = !meIsAdmin() || isSelf || !authorData || !targetIsMod || targetIsAdmin;

    if (!note) return;
    const roleBits = [];
    if (authorData && authorData.admin) roleBits.push("главный модератор");
    else if (authorData && authorData.moderator) roleBits.push("модератор");
    if (authorData && authorData.banned) {
      note.hidden = false;
      note.textContent =
        "Аккаунт заблокирован" + (authorData.banReason ? ": " + authorData.banReason : ".");
    } else if (authorData && authorData.warningsCount) {
      note.hidden = false;
      note.textContent =
        (roleBits.length ? roleBits.join(", ") + " · " : "") +
        "Предупреждений: " +
        authorData.warningsCount;
    } else if (roleBits.length) {
      note.hidden = false;
      note.textContent = roleBits.join(", ");
      note.style.color = "";
    } else {
      note.hidden = true;
      note.textContent = "";
    }
  }

  document.addEventListener("click", (event) => {
    const go = event.target.closest("[data-go]");
    if (go) window.location.href = go.getAttribute("data-go");
  });

  async function load() {
    const title = document.getElementById("author-title");
    const lede = document.getElementById("author-lede");
    const actions = document.getElementById("author-actions");
    if (!id) {
      title.textContent = "Автор не найден";
      lede.textContent = "В ссылке нет идентификатора.";
      return;
    }
    try {
      const headers = {};
      if (window.RifmaryAuth && window.RifmaryAuth.getToken()) {
        headers.Authorization = "Bearer " + window.RifmaryAuth.getToken();
      }
      const base = window.RIFMARY_API || "";
      const res = await fetch(base + "/api/authors/" + encodeURIComponent(id), { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не найден");

      const author = data.author || {};
      authorData = author;
      const stats = data.stats || {};
      const name = author.displayName || "Автор";
      const me = window.RifmaryAuth && window.RifmaryAuth.getUser();
      following = Boolean(data.following);
      title.textContent = name;
      lede.textContent = author.premium
        ? "Автор с Premium на Рифмарии."
        : "Публичный профиль автора.";

      if (actions) {
        const isSelf = me && me.uid === author.uid;
        actions.hidden = false;
        document.getElementById("follow-btn").hidden = Boolean(isSelf);
        updateFollowBtn();
        updateModUi();
      }

      document.getElementById("author-poems").textContent = String(stats.poemCount || 0);
      document.getElementById("author-rank").textContent = stats.rank ? "#" + stats.rank : "—";
      document.getElementById("author-votes").textContent =
        (stats.totalVotes || 0) + " голосов · среди " + (stats.authorsTotal || 0) + " авторов";
      document.getElementById("author-age").textContent =
        author.age != null ? author.age + " " + yearsWord(author.age) : "—";

      const list = document.getElementById("author-poem-list");
      lastPoems = Array.isArray(data.poems) ? data.poems : [];
      if (!lastPoems.length) {
        list.innerHTML = `<li class="board-empty">У автора пока нет стихов.</li>`;
        return;
      }
      list.innerHTML = lastPoems
        .map(
          (poem) => `<li>
            <div>
              <h3>${escapeHtml(poem.title || "Без названия")}</h3>
              <p class="poem-text-preview">${escapeHtml(String(poem.text || "").slice(0, 180))}${
            String(poem.text || "").length > 180 ? "…" : ""
          }</p>
            </div>
            <div class="author-poem-side">
              <span class="poem-votes">▲ ${poem.votes || 0}</span>
              <button type="button" class="btn-ghost" data-export-one="${escapeHtml(poem.id)}">.txt</button>
            </div>
          </li>`
        )
        .join("");
    } catch (err) {
      title.textContent = "Автор не найден";
      lede.textContent = err.message || "Не удалось загрузить профиль.";
    }
  }

  document.getElementById("follow-btn").addEventListener("click", async () => {
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) {
      window.RifmaryAuth && window.RifmaryAuth.openLogin();
      return;
    }
    try {
      if (following) {
        await window.RifmaryAuth.api("/api/follows/" + encodeURIComponent(id), { method: "DELETE" });
        following = false;
      } else {
        await window.RifmaryAuth.api("/api/follows/" + encodeURIComponent(id), {
          method: "POST",
          body: "{}",
        });
        following = true;
      }
      updateFollowBtn();
    } catch (err) {
      alert(err.message || "Не удалось изменить подписку.");
    }
  });

  document.getElementById("warn-btn").addEventListener("click", async () => {
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) return;
    const reason = window.prompt("Причина предупреждения:");
    if (!reason || reason.trim().length < 3) return;
    try {
      const data = await window.RifmaryAuth.api("/api/mod/warn/" + encodeURIComponent(id), {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      authorData = data.author || authorData;
      updateModUi();
      alert(data.message || "Предупреждение выдано.");
    } catch (err) {
      alert(err.message || "Не удалось выдать предупреждение.");
    }
  });

  document.getElementById("ban-btn").addEventListener("click", async () => {
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) return;
    const reason = window.prompt("Причина бана:");
    if (!reason || reason.trim().length < 3) return;
    if (!window.confirm("Забанить этого пользователя?")) return;
    try {
      const data = await window.RifmaryAuth.api("/api/mod/ban/" + encodeURIComponent(id), {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      authorData = data.author || authorData;
      updateModUi();
      alert(data.message || "Пользователь заблокирован.");
    } catch (err) {
      alert(err.message || "Не удалось забанить.");
    }
  });

  document.getElementById("unban-btn").addEventListener("click", async () => {
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) return;
    try {
      const data = await window.RifmaryAuth.api("/api/mod/unban/" + encodeURIComponent(id), {
        method: "POST",
        body: "{}",
      });
      authorData = data.author || authorData;
      updateModUi();
      alert(data.message || "Блокировка снята.");
    } catch (err) {
      alert(err.message || "Не удалось разбанить.");
    }
  });

  document.getElementById("promote-btn").addEventListener("click", async () => {
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) return;
    if (!window.confirm("Назначить этого пользователя модератором?")) return;
    try {
      const data = await window.RifmaryAuth.api("/api/mod/promote/" + encodeURIComponent(id), {
        method: "POST",
        body: "{}",
      });
      authorData = data.author || authorData;
      updateModUi();
      alert(data.message || "Модератор назначен.");
    } catch (err) {
      alert(err.message || "Не удалось назначить модератора.");
    }
  });

  document.getElementById("demote-btn").addEventListener("click", async () => {
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) return;
    if (!window.confirm("Снять модераторские права?")) return;
    try {
      const data = await window.RifmaryAuth.api("/api/mod/demote/" + encodeURIComponent(id), {
        method: "POST",
        body: "{}",
      });
      authorData = data.author || authorData;
      updateModUi();
      alert(data.message || "Права сняты.");
    } catch (err) {
      alert(err.message || "Не удалось снять модератора.");
    }
  });

  document.getElementById("export-author-poems").addEventListener("click", () => {
    if (!lastPoems.length) return;
    const text = lastPoems
      .map((p) => `${p.title || "Без названия"}\n${p.author || ""}\n\n${p.text || ""}\n\n---\n`)
      .join("\n");
    downloadText("rifmary-author.txt", text);
  });

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-export-one]");
    if (!btn) return;
    const poem = lastPoems.find((p) => p.id === btn.getAttribute("data-export-one"));
    if (!poem) return;
    const text = `${poem.title || "Без названия"}\n${poem.author || ""}\n\n${poem.text || ""}\n`;
    downloadText((poem.title || "stih").replace(/[\\/:*?"<>|]+/g, "_") + ".txt", text);
  });

  function boot() {
    if (window.RifmaryAuth && window.RifmaryAuth.onAuth) {
      window.RifmaryAuth.onAuth(() => load());
    } else {
      load();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 40));
  } else {
    setTimeout(boot, 40);
  }
})();

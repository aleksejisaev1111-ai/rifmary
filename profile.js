(function () {
  const guest = document.getElementById("profile-guest");
  const body = document.getElementById("profile-body");
  const title = document.getElementById("profile-title");
  const form = document.getElementById("profile-form");
  const nameInput = document.getElementById("profile-name");
  const statusEl = document.getElementById("profile-status");
  const poemsEl = document.getElementById("profile-poem-list");
  const favEl = document.getElementById("profile-fav-list");
  const saveBtn = document.getElementById("profile-save");
  const premiumStatus = document.getElementById("premium-status");
  const premiumBtn = document.getElementById("premium-btn");
  const publicLink = document.getElementById("public-profile-link");
  const exportFavBtn = document.getElementById("export-favorites");
  const exportPoemsBtn = document.getElementById("export-poems");
  let lastProfile = null;

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

  function renderStats(data) {
    lastProfile = data;
    const user = data.user || {};
    const stats = data.stats || {};
    const name = user.displayName || user.email || "Автор";

    title.textContent = name;
    nameInput.value = user.displayName || "";
    if (publicLink && user.uid) {
      publicLink.href = "author.html?id=" + encodeURIComponent(user.uid);
      publicLink.hidden = false;
    }

    document.getElementById("stat-poems").textContent = String(stats.poemCount || 0);

    const rankEl = document.getElementById("stat-rank");
    const votesEl = document.getElementById("stat-votes");
    if (stats.rank) {
      rankEl.textContent = "#" + stats.rank;
      votesEl.textContent =
        (stats.totalVotes || 0) +
        " голосов · среди " +
        (stats.authorsTotal || 0) +
        " авторов";
    } else {
      rankEl.textContent = "—";
      votesEl.textContent = "Пока нет места в рейтинге";
    }

    const ageEl = document.getElementById("stat-age");
    if (user.age != null) {
      ageEl.textContent = user.age + " " + yearsWord(user.age);
    } else {
      ageEl.textContent = "—";
    }

    if (user.premium) {
      const until = user.premiumUntil ? new Date(user.premiumUntil).toLocaleDateString("ru-RU") : "";
      premiumStatus.textContent = "Premium активен" + (until ? " до " + until : "") + ".";
      premiumBtn.hidden = true;
    } else {
      premiumStatus.textContent =
        "Бесплатно: до 20 избранных рифм и 4 строки в разборе текста. Premium снимает лимиты.";
      premiumBtn.hidden = false;
    }

    let warnBlock = document.getElementById("profile-warnings");
    if (!warnBlock) {
      warnBlock = document.createElement("div");
      warnBlock.id = "profile-warnings";
      warnBlock.className = "profile-warnings";
      const stats = document.querySelector(".profile-stats");
      if (stats && stats.parentNode) stats.parentNode.insertBefore(warnBlock, stats.nextSibling);
    }
    const warnings = Array.isArray(user.warnings) ? user.warnings : [];
    if (user.banned) {
      warnBlock.innerHTML = `<p class="mod-note">Аккаунт заблокирован${
        user.banReason ? ": " + escapeHtml(user.banReason) : "."
      }</p>`;
    } else if (warnings.length) {
      warnBlock.innerHTML =
        `<h2>Предупреждения (${warnings.length})</h2><ul class="profile-fav-list">` +
        warnings
          .map(
            (w) => `<li><div><h3>${escapeHtml(w.reason || "Предупреждение")}</h3>
              <p>${escapeHtml(w.byName || "модератор")} · ${new Date(w.at || Date.now()).toLocaleDateString("ru-RU")}</p></div></li>`
          )
          .join("") +
        `</ul>`;
    } else {
      warnBlock.innerHTML = "";
    }

    const favorites = Array.isArray(data.favorites) ? data.favorites : [];
    if (!favorites.length) {
      favEl.innerHTML = `<li class="board-empty">Пока пусто — сохраняйте рифмы звёздочкой на главной.</li>`;
    } else {
      favEl.innerHTML = favorites
        .map(
          (f) => `<li>
            <div>
              <h3>${escapeHtml(f.word)}</h3>
              <p>к «${escapeHtml(f.query || "")}» · ${escapeHtml(f.kind || "exact")}</p>
            </div>
            <button type="button" class="btn-ghost fav-remove" data-fav-del="${escapeHtml(f.id)}">Убрать</button>
          </li>`
        )
        .join("");
    }

    const poems = Array.isArray(data.poems) ? data.poems : [];
    if (!poems.length) {
      poemsEl.innerHTML = `<li class="board-empty">Вы ещё не публиковали стихи.</li>`;
      return;
    }

    poemsEl.innerHTML = poems
      .map(
        (poem) => `
        <li>
          <div>
            <h3>${escapeHtml(poem.title || "Без названия")}</h3>
            <p>${escapeHtml(poem.author || name)}</p>
          </div>
          <span class="poem-votes">▲ ${poem.votes || 0}</span>
        </li>`
      )
      .join("");
  }

  async function loadProfile() {
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) {
      guest.hidden = false;
      body.hidden = true;
      title.textContent = "Профиль";
      return;
    }

    guest.hidden = true;
    body.hidden = false;
    try {
      const data = await window.RifmaryAuth.api("/api/profile");
      renderStats(data);
    } catch (err) {
      setStatus(err.message || "Не удалось загрузить профиль.", true);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) return;

    const displayName = nameInput.value.trim();
    saveBtn.disabled = true;
    setStatus("Сохраняем…");

    try {
      const data = await window.RifmaryAuth.api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
      });
      if (window.RifmaryAuth && window.RifmaryAuth.refreshMe) {
        await window.RifmaryAuth.refreshMe();
      }
      renderStats(data);
      setStatus(data.message || "Сохранено.");
    } catch (err) {
      setStatus(err.message || "Не удалось сохранить.", true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  if (exportFavBtn) {
    exportFavBtn.addEventListener("click", () => {
      const favorites = (lastProfile && lastProfile.favorites) || [];
      if (!favorites.length) return setStatus("Нечего экспортировать.", true);
      const text = favorites
        .map((f) => `${f.word} ← ${f.query || ""} (${f.kind || "exact"})`)
        .join("\n");
      downloadText("rifmary-favorites.txt", text + "\n");
      setStatus("Избранное скачано.");
    });
  }

  if (exportPoemsBtn) {
    exportPoemsBtn.addEventListener("click", () => {
      const poems = (lastProfile && lastProfile.poems) || [];
      if (!poems.length) return setStatus("Нечего экспортировать.", true);
      // need full text - fetch from board cache is partial. Profile poems don't include text.
      // Re-fetch via author endpoint if uid available.
      const user = lastProfile && lastProfile.user;
      if (!user || !user.uid) return setStatus("Не удалось экспортировать.", true);
      window.RifmaryAuth
        .api("/api/authors/" + encodeURIComponent(user.uid))
        .then((data) => {
          const list = data.poems || [];
          if (!list.length) return setStatus("Нечего экспортировать.", true);
          const text = list
            .map(
              (p) =>
                `${p.title || "Без названия"}\n${p.author || ""}\n\n${p.text || ""}\n\n---\n`
            )
            .join("\n");
          downloadText("rifmary-poems.txt", text);
          setStatus("Стихи скачаны.");
        })
        .catch((err) => setStatus(err.message || "Не удалось экспортировать.", true));
    });
  }

  premiumBtn.addEventListener("click", async () => {
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) return;
    premiumBtn.disabled = true;
    try {
      const data = await window.RifmaryAuth.api("/api/premium/demo", { method: "POST", body: "{}" });
      if (window.RifmaryAuth.refreshMe) await window.RifmaryAuth.refreshMe();
      setStatus(data.message || "Premium активирован.");
      await loadProfile();
    } catch (err) {
      setStatus(err.message || "Не удалось активировать Premium.", true);
    } finally {
      premiumBtn.disabled = false;
    }
  });

  document.addEventListener("click", async (event) => {
    const go = event.target.closest("[data-go]");
    if (go) {
      window.location.href = go.getAttribute("data-go");
      return;
    }

    const del = event.target.closest("[data-fav-del]");
    if (del) {
      try {
        const data = await window.RifmaryAuth.api(
          "/api/favorites/" + encodeURIComponent(del.getAttribute("data-fav-del")),
          { method: "DELETE" }
        );
        const profile = await window.RifmaryAuth.api("/api/profile");
        profile.favorites = data.favorites;
        renderStats(profile);
      } catch (err) {
        setStatus(err.message || "Не удалось удалить.", true);
      }
    }
  });

  document.getElementById("profile-login").addEventListener("click", () => {
    window.RifmaryAuth && window.RifmaryAuth.openLogin();
  });
  document.getElementById("profile-register").addEventListener("click", () => {
    window.RifmaryAuth && window.RifmaryAuth.openRegister();
  });
  document.getElementById("profile-logout").addEventListener("click", async () => {
    if (!window.RifmaryAuth) return;
    await window.RifmaryAuth.logout();
    setStatus("");
    loadProfile();
  });

  function boot() {
    if (!window.RifmaryAuth) {
      loadProfile();
      return;
    }
    window.RifmaryAuth.onAuth(() => {
      loadProfile();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 40));
  } else {
    setTimeout(boot, 40);
  }
})();

(function () {
  const VOTES_KEY = "rifmary-arena-votes-v1";
  const MAX_WORDS = 5000;

  const form = document.getElementById("poem-form");
  const authorInput = document.getElementById("author-input");
  const titleInput = document.getElementById("title-input");
  const poemInput = document.getElementById("poem-input");
  const agreeInput = document.getElementById("agree-rules");
  const charCount = document.getElementById("char-count");
  const formStatus = document.getElementById("form-status");
  const board = document.getElementById("poem-board");
  const feedBoard = document.getElementById("feed-board");
  const arenaMeta = document.getElementById("arena-meta");
  const themeEl = document.getElementById("contest-theme");
  const seasonsEl = document.getElementById("seasons-archive");
  const searchForm = document.getElementById("arena-search");
  const searchInput = document.getElementById("arena-search-input");

  let sortMode = "votes";
  let poemsCache = [];
  let feedCache = [];
  let seasonsCache = [];
  let currentSeason = null;
  let activeSeasonFilter = "";
  let searchQuery = "";
  let openComments = {};

  function loadVotes() {
    try {
      return JSON.parse(localStorage.getItem(VOTES_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveVotes(votes) {
    localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sortedPoems(poems) {
    const list = poems.slice();
    if (sortMode === "new") {
      list.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      list.sort((a, b) => b.votes - a.votes || b.createdAt - a.createdAt);
    }
    return list;
  }

  function plural(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "а";
    return "ов";
  }

  function setStatus(message, isError) {
    formStatus.textContent = message;
    formStatus.classList.toggle("is-error", Boolean(isError));
  }

  function countWords(value) {
    return String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  function seasonTitle(id) {
    const hit = seasonsCache.find((s) => s.id === id);
    return hit ? hit.title : "";
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

  function isPremiumUser() {
    const user = window.RifmaryAuth && window.RifmaryAuth.getUser();
    return Boolean(user && user.premium);
  }

  function canModerate() {
    const user = window.RifmaryAuth && window.RifmaryAuth.getUser();
    return Boolean(user && (user.moderator || user.premium));
  }

  function renderSeasons() {
    if (!seasonsEl) return;
    if (!seasonsCache.length) {
      seasonsEl.innerHTML = `<p class="muted">Архив тем пока пуст.</p>`;
      return;
    }
    seasonsEl.innerHTML = seasonsCache
      .map((s) => {
        const active = s.active ? "is-active" : "";
        const selected =
          (activeSeasonFilter || (currentSeason && currentSeason.id)) === s.id ? "is-selected" : "";
        return `<button type="button" class="season-chip ${active} ${selected}" data-season="${escapeHtml(s.id)}">
          <strong>${escapeHtml(s.title)}</strong>
          <span>${s.active ? "сейчас" : "архив"} · ${s.poemCount || 0} стих${plural(s.poemCount || 0)}</span>
        </button>`;
      })
      .join("");
  }

  function renderComments(poem) {
    const comments = Array.isArray(poem.comments) ? poem.comments : [];
    const open = openComments[poem.id];
    if (!open) {
      return `<button type="button" class="comment-toggle" data-comments="${escapeHtml(poem.id)}">Комментарии (${comments.length})</button>`;
    }
    const list = comments.length
      ? comments
          .map(
            (c) => `<li class="comment-item">
              <strong>${escapeHtml(c.author || "Автор")}</strong>
              <p>${escapeHtml(c.text)}</p>
            </li>`
          )
          .join("")
      : `<li class="comment-item muted">Пока нет комментариев.</li>`;
    return `
      <div class="comments-box">
        <button type="button" class="comment-toggle" data-comments="${escapeHtml(poem.id)}">Скрыть комментарии</button>
        <ul class="comment-list">${list}</ul>
        <form class="comment-form" data-comment-form="${escapeHtml(poem.id)}">
          <input type="text" maxlength="500" placeholder="Ваш комментарий…" required />
          <button type="submit">Отправить</button>
        </form>
      </div>`;
  }

  function poemActions(poem) {
    const hideBtn = canModerate()
      ? `<button type="button" class="mod-btn" data-hide="${escapeHtml(poem.id)}">Скрыть</button>`
      : "";
    return `<div class="poem-tools">
      <button type="button" class="mod-btn" data-export="${escapeHtml(poem.id)}">.txt</button>
      <button type="button" class="mod-btn" data-report="${escapeHtml(poem.id)}">Жалоба</button>
      ${hideBtn}
    </div>`;
  }

  function renderPoemRow(poem, index, ranked) {
    const votes = loadVotes();
    const rank = ranked ? index + 1 : "·";
    const voted = Boolean(votes[poem.id]);
    const title = poem.title && poem.title.trim() ? poem.title.trim() : "Без названия";
    const authorLink = poem.userId
      ? `<a class="poem-author" href="author.html?id=${encodeURIComponent(poem.userId)}">${escapeHtml(poem.author)}</a>`
      : `<p class="poem-author">${escapeHtml(poem.author)}</p>`;
    const seasonNote = poem.seasonId
      ? `<p class="poem-season">${escapeHtml(seasonTitle(poem.seasonId) || "")}</p>`
      : "";
    return `
      <li class="poem-row" data-id="${escapeHtml(poem.id)}">
        <div class="poem-rank ${ranked && rank <= 3 ? "is-top" : ""}">${rank}</div>
        <div class="poem-body">
          <h3>${escapeHtml(title)}</h3>
          ${authorLink}
          ${seasonNote}
          <p class="poem-text">${escapeHtml(poem.text)}</p>
          ${poemActions(poem)}
          ${renderComments(poem)}
        </div>
        <div class="poem-vote">
          <button
            type="button"
            class="vote-btn ${voted ? "is-voted" : ""}"
            data-vote="${escapeHtml(poem.id)}"
            ${voted ? "disabled" : ""}
            aria-label="Голос за стих"
          >${voted ? "✓" : "▲"}</button>
          <span class="vote-count">${poem.votes || 0}</span>
        </div>
      </li>`;
  }

  function render() {
    const list = sortedPoems(poemsCache);
    const themeName = (currentSeason && currentSeason.title) || "Без темы";
    const searchNote = searchQuery ? ` · поиск «${searchQuery}»` : "";
    arenaMeta.textContent = `${list.length} стих${plural(list.length)} в теме «${themeName}»${searchNote}`;

    if (!list.length) {
      board.innerHTML = `<li class="board-empty">${
        searchQuery ? "Ничего не найдено по запросу." : "Пока пусто — ваш стих может стать первым."
      }</li>`;
    } else {
      board.innerHTML = list.map((poem, index) => renderPoemRow(poem, index, true)).join("");
    }

    if (feedBoard) {
      if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) {
        feedBoard.innerHTML = `<li class="board-empty">Войдите, чтобы видеть ленту подписок.</li>`;
      } else if (!feedCache.length) {
        feedBoard.innerHTML = `<li class="board-empty">Подпишитесь на авторов — их новые стихи появятся здесь.</li>`;
      } else {
        feedBoard.innerHTML = feedCache
          .map((poem, index) => renderPoemRow(poem, index, false))
          .join("");
      }
    }
  }

  async function refreshSeasons() {
    if (!window.RifmaryAuth || !window.RifmaryAuth.api) return;
    const data = await window.RifmaryAuth.api("/api/seasons");
    seasonsCache = Array.isArray(data.seasons) ? data.seasons : [];
    currentSeason = data.current || null;
    if (themeEl && currentSeason) themeEl.textContent = currentSeason.title;
    if (!activeSeasonFilter && currentSeason) activeSeasonFilter = currentSeason.id;
    renderSeasons();
  }

  async function refreshPoems() {
    try {
      if (!window.RifmaryAuth || !window.RifmaryAuth.api) {
        poemsCache = [];
        render();
        return;
      }
      const params = new URLSearchParams();
      if (activeSeasonFilter) params.set("season", activeSeasonFilter);
      if (searchQuery) params.set("q", searchQuery);
      const qs = params.toString() ? "?" + params.toString() : "";
      const data = await window.RifmaryAuth.api("/api/poems" + qs);
      poemsCache = Array.isArray(data.poems) ? data.poems : [];
      if (data.season) currentSeason = data.season;
      render();
    } catch (err) {
      arenaMeta.textContent = "Не удалось загрузить рейтинг. Проверьте, что сервер запущен.";
      poemsCache = [];
      render();
    }
  }

  async function refreshFeed() {
    feedCache = [];
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) {
      render();
      return;
    }
    try {
      const data = await window.RifmaryAuth.api("/api/feed");
      feedCache = Array.isArray(data.poems) ? data.poems : [];
    } catch (_) {
      feedCache = [];
    }
    render();
  }

  poemInput.addEventListener("input", () => {
    charCount.textContent = String(countWords(poemInput.value));
  });

  if (searchForm) {
    searchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      searchQuery = (searchInput.value || "").trim();
      await refreshPoems();
    });
  }

  async function publishPoem() {
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) {
      setStatus("Чтобы опубликовать стих, войдите или зарегистрируйтесь по email.", true);
      window.RifmaryAuth && window.RifmaryAuth.openRegister();
      return;
    }

    const user = window.RifmaryAuth.getUser();
    const author = authorInput.value.trim() || user.displayName || user.email;
    const title = titleInput.value.trim();
    const text = poemInput.value.trim();
    const words = countWords(text);

    if (author.length < 2) return setStatus("Укажите псевдоним минимум из двух букв.", true);
    if (title.length < 2) return setStatus("Укажите название стиха.", true);
    if (words < 3) return setStatus("Стих слишком короткий — напишите хотя бы несколько слов.", true);
    if (words > MAX_WORDS) return setStatus(`Слишком длинно: максимум ${MAX_WORDS} слов.`, true);
    if (!agreeInput || !agreeInput.checked) {
      return setStatus("Чтобы опубликовать, нужно принять правила публикации.", true);
    }

    try {
      setStatus("Публикуем…");
      await window.RifmaryAuth.api("/api/poems", {
        method: "POST",
        body: JSON.stringify({ author, title, text, agreedToRules: true }),
      });
      form.reset();
      charCount.textContent = "0";
      if (agreeInput) agreeInput.checked = false;
      if (user) authorInput.value = user.displayName || user.email.split("@")[0];
      setStatus("Стих опубликован. Удачи в рейтинге!");
      sortMode = "new";
      document.querySelectorAll(".filter-btn").forEach((btn) => {
        btn.classList.toggle("is-active", btn.getAttribute("data-sort") === "new");
      });
      await refreshSeasons();
      await refreshPoems();
      document.getElementById("board").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setStatus(err.message || "Не удалось опубликовать.", true);
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    publishPoem();
  });

  document.addEventListener("submit", async (event) => {
    const commentForm = event.target.closest("[data-comment-form]");
    if (!commentForm) return;
    event.preventDefault();
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) {
      window.RifmaryAuth && window.RifmaryAuth.openLogin();
      return;
    }
    const id = commentForm.getAttribute("data-comment-form");
    const input = commentForm.querySelector("input");
    const text = input.value.trim();
    try {
      await window.RifmaryAuth.api("/api/poems/" + encodeURIComponent(id) + "/comments", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      openComments[id] = true;
      input.value = "";
      await refreshPoems();
      await refreshFeed();
    } catch (err) {
      setStatus(err.message || "Не удалось отправить комментарий.", true);
    }
  });

  document.addEventListener("click", async (event) => {
    const go = event.target.closest("[data-go]");
    if (go) {
      window.location.href = go.getAttribute("data-go");
      return;
    }

    const exportBtn = event.target.closest("[data-export]");
    if (exportBtn) {
      const id = exportBtn.getAttribute("data-export");
      const poem = poemsCache.find((p) => p.id === id) || feedCache.find((p) => p.id === id);
      if (!poem) return;
      const text = `${poem.title || "Без названия"}\n${poem.author || ""}\n\n${poem.text || ""}\n`;
      downloadText((poem.title || "stih").replace(/[\\/:*?"<>|]+/g, "_") + ".txt", text);
      return;
    }

    const reportBtn = event.target.closest("[data-report]");
    if (reportBtn) {
      if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) {
        window.RifmaryAuth && window.RifmaryAuth.openLogin();
        return;
      }
      const id = reportBtn.getAttribute("data-report");
      const reason = window.prompt("Коротко: почему жалоба? (необязательно)") || "";
      try {
        const data = await window.RifmaryAuth.api("/api/poems/" + encodeURIComponent(id) + "/report", {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        setStatus(data.message || "Жалоба принята.");
        await refreshPoems();
        await refreshFeed();
      } catch (err) {
        setStatus(err.message || "Не удалось отправить жалобу.", true);
      }
      return;
    }

    const hideBtn = event.target.closest("[data-hide]");
    if (hideBtn) {
      if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) {
        window.RifmaryAuth && window.RifmaryAuth.openLogin();
        return;
      }
      const id = hideBtn.getAttribute("data-hide");
      try {
        const data = await window.RifmaryAuth.api("/api/poems/" + encodeURIComponent(id) + "/hide", {
          method: "POST",
          body: "{}",
        });
        setStatus(data.message || "Стих скрыт.");
        await refreshPoems();
        await refreshFeed();
      } catch (err) {
        setStatus(err.message || "Не удалось скрыть.", true);
      }
      return;
    }

    const seasonBtn = event.target.closest("[data-season]");
    if (seasonBtn) {
      activeSeasonFilter = seasonBtn.getAttribute("data-season");
      renderSeasons();
      await refreshPoems();
      return;
    }

    const commentsBtn = event.target.closest("[data-comments]");
    if (commentsBtn) {
      const id = commentsBtn.getAttribute("data-comments");
      openComments[id] = !openComments[id];
      render();
      return;
    }

    const filter = event.target.closest(".filter-btn");
    if (filter) {
      sortMode = filter.getAttribute("data-sort") || "votes";
      document.querySelectorAll(".filter-btn").forEach((btn) => {
        btn.classList.toggle("is-active", btn === filter);
      });
      render();
      return;
    }

    const voteBtn = event.target.closest("[data-vote]");
    if (!voteBtn || voteBtn.disabled) return;

    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) {
      window.RifmaryAuth && window.RifmaryAuth.openLogin();
      return;
    }

    const id = voteBtn.getAttribute("data-vote");
    const votes = loadVotes();
    if (votes[id]) return;

    try {
      await window.RifmaryAuth.api("/api/poems/" + encodeURIComponent(id) + "/vote", {
        method: "POST",
        body: "{}",
      });
      votes[id] = true;
      saveVotes(votes);
      await refreshPoems();
      await refreshFeed();
    } catch (err) {
      setStatus(err.message || "Не удалось проголосовать.", true);
    }
  });

  function bootContest() {
    if (window.RifmaryAuth) {
      window.RifmaryAuth.onAuth((user) => {
        if (user && !authorInput.value.trim()) {
          authorInput.value = user.displayName || user.email.split("@")[0];
        }
        refreshFeed();
      });
    }
    refreshSeasons()
      .then(refreshPoems)
      .then(refreshFeed)
      .catch(() => refreshPoems());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(bootContest, 50));
  } else {
    setTimeout(bootContest, 50);
  }
})();

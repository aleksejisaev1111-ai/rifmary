(function () {
  const form = document.getElementById("rhyme-form");
  const input = document.getElementById("word-input");
  const button = document.getElementById("search-btn");
  const results = document.getElementById("results");
  const textForm = document.getElementById("text-rhyme-form");
  const textInput = document.getElementById("text-rhyme-input");
  const textOut = document.getElementById("text-rhyme-results");
  const textMeta = document.getElementById("text-rhyme-meta");

  const LABELS = {
    rich: {
      title: "Богатые",
      hint: "Глубокое совпадение: предударная гласная и хвост",
      badge: "rich",
    },
    exact: {
      title: "Точные",
      hint: "Строгое совпадение рифменного хвоста, без слабых окончаний",
      badge: "exact",
    },
    asson: {
      title: "Ассонансные",
      hint: "Те же гласные и опорная согласная — только сильные созвучия",
      badge: "asson",
    },
  };

  const FREE_TEXT_LINES = 4;
  let ready = false;
  let busy = false;
  let lastQuery = "";
  let favoriteSet = new Set();

  function isPremium() {
    const user = window.RifmaryAuth && window.RifmaryAuth.getUser();
    return Boolean(user && user.premium);
  }

  function favKey(word, query) {
    return String(query || "").toLowerCase() + "::" + String(word || "").toLowerCase();
  }

  async function loadFavorites() {
    favoriteSet = new Set();
    if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) return;
    try {
      const data = await window.RifmaryAuth.api("/api/favorites");
      (data.favorites || []).forEach((f) => favoriteSet.add(favKey(f.word, f.query)));
    } catch (_) {}
  }

  function renderChips(words, kind) {
    if (!words.length) {
      return `<p class="empty-state">В этом разделе пока пусто — попробуйте другое слово.</p>`;
    }
    return `<div class="chips">${words
      .map((w) => {
        const saved = favoriteSet.has(favKey(w, lastQuery));
        return `<span class="chip-wrap">
          <button type="button" class="chip" data-example="${escapeAttr(w)}">${escapeHtml(w)}</button>
          <button type="button" class="fav-btn ${saved ? "is-on" : ""}" data-fav="${escapeAttr(w)}" data-kind="${kind}" aria-label="В избранное">${saved ? "★" : "☆"}</button>
        </span>`;
      })
      .join("")}</div>`;
  }

  function renderGroup(kind, words) {
    const meta = LABELS[kind];
    return `
      <article class="rhyme-group">
        <h3><span class="badge ${meta.badge}" aria-hidden="true"></span>${meta.title}</h3>
        <p class="hint">${meta.hint}</p>
        ${renderChips(words, kind)}
      </article>
    `;
  }

  function showResults(data) {
    results.hidden = false;
    lastQuery = data.query || "";

    if (data.error) {
      results.innerHTML = `
        <div class="results-head">
          <h2>Рифмы к слову «${escapeHtml(data.query)}»</h2>
          <p>${escapeHtml(data.error)}</p>
        </div>
        <div class="empty-state">${escapeHtml(data.error)}</div>`;
      results.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const total = data.total;
    const meta =
      total > 0
        ? `Найдено ${total} созвуч${plural(total, "ие", "ия", "ий")} в поэтическом словаре`
        : "Точных совпадений нет — попробуйте более частое слово";

    const body = !total
      ? `<div class="empty-state">К «${escapeHtml(data.query)}» в словаре пока мало пар.</div>`
      : `<div class="results-grid">${[
          renderGroup("rich", data.rich),
          renderGroup("exact", data.exact),
          renderGroup("asson", data.asson),
        ].join("")}</div>`;

    results.innerHTML = `
      <div class="results-head">
        <h2>Рифмы к слову «${escapeHtml(data.query)}»</h2>
        <p>${meta}. Нажмите ☆, чтобы сохранить в избранное.</p>
      </div>
      ${body}`;

    results.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function search(word) {
    if (!ready || busy) return;
    const cleaned = String(word || "").trim();
    if (!cleaned) return;
    if (!window.RhymeEngine) {
      showResults({ query: cleaned, error: "Словарь ещё загружается, подождите секунду." });
      return;
    }

    busy = true;
    button.disabled = true;
    button.textContent = "Ищу…";
    input.value = cleaned;

    setTimeout(() => {
      try {
        const data = window.RhymeEngine.findRhymes(cleaned, window.RHYME_DICTIONARY);
        showResults(data);
      } catch (err) {
        showResults({ query: cleaned, error: "Не удалось подобрать рифмы. Попробуйте ещё раз." });
      } finally {
        busy = false;
        button.disabled = false;
        button.textContent = "Подобрать";
      }
    }, 20);
  }

  function renderTextAnalysis(rows, limited) {
    if (!textOut) return;
    textOut.hidden = false;
    if (!rows.length) {
      textOut.innerHTML = `<div class="empty-state">Вставьте хотя бы одну строку.</div>`;
      return;
    }
    textOut.innerHTML =
      (limited
        ? `<p class="text-limit-note">Бесплатно разбираем до ${FREE_TEXT_LINES} строк. <a href="profile.html">Premium</a> снимает лимит.</p>`
        : "") +
      `<div class="text-rhyme-list">${rows
        .map((row) => {
          const weakBadge = row.weak
            ? `<span class="line-flag is-weak">слабый хвост</span>`
            : `<span class="line-flag is-ok">ок</span>`;
          const suggestions = (row.suggestions || [])
            .map((w) => `<button type="button" class="chip" data-example="${escapeAttr(w)}">${escapeHtml(w)}</button>`)
            .join("");
          return `<article class="text-rhyme-row ${row.weak ? "is-weak" : ""}">
            <header>
              <strong>${escapeHtml(row.word || "—")}</strong>
              ${weakBadge}
            </header>
            <p class="text-line">${escapeHtml(row.line)}</p>
            ${
              row.error
                ? `<p class="hint">${escapeHtml(row.error)}</p>`
                : `<div class="chips">${suggestions || "<span class='hint'>Мало вариантов</span>"}</div>`
            }
          </article>`;
        })
        .join("")}</div>`;
  }

  function analyzeText() {
    if (!textInput || !window.RhymeEngine || !ready) return;
    const raw = textInput.value;
    const allLines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const premium = isPremium();
    const limited = !premium && allLines.length > FREE_TEXT_LINES;
    const rows = window.RhymeEngine.analyzeLines(raw, window.RHYME_DICTIONARY, {
      limit: premium ? 80 : FREE_TEXT_LINES,
    });
    if (textMeta) {
      textMeta.textContent = premium
        ? `Разобрано ${rows.length} строк.`
        : `Разобрано ${rows.length} из ${allLines.length || 0} строк (лимит ${FREE_TEXT_LINES}).`;
    }
    renderTextAnalysis(rows, limited);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    search(input.value);
  });

  if (textForm) {
    textForm.addEventListener("submit", (event) => {
      event.preventDefault();
      analyzeText();
    });
  }

  document.addEventListener("click", async (event) => {
    const go = event.target.closest("[data-go]");
    if (go) {
      window.location.href = go.getAttribute("data-go");
      return;
    }

    const favBtn = event.target.closest("[data-fav]");
    if (favBtn) {
      if (!window.RifmaryAuth || !window.RifmaryAuth.isLoggedIn()) {
        window.RifmaryAuth && window.RifmaryAuth.openRegister();
        return;
      }
      const word = favBtn.getAttribute("data-fav");
      const kind = favBtn.getAttribute("data-kind") || "exact";
      try {
        await window.RifmaryAuth.api("/api/favorites", {
          method: "POST",
          body: JSON.stringify({ word, query: lastQuery, kind }),
        });
        favoriteSet.add(favKey(word, lastQuery));
        favBtn.classList.add("is-on");
        favBtn.textContent = "★";
      } catch (err) {
        alert(err.message || "Не удалось сохранить.");
      }
      return;
    }

    const chip = event.target.closest("[data-example]");
    if (chip) search(chip.getAttribute("data-example"));
  });

  function markReady(size) {
    ready = true;
    button.disabled = false;
    button.textContent = "Подобрать";
    const meta = document.getElementById("dict-meta");
    if (meta) {
      meta.textContent = `В словаре ${size.toLocaleString("ru-RU")} слов. Для редких слов рифмы могут быть приблизительными.`;
    }
  }

  window.addEventListener("load", () => {
    input.focus();
    const meta = document.getElementById("dict-meta");
    if (meta) meta.textContent = "Индексация словаря…";

    if (window.RifmaryAuth) {
      window.RifmaryAuth.onAuth(() => {
        loadFavorites();
      });
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        if (!window.RhymeEngine) {
          if (meta) meta.textContent = "Словарь не загрузился. Обновите страницу.";
          button.textContent = "Ошибка";
          return;
        }
        const size = window.RhymeEngine.dictionarySize();
        markReady(size);
      }, 40);
    });
  });
})();

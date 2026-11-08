const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const POEMS_FILE = path.join(DATA_DIR, "poems.json");
const FAVORITES_FILE = path.join(DATA_DIR, "favorites.json");
const SEASONS_FILE = path.join(DATA_DIR, "seasons.json");
const FOLLOWS_FILE = path.join(DATA_DIR, "follows.json");
const SUPPORT_FILE = path.join(DATA_DIR, "support.json");
const SUGGESTIONS_FILE = path.join(DATA_DIR, "suggestions.json");
const PORT = process.env.PORT || 8787;

const FREE_FAVORITES_LIMIT = 20;
const REPORT_HIDE_THRESHOLD = 3;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function makeId(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex");
}

function ensureSeasons() {
  let seasons = readJson(SEASONS_FILE, null);
  if (Array.isArray(seasons) && seasons.length) return seasons;
  const now = Date.now();
  seasons = [
    {
      id: "s-night",
      title: "Ночь и тишина",
      blurb: "Тихие образы, полумрак, пауза между словами.",
      startAt: now - 7 * 24 * 3600 * 1000,
      endAt: null,
      active: true,
    },
    {
      id: "s-rain",
      title: "Весенний дождь",
      blurb: "Вода, окна, город после ливня.",
      startAt: now - 45 * 24 * 3600 * 1000,
      endAt: now - 7 * 24 * 3600 * 1000,
      active: false,
    },
    {
      id: "s-road",
      title: "Дорога и встреча",
      blurb: "Путь, ожидание, чужие и свои лица.",
      startAt: now - 90 * 24 * 3600 * 1000,
      endAt: now - 45 * 24 * 3600 * 1000,
      active: false,
    },
  ];
  writeJson(SEASONS_FILE, seasons);
  return seasons;
}

function activeSeason() {
  const seasons = ensureSeasons();
  return seasons.find((s) => s.active) || seasons[0] || null;
}

function isPremium(user) {
  return Boolean(user && user.premiumUntil && Number(user.premiumUntil) > Date.now());
}

function isBanned(user) {
  return Boolean(user && user.banned);
}

function warningList(user) {
  return Array.isArray(user && user.warnings) ? user.warnings : [];
}

function publicUser(user) {
  return {
    uid: user.id,
    email: user.email,
    displayName: user.displayName || "",
    age: Number.isFinite(Number(user.age)) ? Number(user.age) : null,
    createdAt: user.createdAt || null,
    premium: isPremium(user),
    premiumUntil: user.premiumUntil || null,
    moderator: Boolean(user.moderator || user.admin),
    admin: Boolean(user.admin),
    banned: isBanned(user),
    banReason: user.banReason || "",
    warnings: warningList(user),
    warningsCount: warningList(user).length,
    provider: "server",
  };
}

function publicAuthor(user) {
  return {
    uid: user.id,
    displayName: user.displayName || "",
    age: Number.isFinite(Number(user.age)) ? Number(user.age) : null,
    createdAt: user.createdAt || null,
    premium: isPremium(user),
    moderator: Boolean(user.moderator || user.admin),
    admin: Boolean(user.admin),
    banned: isBanned(user),
    banReason: user.banReason || "",
    warningsCount: warningList(user).length,
  };
}

function requireModerator(auth) {
  if (!auth || !(auth.user.moderator || auth.user.admin)) {
    return "Только модератор может это сделать.";
  }
  return null;
}

function requireAdmin(auth) {
  if (!auth || !auth.user.admin) {
    return "Только главный модератор может это сделать.";
  }
  return null;
}

function requireActiveUser(auth) {
  if (!auth) return "Не авторизован.";
  if (isBanned(auth.user)) {
    return "Аккаунт заблокирован" + (auth.user.banReason ? ": " + auth.user.banReason : ".");
  }
  return null;
}

function visiblePoems(poems) {
  return (poems || []).filter((p) => !p.hidden);
}

function buildAuthorStats() {
  const poems = visiblePoems(readJson(POEMS_FILE, []));
  const byUser = new Map();

  for (const poem of poems) {
    const key = poem.userId || poem.email || poem.author;
    if (!key) continue;
    if (!byUser.has(key)) {
      byUser.set(key, { poemCount: 0, votes: 0, userId: poem.userId || null });
    }
    const row = byUser.get(key);
    row.poemCount += 1;
    row.votes += Number(poem.votes || 0);
  }

  const ranked = Array.from(byUser.entries())
    .map(([key, stats]) => ({ key, ...stats }))
    .sort((a, b) => b.votes - a.votes || b.poemCount - a.poemCount);

  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });

  return { poems, ranked };
}

function profilePayload(user, extras) {
  const { ranked } = buildAuthorStats();
  const allPoems = readJson(POEMS_FILE, []);
  const mine = allPoems.filter((p) => p.userId === user.id || p.email === user.email);
  const totalVotes = mine.reduce((sum, p) => sum + Number(p.votes || 0), 0);
  const rankRow =
    ranked.find((r) => r.userId === user.id) ||
    ranked.find((r) => r.key === user.id || r.key === user.email);
  const favorites = readJson(FAVORITES_FILE, {});
  const favList = Array.isArray(favorites[user.id]) ? favorites[user.id] : [];

  return Object.assign(
    {
      user: publicUser(user),
      stats: {
        poemCount: mine.length,
        totalVotes,
        rank: rankRow ? rankRow.rank : null,
        authorsTotal: ranked.length,
        favoritesCount: favList.length,
      },
      poems: mine
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((p) => ({
          id: p.id,
          title: p.title,
          author: p.author,
          votes: Number(p.votes || 0),
          createdAt: p.createdAt,
          seasonId: p.seasonId || null,
        })),
      favorites: favList,
    },
    extras || {}
  );
}

function getUserFromReq(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const sessions = readJson(SESSIONS_FILE, {});
  const userId = sessions[token];
  if (!userId) return null;
  const users = readJson(USERS_FILE, {});
  const user = users[userId];
  if (!user) return null;
  return { token, user };
}

function mapPoem(poem) {
  const reports = Array.isArray(poem.reports) ? poem.reports : [];
  return {
    id: poem.id,
    author: poem.author,
    title: poem.title,
    text: poem.text,
    votes: Number(poem.votes || 0),
    createdAt: poem.createdAt,
    userId: poem.userId || null,
    seasonId: poem.seasonId || null,
    comments: Array.isArray(poem.comments) ? poem.comments : [],
    hidden: Boolean(poem.hidden),
    reportCount: reports.length,
  };
}

function getFollowList(userId) {
  const follows = readJson(FOLLOWS_FILE, {});
  return Array.isArray(follows[userId]) ? follows[userId] : [];
}

ensureSeasons();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "rifmary-auth" });
});

app.post("/api/register", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const displayName = String(req.body.displayName || "").trim();
  const age = Number(req.body.age);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Введите корректный email." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Пароль должен быть не короче 6 символов." });
  }
  if (!Number.isInteger(age) || age < 5 || age > 120) {
    return res.status(400).json({ error: "Укажите возраст от 5 до 120 лет." });
  }

  const users = readJson(USERS_FILE, {});
  const exists = Object.values(users).find((u) => u.email === email);
  if (exists) return res.status(409).json({ error: "Этот email уже зарегистрирован." });

  const id = makeId("u");
  const salt = crypto.randomBytes(16).toString("hex");
  users[id] = {
    id,
    email,
    displayName,
    age,
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: Date.now(),
    premiumUntil: null,
  };
  writeJson(USERS_FILE, users);

  const token = makeToken();
  const sessions = readJson(SESSIONS_FILE, {});
  sessions[token] = id;
  writeJson(SESSIONS_FILE, sessions);

  res.json({
    token,
    user: publicUser(users[id]),
    message: "Регистрация успешна. Добро пожаловать!",
  });
});

app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!email || !password) {
    return res.status(400).json({ error: "Введите email и пароль." });
  }

  const users = readJson(USERS_FILE, {});
  const user = Object.values(users).find((u) => u.email === email);
  if (!user) return res.status(401).json({ error: "Аккаунт с такой почтой не найден." });

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return res.status(401).json({ error: "Неверный пароль." });
  }
  if (isBanned(user)) {
    return res.status(403).json({
      error: "Аккаунт заблокирован" + (user.banReason ? ": " + user.banReason : "."),
    });
  }

  const token = makeToken();
  const sessions = readJson(SESSIONS_FILE, {});
  sessions[token] = user.id;
  writeJson(SESSIONS_FILE, sessions);

  res.json({
    token,
    user: publicUser(user),
    message: "Вы вошли в аккаунт.",
  });
});

app.get("/api/me", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  res.json({ user: publicUser(auth.user) });
});

app.get("/api/profile", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  res.json(profilePayload(auth.user));
});

app.patch("/api/profile", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });

  const users = readJson(USERS_FILE, {});
  const user = users[auth.user.id];
  if (!user) return res.status(404).json({ error: "Пользователь не найден." });

  if (Object.prototype.hasOwnProperty.call(req.body, "displayName")) {
    const displayName = String(req.body.displayName || "").trim();
    if (displayName.length < 2) {
      return res.status(400).json({ error: "Псевдоним минимум из двух букв." });
    }
    if (displayName.length > 40) {
      return res.status(400).json({ error: "Псевдоним слишком длинный." });
    }
    user.displayName = displayName;
  }

  users[user.id] = user;
  writeJson(USERS_FILE, users);
  res.json(Object.assign({ message: "Профиль сохранён." }, profilePayload(user)));
});

app.post("/api/logout", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token) {
    const sessions = readJson(SESSIONS_FILE, {});
    delete sessions[token];
    writeJson(SESSIONS_FILE, sessions);
  }
  res.json({ ok: true });
});

app.get("/api/authors/:id", (req, res) => {
  const users = readJson(USERS_FILE, {});
  const user = users[req.params.id];
  if (!user) return res.status(404).json({ error: "Автор не найден." });

  const { poems, ranked } = buildAuthorStats();
  const mine = poems.filter((p) => p.userId === user.id && !p.hidden);
  const totalVotes = mine.reduce((sum, p) => sum + Number(p.votes || 0), 0);
  const rankRow = ranked.find((r) => r.userId === user.id);
  const auth = getUserFromReq(req);
  const following = auth ? getFollowList(auth.user.id).includes(user.id) : false;

  res.json({
    author: publicAuthor(user),
    following,
    stats: {
      poemCount: mine.length,
      totalVotes,
      rank: rankRow ? rankRow.rank : null,
      authorsTotal: ranked.length,
    },
    poems: mine
      .slice()
      .sort((a, b) => b.votes - a.votes || b.createdAt - a.createdAt)
      .map((p) => ({
        id: p.id,
        title: p.title,
        author: p.author,
        text: p.text,
        votes: Number(p.votes || 0),
        createdAt: p.createdAt,
        seasonId: p.seasonId || null,
      })),
  });
});

app.get("/api/follows", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  res.json({ following: getFollowList(auth.user.id) });
});

app.post("/api/follows/:authorId", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Войдите, чтобы подписаться." });
  const authorId = String(req.params.authorId || "");
  if (!authorId || authorId === auth.user.id) {
    return res.status(400).json({ error: "Нельзя подписаться на этот профиль." });
  }
  const users = readJson(USERS_FILE, {});
  if (!users[authorId]) return res.status(404).json({ error: "Автор не найден." });

  const follows = readJson(FOLLOWS_FILE, {});
  const list = Array.isArray(follows[auth.user.id]) ? follows[auth.user.id] : [];
  if (!list.includes(authorId)) list.unshift(authorId);
  follows[auth.user.id] = list;
  writeJson(FOLLOWS_FILE, follows);
  res.json({ following: list, message: "Подписка оформлена." });
});

app.delete("/api/follows/:authorId", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const follows = readJson(FOLLOWS_FILE, {});
  const list = Array.isArray(follows[auth.user.id]) ? follows[auth.user.id] : [];
  follows[auth.user.id] = list.filter((id) => id !== req.params.authorId);
  writeJson(FOLLOWS_FILE, follows);
  res.json({ following: follows[auth.user.id], message: "Подписка снята." });
});

app.get("/api/feed", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Войдите, чтобы видеть ленту." });
  const following = new Set(getFollowList(auth.user.id));
  if (!following.size) return res.json({ poems: [], following: [] });

  const poems = visiblePoems(readJson(POEMS_FILE, []))
    .filter((p) => following.has(p.userId))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map(mapPoem);
  res.json({ poems, following: Array.from(following) });
});

app.get("/api/favorites", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const favorites = readJson(FAVORITES_FILE, {});
  res.json({ favorites: favorites[auth.user.id] || [], premium: isPremium(auth.user) });
});

app.post("/api/favorites", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Чтобы сохранять рифмы, войдите в аккаунт." });

  const word = String(req.body.word || "").trim().toLowerCase();
  const query = String(req.body.query || "").trim().toLowerCase();
  const kind = String(req.body.kind || "exact");
  if (word.length < 2) return res.status(400).json({ error: "Нужно слово для избранного." });

  const favorites = readJson(FAVORITES_FILE, {});
  const list = Array.isArray(favorites[auth.user.id]) ? favorites[auth.user.id] : [];
  if (list.some((f) => f.word === word && f.query === query)) {
    return res.json({ favorites: list, message: "Уже в избранном." });
  }

  if (!isPremium(auth.user) && list.length >= FREE_FAVORITES_LIMIT) {
    return res.status(403).json({
      error: `В бесплатном тарифе можно сохранить до ${FREE_FAVORITES_LIMIT} рифм. Откройте Premium.`,
    });
  }

  list.unshift({
    id: makeId("f"),
    word,
    query,
    kind,
    savedAt: Date.now(),
  });
  favorites[auth.user.id] = list;
  writeJson(FAVORITES_FILE, favorites);
  res.json({ favorites: list, message: "Сохранено в избранное." });
});

app.delete("/api/favorites/:id", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const favorites = readJson(FAVORITES_FILE, {});
  const list = Array.isArray(favorites[auth.user.id]) ? favorites[auth.user.id] : [];
  favorites[auth.user.id] = list.filter((f) => f.id !== req.params.id);
  writeJson(FAVORITES_FILE, favorites);
  res.json({ favorites: favorites[auth.user.id], message: "Удалено из избранного." });
});

app.get("/api/seasons", (_req, res) => {
  const seasons = ensureSeasons();
  const poems = visiblePoems(readJson(POEMS_FILE, []));
  const withCounts = seasons.map((s) => ({
    ...s,
    poemCount: poems.filter((p) => p.seasonId === s.id).length,
  }));
  res.json({
    current: withCounts.find((s) => s.active) || withCounts[0] || null,
    seasons: withCounts,
  });
});

app.get("/api/poems", (req, res) => {
  const seasonId = String(req.query.season || "").trim();
  const q = String(req.query.q || "").trim().toLowerCase();
  let poems = visiblePoems(readJson(POEMS_FILE, [])).map(mapPoem);
  if (seasonId) poems = poems.filter((p) => p.seasonId === seasonId);
  if (q) {
    poems = poems.filter((p) => {
      const hay = [p.title, p.author, p.text].join("\n").toLowerCase();
      return hay.includes(q);
    });
  }
  res.json({ poems, season: activeSeason(), q });
});

app.post("/api/poems", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Чтобы публиковать, войдите в аккаунт." });
  const activeErr = requireActiveUser(auth);
  if (activeErr) return res.status(403).json({ error: activeErr });

  const title = String(req.body.title || "").trim();
  const text = String(req.body.text || "").trim();
  const author = String(req.body.author || "").trim() || auth.user.displayName || auth.user.email;
  const words = text.split(/\s+/).filter(Boolean).length;
  const season = activeSeason();

  if (!req.body.agreedToRules) {
    return res.status(400).json({
      error: "Нужно принять правила публикации перед отправкой стиха.",
    });
  }
  if (title.length < 2) return res.status(400).json({ error: "Укажите название стиха." });
  if (author.length < 2) return res.status(400).json({ error: "Укажите псевдоним." });
  if (words < 3) return res.status(400).json({ error: "Стих слишком короткий." });
  if (words > 5000) return res.status(400).json({ error: "Максимум 5000 слов." });

  const poems = readJson(POEMS_FILE, []);
  const poem = {
    id: makeId("p"),
    author,
    title,
    text,
    votes: 0,
    comments: [],
    reports: [],
    hidden: false,
    createdAt: Date.now(),
    userId: auth.user.id,
    email: auth.user.email,
    seasonId: season ? season.id : null,
  };
  poems.unshift(poem);
  writeJson(POEMS_FILE, poems);
  res.json({ poem: mapPoem(poem) });
});

app.post("/api/poems/:id/vote", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Чтобы голосовать, войдите в аккаунт." });
  const activeErr = requireActiveUser(auth);
  if (activeErr) return res.status(403).json({ error: activeErr });

  const poems = readJson(POEMS_FILE, []);
  const poem = poems.find((p) => p.id === req.params.id);
  if (!poem || poem.hidden) return res.status(404).json({ error: "Стих не найден." });

  poem.votes = Number(poem.votes || 0) + 1;
  writeJson(POEMS_FILE, poems);
  res.json({ poem: mapPoem(poem) });
});

app.post("/api/poems/:id/comments", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Чтобы комментировать, войдите в аккаунт." });
  const activeErr = requireActiveUser(auth);
  if (activeErr) return res.status(403).json({ error: activeErr });

  const text = String(req.body.text || "").trim();
  if (text.length < 2) return res.status(400).json({ error: "Комментарий слишком короткий." });
  if (text.length > 500) return res.status(400).json({ error: "Максимум 500 символов." });

  const poems = readJson(POEMS_FILE, []);
  const poem = poems.find((p) => p.id === req.params.id);
  if (!poem || poem.hidden) return res.status(404).json({ error: "Стих не найден." });
  if (!Array.isArray(poem.comments)) poem.comments = [];

  const comment = {
    id: makeId("c"),
    userId: auth.user.id,
    author: auth.user.displayName || auth.user.email,
    text,
    createdAt: Date.now(),
  };
  poem.comments.push(comment);
  writeJson(POEMS_FILE, poems);
  res.json({ comment, poem: mapPoem(poem) });
});

app.post("/api/poems/:id/report", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Войдите, чтобы пожаловаться." });

  const poems = readJson(POEMS_FILE, []);
  const poem = poems.find((p) => p.id === req.params.id);
  if (!poem) return res.status(404).json({ error: "Стих не найден." });
  if (poem.userId === auth.user.id) {
    return res.status(400).json({ error: "Нельзя жаловаться на свой стих." });
  }
  if (!Array.isArray(poem.reports)) poem.reports = [];
  if (poem.reports.includes(auth.user.id)) {
    return res.json({ poem: mapPoem(poem), message: "Вы уже жаловались на этот стих." });
  }

  poem.reports.push(auth.user.id);
  const reason = String(req.body.reason || "").trim().slice(0, 200);
  if (reason) {
    if (!Array.isArray(poem.reportNotes)) poem.reportNotes = [];
    poem.reportNotes.push({ userId: auth.user.id, reason, at: Date.now() });
  }
  if (poem.reports.length >= REPORT_HIDE_THRESHOLD) {
    poem.hidden = true;
  }
  writeJson(POEMS_FILE, poems);
  res.json({
    poem: mapPoem(poem),
    message: poem.hidden
      ? "Стих скрыт после жалоб."
      : "Жалоба принята. После нескольких жалоб стих скроется.",
  });
});

app.post("/api/poems/:id/hide", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  if (!isPremium(auth.user) && !auth.user.moderator) {
    return res.status(403).json({ error: "Скрывать стихи могут Premium или модераторы." });
  }

  const poems = readJson(POEMS_FILE, []);
  const poem = poems.find((p) => p.id === req.params.id);
  if (!poem) return res.status(404).json({ error: "Стих не найден." });
  poem.hidden = true;
  writeJson(POEMS_FILE, poems);
  res.json({ poem: mapPoem(poem), message: "Стих скрыт из рейтинга." });
});

app.post("/api/mod/warn/:userId", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const modErr = requireModerator(auth);
  if (modErr) return res.status(403).json({ error: modErr });

  const users = readJson(USERS_FILE, {});
  const target = users[req.params.userId];
  if (!target) return res.status(404).json({ error: "Пользователь не найден." });
  if (target.id === auth.user.id) return res.status(400).json({ error: "Нельзя предупредить себя." });
  if (target.admin) return res.status(400).json({ error: "Нельзя предупреждать главного модератора." });
  if ((target.moderator || target.admin) && !auth.user.admin) {
    return res.status(400).json({ error: "Нельзя предупреждать модератора." });
  }

  const reason = String(req.body.reason || "").trim();
  if (reason.length < 3) return res.status(400).json({ error: "Укажите причину предупреждения." });
  if (reason.length > 300) return res.status(400).json({ error: "Слишком длинная причина." });

  if (!Array.isArray(target.warnings)) target.warnings = [];
  target.warnings.push({
    id: makeId("w"),
    reason,
    by: auth.user.id,
    byName: auth.user.displayName || auth.user.email,
    at: Date.now(),
  });
  users[target.id] = target;
  writeJson(USERS_FILE, users);
  res.json({
    author: publicAuthor(target),
    warnings: target.warnings,
    message: "Предупреждение выдано.",
  });
});

app.post("/api/mod/ban/:userId", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const modErr = requireModerator(auth);
  if (modErr) return res.status(403).json({ error: modErr });

  const users = readJson(USERS_FILE, {});
  const target = users[req.params.userId];
  if (!target) return res.status(404).json({ error: "Пользователь не найден." });
  if (target.id === auth.user.id) return res.status(400).json({ error: "Нельзя забанить себя." });
  if (target.admin) return res.status(400).json({ error: "Нельзя банить главного модератора." });
  if ((target.moderator || target.admin) && !auth.user.admin) {
    return res.status(400).json({ error: "Нельзя банить модератора." });
  }

  const reason = String(req.body.reason || "").trim();
  if (reason.length < 3) return res.status(400).json({ error: "Укажите причину бана." });
  if (reason.length > 300) return res.status(400).json({ error: "Слишком длинная причина." });

  target.banned = true;
  target.banReason = reason;
  target.bannedAt = Date.now();
  target.bannedBy = auth.user.id;
  users[target.id] = target;
  writeJson(USERS_FILE, users);

  // drop sessions
  const sessions = readJson(SESSIONS_FILE, {});
  Object.keys(sessions).forEach((token) => {
    if (sessions[token] === target.id) delete sessions[token];
  });
  writeJson(SESSIONS_FILE, sessions);

  res.json({
    author: publicAuthor(target),
    message: "Пользователь заблокирован.",
  });
});

app.post("/api/mod/unban/:userId", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const modErr = requireModerator(auth);
  if (modErr) return res.status(403).json({ error: modErr });

  const users = readJson(USERS_FILE, {});
  const target = users[req.params.userId];
  if (!target) return res.status(404).json({ error: "Пользователь не найден." });

  target.banned = false;
  target.banReason = "";
  target.bannedAt = null;
  target.bannedBy = null;
  users[target.id] = target;
  writeJson(USERS_FILE, users);
  res.json({
    author: publicAuthor(target),
    message: "Блокировка снята.",
  });
});

app.post("/api/mod/promote/:userId", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const adminErr = requireAdmin(auth);
  if (adminErr) return res.status(403).json({ error: adminErr });

  const users = readJson(USERS_FILE, {});
  const target = users[req.params.userId];
  if (!target) return res.status(404).json({ error: "Пользователь не найден." });
  if (target.id === auth.user.id) {
    return res.status(400).json({ error: "Вы уже главный модератор." });
  }
  if (isBanned(target)) {
    return res.status(400).json({ error: "Сначала разбаньте пользователя." });
  }

  target.moderator = true;
  users[target.id] = target;
  writeJson(USERS_FILE, users);
  res.json({
    author: publicAuthor(target),
    message: "Пользователь назначен модератором.",
  });
});

app.post("/api/mod/demote/:userId", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const adminErr = requireAdmin(auth);
  if (adminErr) return res.status(403).json({ error: adminErr });

  const users = readJson(USERS_FILE, {});
  const target = users[req.params.userId];
  if (!target) return res.status(404).json({ error: "Пользователь не найден." });
  if (target.id === auth.user.id) {
    return res.status(400).json({ error: "Нельзя снять с себя главную роль." });
  }
  if (target.admin) {
    return res.status(400).json({ error: "Нельзя снять другого главного модератора." });
  }

  target.moderator = false;
  users[target.id] = target;
  writeJson(USERS_FILE, users);
  res.json({
    author: publicAuthor(target),
    message: "Модераторские права сняты.",
  });
});

app.post("/api/premium/demo", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Войдите в аккаунт." });

  const users = readJson(USERS_FILE, {});
  const user = users[auth.user.id];
  if (!user) return res.status(404).json({ error: "Пользователь не найден." });

  user.premiumUntil = Date.now() + 30 * 24 * 3600 * 1000;
  users[user.id] = user;
  writeJson(USERS_FILE, users);
  res.json({
    user: publicUser(user),
    message: "Premium на 30 дней активирован (демо).",
  });
});

function readSupport() {
  const data = readJson(SUPPORT_FILE, { threads: {} });
  if (!data.threads || typeof data.threads !== "object") data.threads = {};
  return data;
}

function mapThread(thread) {
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  return {
    id: thread.id,
    userId: thread.userId,
    userName: thread.userName || "",
    userEmail: thread.userEmail || "",
    updatedAt: thread.updatedAt || 0,
    unreadForAdmin: Boolean(thread.unreadForAdmin),
    unreadForUser: Boolean(thread.unreadForUser),
    messages,
    preview: messages.length ? messages[messages.length - 1].text : "",
  };
}

app.get("/api/support", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Войдите, чтобы писать в поддержку." });
  const data = readSupport();
  const thread = data.threads[auth.user.id] || {
    id: auth.user.id,
    userId: auth.user.id,
    userName: auth.user.displayName || auth.user.email,
    userEmail: auth.user.email,
    updatedAt: 0,
    unreadForAdmin: false,
    unreadForUser: false,
    messages: [],
  };
  if (data.threads[auth.user.id]) {
    data.threads[auth.user.id].unreadForUser = false;
    writeJson(SUPPORT_FILE, data);
    thread.unreadForUser = false;
  }
  res.json({ thread: mapThread(thread) });
});

app.post("/api/support", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Войдите, чтобы писать в поддержку." });
  const activeErr = requireActiveUser(auth);
  if (activeErr) return res.status(403).json({ error: activeErr });

  const text = String(req.body.text || "").trim();
  if (text.length < 2) return res.status(400).json({ error: "Сообщение слишком короткое." });
  if (text.length > 2000) return res.status(400).json({ error: "Максимум 2000 символов." });

  const data = readSupport();
  const thread = data.threads[auth.user.id] || {
    id: auth.user.id,
    userId: auth.user.id,
    userName: auth.user.displayName || auth.user.email,
    userEmail: auth.user.email,
    updatedAt: 0,
    unreadForAdmin: false,
    unreadForUser: false,
    messages: [],
  };
  thread.userName = auth.user.displayName || auth.user.email;
  thread.userEmail = auth.user.email;
  thread.messages.push({
    id: makeId("m"),
    from: "user",
    text,
    at: Date.now(),
    byName: auth.user.displayName || auth.user.email,
  });
  thread.updatedAt = Date.now();
  thread.unreadForAdmin = true;
  data.threads[auth.user.id] = thread;
  writeJson(SUPPORT_FILE, data);
  res.json({ thread: mapThread(thread), message: "Сообщение отправлено в поддержку." });
});

app.get("/api/support/inbox", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const adminErr = requireAdmin(auth);
  if (adminErr) return res.status(403).json({ error: adminErr });

  const data = readSupport();
  const threads = Object.values(data.threads)
    .map(mapThread)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  res.json({ threads });
});

app.get("/api/support/thread/:userId", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const adminErr = requireAdmin(auth);
  if (adminErr) return res.status(403).json({ error: adminErr });

  const data = readSupport();
  const thread = data.threads[req.params.userId];
  if (!thread) return res.status(404).json({ error: "Диалог не найден." });
  thread.unreadForAdmin = false;
  writeJson(SUPPORT_FILE, data);
  res.json({ thread: mapThread(thread) });
});

app.post("/api/support/thread/:userId/reply", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const adminErr = requireAdmin(auth);
  if (adminErr) return res.status(403).json({ error: adminErr });

  const text = String(req.body.text || "").trim();
  if (text.length < 2) return res.status(400).json({ error: "Сообщение слишком короткое." });
  if (text.length > 2000) return res.status(400).json({ error: "Максимум 2000 символов." });

  const data = readSupport();
  const thread = data.threads[req.params.userId];
  if (!thread) return res.status(404).json({ error: "Диалог не найден." });

  thread.messages.push({
    id: makeId("m"),
    from: "admin",
    text,
    at: Date.now(),
    byName: auth.user.displayName || "Поддержка",
  });
  thread.updatedAt = Date.now();
  thread.unreadForUser = true;
  thread.unreadForAdmin = false;
  data.threads[req.params.userId] = thread;
  writeJson(SUPPORT_FILE, data);
  res.json({ thread: mapThread(thread), message: "Ответ отправлен." });
});

app.get("/api/suggestions", (req, res) => {
  const auth = getUserFromReq(req);
  if (!auth) return res.status(401).json({ error: "Не авторизован." });
  const adminErr = requireAdmin(auth);
  if (adminErr) return res.status(403).json({ error: adminErr });
  const list = readJson(SUGGESTIONS_FILE, []);
  res.json({
    suggestions: Array.isArray(list)
      ? list.slice().sort((a, b) => b.createdAt - a.createdAt)
      : [],
  });
});

app.post("/api/suggestions", (req, res) => {
  const auth = getUserFromReq(req);
  const text = String(req.body.text || "").trim();
  const name = String(req.body.name || (auth && auth.user && (auth.user.displayName || auth.user.email)) || "Гость").trim();
  if (text.length < 5) return res.status(400).json({ error: "Опишите идею чуть подробнее." });
  if (text.length > 2000) return res.status(400).json({ error: "Максимум 2000 символов." });
  if (name.length < 2) return res.status(400).json({ error: "Укажите имя или псевдоним." });

  const list = readJson(SUGGESTIONS_FILE, []);
  const item = {
    id: makeId("s"),
    text,
    name: name.slice(0, 40),
    userId: auth ? auth.user.id : null,
    email: auth ? auth.user.email : "",
    createdAt: Date.now(),
  };
  list.unshift(item);
  writeJson(SUGGESTIONS_FILE, list.slice(0, 500));
  res.json({ suggestion: item, message: "Спасибо! Идея отправлена." });
});

app.get("/googlea176a3127a751794.html", (_req, res) => {
  const filePath = path.join(ROOT, "googlea176a3127a751794.html");
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.type("text/html").send("google-site-verification: googlea176a3127a751794.html");
});

app.get("/googlebb4ec8c8e133c6c5.html", (_req, res) => {
  const filePath = path.join(ROOT, "googlebb4ec8c8e133c6c5.html");
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.type("text/html").send("google-site-verification: googlebb4ec8c8e133c6c5.html");
});

app.get("/robots.txt", (_req, res) => {
  const filePath = path.join(ROOT, "robots.txt");
  res.type("text/plain");
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.send("User-agent: *\nDisallow:\n\nUser-agent: Googlebot\nAllow: /\n\nSitemap: https://rifmary.onrender.com/sitemap.xml\n");
});

app.get("/sitemap.xml", (_req, res) => {
  const filePath = path.join(ROOT, "sitemap.xml");
  res.type("application/xml");
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://rifmary.onrender.com/</loc><priority>1.0</priority></url>
  <url><loc>https://rifmary.onrender.com/contest.html</loc><priority>0.9</priority></url>
  <url><loc>https://rifmary.onrender.com/ideas.html</loc><priority>0.7</priority></url>
  <url><loc>https://rifmary.onrender.com/support.html</loc><priority>0.5</priority></url>
  <url><loc>https://rifmary.onrender.com/profile.html</loc><priority>0.6</priority></url>
</urlset>`);
});

app.use(express.static(ROOT));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Rifmary server: http://0.0.0.0:${PORT}`);
});

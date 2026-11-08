(function () {
  const VOWELS = new Set("аеёиоуыэюя".split(""));

  /** Пары согласных, близких по звучанию */
  const SOFT_PAIRS = {
    б: "п", п: "б",
    в: "ф", ф: "в",
    г: "к", к: "г",
    д: "т", т: "д",
    ж: "ш", ш: "ж",
    з: "с", с: "з",
  };

  /**
   * Слабые открытые хвосты (CV): без совпадения предударной гласной
   * дают слишком много мусорных пар.
   */
  const WEAK_OPEN = new Set([
    "на","ла","та","ра","са","ма","ка","ва","да","ба","па","га","жа","за","ха","фа","ца","ша","ща",
    "ня","ля","тя","ря","ся","мя","кя","вя","дя","ья","ая","яя",
    "но","ло","то","ро","со","мо","ко","во","до","бо","по","го","жо","зо","хо","фо","цо","шо","що",
    "не","ле","те","ре","се","ме","ке","ве","де","бе","пе","ге","же","зе","хе","фе","ше",
    "ны","лы","ты","ры","сы","мы","кы","вы","ды","бы","пы","гы",
    "ни","ли","ти","ри","си","ми","ки","ви","ди","би","пи","ги","жи","зи","хи","фи","ци","ши","щи",
    "ну","лу","ту","ру","су","му","ку","ву","ду","бу","пу","гу",
  ]);

  function normalize(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^а-я]/g, "");
  }

  function isVowel(ch) {
    return VOWELS.has(ch);
  }

  function vowelIndexes(word) {
    const idx = [];
    for (let i = 0; i < word.length; i++) {
      if (isVowel(word[i])) idx.push(i);
    }
    return idx;
  }

  function syllableCount(word) {
    return vowelIndexes(word).length;
  }

  function endsOpen(word) {
    const last = word[word.length - 1];
    return isVowel(last);
  }

  function lastConsonant(tail) {
    for (let i = tail.length - 1; i >= 0; i--) {
      const ch = tail[i];
      if (ch === "ь" || ch === "ъ") continue;
      if (!isVowel(ch)) return ch;
    }
    return "";
  }

  function penultVowel(word) {
    const v = vowelIndexes(word);
    if (v.length < 2) return "";
    return word[v[v.length - 2]];
  }

  /**
   * Точный рифменный хвост: от последней гласной.
   * Для открытого слога («-а») захватываем согласную перед ней.
   */
  function exactTail(word) {
    const vowels = vowelIndexes(word);
    if (!vowels.length) return word.slice(-Math.min(3, word.length));
    const lastV = vowels[vowels.length - 1];
    const fromVowel = word.slice(lastV);
    if (fromVowel.length <= 1 && lastV > 0) {
      return word.slice(lastV - 1);
    }
    return fromVowel;
  }

  /** Богатый хвост: от предпоследней гласной */
  function richTail(word) {
    const vowels = vowelIndexes(word);
    if (vowels.length >= 2) {
      return word.slice(vowels[vowels.length - 2]);
    }
    if (vowels.length === 1 && vowels[0] > 0) {
      return word.slice(vowels[0] - 1);
    }
    return exactTail(word);
  }

  function vowelSkeleton(tail) {
    return [...tail].filter(isVowel).join("");
  }

  function uniqueWords(list) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const w = normalize(item);
      if (!w || w.length < 2 || seen.has(w)) continue;
      seen.add(w);
      out.push(w);
    }
    return out;
  }

  /** Насколько близки слова по длине и числу слогов */
  function shapePenalty(query, candidate) {
    const lenDiff = Math.abs(candidate.length - query.length);
    const sylDiff = Math.abs(syllableCount(candidate) - syllableCount(query));
    return lenDiff + sylDiff * 2;
  }

  function similarShape(query, candidate, maxLenDiff, maxSylDiff) {
    return (
      Math.abs(candidate.length - query.length) <= maxLenDiff &&
      Math.abs(syllableCount(candidate) - syllableCount(query)) <= maxSylDiff
    );
  }

  /** Позиционное сравнение с одной парой звонкость/глухость */
  function positionalSoft(a, b) {
    if (a.length !== b.length) return false;
    let differ = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (x === y) continue;
      if (x === "ь" || x === "ъ" || y === "ь" || y === "ъ") return false;
      if (isVowel(x) || isVowel(y)) return false;
      if (SOFT_PAIRS[x] === y) {
        differ += 1;
        continue;
      }
      return false;
    }
    return differ === 1;
  }

  function scoreRhyme(query, candidate) {
    if (query === candidate) return null;

    const qExact = exactTail(query);
    const cExact = exactTail(candidate);
    const qRich = richTail(query);
    const cRich = richTail(candidate);
    const penalty = shapePenalty(query, candidate);

    // ——— Богатая ———
    if (qRich.length >= 3 && qRich === cRich) {
      if (!similarShape(query, candidate, 8, 3)) return null;
      return { kind: "rich", score: 120 + qRich.length - penalty };
    }

    // ——— Точная ———
    if (qExact.length >= 2 && qExact === cExact) {
      const open = endsOpen(query);
      const weak = WEAK_OPEN.has(qExact);
      const qSyl = syllableCount(query);

      // Двусложные закрытые + короткий хвост без богатства → не exact,
      // но можно ещё проверить ассонанс ниже
      const skipExact =
        qSyl === 2 && !open && qExact.length <= 2 && qRich !== cRich;

      let exactOk = !skipExact;
      if (exactOk && open && weak) {
        const qPen = penultVowel(query);
        const cPen = penultVowel(candidate);
        exactOk = Boolean(qPen && qPen === cPen && similarShape(query, candidate, 3, 1));
      } else if (exactOk && open && qExact.length < 3) {
        exactOk = similarShape(query, candidate, 2, 1);
      } else if (exactOk && qExact.length <= 2) {
        exactOk = similarShape(query, candidate, 2, 1);
      } else if (exactOk) {
        exactOk = similarShape(query, candidate, 5, 2);
      }

      if (exactOk) {
        const qBefore = query.slice(
          Math.max(0, query.length - qExact.length - 1),
          query.length - qExact.length
        );
        const cBefore = candidate.slice(
          Math.max(0, candidate.length - cExact.length - 1),
          candidate.length - cExact.length
        );
        if (qBefore && qBefore === cBefore && !isVowel(qBefore)) {
          return { kind: "rich", score: 110 + qExact.length - penalty };
        }
        return { kind: "exact", score: 80 + qExact.length - penalty };
      }
    }

    // ——— Неточная (одна глухая/звонкая замена), только для длинных хвостов ———
    if (
      qExact.length >= 3 &&
      qExact.length === cExact.length &&
      positionalSoft(qExact, cExact) &&
      similarShape(query, candidate, 4, 1)
    ) {
      return { kind: "exact", score: 60 + qExact.length - penalty };
    }

    // ——— Ассонанс: те же гласные + опора согласной + сходный точный хвост ———
    const qVow = vowelSkeleton(qRich);
    const cVow = vowelSkeleton(cRich);
    if (
      qVow.length >= 2 &&
      qVow === cVow &&
      Math.abs(qRich.length - cRich.length) <= 2 &&
      Math.abs(qExact.length - cExact.length) <= 1 &&
      similarShape(query, candidate, 4, 1)
    ) {
      const qEnd = lastConsonant(qExact);
      const cEnd = lastConsonant(cExact);
      const softEnd = qEnd && cEnd && (qEnd === cEnd || SOFT_PAIRS[qEnd] === cEnd);
      const sameStart = qExact[0] === cExact[0];
      const softSignOk = query.endsWith("ь") === candidate.endsWith("ь");
      if (softEnd && sameStart && softSignOk) {
        return { kind: "asson", score: 45 + qVow.length - penalty };
      }
    }

    return null;
  }

  let cachedDict = null;
  let exactIndex = null;
  let richIndex = null;
  let vowIndex = null;
  let indexedSource = null;

  function pushIndex(map, key, word) {
    if (!key) return;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(word);
  }

  function ensureIndex(dictionary) {
    const source = dictionary || window.RHYME_DICTIONARY || [];
    if (cachedDict && indexedSource === source) return cachedDict;

    // Полный словарь уже очищен при сборке
    cachedDict =
      source === window.RHYME_DICTIONARY && Array.isArray(source) && source.length > 100000
        ? source
        : uniqueWords(source);
    indexedSource = source;
    exactIndex = new Map();
    richIndex = new Map();
    vowIndex = null; // на полном словаре слишком тяжёлый; ассонанс идёт через exact-корзины

    for (let i = 0; i < cachedDict.length; i++) {
      const word = cachedDict[i];
      pushIndex(exactIndex, exactTail(word), word);
      pushIndex(richIndex, richTail(word), word);
    }
    return cachedDict;
  }

  function collectCandidates(query) {
    const qExact = exactTail(query);
    const qRich = richTail(query);
    const cand = new Set();

    const addAll = (list) => {
      if (!list) return;
      for (const w of list) cand.add(w);
    };

    addAll(exactIndex.get(qExact));
    addAll(richIndex.get(qRich));

    // Ассонанс для пар вроде ветер/вечер уже в той же exact-корзине («ер»)

    if (qExact.length >= 3) {
      for (let i = 0; i < qExact.length; i++) {
        const ch = qExact[i];
        const alt = SOFT_PAIRS[ch];
        if (!alt || isVowel(ch)) continue;
        addAll(exactIndex.get(qExact.slice(0, i) + alt + qExact.slice(i + 1)));
      }
    }

    return cand;
  }

  function findRhymes(rawWord, dictionary) {
    const query = normalize(rawWord);
    if (!query || query.length < 2) {
      return { query: rawWord, error: "Введите слово из хотя бы двух букв." };
    }
    if (!/^[а-я]+$/i.test(query)) {
      return { query: rawWord, error: "Пока поддерживаются только русские слова." };
    }

    ensureIndex(dictionary);
    const buckets = { rich: [], exact: [], asson: [] };
    const candidates = collectCandidates(query);

    for (const word of candidates) {
      const hit = scoreRhyme(query, word);
      if (!hit) continue;
      buckets[hit.kind].push({ word, score: hit.score });
    }

    const sortUnique = (arr) => {
      arr.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, "ru"));
      const seen = new Set();
      return arr
        .filter((item) => {
          if (seen.has(item.word)) return false;
          seen.add(item.word);
          return true;
        })
        .map((item) => item.word);
    };

    const rich = sortUnique(buckets.rich);
    const exact = sortUnique(buckets.exact).filter((w) => !rich.includes(w));
    const asson = sortUnique(buckets.asson).filter(
      (w) => !rich.includes(w) && !exact.includes(w)
    );

    return {
      query,
      rich: rich.slice(0, 48),
      exact: exact.slice(0, 48),
      asson: asson.slice(0, 36),
      total: rich.length + exact.length + asson.length,
      dictSize: cachedDict.length,
    };
  }

  function dictionarySize() {
    ensureIndex();
    return cachedDict.length;
  }

  function lastWord(line) {
    const parts = String(line || "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")
      .split(/[^а-я]+/i)
      .filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }

  function analyzeLines(rawText, dictionary, options) {
    const limit = options && options.limit ? Number(options.limit) : 40;
    const lines = String(rawText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, Math.max(1, limit));

    return lines.map((line, index) => {
      const word = lastWord(line);
      if (!word || word.length < 2) {
        return {
          index,
          line,
          word: "",
          weak: false,
          error: "В строке нет русского слова для рифмы.",
          suggestions: [],
        };
      }
      const tail = exactTail(normalize(word));
      const weak = WEAK_OPEN.has(tail);
      const found = findRhymes(word, dictionary);
      const suggestions = []
        .concat(found.rich || [], found.exact || [], found.asson || [])
        .slice(0, 8);
      return {
        index,
        line,
        word,
        weak,
        tail,
        error: found.error || null,
        suggestions,
      };
    });
  }

  window.RhymeEngine = {
    normalize,
    findRhymes,
    analyzeLines,
    uniqueWords,
    exactTail,
    richTail,
    dictionarySize,
  };
})();

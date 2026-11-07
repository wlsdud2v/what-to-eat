/**
 * 오늘 뭐 먹지? — 직접 추가한 메뉴 저장소 (localStorage)
 * menus.js 에 없는 메뉴도 추천에 나오도록 메뉴 정보(분류·온도·계절·날씨·끼니…)를 함께 저장합니다.
 *
 *  CustomMenus.build(name, opts)  이름 + 고른 값으로 메뉴 객체 만들기.
 *                                 안 고른 값은 이름이 가장 비슷한 기존 메뉴(similar)에서 가져옴
 *  CustomMenus.sanitize(raw)      가져오기 등 바깥 데이터를 허용된 값만 남겨 메뉴 객체로 (안 되면 null)
 *  CustomMenus.put/remove/...     저장소 (다른 탭에서 바꿔도 storage 이벤트로 반영)
 *  allMenus()                     기존 메뉴 + 직접 추가한 메뉴 (추천에 넘기는 목록)
 *
 * 저장 항목은 menus.js 의 메뉴 객체와 같은 모양이고 custom: true, ref(참고한 메뉴 이름), addedAt 이 더 붙습니다.
 */
(function (root) {
  const KEY = "what-to-eat:custom-menus:v1";
  const CATS = ["한식", "중식", "일식", "양식", "분식", "아시안", "빵"];
  const TEMPS = ["hot", "cold", "neutral"];
  const SEASONS = ["spring", "summer", "autumn", "winter"];
  const WEATHER = ["rain", "snow", "hot", "cold", "chilly", "mild", "clear", "cloudy", "humid", "windy"];
  const MEALS = ["lunch", "dinner", "both"];
  const CAT_EMOJI = { 한식: "🍚", 중식: "🥟", 일식: "🍣", 양식: "🍝", 분식: "🍢", 아시안: "🍜", 빵: "🥐" };
  const CUISINE = {
    한식: ["korean"], 중식: ["chinese"], 일식: ["japanese"], 양식: ["western"], 분식: ["korean"], 아시안: ["asian"], 빵: ["bakery"],
  };
  /** 글자 수·개수 제한 (가져오기 데이터도 같은 기준) */
  const LIMIT = { name: 30, desc: 40, emoji: 8, kw: 20, kwCount: 5, regions: 5, count: 300 };
  const DEFAULT_DESC = "내가 추가한 메뉴";

  const builtins = () => root.MENUS_DATA || [];
  /** 비교용 정규화: 공백·가운뎃점 제거, 소문자 */
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s·・.,]/g, "");


  /** 글자 다듬기: 제어문자·꺾쇠 제거, 공백 정리, 최대 길이 (이모지가 깨지지 않게 글자 단위로 자름) */
  function cleanText(s, max) {
    const t = String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
    return [...t].slice(0, max).join("");
  }


  /** 허용된 값만 남기고 중복 제거 */
  function pick(list, allowed) {
    return Array.isArray(list) ? [...new Set(list.filter((x) => allowed.includes(x)))] : [];
  }


  /** 기존 메뉴 이름이면 true (직접 추가 메뉴와 이름이 겹치면 안 됨) */
  function isBuiltin(name) {
    const n = norm(name);
    return builtins().some((m) => norm(m.name) === n);
  }


  /**
   * 이름이 가장 비슷한 기존 메뉴: 기존 메뉴 이름(·로 나눈 부분 포함)이나 키워드가
   * 새 이름 안에 들어 있으면 후보, 그중 가장 길게 겹치는 것. 이름 끝에서 겹치면 조금 더 우선
   * (한국어 음식 이름은 끝말이 종류를 정함: 닭칼국수 → 칼국수, 김치볶음밥 → 볶음밥)
   */
  function similar(name) {
    const n = norm(name);
    if (!n) return null;
    let best = null;
    let bestScore = 0;
    for (const m of builtins()) {
      const cands = [[m.name, 0.5], ...m.name.split("·").map((x) => [x, 0.5]), ...(m.kw || []).map((k) => [k, 0])];
      for (const [raw, bonus] of cands) {
        const c = norm(raw);
        if (c.length < 2 || !n.includes(c)) continue;
        const s = c.length + bonus + (n.endsWith(c) ? 0.3 : 0);
        if (s > bestScore) {
          best = m;
          bestScore = s;
        }
      }
    }
    return best;
  }


  /** 카카오 검색어 등 키워드: 이름(공백 없이) + 이름을 나눈 조각 */
  function keywordsOf(name) {
    const whole = name.replace(/\s+/g, "");
    const parts = name.split(/[·,/\s]+/).filter((x) => [...x].length >= 2);
    return [...new Set([whole, ...parts])].map((k) => cleanText(k, LIMIT.kw)).filter(Boolean).slice(0, LIMIT.kwCount);
  }


  /**
   * 바깥 데이터 → 메뉴 객체 (허용된 값만). 이름이 없거나 기존 메뉴와 겹치면 null
   * 빠진 값은 기본값으로 채움 (분류 한식, 보통 온도, 사계절, 점심·저녁 둘 다)
   */
  function sanitize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = cleanText(raw.name, LIMIT.name);
    if (!name || isBuiltin(name)) return null;
    const cat = CATS.includes(raw.cat) ? raw.cat : "한식";
    let kw = Array.isArray(raw.kw) ? raw.kw.map((k) => cleanText(k, LIMIT.kw)).filter(Boolean) : [];
    kw = [...new Set(kw)].slice(0, LIMIT.kwCount);
    if (!kw.length) kw = keywordsOf(name);
    const at = Number(raw.addedAt);
    return {
      name,
      emoji: cleanText(raw.emoji, LIMIT.emoji) || CAT_EMOJI[cat],
      cat,
      temp: TEMPS.includes(raw.temp) ? raw.temp : "neutral",
      seasons: pick(raw.seasons, SEASONS),
      weather: pick(raw.weather, WEATHER),
      regions: Array.isArray(raw.regions)
        ? raw.regions.map((r) => cleanText(r, 10)).filter(Boolean).slice(0, LIMIT.regions) : [],
      meal: MEALS.includes(raw.meal) ? raw.meal : "both",
      kw,
      cuisine: CUISINE[cat],
      desc: cleanText(raw.desc, LIMIT.desc) || DEFAULT_DESC,
      kid: raw.kid !== false,
      light: raw.light === true,
      drink: raw.drink === true,
      custom: true,
      ref: cleanText(raw.ref, LIMIT.name) || "",
      addedAt: Number.isFinite(at) && at > 0 ? at : Date.now(),
    };
  }


  /**
   * 이름 + 사용자가 고른 값(opts) → 메뉴 객체. opts 에 없는 값은 비슷한 기존 메뉴에서 가져옴
   * opts: { cat, temp, meal, seasons, weather, kid, light, drink, emoji, desc, addedAt }
   */
  function build(name, opts = {}) {
    const base = similar(name);
    const has = (k) => opts[k] !== undefined && opts[k] !== null && opts[k] !== "";
    const cat = has("cat") ? opts.cat : base?.cat || "한식";
    const m = sanitize({
      name,
      emoji: has("emoji") ? opts.emoji : base?.emoji || CAT_EMOJI[cat],
      cat,
      temp: has("temp") ? opts.temp : base?.temp || "neutral",
      seasons: has("seasons") ? opts.seasons : base?.seasons || [],
      weather: has("weather") ? opts.weather : base?.weather || [],
      meal: has("meal") ? opts.meal : base?.meal || "both",
      kw: keywordsOf(String(name || "")),
      desc: has("desc") ? opts.desc : "",
      kid: has("kid") ? opts.kid : base?.kid !== false,
      light: has("light") ? opts.light : !!base?.light,
      drink: has("drink") ? opts.drink : !!base?.drink,
      ref: base?.name || "",
      addedAt: opts.addedAt,
    });
    if (m && base && base.cat === m.cat) m.cuisine = base.cuisine.slice();
    return m;
  }


  // ── 저장소 ──────────────────────────────────
  const listeners = new Set();

  function load() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (!Array.isArray(a)) return [];
      const seen = new Set();
      const out = [];
      for (const raw of a) {
        const m = sanitize(raw);
        if (m && !seen.has(m.name)) {
          seen.add(m.name);
          // 저장된 cuisine 은 그대로 (build 때 참고 메뉴에서 가져온 값)
          if (Array.isArray(raw.cuisine) && raw.cuisine.every((c) => typeof c === "string")) m.cuisine = raw.cuisine.slice(0, 12);
          out.push(m);
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      console.warn(`[${KEY}] 저장 실패:`, e.message);
    }
    emit();
  }

  function emit() {
    listeners.forEach((fn) => fn(list.slice()));
  }

  let list = load();

  root.addEventListener?.("storage", (e) => {
    if (e.key !== KEY) return;
    list = load();
    emit();
  });


  const CustomMenus = {
    KEY, CATS, TEMPS, SEASONS, WEATHER, MEALS, CAT_EMOJI, LIMIT, DEFAULT_DESC,
    norm, similar, build, sanitize, isBuiltin,

    all: () => list.slice(),
    count: () => list.length,
    has: (name) => list.some((x) => x.name === name),
    get: (name) => list.find((x) => x.name === name) || null,

    /** 추가하거나(새 이름) 고치기(같은 이름). 최대 개수를 넘거나 잘못된 메뉴면 false */
    put(menu) {
      const m = menu?.custom ? menu : sanitize(menu);
      if (!m) return false;
      const i = list.findIndex((x) => x.name === m.name);
      if (i >= 0) list[i] = { ...m, addedAt: list[i].addedAt };
      else {
        if (list.length >= LIMIT.count) return false;
        list.unshift(m);
      }
      save();
      return true;
    },

    /** 삭제. 지운 항목을 돌려줌 (되돌리기용) */
    remove(name) {
      const i = list.findIndex((x) => x.name === name);
      if (i < 0) return null;
      const [item] = list.splice(i, 1);
      save();
      return item;
    },

    restore(item) {
      if (!item || CustomMenus.has(item.name)) return;
      list.push(item);
      list.sort((a, b) => b.addedAt - a.addedAt);
      save();
    },

    /** 목록 통째로 바꾸기 (가져오기·되돌리기) */
    setAll(items) {
      const seen = new Set();
      list = (items || []).filter((m) => m && m.custom && !seen.has(m.name) && seen.add(m.name)).slice(0, LIMIT.count);
      save();
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };


  root.CustomMenus = CustomMenus;
  /** 추천에 쓰는 전체 메뉴: 기존 메뉴 + 직접 추가한 메뉴 */
  root.allMenus = () => builtins().concat(list);
})(window);

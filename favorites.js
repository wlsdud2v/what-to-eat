/**
 * 오늘 뭐 먹지? — 내 메뉴 저장소 (localStorage)
 * 추천 화면(app.js)과 내 메뉴 관리 페이지(favorites-page.js)가 함께 씀.
 *
 *  Favorites  좋아하는 메뉴 — 추천 카드에서 분홍색으로 강조
 *  Excluded   추천 제외 메뉴 — 추천 목록에서 아예 빠짐
 * 한 메뉴는 둘 중 한 곳에만 있을 수 있어서, 한쪽에 넣으면 다른 쪽에서는 빠집니다.
 *
 * 항목: { name, emoji, cat, custom, addedAt }
 *  - name    메뉴 이름 (menus.js 의 name 과 같으면 추천 카드에 반영)
 *  - custom  menus.js 에 없는 메뉴(직접 추가한 메뉴)면 true
 * 다른 탭에서 바꿔도 storage 이벤트로 바로 반영됩니다.
 */
(function (root) {
  /** menus.js 와 직접 추가한 메뉴(custom-menus.js)에서 이름으로 메뉴 찾기 */
  function findMenu(name) {
    const menus = root.MENUS_DATA || root.Recommend?.MENUS || [];
    return menus.find((m) => m.name === name) || root.CustomMenus?.get(name) || null;
  }


  /**
   * localStorage 목록 저장소 하나 만들기
   * opts.other: () => 다른 저장소 (같은 메뉴를 넣으면 거기서 뺌)
   */
  function createStore(KEY, opts = {}) {
    const listeners = new Set();


    function load() {
      try {
        const a = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(a) ? a.filter((x) => x && typeof x.name === "string" && x.name.trim()) : [];
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


    const api = {
      all: () => list.slice(),
      count: () => list.length,
      has: (name) => list.some((x) => x.name === name),
      names: () => new Set(list.map((x) => x.name)),
      findMenu,

      /** 추가. 이미 있으면 false. 다른 목록에 있던 메뉴면 거기서 빼고, 뺀 항목을 moved 로 알려줌 */
      add(name, extra = {}) {
        name = String(name || "").trim();
        if (!name || api.has(name)) return false;
        const other = opts.other?.();
        const moved = other?.has(name) ? other.remove(name) : null;
        const m = findMenu(name);
        list.unshift({
          name,
          emoji: m?.emoji || extra.emoji || moved?.emoji || "🍽️",
          cat: m?.cat || extra.cat || moved?.cat || "직접 추가",
          custom: !m || !!m.custom,
          addedAt: extra.addedAt || Date.now(),
        });
        save();
        return moved ? { moved } : true;
      },

      /** 삭제. 지운 항목을 돌려줌 (되돌리기용) */
      remove(name) {
        const i = list.findIndex((x) => x.name === name);
        if (i < 0) return null;
        const [item] = list.splice(i, 1);
        save();
        return item;
      },

      /** 지운 항목을 원래 자리로 되돌림 (다른 목록에 들어가 있으면 거기서 뺌) */
      restore(item) {
        if (!item || api.has(item.name)) return;
        const other = opts.other?.();
        if (other?.has(item.name)) other.remove(item.name);
        list.push(item);
        list.sort((a, b) => b.addedAt - a.addedAt);
        save();
      },

      /** 등록/해제 전환. 등록 상태가 되면 true */
      toggle(name) {
        if (api.has(name)) {
          api.remove(name);
          return false;
        }
        api.add(name);
        return true;
      },

      /** 목록 통째로 바꾸기 (가져오기·되돌리기) */
      setAll(items) {
        const seen = new Set();
        list = (items || []).filter((x) => x && typeof x.name === "string" && !seen.has(x.name) && seen.add(x.name));
        save();
      },

      onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
    return api;
  }


  const Favorites = createStore("what-to-eat:favorites:v1", { other: () => Excluded });
  const Excluded = createStore("what-to-eat:excluded:v1", { other: () => Favorites });

  // 예전에 이름만 저장한 직접 추가 메뉴 → 비슷한 메뉴 정보로 채워서 추천에도 나오게
  const CM = root.CustomMenus;
  if (CM) {
    for (const x of Favorites.all()) {
      if (!x.custom || CM.has(x.name) || CM.isBuiltin(x.name)) continue;
      const m = CM.build(x.name, { addedAt: x.addedAt });
      if (m) CM.put(m);
    }
  }

  root.Favorites = Favorites;
  root.Excluded = Excluded;
  root.Snoozed = createSnoozeStore("what-to-eat:snoozed:v1");


  /**
   * 💤 일주일간 안 보기 — 기한이 지나면 저절로 다시 추천되는 임시 제외 목록
   * 항목: { name, emoji, until } (until: 다시 추천할 시각 ms)
   * 좋아하는 메뉴·추천 제외와 따로 관리 (최애 메뉴도 잠깐 쉬었다가 돌아옴)
   */
  function createSnoozeStore(KEY) {
    const DAY = 24 * 60 * 60 * 1000;
    const listeners = new Set();
    let timer = null;

    function load() {
      try {
        const a = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(a) ? a.filter((x) => x && typeof x.name === "string" && x.until > Date.now()) : [];
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
      schedule();
      listeners.forEach((fn) => fn(list.slice()));
    }

    /** 기한 지난 항목 정리. 하나라도 지웠으면 true */
    function prune() {
      const n = list.length;
      list = list.filter((x) => x.until > Date.now());
      if (list.length === n) return false;
      save();
      return true;
    }

    /** 가장 먼저 풀리는 시각에 맞춰 정리 예약 (화면을 켜 둔 채 기한이 지나도 바로 다시 추천) */
    function schedule() {
      clearTimeout(timer);
      if (!list.length) return;
      const next = Math.min(...list.map((x) => x.until));
      timer = setTimeout(prune, Math.min(Math.max(next - Date.now(), 0) + 500, 2 ** 31 - 1));
    }

    let list = load();
    schedule();

    root.addEventListener?.("storage", (e) => {
      if (e.key !== KEY) return;
      list = load();
      emit();
    });

    // 잠자기·백그라운드에서 타이머가 늦어질 수 있어 화면이 다시 보일 때도 정리
    root.document?.addEventListener("visibilitychange", () => { if (!root.document.hidden) prune(); });

    const api = {
      DAYS: 7,
      all: () => (prune(), list.slice()),
      count: () => (prune(), list.length),
      has: (name) => list.some((x) => x.name === name && x.until > Date.now()),
      names: () => new Set(list.filter((x) => x.until > Date.now()).map((x) => x.name)),

      /** days 일 동안 추천에서 빼기 (이미 있으면 기한만 새로) */
      add(name, days = api.DAYS) {
        name = String(name || "").trim();
        if (!name) return false;
        const m = findMenu(name);
        list = list.filter((x) => x.name !== name);
        list.unshift({ name, emoji: m?.emoji || "🍽️", until: Date.now() + days * DAY });
        save();
        return true;
      },

      /** 바로 다시 추천. 지운 항목을 돌려줌 (되돌리기용) */
      remove(name) {
        const i = list.findIndex((x) => x.name === name);
        if (i < 0) return null;
        const [item] = list.splice(i, 1);
        save();
        return item;
      },

      restore(item) {
        if (!item || item.until <= Date.now()) return;
        list = list.filter((x) => x.name !== item.name);
        list.push(item);
        list.sort((a, b) => a.until - b.until);
        save();
      },

      clear() {
        list = [];
        save();
      },

      /** 남은 기간 글자: "3일 남음", "5시간 남음" */
      left(item) {
        const ms = item.until - Date.now();
        if (ms >= DAY) return `${Math.ceil(ms / DAY)}일 남음`;
        return `${Math.max(1, Math.ceil(ms / 3600000))}시간 남음`;
      },

      onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    };
    return api;
  }
})(window);

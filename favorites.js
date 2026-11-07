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
})(window);

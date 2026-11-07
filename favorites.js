/**
 * 오늘 뭐 먹지? — 좋아하는 메뉴 저장소 (localStorage)
 * 추천 화면(app.js)과 좋아하는 메뉴 페이지(favorites-page.js)가 함께 씀.
 *
 * 항목: { name, emoji, cat, custom, addedAt }
 *  - name    메뉴 이름 (menus.js 의 name 과 같으면 추천 카드에서 강조)
 *  - custom  menus.js 에 없는 메뉴를 직접 추가했으면 true
 * 다른 탭에서 바꿔도 storage 이벤트로 바로 반영됩니다.
 */
(function (root) {
  const KEY = "what-to-eat:favorites:v1";
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
      console.warn("[좋아하는 메뉴] 저장 실패:", e.message);
    }
    emit();
  }


  function emit() {
    listeners.forEach((fn) => fn(list.slice()));
  }


  /** menus.js 에서 이름으로 메뉴 찾기 */
  function findMenu(name) {
    const menus = root.MENUS_DATA || root.Recommend?.MENUS || [];
    return menus.find((m) => m.name === name) || null;
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
    findMenu,

    /** 추가. 이미 있으면 false */
    add(name, extra = {}) {
      name = String(name || "").trim();
      if (!name || api.has(name)) return false;
      const m = findMenu(name);
      list.unshift({
        name,
        emoji: m?.emoji || extra.emoji || "🍽️",
        cat: m?.cat || extra.cat || "직접 추가",
        custom: !m,
        addedAt: extra.addedAt || Date.now(),
      });
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

    /** 지운 항목을 원래 자리로 되돌림 */
    restore(item) {
      if (!item || api.has(item.name)) return;
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

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  root.Favorites = api;
})(window);

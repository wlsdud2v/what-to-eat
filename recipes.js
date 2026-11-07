/**
 * 오늘 뭐 먹지? — 레시피 검색 (주변 식당과 같은 단계의 섹션)
 *
 * 선택한 추천 메뉴를 따라가고, 검색창에 직접 요리·재료를 입력해 찾을 수도 있습니다.
 * 레시피 사이트들은 브라우저에서 바로 부를 수 있는 공개 API 가 없어서(CORS·키 필요)
 * 각 사이트의 검색 결과 페이지를 새 탭으로 엽니다.
 *
 * 사용: const rs = RecipeSearch.create(); rs.setMenu(menu);
 * 최근 검색어는 localStorage(`what-to-eat:recipe-recent:v1`)에 최대 8개 저장합니다.
 */
(function (root) {
  const RECENT_KEY = "what-to-eat:recipe-recent:v1";
  const RECENT_MAX = 8;

  /** 검색 방식: 검색어 뒤에 붙일 말 */
  const VARIANTS = [
    { id: "", label: "기본" },
    { id: "간단", label: "간단하게" },
    { id: "황금레시피", label: "황금레시피" },
    { id: "1인분", label: "1인분" },
    { id: "에어프라이어", label: "에어프라이어" },
  ];

  /** 검색 사이트. url(q) 의 q 는 이미 '레시피'가 붙은 검색어(withRecipe) 또는 그냥 검색어 */
  const SITES = [
    { id: "10000", name: "만개의레시피", icon: "🍳", sub: "레시피 모음", url: (q) => `https://www.10000recipe.com/recipe/list.html?q=${enc(q)}` },
    { id: "youtube", name: "유튜브", icon: "▶️", sub: "영상으로 보기", url: (q) => `https://www.youtube.com/results?search_query=${enc(withRecipe(q))}` },
    { id: "naver", name: "네이버", icon: "🟢", sub: "블로그·카페 레시피", url: (q) => `https://search.naver.com/search.naver?query=${enc(withRecipe(q))}` },
    { id: "google", name: "구글", icon: "🔎", sub: "웹 전체 검색", url: (q) => `https://www.google.com/search?q=${enc(withRecipe(q))}` },
  ];

  const enc = encodeURIComponent;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));


  /** '레시피'가 없으면 붙임 (황금레시피처럼 이미 들어 있으면 그대로) */
  function withRecipe(q) {
    return /레시피/.test(q) ? q : `${q} 레시피`;
  }


  /** 메뉴 이름 → 검색어. "설렁탕·곰탕" 처럼 묶인 이름은 첫 이름만 */
  function menuQuery(menu) {
    return menu ? menu.name.split("·")[0].trim() : "";
  }


  function loadRecent() {
    try {
      const a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(a) ? a.filter((x) => typeof x === "string" && x.trim()).slice(0, RECENT_MAX) : [];
    } catch {
      return [];
    }
  }


  function saveRecent(list) {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn("[레시피] 최근 검색어 저장 실패:", e.message);
    }
  }


  function create() {
    const $ = (sel) => document.querySelector(sel);
    const el = {
      title: $("#recipes-title"),
      form: $("#recipe-form"),
      input: $("#recipe-input"),
      reset: $("#btn-recipe-menu"),
      variants: $("#recipe-variants"),
      sites: $("#recipe-sites"),
      recent: $("#recipe-recent"),
    };

    const state = {
      menu: null,      // 선택한 추천 메뉴
      custom: false,   // 사용자가 검색어를 직접 바꿨으면 true (메뉴가 바뀌면 다시 false)
      variant: "",
      recent: loadRecent(),
    };


    /** 지금 검색어 (검색 방식 포함) */
    function query() {
      const base = el.input.value.trim() || menuQuery(state.menu);
      if (!base) return "";
      return state.variant && !base.includes(state.variant) ? `${base} ${state.variant}` : base;
    }


    function render() {
      const base = el.input.value.trim() || menuQuery(state.menu);
      const m = state.menu;
      el.title.textContent = state.custom && base
        ? `'${base}' 레시피`
        : m ? `${m.name}, 집에서 만들어 먹기` : "집에서 만들어 먹기";
      el.reset.hidden = !(state.custom && m);
      if (m) el.reset.textContent = `↺ ${menuQuery(m)}(으)로`;

      el.variants.innerHTML = VARIANTS.map((v) =>
        `<button type="button" class="chip ${v.id === state.variant ? "on" : ""}" data-variant="${esc(v.id)}" aria-pressed="${v.id === state.variant}">${esc(v.label)}</button>`).join("");

      renderSites();
      renderRecent();
    }


    /** 사이트 버튼의 링크만 갈아 끼움 (입력할 때마다 호출) */
    function renderSites() {
      const q = query();
      if (!q) {
        el.sites.innerHTML = '<div class="empty">추천 메뉴를 고르거나 요리 이름을 입력해 주세요.</div>';
        return;
      }
      el.sites.innerHTML = SITES.map((s) =>
        `<a class="site site-${s.id}" href="${esc(s.url(q))}" target="_blank" rel="noopener" data-site="${s.id}">
          <span class="ico">${s.icon}</span>
          <span class="tx"><b>${esc(s.name)}</b><small>${esc(s.sub)}</small></span>
          <span class="go" aria-hidden="true">↗</span>
        </a>`).join("");
    }


    function renderRecent() {
      if (!state.recent.length) {
        el.recent.innerHTML = "";
        return;
      }
      el.recent.innerHTML = `<span class="lbl">최근 검색</span>` +
        state.recent.map((q) => `<button type="button" class="chip" data-recent="${esc(q)}">${esc(q)}</button>`).join("") +
        `<button type="button" class="clear" data-clear>지우기</button>`;
    }


    function remember(q) {
      if (!q) return;
      state.recent = [q, ...state.recent.filter((x) => x !== q)].slice(0, RECENT_MAX);
      saveRecent(state.recent);
      renderRecent();
    }


    /** 검색창 값을 메뉴 이름으로 되돌림 */
    function followMenu() {
      state.custom = false;
      el.input.value = menuQuery(state.menu);
      render();
    }


    // ── 이벤트 ──
    el.input.addEventListener("input", () => {
      state.custom = el.input.value.trim() !== menuQuery(state.menu);
      render();
    });

    // 검색 = 대표 사이트(만개의레시피)를 새 탭으로
    el.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = query();
      if (!q) {
        el.input.focus();
        return;
      }
      remember(q);
      el.input.blur(); // 모바일 키보드 닫기
      window.open(SITES[0].url(q), "_blank", "noopener");
    });

    el.sites.addEventListener("click", (e) => {
      if (e.target.closest(".site")) remember(query());
    });

    el.variants.addEventListener("click", (e) => {
      const b = e.target.closest("[data-variant]");
      if (!b) return;
      state.variant = b.dataset.variant;
      render();
    });

    el.recent.addEventListener("click", (e) => {
      if (e.target.closest("[data-clear]")) {
        state.recent = [];
        saveRecent(state.recent);
        renderRecent();
        return;
      }
      const b = e.target.closest("[data-recent]");
      if (!b) return;
      el.input.value = b.dataset.recent;
      state.variant = "";
      state.custom = el.input.value !== menuQuery(state.menu);
      render();
    });

    el.reset.addEventListener("click", followMenu);

    // 다른 탭에서 최근 검색을 바꾸면 반영
    window.addEventListener("storage", (e) => {
      if (e.key !== RECENT_KEY) return;
      state.recent = loadRecent();
      renderRecent();
    });

    render();


    return {
      /**
       * 선택한 추천 메뉴 알려주기.
       * 직접 입력한 검색어는 자동 재추천으로 덮어쓰지 않고, follow(사용자가 카드를 고름)일 때만 메뉴로 되돌림
       */
      setMenu(menu, { follow = false } = {}) {
        const same = (menu?.name || "") === (state.menu?.name || "");
        state.menu = menu || null;
        if (follow || !state.custom) followMenu();
        else if (!same) render(); // 되돌리기 버튼 이름만 갱신
      },
    };
  }


  root.RecipeSearch = { create, SITES, VARIANTS };
})(typeof window !== "undefined" ? window : globalThis);

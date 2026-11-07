/* 오늘 뭐 먹지? — 내 메뉴 관리 페이지 (좋아하는 메뉴 · 추천 제외 메뉴: 추가·삭제·옮기기·검색) */
(function () {
  const Fav = window.Favorites;
  const Ex = window.Excluded;
  const MENUS = window.MENUS_DATA || [];
  const CATS = ["한식", "중식", "일식", "양식", "분식", "아시안", "직접 추가"];

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /** 검색용 정규화: 공백·가운뎃점 제거, 소문자 */
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s·・.,]/g, "");

  /** 탭별 설정. 주소의 #excluded 면 추천 제외 탭 */
  const TABS = {
    fav: {
      store: Fav, other: "ex", hash: "#favorites", page: "좋아하는 메뉴",
      title: "💗 좋아하는 메뉴", desc: "등록한 메뉴가 추천에 나오면 카드가 분홍색으로 강조돼요.",
      addTitle: "메뉴 추가", listTitle: "내 메뉴", done: "✓ 등록됨", custom: true,
      added: (n) => `💗 '${n}'을(를) 좋아하는 메뉴로 등록했어요`,
      removed: (n) => `'${n}'을(를) 좋아하는 메뉴에서 뺐어요`,
      empty: "아직 등록한 메뉴가 없어요.<br/>위에서 메뉴를 추가하거나, 추천 카드의 ♡ 를 눌러 보세요.",
      delIcon: "🗑️", delLabel: "삭제", moveIcon: "🚫", moveLabel: "추천에서 빼기",
    },
    ex: {
      store: Ex, other: "fav", hash: "#excluded", page: "추천 제외",
      title: "🚫 추천 제외 메뉴", desc: "여기 있는 메뉴는 추천 카드에 나오지 않아요.",
      addTitle: "제외할 메뉴 추가", listTitle: "제외한 메뉴", done: "✓ 제외됨", custom: false,
      added: (n) => `🚫 '${n}'은(는) 이제 추천하지 않아요`,
      removed: (n) => `'${n}'을(를) 다시 추천해요`,
      empty: "제외한 메뉴가 없어요.<br/>싫어하거나 못 먹는 메뉴를 위에서 추가하거나, 추천 카드의 🚫 를 눌러 보세요.",
      delIcon: "↩️", delLabel: "다시 추천하기", moveIcon: "💗", moveLabel: "좋아하는 메뉴로 옮기기",
    },
  };

  const state = { tab: tabFromHash(), filter: "", cat: "", sort: "recent" };
  const cfg = () => TABS[state.tab];
  const store = () => cfg().store;
  const otherCfg = () => TABS[cfg().other];

  function tabFromHash() {
    return location.hash === "#excluded" ? "ex" : "fav";
  }


  // ── 탭 ─────────────────────────────────────
  function renderTabs() {
    const c = cfg();
    document.body.classList.toggle("ex-tab", state.tab === "ex");
    document.title = `${c.page} · 오늘 뭐 먹지?`;
    $("#fp-title").textContent = c.title;
    $("#fp-desc").textContent = c.desc;
    $("#add-title").textContent = c.addTitle;
    $("#list-title").textContent = c.listTitle;
    $("#add-input").placeholder = state.tab === "ex"
      ? "추천에서 뺄 메뉴 (예: 마라탕, 홍어삼합, 회)"
      : "메뉴 이름 (예: 짬뽕, 마라탕, 냉면)";
    document.querySelectorAll(".fp-tab").forEach((a) => {
      const on = a.dataset.tab === state.tab;
      a.classList.toggle("on", on);
      a.setAttribute("aria-selected", String(on));
    });
    $("#tab-fav-n").textContent = Fav.count() || "";
    $("#tab-ex-n").textContent = Ex.count() || "";
  }


  function setTab(tab) {
    if (tab === state.tab) return;
    state.tab = tab;
    state.filter = "";
    state.cat = "";
    $("#filter-input").value = "";
    renderAll();
  }


  // ── 메뉴 후보 (추가용) ──────────────────────
  /** 이름 > 이름 앞부분 > 이름 포함 > 키워드 포함 순으로 후보 */
  function suggest(q, limit = 8) {
    const n = norm(q);
    if (!n) return [];
    const scored = [];
    for (const m of MENUS) {
      const name = norm(m.name);
      let s = 0;
      if (name === n) s = 4;
      else if (name.startsWith(n)) s = 3;
      else if (name.includes(n)) s = 2;
      else if ((m.kw || []).some((k) => norm(k).includes(n))) s = 1;
      if (s) scored.push({ m, s });
    }
    scored.sort((a, b) => b.s - a.s || a.m.name.length - b.m.name.length || a.m.name.localeCompare(b.m.name, "ko"));
    return scored.slice(0, limit).map((x) => x.m);
  }


  function renderSuggest() {
    const q = $("#add-input").value.trim();
    const box = $("#suggest");
    if (!q) {
      box.innerHTML = "";
      return;
    }
    const c = cfg();
    const oc = otherCfg();
    const list = suggest(q);
    const exact = MENUS.some((m) => norm(m.name) === norm(q));
    const rows = list.map((m) => {
      const has = store().has(m.name);
      const inOther = !has && oc.store.has(m.name);
      const note = inOther ? `<small class="move-note">${oc.title.split(" ")[0]} ${oc.page}에 있어요 · 추가하면 옮겨져요</small>` : "";
      return `<li>
        <span class="em">${m.emoji}</span>
        <div class="tx"><b>${esc(m.name)}</b><small>${esc(m.cat)} · ${esc(m.desc)}</small>${note}</div>
        <button type="button" class="fp-add ${has ? "done" : ""}" data-add="${esc(m.name)}" ${has ? "disabled" : ""}>${has ? c.done : "+ 추가"}</button>
      </li>`;
    });
    if (c.custom && !exact && !store().has(q)) {
      rows.push(`<li class="custom">
        <span class="em">🍽️</span>
        <div class="tx"><b>'${esc(q)}' 직접 추가</b><small>메뉴 목록에 없는 이름이라 추천 카드에는 나오지 않아요</small></div>
        <button type="button" class="fp-add" data-add="${esc(q)}">+ 추가</button>
      </li>`);
    }
    if (!rows.length) rows.push(`<li class="custom"><span class="em">🔍</span><div class="tx"><b>'${esc(q)}'에 맞는 메뉴가 없어요</b><small>추천 목록에 있는 메뉴만 제외할 수 있어요</small></div></li>`);
    box.innerHTML = rows.join("");
  }


  function add(name) {
    const c = cfg();
    const r = store().add(name);
    if (!r) toast(`'${name}'은(는) 이미 ${c.page}에 있어요`);
    else if (r.moved) toast(`${c.added(name)} (${otherCfg().page}에서 옮김)`);
    else toast(c.added(name));
  }


  // ── 목록 ────────────────────────────────────
  function matches(item, q) {
    if (!q) return true;
    const m = store().findMenu(item.name);
    const hay = [item.name, item.cat, m?.desc, ...(m?.kw || [])].map(norm).join("|");
    return hay.includes(q);
  }


  function renderList() {
    const c = cfg();
    const all = store().all();
    $("#fp-total").textContent = all.length ? `지금 ${all.length}개 있어요.` : "";
    $("#fp-count").textContent = all.length ? `${all.length}` : "";

    // 들어 있는 종류만 칩으로
    const present = CATS.filter((x) => all.some((it) => it.cat === x));
    if (state.cat && !present.includes(state.cat)) state.cat = "";
    $("#cat-filter").innerHTML = present.length > 1
      ? [`<button class="chip ${state.cat ? "" : "on"}" data-cat="">전체</button>`]
          .concat(present.map((x) => `<button class="chip ${state.cat === x ? "on" : ""}" data-cat="${x}">${x}</button>`)).join("")
      : "";

    const q = norm(state.filter);
    let list = all.filter((x) => (!state.cat || x.cat === state.cat) && matches(x, q));
    if (state.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    else if (state.sort === "cat") list.sort((a, b) => CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || a.name.localeCompare(b.name, "ko"));

    const box = $("#fav-list");
    if (!all.length) {
      box.innerHTML = `<li class="empty">${c.empty}</li>`;
      return;
    }
    if (!list.length) {
      box.innerHTML = `<li class="empty">'${esc(state.filter || state.cat)}'에 맞는 메뉴가 없어요.</li>`;
      return;
    }
    box.innerHTML = list.map((x) => {
      const m = store().findMenu(x.name);
      const d = new Date(x.addedAt);
      const date = isNaN(d) ? "" : `${d.getMonth() + 1}/${d.getDate()} 추가`;
      const sub = m ? `${esc(m.cat)} · ${esc(m.desc)}` : "직접 추가한 메뉴 · 추천 카드에는 나오지 않아요";
      const kq = encodeURIComponent(x.name.split("·")[0]);
      // 직접 추가한 메뉴는 추천에 안 나오므로 제외 목록으로 옮길 필요가 없음
      const move = m ? `<button type="button" class="fp-move" data-move="${esc(x.name)}" aria-label="${esc(x.name)} ${c.moveLabel}" title="${c.moveLabel}">${c.moveIcon}</button>` : "";
      return `<li class="fp-item">
        <span class="em">${esc(x.emoji)}</span>
        <div class="tx"><b>${esc(x.name)}</b><small>${sub}</small><small class="date">${date}</small></div>
        <div class="acts">
          <a class="fp-map" href="https://map.kakao.com/link/search/${kq}" target="_blank" rel="noopener" title="카카오맵에서 찾기">🗺️</a>
          ${move}
          <button type="button" class="fp-del" data-del="${esc(x.name)}" aria-label="${esc(x.name)} ${c.delLabel}" title="${c.delLabel}">${c.delIcon}</button>
        </div>
      </li>`;
    }).join("");
  }


  function renderAll() {
    renderTabs();
    renderList();
    renderSuggest();
  }


  // ── 토스트 (되돌리기) ───────────────────────
  let toastTimer;
  let undoFn = null;
  function toast(msg, undo) {
    const t = $("#toast");
    undoFn = undo || null;
    t.innerHTML = esc(msg) + (undo ? ' <button type="button" class="undo">되돌리기</button>' : "");
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), undo ? 4500 : 2200);
  }


  // ── 이벤트 ──────────────────────────────────
  window.addEventListener("hashchange", () => setTab(tabFromHash()));

  document.querySelector(".fp-tabs").addEventListener("click", (e) => {
    const a = e.target.closest(".fp-tab");
    if (!a) return;
    e.preventDefault();
    history.replaceState(null, "", TABS[a.dataset.tab].hash);
    setTab(a.dataset.tab);
  });

  $("#add-input").addEventListener("input", renderSuggest);

  $("#add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#add-input").value.trim();
    if (!q) return;
    const exact = MENUS.find((m) => norm(m.name) === norm(q));
    if (exact) add(exact.name);
    else if (cfg().custom && !suggest(q).length) add(q);
    else {
      toast(cfg().custom ? "아래 후보에서 골라 주세요 (목록 맨 아래에서 직접 추가도 돼요)" : "아래 후보에서 골라 주세요");
      return;
    }
    $("#add-input").value = "";
    renderSuggest();
  });

  $("#suggest").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (b) add(b.dataset.add);
  });

  $("#fav-list").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      const s = store();
      const c = cfg();
      const item = s.remove(del.dataset.del);
      if (item) toast(c.removed(item.name), () => {
        s.restore(item);
        toast(`'${item.name}'을(를) 되돌렸어요`);
      });
      return;
    }
    const mv = e.target.closest("[data-move]");
    if (mv) {
      const name = mv.dataset.move;
      const from = store();
      const to = otherCfg();
      const r = to.store.add(name); // 다른 목록에 넣으면 이 목록에서는 자동으로 빠짐
      if (r) toast(`'${name}'을(를) ${to.page}(으)로 옮겼어요`, () => {
        to.store.remove(name);
        if (r.moved) from.restore(r.moved);
        toast(`'${name}'을(를) 되돌렸어요`);
      });
    }
  });

  $("#toast").addEventListener("click", (e) => {
    if (!e.target.closest(".undo") || !undoFn) return;
    const fn = undoFn;
    undoFn = null;
    fn();
  });

  $("#filter-input").addEventListener("input", (e) => {
    state.filter = e.target.value.trim();
    renderList();
  });

  $("#cat-filter").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state.cat = b.dataset.cat;
    renderList();
  });

  $("#sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    renderList();
  });

  // 추가·삭제·옮기기(다른 탭 포함)되면 탭 숫자·목록·후보 버튼 상태 갱신
  Fav.onChange(renderAll);
  Ex.onChange(renderAll);


  renderAll();
})();

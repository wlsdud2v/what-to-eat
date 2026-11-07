/* 오늘 뭐 먹지? — 좋아하는 메뉴 페이지 (추가·삭제·검색) */
(function () {
  const Fav = window.Favorites;
  const MENUS = window.MENUS_DATA || [];
  const CATS = ["한식", "중식", "일식", "양식", "분식", "아시안", "직접 추가"];

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /** 검색용 정규화: 공백·가운뎃점 제거, 소문자 */
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s·・.,]/g, "");

  const state = { filter: "", cat: "", sort: "recent" };


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
    const list = suggest(q);
    const exact = MENUS.some((m) => norm(m.name) === norm(q));
    const rows = list.map((m) => {
      const has = Fav.has(m.name);
      return `<li>
        <span class="em">${m.emoji}</span>
        <div class="tx"><b>${esc(m.name)}</b><small>${esc(m.cat)} · ${esc(m.desc)}</small></div>
        <button type="button" class="fp-add ${has ? "done" : ""}" data-add="${esc(m.name)}" ${has ? "disabled" : ""}>${has ? "✓ 등록됨" : "+ 추가"}</button>
      </li>`;
    });
    if (!exact && !Fav.has(q)) {
      rows.push(`<li class="custom">
        <span class="em">🍽️</span>
        <div class="tx"><b>'${esc(q)}' 직접 추가</b><small>메뉴 목록에 없는 이름이라 추천 카드에는 나오지 않아요</small></div>
        <button type="button" class="fp-add" data-add="${esc(q)}">+ 추가</button>
      </li>`);
    }
    box.innerHTML = rows.join("");
  }


  function add(name) {
    if (Fav.add(name)) toast(`💗 '${name}'을(를) 등록했어요`);
    else toast(`'${name}'은(는) 이미 등록돼 있어요`);
  }


  // ── 내 메뉴 목록 ────────────────────────────
  function matches(item, q) {
    if (!q) return true;
    const m = Fav.findMenu(item.name);
    const hay = [item.name, item.cat, m?.desc, ...(m?.kw || [])].map(norm).join("|");
    return hay.includes(q);
  }


  function renderList() {
    const all = Fav.all();
    $("#fp-total").textContent = all.length ? `지금 ${all.length}개 등록돼 있어요.` : "";
    $("#fp-count").textContent = all.length ? `${all.length}` : "";

    // 등록된 종류만 칩으로
    const present = CATS.filter((c) => all.some((x) => x.cat === c));
    if (state.cat && !present.includes(state.cat)) state.cat = "";
    $("#cat-filter").innerHTML = present.length > 1
      ? [`<button class="chip ${state.cat ? "" : "on"}" data-cat="">전체</button>`]
          .concat(present.map((c) => `<button class="chip ${state.cat === c ? "on" : ""}" data-cat="${c}">${c}</button>`)).join("")
      : "";

    const q = norm(state.filter);
    let list = all.filter((x) => (!state.cat || x.cat === state.cat) && matches(x, q));
    if (state.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    else if (state.sort === "cat") list.sort((a, b) => CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || a.name.localeCompare(b.name, "ko"));

    const box = $("#fav-list");
    if (!all.length) {
      box.innerHTML = `<li class="empty">아직 등록한 메뉴가 없어요.<br/>위에서 메뉴를 추가하거나, 추천 카드의 ♡ 를 눌러 보세요.</li>`;
      return;
    }
    if (!list.length) {
      box.innerHTML = `<li class="empty">'${esc(state.filter || state.cat)}'에 맞는 메뉴가 없어요.</li>`;
      return;
    }
    box.innerHTML = list.map((x) => {
      const m = Fav.findMenu(x.name);
      const d = new Date(x.addedAt);
      const date = isNaN(d) ? "" : `${d.getMonth() + 1}/${d.getDate()} 등록`;
      const sub = m ? `${esc(m.cat)} · ${esc(m.desc)}` : "직접 추가한 메뉴 · 추천 카드에는 나오지 않아요";
      const kq = encodeURIComponent(x.name.split("·")[0]);
      return `<li class="fp-item">
        <span class="em">${esc(x.emoji)}</span>
        <div class="tx"><b>${esc(x.name)}</b><small>${sub}</small><small class="date">${date}</small></div>
        <div class="acts">
          <a class="fp-map" href="https://map.kakao.com/link/search/${kq}" target="_blank" rel="noopener" title="카카오맵에서 찾기">🗺️</a>
          <button type="button" class="fp-del" data-del="${esc(x.name)}" aria-label="${esc(x.name)} 삭제" title="삭제">🗑️</button>
        </div>
      </li>`;
    }).join("");
  }


  // ── 토스트 (삭제 되돌리기) ──────────────────
  let toastTimer;
  let undoItem = null;
  function toast(msg, undo) {
    const t = $("#toast");
    undoItem = undo || null;
    t.innerHTML = esc(msg) + (undo ? ' <button type="button" class="undo">되돌리기</button>' : "");
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), undo ? 4500 : 2200);
  }


  // ── 이벤트 ──────────────────────────────────
  $("#add-input").addEventListener("input", renderSuggest);

  $("#add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#add-input").value.trim();
    if (!q) return;
    const exact = MENUS.find((m) => norm(m.name) === norm(q));
    if (exact) add(exact.name);
    else if (!suggest(q).length) add(q);
    else {
      toast("아래 후보에서 골라 주세요 (목록 맨 아래에서 직접 추가도 돼요)");
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
    const b = e.target.closest("[data-del]");
    if (!b) return;
    const item = Fav.remove(b.dataset.del);
    if (item) toast(`'${item.name}'을(를) 삭제했어요`, item);
  });

  $("#toast").addEventListener("click", (e) => {
    if (!e.target.closest(".undo") || !undoItem) return;
    Fav.restore(undoItem);
    toast(`'${undoItem.name}'을(를) 되돌렸어요`);
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

  // 추가·삭제(다른 탭 포함)되면 목록과 후보 버튼 상태 갱신
  Fav.onChange(() => {
    renderList();
    renderSuggest();
  });


  renderList();
})();

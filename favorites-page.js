/* 오늘 뭐 먹지? — 내 메뉴 관리 페이지
 * 좋아하는 메뉴 · 직접 추가 메뉴 · 추천 제외 메뉴 (추가·고치기·삭제·옮기기·검색) + 내보내기·가져오기 */
(function () {
  const Fav = window.Favorites;
  const Ex = window.Excluded;
  const CM = window.CustomMenus;
  const XF = window.MenuTransfer;
  const allMenus = () => window.allMenus();
  const CATS = ["한식", "중식", "일식", "양식", "분식", "아시안", "직접 추가"];

  const TEMP_KO = { hot: "🔥 뜨거운", cold: "🧊 차가운", neutral: "🍽️ 보통" };
  const MEAL_KO = { lunch: "점심", dinner: "저녁", both: "점심·저녁" };
  const SEASON_KO = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };
  const WEATHER_KO = {
    rain: "🌧️ 비", snow: "❄️ 눈", hot: "☀️ 무더위", cold: "🥶 추위", chilly: "🍃 쌀쌀",
    mild: "🌤️ 선선", clear: "☀️ 맑음", cloudy: "☁️ 흐림", humid: "💦 후덥지근", windy: "🌬️ 바람",
  };
  const FLAGS = { kid: "👶 아이와 OK", light: "🥗 가벼운 식사", drink: "🍶 반주·안주" };

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /** 검색용 정규화: 공백·가운뎃점 제거, 소문자 */
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s·・.,]/g, "");

  /** 탭별 설정. 주소의 #custom 이면 직접 추가, #excluded 면 추천 제외 탭 */
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
    my: {
      store: CM, other: null, hash: "#custom", page: "직접 추가 메뉴",
      title: "✏️ 직접 추가 메뉴", desc: "목록에 없는 메뉴도 추천에 나와요. 안 고른 정보는 이름이 비슷한 메뉴에서 가져와요.",
      addTitle: "새 메뉴 만들기", listTitle: "내가 만든 메뉴",
      removed: (n) => `'${n}'을(를) 지웠어요`,
      empty: "아직 만든 메뉴가 없어요.<br/>위에 메뉴 이름을 넣으면 정보를 골라 추가할 수 있어요.",
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

  const state = {
    tab: tabFromHash(), filter: "", cat: "", sort: "recent",
    // 직접 추가 탭의 메뉴 정보 고르기: opts 는 사용자가 직접 고른 값만 (나머지는 비슷한 메뉴에서)
    draft: { opts: {}, editing: null, fav: true },
  };
  const cfg = () => TABS[state.tab];
  const store = () => cfg().store;
  const otherCfg = () => TABS[cfg().other];
  const isMy = () => state.tab === "my";

  function tabFromHash() {
    if (location.hash === "#excluded") return "ex";
    if (location.hash === "#custom") return "my";
    return "fav";
  }


  // ── 탭 ─────────────────────────────────────
  function renderTabs() {
    const c = cfg();
    document.body.classList.toggle("ex-tab", state.tab === "ex");
    document.body.classList.toggle("my-tab", isMy());
    document.title = `${c.page} · 오늘 뭐 먹지?`;
    $("#fp-title").textContent = c.title;
    $("#fp-desc").textContent = c.desc;
    $("#add-title").textContent = c.addTitle;
    $("#list-title").textContent = c.listTitle;
    $("#add-input").placeholder = state.tab === "ex"
      ? "추천에서 뺄 메뉴 (예: 마라탕, 홍어삼합, 회)"
      : isMy() ? "새 메뉴 이름 (예: 닭칼국수, 엄마표 김치볶음밥)" : "메뉴 이름 (예: 짬뽕, 마라탕, 냉면)";
    $("#add-form button").textContent = isMy() ? "만들기" : "추가";
    document.querySelectorAll(".fp-tab").forEach((a) => {
      const on = a.dataset.tab === state.tab;
      a.classList.toggle("on", on);
      a.setAttribute("aria-selected", String(on));
    });
    $("#tab-fav-n").textContent = Fav.count() || "";
    $("#tab-my-n").textContent = CM.count() || "";
    $("#tab-ex-n").textContent = Ex.count() || "";
    $("#suggest").hidden = isMy();
  }


  function setTab(tab, opts = {}) {
    if (tab === state.tab && !opts.force) return;
    state.tab = tab;
    state.filter = "";
    state.cat = "";
    $("#filter-input").value = "";
    if (state.draft.editing) endEdit();
    if (!opts.keepInput) $("#add-input").value = "";
    renderAll();
    renderEditor();
  }


  // ── 메뉴 후보 (추가용) ──────────────────────
  /** 이름 > 이름 앞부분 > 이름 포함 > 키워드 포함 순으로 후보 (직접 추가 메뉴 포함) */
  function suggest(q, limit = 8) {
    const n = norm(q);
    if (!n) return [];
    const scored = [];
    for (const m of allMenus()) {
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

  const exactMenu = (q) => allMenus().find((m) => norm(m.name) === norm(q)) || null;


  function renderSuggest() {
    const box = $("#suggest");
    const q = $("#add-input").value.trim();
    if (!q || isMy()) {
      box.innerHTML = "";
      return;
    }
    const c = cfg();
    const oc = otherCfg();
    const list = suggest(q);
    const exact = exactMenu(q);
    const rows = list.map((m) => {
      const has = store().has(m.name);
      const inOther = !has && oc.store.has(m.name);
      const note = inOther ? `<small class="move-note">${oc.title.split(" ")[0]} ${oc.page}에 있어요 · 추가하면 옮겨져요</small>` : "";
      return `<li>
        <span class="em">${esc(m.emoji)}</span>
        <div class="tx"><b>${esc(m.name)}</b><small>${m.custom ? "✏️ 직접 추가 · " : ""}${esc(m.cat)} · ${esc(m.desc)}</small>${note}</div>
        <button type="button" class="fp-add ${has ? "done" : ""}" data-add="${esc(m.name)}" ${has ? "disabled" : ""}>${has ? c.done : "+ 추가"}</button>
      </li>`;
    });
    if (c.custom && !exact && !store().has(q)) {
      const ref = CM.similar(q);
      rows.push(`<li class="custom">
        <span class="em">${esc(ref?.emoji || "🍽️")}</span>
        <div class="tx"><b>'${esc(q)}' 직접 추가</b><small>${ref ? `'${esc(ref.name)}' 정보로 추천에도 나와요` : "추천에도 나와요"} · ✏️ 직접 추가 탭에서 고칠 수 있어요</small></div>
        <button type="button" class="fp-add" data-quick="${esc(q)}">+ 추가</button>
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


  /** 좋아하는 메뉴 탭에서 목록에 없는 이름 바로 추가: 비슷한 메뉴 정보로 직접 추가 메뉴 + 좋아하는 메뉴 */
  function quickCustom(name) {
    if (!CM.has(name)) {
      const m = CM.build(name);
      if (!m || !CM.put(m)) {
        toast(m ? `직접 추가 메뉴는 ${CM.LIMIT.count}개까지 만들 수 있어요` : "추가할 수 없는 이름이에요");
        return;
      }
    }
    Fav.add(name);
    toast(`💗 '${name}'을(를) 추가했어요 · 이제 추천에도 나와요`);
  }


  // ── 직접 추가: 메뉴 정보 고르기 ─────────────
  function draftName() {
    return state.draft.editing || $("#add-input").value.trim();
  }

  /** 지금 고른 값으로 만든 메뉴 (이름이 비었거나 기존 메뉴면 null) */
  function draftMenu() {
    const name = draftName();
    return name ? CM.build(name, state.draft.opts) : null;
  }


  function chipRow(label, field, values, labels, menu, kind, hint = "") {
    const cur = menu[field];
    const chips = values.map((v) => {
      const on = kind === "multi" ? cur.includes(v) : cur === v;
      return `<button type="button" class="chip ${on ? "on" : ""}" data-f="${field}" data-v="${v}" data-k="${kind}" aria-pressed="${on}">${esc(labels[v] || v)}</button>`;
    }).join("");
    return `<div class="cm-row"><span>${label}${hint ? ` <small class="hint">${hint}</small>` : ""}</span><div class="chips">${chips}</div></div>`;
  }


  function renderEditor() {
    const box = $("#editor");
    const name = draftName();
    if (!isMy() || !name) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    const d = state.draft;

    // 이미 있는 메뉴 이름이면 안내만
    const builtin = !d.editing && exactMenu(name);
    if (builtin && !builtin.custom) {
      const fav = Fav.has(builtin.name);
      box.innerHTML = `<div class="cm-head"><span class="em">${esc(builtin.emoji)}</span><div><b>'${esc(builtin.name)}'은(는) 이미 메뉴 목록에 있어요</b><small>${esc(builtin.cat)} · ${esc(builtin.desc)}</small></div></div>
        <div class="cm-actions"><button type="button" class="pill-btn soft" data-act="fav-builtin" data-name="${esc(builtin.name)}" ${fav ? "disabled" : ""}>${fav ? "💗 이미 좋아하는 메뉴예요" : "💗 좋아하는 메뉴로 등록"}</button></div>`;
      return;
    }
    if (!d.editing && builtin && builtin.custom) {
      box.innerHTML = `<div class="cm-head"><span class="em">${esc(builtin.emoji)}</span><div><b>'${esc(builtin.name)}'은(는) 이미 만든 메뉴예요</b><small>아래 목록에서 ✏️ 를 눌러 고칠 수 있어요</small></div></div>
        <div class="cm-actions"><button type="button" class="pill-btn soft" data-act="edit" data-name="${esc(builtin.name)}">✏️ 고치기</button></div>`;
      return;
    }

    const m = draftMenu();
    if (!m) {
      box.innerHTML = `<div class="cm-head"><span class="em">🤔</span><div><b>쓸 수 없는 이름이에요</b><small>다른 이름을 넣어 주세요</small></div></div>`;
      return;
    }
    const descVal = d.opts.desc ?? (m.desc === CM.DEFAULT_DESC ? "" : m.desc);
    const refNote = m.ref
      ? `🔎 '${esc(m.ref)}' 정보를 참고했어요 · 원하는 대로 바꿔 보세요`
      : "비슷한 메뉴를 못 찾아 기본값을 넣었어요 · 골라 주세요";
    box.innerHTML = `
      <div class="cm-head"><span class="em" id="cm-emoji-view">${esc(m.emoji)}</span><div><b>${esc(m.name)}</b><small>${d.editing ? "✏️ 메뉴 정보 고치기" : refNote}</small></div></div>
      ${chipRow("분류", "cat", CM.CATS, Object.fromEntries(CM.CATS.map((x) => [x, x])), m, "one")}
      ${chipRow("온도", "temp", CM.TEMPS, TEMP_KO, m, "one")}
      ${chipRow("끼니", "meal", CM.MEALS, MEAL_KO, m, "one")}
      ${chipRow("계절", "seasons", CM.SEASONS, SEASON_KO, m, "multi", "안 고르면 사계절")}
      ${chipRow("어울리는 날씨", "weather", CM.WEATHER, WEATHER_KO, m, "multi")}
      <div class="cm-row"><span>특징</span><div class="chips">${Object.entries(FLAGS).map(([k, label]) =>
        `<button type="button" class="chip ${m[k] ? "on" : ""}" data-f="${k}" data-k="flag" aria-pressed="${!!m[k]}">${label}</button>`).join("")}</div></div>
      <div class="cm-text">
        <input id="cm-emoji" value="${esc(d.opts.emoji ?? m.emoji)}" maxlength="8" aria-label="이모지" />
        <input id="cm-desc" value="${esc(descVal)}" maxlength="${CM.LIMIT.desc}" placeholder="한 줄 설명 (예: 회사 앞 단골집)" aria-label="한 줄 설명" />
      </div>
      ${d.editing ? "" : `<label class="cm-check"><input type="checkbox" id="cm-fav" ${d.fav ? "checked" : ""} /> 💗 좋아하는 메뉴에도 등록</label>`}
      <div class="cm-actions">
        ${d.editing
          ? `<button type="button" class="pill-btn soft" data-act="cancel">취소</button><button type="button" class="pill-btn primary" data-act="save">저장</button>`
          : `<button type="button" class="pill-btn primary" data-act="create">＋ 메뉴 추가</button>`}
      </div>`;
  }


  function createDraft() {
    const name = draftName();
    if (!name) return;
    if (exactMenu(name)) {
      renderEditor();
      toast(`'${name}'은(는) 이미 있는 메뉴예요`);
      return;
    }
    const m = draftMenu();
    if (!m) return toast("추가할 수 없는 이름이에요");
    if (!CM.put(m)) return toast(`직접 추가 메뉴는 ${CM.LIMIT.count}개까지 만들 수 있어요`);
    if (state.draft.fav) Fav.add(m.name);
    toast(`✏️ '${m.name}'을(를) 추가했어요 · 이제 추천에도 나와요`);
    $("#add-input").value = "";
    state.draft.opts = {};
    renderEditor();
  }


  function startEdit(name) {
    const m = CM.get(name);
    if (!m) return;
    if (!isMy()) {
      history.replaceState(null, "", TABS.my.hash);
      setTab("my");
    }
    const { cat, temp, meal, seasons, weather, kid, light, drink, emoji, desc } = m;
    state.draft = { opts: { cat, temp, meal, seasons, weather, kid, light, drink, emoji, desc: desc === CM.DEFAULT_DESC ? "" : desc }, editing: name, fav: state.draft.fav };
    const input = $("#add-input");
    input.value = name;
    input.disabled = true;
    renderEditor();
    $("#editor").scrollIntoView({ behavior: "smooth", block: "center" });
  }


  function endEdit() {
    state.draft.editing = null;
    state.draft.opts = {};
    const input = $("#add-input");
    input.disabled = false;
    input.value = "";
  }


  function saveEdit() {
    const name = state.draft.editing;
    const m = draftMenu();
    if (!name || !m) return;
    CM.put(m);
    toast(`✏️ '${name}' 정보를 고쳤어요`);
    endEdit();
    renderEditor();
  }


  // ── 목록 ────────────────────────────────────
  function menuOf(item) {
    return item.custom && CM.get(item.name) ? CM.get(item.name) : Fav.findMenu(item.name);
  }

  function matches(item, q) {
    if (!q) return true;
    const m = menuOf(item);
    const hay = [item.name, item.cat, m?.desc, m?.ref, ...(m?.kw || [])].map(norm).join("|");
    return hay.includes(q);
  }


  /** 직접 추가 메뉴 한 줄 요약: 한식 · 🔥 뜨거운 · 점심 · 가을 겨울 */
  function infoLine(m) {
    const seasons = m.seasons.length ? m.seasons.map((s) => SEASON_KO[s]).join(" ") : "사계절";
    return [m.cat, TEMP_KO[m.temp], MEAL_KO[m.meal], seasons].join(" · ");
  }


  function itemHtml(x) {
    const c = cfg();
    const m = menuOf(x);
    const d = new Date(x.addedAt);
    const date = isNaN(d) ? "" : `${d.getMonth() + 1}/${d.getDate()} 추가`;
    const kq = encodeURIComponent(x.name.split("·")[0]);
    const map = `<a class="fp-map" href="https://map.kakao.com/link/search/${kq}" target="_blank" rel="noopener" title="카카오맵에서 찾기">🗺️</a>`;

    if (isMy()) {
      const fav = Fav.has(x.name);
      const ex = Ex.has(x.name);
      const desc = x.desc && x.desc !== CM.DEFAULT_DESC ? `${esc(x.desc)} · ` : "";
      return `<li class="fp-item ${fav ? "fav" : ""}">
        <span class="em">${esc(x.emoji)}</span>
        <div class="tx"><b>${esc(x.name)}</b><small>${esc(infoLine(x))}</small><small class="date">${ex ? "🚫 추천 제외 중 · " : ""}${desc}${date}</small></div>
        <div class="acts">
          <button type="button" class="fp-fav ${fav ? "on" : ""}" data-fav="${esc(x.name)}" aria-pressed="${fav}" title="${fav ? "좋아하는 메뉴에서 빼기" : "좋아하는 메뉴로 등록"}">${fav ? "💗" : "🤍"}</button>
          <button type="button" class="fp-edit" data-edit="${esc(x.name)}" title="정보 고치기" aria-label="${esc(x.name)} 정보 고치기">✏️</button>
          <button type="button" class="fp-del" data-del="${esc(x.name)}" title="삭제" aria-label="${esc(x.name)} 삭제">🗑️</button>
        </div>
      </li>`;
    }

    const sub = m ? `${m.custom ? "✏️ 직접 추가 · " : ""}${esc(m.cat)} · ${esc(m.desc)}` : "직접 추가한 메뉴";
    const move = m ? `<button type="button" class="fp-move" data-move="${esc(x.name)}" aria-label="${esc(x.name)} ${c.moveLabel}" title="${c.moveLabel}">${c.moveIcon}</button>` : "";
    const edit = m?.custom ? `<button type="button" class="fp-edit" data-edit="${esc(x.name)}" title="정보 고치기" aria-label="${esc(x.name)} 정보 고치기">✏️</button>` : "";
    return `<li class="fp-item">
      <span class="em">${esc(x.emoji)}</span>
      <div class="tx"><b>${esc(x.name)}</b><small>${sub}</small><small class="date">${date}</small></div>
      <div class="acts">${map}${edit}${move}
        <button type="button" class="fp-del" data-del="${esc(x.name)}" aria-label="${esc(x.name)} ${c.delLabel}" title="${c.delLabel}">${c.delIcon}</button>
      </div>
    </li>`;
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
    box.innerHTML = list.map(itemHtml).join("");
  }


  function renderAll() {
    renderTabs();
    renderList();
    renderSuggest();
    renderXferCounts();
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
    toastTimer = setTimeout(() => t.classList.remove("show"), undo ? 5500 : 2600);
  }


  // ── 내보내기 · 가져오기 ─────────────────────
  function renderXferCounts() {
    const n = { custom: CM.count(), favorites: Fav.count(), excluded: Ex.count() };
    for (const k in n) $(`#xp-${k}`).textContent = `${n[k]}개`;
  }

  /** 내보낼 섹션 (체크한 것 중 메뉴가 있는 것) */
  function exportData() {
    const pick = {};
    document.querySelectorAll("#xfer-pick input").forEach((i) => (pick[i.value] = i.checked));
    if (!Object.values(pick).some(Boolean)) {
      toast("내보낼 목록을 골라 주세요");
      return null;
    }
    const data = XF.build(pick);
    const n = (data.custom?.length || 0) + (data.favorites?.length || 0) + (data.excluded?.length || 0);
    if (!n) {
      toast("고른 목록에 메뉴가 없어요");
      return null;
    }
    return data;
  }


  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { /* 복사 못 함 */ }
      ta.remove();
      return ok;
    }
  }


  /** 복사가 안 되는 환경: 붙여넣기 칸에 보여주고 직접 복사하게 */
  function showForManualCopy(text) {
    $("#xf-paste-form").hidden = false;
    const ta = $("#xf-text");
    ta.value = text;
    ta.focus();
    ta.select();
    toast("자동 복사가 안 돼요. 칸의 내용을 직접 복사해 주세요");
  }


  $("#xf-link").addEventListener("click", async () => {
    const data = exportData();
    if (!data) return;
    const url = await XF.toLink(data);
    const long = url.length > 8000 ? " · 링크가 길어서 잘릴 수 있으니 안 열리면 파일로 보내 주세요" : "";
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: "오늘 뭐 먹지? 내 메뉴", text: "내 메뉴 목록이에요. 링크를 열면 가져올 수 있어요.", url });
        if (long) toast(long.slice(3));
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    if (await copyText(url)) toast(`🔗 공유 링크를 복사했어요${long}`);
    else showForManualCopy(url);
  });

  $("#xf-copy").addEventListener("click", async () => {
    const data = exportData();
    if (!data) return;
    const text = XF.toJSON(data);
    if (await copyText(text)) toast("📋 메뉴 목록을 텍스트로 복사했어요");
    else showForManualCopy(text);
  });

  $("#xf-file").addEventListener("click", () => {
    const data = exportData();
    if (!data) return;
    const blob = new Blob([XF.toJSON(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = XF.fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("💾 파일로 저장했어요");
  });

  $("#xf-open").addEventListener("click", () => $("#xf-input").click());

  $("#xf-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2_000_000) return toast("파일이 너무 커요");
    startImport(await file.text());
  });

  $("#xf-paste").addEventListener("click", () => {
    const f = $("#xf-paste-form");
    f.hidden = !f.hidden;
    if (!f.hidden) $("#xf-text").focus();
  });

  $("#xf-paste-form").addEventListener("submit", (e) => {
    e.preventDefault();
    startImport($("#xf-text").value);
  });


  let pending = null; // 미리보기 중인 가져오기 데이터

  async function startImport(text) {
    let data;
    try {
      data = await XF.parse(text);
    } catch (e) {
      toast(e.message || "가져오지 못했어요");
      return;
    }
    openImport(data);
  }


  const SEC_INFO = {
    custom: { title: "✏️ 직접 추가 메뉴" },
    favorites: { title: "💗 좋아하는 메뉴" },
    excluded: { title: "🚫 추천 제외" },
  };

  function openImport(data) {
    pending = data;
    const pv = XF.preview(data);
    const d = data.exportedAt;
    $("#import-meta").textContent = d
      ? `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} 에 내보낸 메뉴예요. 가져올 목록을 골라 주세요.`
      : "가져올 목록을 골라 주세요.";
    $("#import-secs").innerHTML = Object.keys(SEC_INFO).filter((k) => pv[k]).map((k) => {
      const p = pv[k];
      const list = k === "custom" ? data.custom.map((m) => `${m.emoji} ${m.name}`) : data[k];
      const shown = list.slice(0, 8).join(", ") + (list.length > 8 ? ` 외 ${list.length - 8}개` : "");
      const parts = [`새로 ${p.add}개`];
      if (p.same) parts.push(k === "custom" ? `같은 이름 ${p.same}개(정보를 받은 것으로 바꿈)` : `이미 있음 ${p.same}개`);
      if (p.conflict) parts.push(`내 ${k === "favorites" ? "추천 제외" : "좋아하는 메뉴"}에 ${p.conflict}개(합치기면 내 쪽 유지)`);
      const skipped = k === "custom" && data.skipped ? `<small>기존 메뉴와 이름이 겹치거나 잘못된 ${data.skipped}개는 뺐어요</small>` : "";
      return `<label><input type="checkbox" value="${k}" ${p.total ? "checked" : ""} />
        <span><b>${SEC_INFO[k].title} ${p.total}개</b><small>${parts.join(" · ")}</small>${shown ? `<small class="names">${esc(shown)}</small>` : ""}${skipped}</span></label>`;
    }).join("");
    $("#import-form").reset();
    const dlg = $("#import-dlg");
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  }


  function closeImport() {
    const dlg = $("#import-dlg");
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
    pending = null;
  }

  $("#import-cancel").addEventListener("click", closeImport);

  $("#import-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!pending) return closeImport();
    const sections = {};
    document.querySelectorAll("#import-secs input").forEach((i) => (sections[i.value] = i.checked));
    if (!Object.values(sections).some(Boolean)) return toast("가져올 목록을 골라 주세요");
    const mode = new FormData(e.target).get("mode") || "merge";
    if (mode === "replace" && !confirmReplace(sections)) return;
    const { snap, added } = XF.apply(pending, { sections, mode });
    closeImport();
    $("#xf-paste-form").hidden = true;
    $("#xf-text").value = "";
    const msg = Object.keys(SEC_INFO).filter((k) => added[k] != null)
      .map((k) => `${SEC_INFO[k].title.split(" ")[0]} ${added[k]}개`).join(" · ");
    toast(`📥 ${mode === "replace" ? "바꿨어요" : "새로 더했어요"}: ${msg}`, () => {
      XF.restore(snap);
      toast("가져오기 전으로 되돌렸어요");
    });
    if (sections.custom && added.custom && !isMy()) {
      history.replaceState(null, "", TABS.my.hash);
      setTab("my");
    }
  });

  /** 바꾸기는 기존 목록이 사라지므로 한 번 더 확인 (지울 게 있을 때만) */
  function confirmReplace(sections) {
    const lose = [];
    if (sections.custom && CM.count()) lose.push(`직접 추가 메뉴 ${CM.count()}개`);
    if (sections.favorites && Fav.count()) lose.push(`좋아하는 메뉴 ${Fav.count()}개`);
    if (sections.excluded && Ex.count()) lose.push(`추천 제외 ${Ex.count()}개`);
    return !lose.length || confirm(`지금 있는 ${lose.join(", ")}가 받은 목록으로 바뀌어요. 계속할까요?\n(가져온 뒤 되돌리기도 할 수 있어요)`);
  }


  // ── 이벤트 ──────────────────────────────────
  window.addEventListener("hashchange", () => {
    if (location.hash.startsWith("#import=")) return handleImportLink();
    setTab(tabFromHash());
  });

  document.querySelector(".fp-tabs").addEventListener("click", (e) => {
    const a = e.target.closest(".fp-tab");
    if (!a) return;
    e.preventDefault();
    history.replaceState(null, "", TABS[a.dataset.tab].hash);
    // 입력하던 이름은 탭을 옮겨도 그대로 (좋아하는 메뉴에서 찾다가 직접 추가로 넘어가기 쉽게)
    setTab(a.dataset.tab, { keepInput: !state.draft.editing });
  });

  $("#add-input").addEventListener("input", () => {
    state.draft.opts = {};
    renderSuggest();
    renderEditor();
  });

  $("#add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#add-input").value.trim();
    if (!q) return;
    if (isMy()) {
      if (state.draft.editing) saveEdit();
      else createDraft();
      return;
    }
    const exact = exactMenu(q);
    if (exact) add(exact.name);
    else if (cfg().custom && !suggest(q).length) quickCustom(q);
    else {
      toast(cfg().custom ? "아래 후보에서 골라 주세요 (목록 맨 아래에서 직접 추가도 돼요)" : "아래 후보에서 골라 주세요");
      return;
    }
    $("#add-input").value = "";
    renderSuggest();
  });

  $("#suggest").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (b) return add(b.dataset.add);
    const qb = e.target.closest("[data-quick]");
    if (qb) {
      quickCustom(qb.dataset.quick);
      $("#add-input").value = "";
      renderSuggest();
    }
  });

  $("#editor").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip[data-f]");
    if (chip) {
      const m = draftMenu();
      if (!m) return;
      const { f, v, k } = chip.dataset;
      const o = state.draft.opts;
      if (k === "one") o[f] = v;
      else if (k === "flag") o[f] = !m[f];
      else o[f] = m[f].includes(v) ? m[f].filter((x) => x !== v) : m[f].concat(v);
      // 분류를 바꾸면 이모지를 직접 고치지 않은 경우 분류 기본 이모지로
      if (f === "cat" && o.emoji === undefined && !m.ref) o.emoji = CM.CAT_EMOJI[v];
      renderEditor();
      return;
    }
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const a = act.dataset.act;
    if (a === "create") createDraft();
    else if (a === "save") saveEdit();
    else if (a === "cancel") {
      endEdit();
      renderEditor();
    } else if (a === "edit") startEdit(act.dataset.name);
    else if (a === "fav-builtin") {
      Fav.add(act.dataset.name);
      toast(`💗 '${act.dataset.name}'을(를) 좋아하는 메뉴로 등록했어요`);
      $("#add-input").value = "";
      renderEditor();
    }
  });

  $("#editor").addEventListener("input", (e) => {
    if (e.target.id === "cm-emoji") {
      state.draft.opts.emoji = e.target.value;
      const v = $("#cm-emoji-view");
      if (v) v.textContent = e.target.value.trim() || draftMenu()?.emoji || "🍽️";
    } else if (e.target.id === "cm-desc") state.draft.opts.desc = e.target.value;
  });

  $("#editor").addEventListener("change", (e) => {
    if (e.target.id === "cm-fav") state.draft.fav = e.target.checked;
  });

  $("#fav-list").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      const name = del.dataset.del;
      if (isMy()) {
        // 직접 추가 메뉴를 지우면 좋아하는 메뉴·추천 제외에서도 뺌 (되돌리기로 모두 복구)
        const item = CM.remove(name);
        const fav = Fav.remove(name);
        const ex = Ex.remove(name);
        if (state.draft.editing === name) {
          endEdit();
          renderEditor();
        }
        if (item) toast(TABS.my.removed(name), () => {
          CM.restore(item);
          if (fav) Fav.restore(fav);
          if (ex) Ex.restore(ex);
          toast(`'${name}'을(를) 되돌렸어요`);
        });
        return;
      }
      const s = store();
      const c = cfg();
      const item = s.remove(name);
      if (item) toast(c.removed(item.name), () => {
        s.restore(item);
        toast(`'${item.name}'을(를) 되돌렸어요`);
      });
      return;
    }
    const ed = e.target.closest("[data-edit]");
    if (ed) return startEdit(ed.dataset.edit);
    const fv = e.target.closest("[data-fav]");
    if (fv) {
      const name = fv.dataset.fav;
      const on = Fav.toggle(name);
      toast(on ? `💗 '${name}'을(를) 좋아하는 메뉴로 등록했어요` : `'${name}'을(를) 좋아하는 메뉴에서 뺐어요`);
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
  CM.onChange(renderAll);


  /** 공유 링크(#import=…)로 열렸으면 가져오기 미리보기 */
  function handleImportLink() {
    const href = location.href;
    history.replaceState(null, "", location.pathname + location.search + "#favorites");
    state.tab = "fav";
    renderAll();
    startImport(href);
  }


  renderAll();
  renderEditor();
  if (location.hash.startsWith("#import=")) handleImportLink();
})();

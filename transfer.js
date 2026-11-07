/**
 * 오늘 뭐 먹지? — 내 메뉴 내보내기·가져오기
 * 직접 추가한 메뉴·좋아하는 메뉴·추천 제외 메뉴를 JSON 묶음으로 만들고, 파일·텍스트·공유 링크로 주고받습니다.
 *
 * 묶음 형식 (version 1)
 *  { app: "what-to-eat", version: 1, exportedAt: "ISO 시각",
 *    custom:    [메뉴 객체 …]          직접 추가한 메뉴 (custom-menus.js 와 같은 모양)
 *    favorites: ["메뉴 이름", …]       좋아하는 메뉴
 *    excluded:  ["메뉴 이름", …] }     추천 제외 메뉴
 *  세 항목 중 고른 것만 들어 있습니다.
 *
 * 공유 링크: favorites.html#import=<코드>
 *  코드 첫 글자 z = deflate-raw 압축 + base64url, j = 압축 없이 base64url (CompressionStream 이 없는 브라우저)
 */
(function (root) {
  const APP = "what-to-eat";
  const VERSION = 1;
  const MAX_NAMES = 1000;
  const MAX_TEXT = 2_000_000; // 붙여넣기·파일 최대 글자 수
  const SECTIONS = ["custom", "favorites", "excluded"];

  const CM = () => root.CustomMenus;
  const stores = () => ({ favorites: root.Favorites, excluded: root.Excluded });


  // ── 묶음 만들기 ─────────────────────────────
  /** pick: { custom, favorites, excluded } 중 true 인 것만 담음 */
  function build(pick) {
    const data = { app: APP, version: VERSION, exportedAt: new Date().toISOString() };
    if (pick.custom) {
      data.custom = CM().all().map(({ name, emoji, cat, temp, seasons, weather, regions, meal, kw, cuisine, desc, kid, light, drink, ref, addedAt }) =>
        ({ name, emoji, cat, temp, seasons, weather, regions, meal, kw, cuisine, desc, kid, light, drink, ref, addedAt }));
    }
    if (pick.favorites) data.favorites = root.Favorites.all().map((x) => x.name);
    if (pick.excluded) data.excluded = root.Excluded.all().map((x) => x.name);
    return data;
  }


  function toJSON(data) {
    return JSON.stringify(data, null, 2);
  }


  function fileName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `오늘뭐먹지-내메뉴-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
  }


  // ── base64url · 압축 ────────────────────────
  function bytesToB64url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64urlToBytes(s) {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function pipe(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }

  /** 묶음 → 링크용 코드 (압축 가능하면 압축) */
  async function encode(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    if (typeof CompressionStream === "function") {
      try {
        return "z" + bytesToB64url(await pipe(bytes, new CompressionStream("deflate-raw")));
      } catch { /* 압축 실패하면 그대로 */ }
    }
    return "j" + bytesToB64url(bytes);
  }

  /** 링크용 코드 → JSON 텍스트 */
  async function decode(code) {
    const kind = code[0];
    const bytes = b64urlToBytes(code.slice(1));
    if (kind === "z") {
      if (typeof DecompressionStream !== "function") throw new Error("이 브라우저는 압축된 링크를 열 수 없어요. 파일이나 텍스트로 받아 주세요.");
      return new TextDecoder().decode(await pipe(bytes, new DecompressionStream("deflate-raw")));
    }
    if (kind === "j") return new TextDecoder().decode(bytes);
    throw new Error("링크 형식을 알 수 없어요");
  }


  /** 공유 링크 (내 메뉴 관리 페이지 주소 + #import=코드) */
  async function toLink(data) {
    const base = location.href.replace(/[#?].*$/, "").replace(/[^/]*$/, "");
    return `${base}favorites.html#import=${await encode(data)}`;
  }


  // ── 읽기 · 검사 ─────────────────────────────
  /**
   * 붙여넣은 글자·파일 내용·링크 → 검사한 묶음
   * JSON 텍스트, 공유 링크 전체, #import= 뒤 코드 모두 받음
   */
  async function parse(text) {
    text = String(text || "").trim();
    if (!text) throw new Error("내용이 비어 있어요");
    if (text.length > MAX_TEXT) throw new Error("내용이 너무 길어요");
    let json = text;
    const m = text.match(/#import=([A-Za-z0-9_-]+)/) || (/^[zj][A-Za-z0-9_-]{8,}$/.test(text) ? [text, text] : null);
    if (m) {
      try {
        json = await decode(m[1]);
      } catch (e) {
        throw new Error(e.message.startsWith("이 브라우저") ? e.message : "링크가 잘렸거나 잘못됐어요. 전체를 복사했는지 확인해 주세요.");
      }
    }
    let raw;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error("오늘 뭐 먹지? 메뉴 파일이 아니에요 (JSON 형식이 아님)");
    }
    return validate(raw);
  }


  /** 이름 목록 검사: 글자 다듬고 중복·빈 이름 제거 */
  function names(list) {
    if (!Array.isArray(list)) return [];
    const clean = list
      .map((x) => (typeof x === "string" ? x : x && typeof x.name === "string" ? x.name : ""))
      .map((x) => [...x.replace(/[\u0000-\u001f\u007f<>]/g, "").trim()].slice(0, CM().LIMIT.name).join(""))
      .filter(Boolean);
    return [...new Set(clean)].slice(0, MAX_NAMES);
  }


  /**
   * 바깥 데이터 → { custom:[], favorites:[], excluded:[], has:{섹션:boolean}, skipped, exportedAt }
   * 허용 안 되는 값은 버리고, 기존 메뉴와 이름이 겹치는 직접 추가 메뉴는 skipped 로 셈
   */
  function validate(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("오늘 뭐 먹지? 메뉴 파일이 아니에요");
    if (raw.app !== APP) throw new Error("오늘 뭐 먹지? 메뉴 파일이 아니에요");
    if (!(Number(raw.version) >= 1)) throw new Error("파일 버전을 알 수 없어요");
    if (Number(raw.version) > VERSION) throw new Error("더 새 버전에서 만든 파일이에요. 앱을 새로고침한 뒤 다시 시도해 주세요.");

    const out = { custom: [], favorites: [], excluded: [], has: {}, skipped: 0, exportedAt: null };
    if (Array.isArray(raw.custom)) {
      out.has.custom = true;
      const seen = new Set();
      for (const r of raw.custom.slice(0, CM().LIMIT.count * 2)) {
        const m = CM().sanitize(r);
        if (!m || seen.has(m.name)) {
          out.skipped++;
          continue;
        }
        if (Array.isArray(r.cuisine) && r.cuisine.every((c) => typeof c === "string" && c.length <= 30)) m.cuisine = r.cuisine.slice(0, 12);
        seen.add(m.name);
        out.custom.push(m);
      }
      out.custom = out.custom.slice(0, CM().LIMIT.count);
    }
    for (const k of ["favorites", "excluded"]) {
      if (Array.isArray(raw[k])) {
        out.has[k] = true;
        out[k] = names(raw[k]);
      }
    }
    // 같은 메뉴가 양쪽에 있으면 추천 제외 쪽만 남김
    const ex = new Set(out.excluded);
    out.favorites = out.favorites.filter((n) => !ex.has(n));
    if (!SECTIONS.some((k) => out.has[k])) throw new Error("가져올 메뉴가 들어 있지 않아요");
    const t = Date.parse(raw.exportedAt);
    if (!isNaN(t)) out.exportedAt = new Date(t);
    return out;
  }


  // ── 미리보기 · 적용 ─────────────────────────
  /**
   * 섹션별 숫자 미리보기
   * 반환: { custom|favorites|excluded: { total, add, same, conflict } }
   *   add       새로 들어올 것
   *   same      이미 같은 이름이 있는 것 (합치기면 그대로 둠, 직접 추가 메뉴는 정보만 바꿀 수 있음)
   *   conflict  내 다른 목록에 있는 것 (합치기면 내 쪽을 그대로 둠)
   */
  function preview(data) {
    const s = stores();
    const res = {};
    if (data.has.custom) {
      const add = data.custom.filter((m) => !CM().has(m.name)).length;
      res.custom = { total: data.custom.length, add, same: data.custom.length - add, conflict: 0 };
    }
    for (const k of ["favorites", "excluded"]) {
      if (!data.has[k]) continue;
      const mine = s[k];
      const other = s[k === "favorites" ? "excluded" : "favorites"];
      let add = 0, same = 0, conflict = 0;
      for (const n of data[k]) {
        if (mine.has(n)) same++;
        else if (other.has(n)) conflict++;
        else add++;
      }
      res[k] = { total: data[k].length, add, same, conflict };
    }
    return res;
  }


  /** 지금 상태 저장 (되돌리기용) */
  function snapshot() {
    return { custom: CM().all(), favorites: root.Favorites.all(), excluded: root.Excluded.all() };
  }

  function restore(snap) {
    CM().setAll(snap.custom);
    root.Favorites.setAll(snap.favorites);
    root.Excluded.setAll(snap.excluded);
  }


  /** 이름 → 좋아하는/제외 목록 항목 */
  function itemOf(name, now) {
    const m = root.Favorites.findMenu(name);
    return { name, emoji: m?.emoji || "🍽️", cat: m?.cat || "직접 추가", custom: !m || !!m.custom, addedAt: now };
  }


  /**
   * 적용. opts: { sections: { custom, favorites, excluded }, mode: "merge" | "replace" }
   *  merge    내 목록은 그대로 두고 새 메뉴만 더함 (직접 추가 메뉴는 같은 이름이면 정보를 받은 것으로 바꿈)
   *  replace  고른 섹션을 받은 목록으로 통째로 바꿈
   * 반환: { snap (되돌리기용), added: { 섹션: 개수 } }
   */
  function apply(data, opts) {
    const snap = snapshot();
    const sec = opts.sections;
    const replace = opts.mode === "replace";
    const added = {};
    const now = Date.now();

    if (sec.custom && data.has.custom) {
      if (replace) {
        CM().setAll(data.custom);
        added.custom = data.custom.length;
      } else {
        const cur = CM().all();
        const byName = new Map(cur.map((m) => [m.name, m]));
        let n = 0;
        for (const m of data.custom) {
          if (!byName.has(m.name)) n++;
          byName.set(m.name, byName.has(m.name) ? { ...m, addedAt: byName.get(m.name).addedAt } : m);
        }
        CM().setAll([...byName.values()].sort((a, b) => b.addedAt - a.addedAt));
        added.custom = n;
      }
    }

    // 좋아하는 메뉴·추천 제외: 받은 순서대로 (앞쪽이 최근)
    const lists = { favorites: root.Favorites.all(), excluded: root.Excluded.all() };
    for (const k of ["favorites", "excluded"]) {
      if (!sec[k] || !data.has[k]) continue;
      const otherK = k === "favorites" ? "excluded" : "favorites";
      const items = data[k].map((n, i) => itemOf(n, now - i));
      if (replace) {
        lists[k] = items;
        // 받은 메뉴가 내 다른 목록에 있으면 거기서 뺌 (한 메뉴는 한 목록에만)
        const set = new Set(data[k]);
        lists[otherK] = lists[otherK].filter((x) => !set.has(x.name));
        added[k] = items.length;
      } else {
        const have = new Set([...lists.favorites, ...lists.excluded].map((x) => x.name));
        const fresh = items.filter((x) => !have.has(x.name));
        lists[k] = fresh.concat(lists[k]);
        added[k] = fresh.length;
      }
    }
    // 둘 다 바꾸면 겹치는 메뉴는 추천 제외 쪽만 남김
    const exNames = new Set(lists.excluded.map((x) => x.name));
    lists.favorites = lists.favorites.filter((x) => !exNames.has(x.name));
    root.Favorites.setAll(lists.favorites);
    root.Excluded.setAll(lists.excluded);

    // 직접 추가 메뉴 정보 없이 이름만 받은 좋아하는 메뉴 → 비슷한 메뉴 정보로 채워서 추천에도 나오게
    for (const x of lists.favorites) {
      if (x.custom && !CM().has(x.name) && !CM().isBuiltin(x.name)) {
        const m = CM().build(x.name, { addedAt: x.addedAt });
        if (m) CM().put(m);
      }
    }

    return { snap, added };
  }


  root.MenuTransfer = { build, toJSON, fileName, toLink, encode, decode, parse, validate, preview, apply, snapshot, restore };
})(window);

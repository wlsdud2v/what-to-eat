/**
 * 오늘 뭐 먹지? — 최근 추천 기록 (같은 메뉴가 매일 반복되지 않게 감점할 때 씀)
 * 날짜·끼니(점심/저녁)마다 마지막으로 히어로에 보인 메뉴 하나만 기억합니다.
 * 저장: localStorage "what-to-eat:history:v1" = [{ day: "2026-11-21", meal: "dinner", name, cat }]
 */
(function (root) {
  const KEY = "what-to-eat:history:v1";
  const KEEP_DAYS = 14;
  const DAY_MS = 86400000;


  /** 로컬 날짜 문자열 YYYY-MM-DD */
  function dayKey(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }


  /** 두 날짜 문자열 사이 일수 (a 가 b 보다 며칠 전인지) */
  function daysBetween(a, b) {
    const t = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((t(b) - t(a)) / DAY_MS);
  }


  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v.filter((e) => e && typeof e.name === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.day)) : [];
    } catch { return []; }
  }


  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 저장 못 해도 추천은 동작 */ }
  }


  /** 지금 끼니에 히어로로 보인 메뉴 기록 (같은 날·끼니는 덮어씀 — 마지막으로 본 메뉴가 먹은 메뉴일 가능성이 큼) */
  function record(menu, meal, now = new Date()) {
    if (!menu) return;
    const today = dayKey(now);
    const list = load().filter((e) => !(e.day === today && e.meal === meal) && daysBetween(e.day, today) < KEEP_DAYS);
    list.push({ day: today, meal, name: menu.name, cat: menu.cat });
    save(list);
  }


  /**
   * recommend() 에 넘길 최근 기록 [{ name, cat, daysAgo }] (최근 순)
   * 지금 끼니 기록은 빼서, 10분마다 다시 계산할 때 보고 있는 메뉴가 스스로 밀려나지 않게 함
   */
  function recent(meal, now = new Date()) {
    const today = dayKey(now);
    return load()
      .filter((e) => !(e.day === today && e.meal === meal))
      .map((e) => ({ name: e.name, cat: e.cat, daysAgo: daysBetween(e.day, today) }))
      .filter((e) => e.daysAgo >= 0 && e.daysAgo < KEEP_DAYS)
      .sort((a, b) => a.daysAgo - b.daysAgo);
  }


  root.MenuHistory = { record, recent, dayKey };
})(typeof window !== "undefined" ? window : globalThis);

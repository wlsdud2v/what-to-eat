/* 오늘 뭐 먹지? — 화면 동작 (위치·날씨·식당 API 호출과 렌더링) */
(function () {
  const R = window.Recommend;
  const DEFAULT_POS = { lat: 37.5663, lon: 126.9779 }; // 서울시청 (위치 권한 거부 시)
  const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  const NOMINATIM = "https://nominatim.openstreetmap.org";
  const CATS = ["한식", "중식", "일식", "양식", "분식", "아시안"];

  const state = {
    lat: null,
    lon: null,
    place: null,        // { label, region, area }
    weather: null,      // { temp, feels, humidity, wind, weatherCode }
    meal: R.getMeal(new Date().getHours()),
    override: "",
    radius: 1000,
    excludeCats: new Set(),
    restaurants: [],    // 반경 안 음식점 풀 (카카오: 가까운 순 최대 45곳)
    restaurantsLoading: false,
    source: "kakao",    // "kakao" | "osm" (카카오 키가 없거나 실패하면 osm)
    menuHits: new Map(),  // 메뉴 이름 → 카카오 키워드 검색 결과 { items, total, complete, pages, failed? }
    menuHitsP: new Map(), // 진행 중인 키워드 검색 { p, pages }
    hitsGen: 0,           // 위치·반경이 바뀔 때마다 증가 (이전 검색 결과 버림)
    ranked: [],
    recs: [],
    selected: 0,
    userPicked: false,  // 사용자가 메뉴를 직접 골랐으면 재정렬 후에도 그 메뉴 유지
    changed: true,      // 히어로 메뉴가 바뀌었는지 (바뀔 때만 등장 애니메이션)
    season: null,
    whyOpen: false,
    jitter: new Map(),  // 메뉴별 무작위값 (다시 추천 때만 바뀜)
    kidOnly: loadKid(), // 👶 아이와 함께: 맵거나 날것·술안주 메뉴 빼기 (localStorage 에 기억)
    lightOnly: loadLight(), // 🥗 가벼운 식사: 국수·죽·김밥·샐러드처럼 부담 없는 메뉴만 (localStorage 에 기억)
  };

  const Fav = window.Favorites;
  const Ex = window.Excluded;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));


  const KID_KEY = "what-to-eat:kid-only:v1";
  function loadKid() {
    try { return localStorage.getItem(KID_KEY) === "1"; } catch { return false; }
  }
  function saveKid(on) {
    try { localStorage.setItem(KID_KEY, on ? "1" : "0"); } catch { /* 저장 못 해도 이번 화면에서는 동작 */ }
  }

  const LIGHT_KEY = "what-to-eat:light-only:v1";
  function loadLight() {
    try { return localStorage.getItem(LIGHT_KEY) === "1"; } catch { return false; }
  }
  function saveLight(on) {
    try { localStorage.setItem(LIGHT_KEY, on ? "1" : "0"); } catch { /* 저장 못 해도 이번 화면에서는 동작 */ }
  }


  // 카카오 SDK 준비 (키 없음·도메인 미등록이면 false → OSM 사용)
  const kakaoReady = window.KakaoPlaces.init(window.KAKAO_JS_KEY)
    .then(() => true)
    .catch((e) => {
      console.warn("[카카오] 사용 안 함, OpenStreetMap 으로 대체:", e.message);
      return false;
    });


  // ── 지도 (카카오맵, 안 되면 Leaflet) ─────────
  const mapView = window.MapView.create("map", kakaoReady, {
    center: DEFAULT_POS,
    zoom: 15,
    onClick: (lat, lon) => setLocation(lat, lon),
  });
  mapView.setUser(DEFAULT_POS.lat, DEFAULT_POS.lon);
  mapView.setRadius(state.radius);
  mapView.ready.then(() => { if (state.source) renderSource(); });


  // ── 레시피 검색 (선택한 메뉴를 따라감) ─────────
  const recipes = window.RecipeSearch.create();


  // ── API ─────────────────────────────────────
  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }


  async function fetchWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day&timezone=auto";
    const j = await fetchJson(url);
    const c = j.current;
    return {
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m,
      weatherCode: c.weather_code,
      isDay: c.is_day,
    };
  }


  /** 좌표 → { label, region, area }. 카카오 우선, 국외·실패 시 OSM */
  async function reverseGeocode(lat, lon) {
    if (await kakaoReady) {
      try {
        const r = await window.KakaoPlaces.reverseGeocode(lat, lon);
        if (r) return r;
      } catch (e) {
        console.warn("[카카오] 역지오코딩 실패, OSM 사용:", e.message);
      }
    }
    return reverseGeocodeOsm(lat, lon);
  }


  async function reverseGeocodeOsm(lat, lon) {
    const j = await fetchJson(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&accept-language=ko`);
    const a = j.address || {};
    const big = a.city || a.state || a.province || "";
    const mid = a.borough || a.county || a.city_district || a.town || "";
    const small = a.suburb || a.quarter || a.neighbourhood || a.village || "";
    const label = [big, mid, small].filter(Boolean).join(" ") || j.display_name || "알 수 없는 위치";
    return { label, region: j.display_name || label, area: small || mid || big };
  }


  /** 검색어(주소·역·건물·가게 이름) → 좌표. 카카오 우선, 못 찾거나 실패하면 OSM */
  async function geocode(q) {
    if (await kakaoReady) {
      try {
        const near = state.lat != null ? { lat: state.lat, lon: state.lon } : null;
        const r = await window.KakaoPlaces.geocode(q, near);
        if (r) return r;
      } catch (e) {
        console.warn("[카카오] 위치 검색 실패, OSM 사용:", e.message);
      }
    }
    return geocodeOsm(q);
  }


  async function geocodeOsm(q) {
    const j = await fetchJson(`${NOMINATIM}/search?format=jsonv2&limit=1&accept-language=ko&q=${encodeURIComponent(q)}`);
    if (!j.length) return null;
    return { lat: +j[0].lat, lon: +j[0].lon };
  }


  /** 반경 안 음식점 목록. 카카오 우선, 실패 시 OSM. 반환: { source, list } */
  async function fetchRestaurants(lat, lon, radius) {
    if (await kakaoReady) {
      try {
        const r = await window.KakaoPlaces.nearbyFood(lat, lon, radius);
        return { source: "kakao", list: r.items };
      } catch (e) {
        console.warn(e);
      }
    }
    return { source: "osm", list: await fetchOverpass(lat, lon, radius) };
  }


  async function fetchOverpass(lat, lon, radius) {
    const q = `[out:json][timeout:25];nwr["amenity"~"^(restaurant|fast_food|food_court|pub|bar)$"]["name"](around:${radius},${lat},${lon});out center tags 400;`;
    let lastErr;
    for (const ep of OVERPASS) {
      try {
        const j = await fetchJson(ep, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        return j.elements.map((e) => {
          const plat = e.lat ?? e.center?.lat;
          const plon = e.lon ?? e.center?.lon;
          return { id: `${e.type}/${e.id}`, lat: plat, lon: plon, tags: e.tags || {}, dist: R.distance(lat, lon, plat, plon) };
        }).filter((r) => r.lat != null);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }


  // ── 흐름 ────────────────────────────────────
  let reqId = 0;

  async function setLocation(lat, lon) {
    const id = ++reqId;
    state.lat = lat;
    state.lon = lon;
    state.restaurants = [];
    state.restaurantsLoading = true;
    mapView.setUser(lat, lon);
    mapView.setView(lat, lon, state.radius > 1000 ? 14 : 15);
    setPlace("위치 확인 중…");
    setPill("날씨 불러오는 중…");

    const placeP = reverseGeocode(lat, lon).catch(() => ({ label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, region: "", area: "" }));
    const weatherP = fetchWeather(lat, lon).catch(() => null);
    loadRestaurants(id);

    const [place, weather] = await Promise.all([placeP, weatherP]);
    if (id !== reqId) return;
    state.place = place;
    state.weather = weather;
    renderContext();
    runRecommend();
  }


  async function loadRestaurants(id = reqId) {
    state.restaurantsLoading = true;
    state.hitsGen++;
    state.menuHits = new Map();
    state.menuHitsP = new Map();
    renderPlaces();
    try {
      const { source, list } = await fetchRestaurants(state.lat, state.lon, state.radius);
      if (id !== reqId) return;
      state.source = source;
      state.restaurants = list;
      renderSource();
      state.restaurantsLoading = false;
      if (state.recs.length) runRecommend({ keepSelection: true });
      return;
    } catch (e) {
      if (id !== reqId) return;
      state.restaurants = null; // 실패 표시
    }
    state.restaurantsLoading = false;
    renderPlaces();
  }


  /** 날씨 직접 선택 시 태그와 체감온도 대체 */
  function effectiveWeather() {
    const w = state.weather || { temp: 15, feels: 15, humidity: 50, wind: 5, weatherCode: 2 };
    const o = state.override;
    if (!o) return { feels: w.feels, tags: R.weatherTags(w) };
    if (o === "clear") return { feels: w.feels, tags: R.weatherTags({ ...w, weatherCode: 0 }) };
    if (o === "rain") return { feels: w.feels, tags: R.weatherTags({ ...w, weatherCode: 63 }) };
    if (o === "snow") return { feels: Math.min(w.feels, -1), tags: ["snow", "cold"] };
    if (o === "hot") return { feels: 33, tags: ["hot", "humid", "clear"] };
    if (o === "cold") return { feels: -8, tags: ["cold", "clear", "windy"] };
  }


  /** 카카오 키워드 검색 (메뉴별 캐시). pages 만큼 가져온 결과가 있으면 재사용 */
  function menuHits(menu, pages = 1) {
    const key = menu.name;
    const cur = state.menuHits.get(key);
    if (cur && (cur.complete || cur.pages >= pages)) return Promise.resolve(cur);
    const pending = state.menuHitsP.get(key);
    if (pending && pending.pages >= pages) return pending.p;

    const gen = state.hitsGen;
    const p = window.KakaoPlaces.searchMenu(menu.kw[0], state.lat, state.lon, state.radius, pages)
      .then((r) => {
        if (gen !== state.hitsGen) throw new Error("stale");
        const prev = state.menuHits.get(key);
        if (prev && !prev.failed && (prev.complete || prev.pages >= pages)) return prev; // 더 긴 검색이 먼저 끝난 경우
        const v = { ...r, pages };
        state.menuHits.set(key, v);
        return v;
      })
      .catch((e) => {
        if (gen !== state.hitsGen) throw e;
        console.warn(e);
        const v = { items: [], total: 0, complete: true, pages, failed: true };
        state.menuHits.set(key, v);
        return v;
      })
      .finally(() => {
        if (state.menuHitsP.get(key)?.p === p) state.menuHitsP.delete(key);
      });
    state.menuHitsP.set(key, { p, pages });
    return p;
  }


  /** 상위 후보 메뉴들을 카카오 키워드로 검색해 "근처에 파는 곳" 점수를 정확하게 → 다시 정렬 */
  const SCORE_TOP = 12;
  function scoreCandidates() {
    if (state.source !== "kakao" || state.restaurantsLoading || !state.restaurants) return;
    // 화면 카드처럼 분류를 섞어 후보를 고름 (분류당 최대 4개)
    const todo = R.pickTop(state.ranked, SCORE_TOP, 4).map((r) => r.menu)
      .filter((m) => !state.menuHits.has(m.name) && !state.menuHitsP.has(m.name));
    if (!todo.length) return;
    const gen = state.hitsGen;
    Promise.all(todo.map((m) => menuHits(m, 1))).then(() => {
      if (gen === state.hitsGen) runRecommend({ keepSelection: true });
    }, () => {});
  }


  function nearbyCount(menu) {
    if (!state.restaurants || state.restaurantsLoading) return null;
    let similar = 0;
    const exactIds = new Set();
    for (const p of state.restaurants) {
      const lv = R.matchRestaurant(menu, p.tags);
      if (lv === 2) exactIds.add(p.id);
      else if (lv === 1) similar++;
    }
    const h = state.source === "kakao" ? state.menuHits.get(menu.name) : null;
    if (h && !h.failed) {
      for (const p of h.items) exactIds.add(p.id);
      return { exact: Math.max(h.total, exactIds.size), similar };
    }
    return { exact: exactIds.size, similar };
  }


  function runRecommend(opts = {}) {
    const prevName = state.recs[state.selected]?.menu.name;
    if (opts.reroll) state.jitter.clear();
    const now = new Date();
    const ew = effectiveWeather();
    const season = R.getSeason(now.getMonth() + 1, state.lat ?? 37);
    state.season = season;

    state.ranked = R.recommend({
      season,
      meal: state.meal,
      tags: ew.tags,
      feels: ew.feels,
      region: state.place?.region || "",
      excludeCats: state.excludeCats,
      excludeNames: Ex.names(),
      kidOnly: state.kidOnly,
      lightOnly: state.lightOnly,
      nearby: nearbyCount,
      jitter: (m) => {
        if (!state.jitter.has(m.name)) state.jitter.set(m.name, Math.random());
        return state.jitter.get(m.name);
      },
    });
    state.recs = R.pickTop(state.ranked, 6);
    if (!opts.keepSelection) state.userPicked = false;
    const keep = opts.keepSelection && state.userPicked ? state.recs.findIndex((r) => r.menu.name === prevName) : -1;
    const next = keep >= 0 ? keep : 0;
    state.changed = state.recs[next]?.menu.name !== prevName;
    state.selected = next;
    renderSky();
    renderContext();
    renderRecs();
    renderPlaces();
    scoreCandidates();
  }


  // ── 하늘·인사말 ─────────────────────────────
  /** 지금 하늘 종류 (날씨 직접 선택 우선) */
  function skyKind() {
    const o = state.override;
    if (o) return o; // clear | rain | snow | hot | cold
    const w = state.weather;
    if (!w) return "partly";
    const c = w.weatherCode;
    if (c >= 95) return "storm";
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "snow";
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
    if (c === 45 || c === 48) return "fog";
    if (c === 3) return "cloudy";
    if (w.feels >= 30) return "hot";
    if (w.feels <= -5) return "cold";
    return c === 0 ? "clear" : "partly";
  }


  function isNight() {
    if (state.weather && state.weather.isDay != null) return state.weather.isDay === 0;
    const h = new Date().getHours();
    return h < 6 || h >= 19;
  }


  /** 해 질 녘: 낮이면서 16시 이후 (저녁 식사 준비할 때쯤 노을 하늘) */
  function isDusk() {
    return !isNight() && new Date().getHours() >= 16;
  }


  /** 인사말 첫 단어: 비·눈 같은 하늘이면 하늘, 아니면 체감온도 */
  function feelWord(kind) {
    const SKY = { rain: "비 내리는", storm: "천둥 치는", snow: "눈 내리는", fog: "안개 낀", cloudy: "흐린", hot: "무더운", cold: "꽁꽁 언" };
    if (SKY[kind]) return SKY[kind];
    if (!state.weather) return "";
    const f = effectiveWeather().feels;
    if (f >= 28) return "무더운";
    if (f >= 22) return "따뜻한";
    if (f >= 14) return "선선한";
    if (f >= 4) return "쌀쌀한";
    return "추운";
  }


  // "이런 메뉴도" 카드 첫 줄
  const ALT_LINE = {
    clear: "날씨 좋은 {meal}이에요.", partly: "느긋한 {meal}이에요.", cloudy: "흐린 날엔 따끈한 게 최고죠.",
    fog: "포근한 한 끼가 생각나요.", rain: "빗소리엔 뜨끈한 게 당기죠.", storm: "이런 날은 든든하게 먹어요.",
    snow: "눈 오는 날엔 따뜻하게.", hot: "더위엔 시원한 게 최고죠.", cold: "몸 녹일 메뉴가 필요해요.",
  };
  const DAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

  function mealWord() {
    return isNight() && state.meal === "dinner" ? "밤" : R.MEAL_KO[state.meal];
  }

  function renderSky() {
    const kind = skyKind();
    window.Sky.set({ kind, night: isNight(), dusk: isDusk() });
    const word = feelWord(kind);
    const day = DAYS[new Date().getDay()];
    $("#kicker").textContent = `${word ? word + " " : ""}${day} ${mealWord()}, 오늘은`;
    const sel = state.recs[state.selected]?.menu;
    const line = sel && sel.temp === "hot" && !["hot", "rain", "snow", "storm", "cold"].includes(kind)
      ? "국물이 당기는 {meal}이에요." : ALT_LINE[kind];
    $("#alts-line").textContent = `${line.replace("{meal}", mealWord())}\n이런 메뉴도 군침 돌아요.`;
  }


  // ── 그릇 모양 ───────────────────────────────
  /** 메뉴 → 그릇 종류(bowl 뜨거운 국물 / cold 차가운 그릇 / plate 접시)와 국물 색 */
  function dishOf(m) {
    const type = m.temp === "hot" ? "bowl" : m.temp === "cold" ? "cold" : "plate";
    const t = `${m.name} ${m.desc}`;
    let broth = "cream";
    if (/김치|부대|짬뽕|마라|육개장|매운|매콤|얼큰|칼칼|감자탕|닭볶음|떡볶|해장|낙곱새|전골|알탕|동태|대구탕|훠궈|똠|순두부|고추|짬|닭갈비|쭈꾸미|낙지/.test(t)) broth = "red";
    else if (/된장|청국장|카레|커리|추어|소머리|갈비탕|라멘|우동|국밥|순대국|선지|쌀국수|스튜|짜장|올갱이|시래기|미소|소바/.test(t)) broth = "brown";
    else if (/설렁|곰탕|사골|삼계|닭곰|칼국수|수제비|떡국|만둣국|백숙|닭한마리|어묵|샤브|굴|재첩|맑은|지리|콩나물/.test(t)) broth = "clear";
    return { type, broth };
  }


  // ── 렌더링 ──────────────────────────────────
  function setPlace(text) {
    $("#place-name").textContent = text;
    $("#loc-val").textContent = text === "위치 확인 중…" ? "" : (state.place?.label || "");
  }

  function setPill(text) {
    $("#wx-pill").textContent = text;
  }


  const OVERRIDE_KO = { clear: "맑음", rain: "비", snow: "눈", hot: "무더위", cold: "한파" };

  function renderContext() {
    const p = state.place;
    if (p) setPlace(p.area || p.label.split(" ").pop() || p.label);
    const season = state.season ? R.SEASON_KO[state.season] : "";
    const w = state.weather;
    if (state.override) {
      setPill(`${OVERRIDE_KO[state.override]} · 직접 고름${season ? " · " + season : ""}`);
      return;
    }
    if (!w) {
      if (p) setPill(`날씨를 못 불러왔어요${season ? " · " + season : ""}`);
      return;
    }
    const [desc] = R.describeWeather(w.weatherCode);
    setPill(`${desc} ${Math.round(w.temp)}° · 체감 ${Math.round(w.feels)}°${season ? " · " + season : ""}`);
  }


  /** 근거 목록 (종류 꼬리표 + 문장) */
  function whyItems(r, n) {
    return r.reasons.slice(0, n).map((x) =>
      `<li class="why why-${x.kind}"><span class="tag">${x.icon} ${R.KINDS[x.kind].label}</span>${esc(x.text)}</li>`).join("");
  }


  function lenClass(name) {
    const n = [...name].length;
    return n <= 3 ? "s" : n <= 5 ? "m" : n <= 7 ? "l" : "xl";
  }


  function renderRecs() {
    renderHero();
    renderAlts();
    renderDots();
  }


  /** 히어로: 고른 메뉴(기본 1위)를 크게 */
  function renderHero() {
    const r = state.recs[state.selected];
    const h1 = $("#headline");
    const dish = $("#dish");
    const acts = $("#hero-actions");
    if (!r) {
      const why = [];
      if (state.excludeCats.size) why.push("음식 종류");
      if (state.kidOnly) why.push("👶 아이와 함께");
      if (state.lightOnly) why.push("🥗 가벼운 식사");
      if (Ex.count()) why.push("🚫 추천 제외 메뉴");
      h1.textContent = "오늘 뭐 먹지?";
      h1.dataset.len = "m";
      $("#tagline").textContent = state.place
        ? `조건에 맞는 메뉴가 없어요. ${why.join(" · ") || "설정"}을(를) 다시 확인해 주세요.`
        : "위치와 날씨를 확인하고 있어요…";
      $("#hero-chips").innerHTML = "";
      $("#hero-why").innerHTML = "";
      $("#dish-emoji").textContent = "🍚";
      acts.classList.add("placeholder-copy");
      $("#btn-fav").disabled = $("#btn-ex").disabled = true;
      return;
    }
    acts.classList.remove("placeholder-copy");
    $("#btn-fav").disabled = $("#btn-ex").disabled = false;
    const m = r.menu;
    const fav = Fav.has(m.name);

    h1.innerHTML = esc(m.name) + (fav ? ' <span class="fav-flag">💗 내 최애</span>' : "");
    h1.dataset.len = lenClass(m.name);
    $("#tagline").textContent = m.desc;
    const b = r.basis;
    $("#hero-chips").innerHTML =
      `<span class="accent">${b.icon} ${esc(b.label)}</span>` +
      `<span id="chip-near" hidden></span>` +
      `<span>${esc(m.cat)}</span>` +
      (state.kidOnly ? '<span class="kid">👶 아이 OK</span>' : "") +
      (state.lightOnly ? '<span class="light">🥗 가볍게</span>' : "");
    $("#hero-why").innerHTML = whyItems(r, 2);

    const fb = $("#btn-fav");
    fb.classList.toggle("on", fav);
    fb.setAttribute("aria-pressed", String(fav));
    fb.title = fb.ariaLabel = fav ? `${m.name} 좋아하는 메뉴에서 빼기` : `${m.name} 좋아하는 메뉴로 등록`;
    $("#btn-ex").title = `${m.name} 추천에서 빼기`;

    const d = dishOf(m);
    dish.dataset.type = d.type;
    dish.dataset.broth = d.broth;
    $("#dish-emoji").textContent = m.emoji;
    if (state.changed) {
      state.changed = false;
      for (const el of [h1, dish]) {
        el.classList.remove("pop", "swap");
        void el.offsetWidth;
        el.classList.add(el === h1 ? "pop" : "swap");
      }
    }
    renderNear();
  }


  /** 나머지 5개: 작은 그릇 + 점수 곡선 */
  function renderAlts() {
    const grid = $("#alt-grid");
    const others = state.recs.map((r, i) => ({ r, i })).filter((x) => x.i !== state.selected);
    $("#alts").hidden = !others.length;
    grid.innerHTML = others.map(({ r, i }, k) => {
      const m = r.menu;
      const d = dishOf(m);
      const fav = Fav.has(m.name);
      return `<button type="button" class="alt ${fav ? "fav" : ""}" data-i="${i}" style="animation-delay:${k * 0.05}s"
          aria-label="${esc(m.name)} 크게 보기">
        ${fav ? '<span class="heart" aria-hidden="true">♥</span>' : ""}
        <span class="disc" data-type="${d.type}" data-broth="${d.type === "plate" ? "" : d.broth}" aria-hidden="true">${m.emoji}</span>
        <b>${esc(m.name)}</b><small>${esc(m.desc)}</small>
      </button>`;
    }).join("");
    renderCurve(others.map((x) => x.r));
    renderWhy();
  }


  /** 추천 점수 곡선 (실제 너비로 다시 그려서 글자가 찌그러지지 않게) */
  function renderCurve(list) {
    const svg = $("#score-curve");
    const W = svg.clientWidth || 310;
    const H = 84;
    if (!list.length) {
      svg.innerHTML = "";
      return;
    }
    const scores = list.map((r) => r.score);
    const hi = Math.max(...scores);
    const lo = Math.min(...scores);
    const step = W / list.length;
    const pts = scores.map((s, k) => ({ x: step * (k + 0.5), y: hi === lo ? 44 : 30 + (hi - s) / (hi - lo) * 40, s }));
    let d = `M0 ${pts[0].y}`;
    let px = 0;
    let py = pts[0].y;
    for (const p of pts.concat({ x: W, y: pts[pts.length - 1].y })) {
      const cx = (px + p.x) / 2;
      d += ` C${cx} ${py} ${cx} ${p.y} ${p.x} ${p.y}`;
      px = p.x;
      py = p.y;
    }
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("aria-label", "추천 점수: " + list.map((r) => `${r.menu.name} ${r.score.toFixed(1)}`).join(", "));
    svg.innerHTML = `<path d="${d}" stroke="var(--accent)" stroke-width="2.5" fill="none" />` +
      pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="var(--cream)" /><text x="${p.x}" y="${p.y - 12}" text-anchor="middle">${p.s.toFixed(1)}</text>`).join("");
  }


  /** 추천 근거 펼쳐 보기: 6개 모두 */
  function renderWhy() {
    const box = $("#why-list");
    box.hidden = !state.whyOpen;
    $("#btn-why").setAttribute("aria-expanded", String(state.whyOpen));
    if (!state.whyOpen) return;
    box.innerHTML = state.recs.map((r, i) =>
      `<div><div class="wl-name">${i + 1}. ${r.menu.emoji} ${esc(r.menu.name)} <small class="hint">${r.score.toFixed(1)}점</small></div><ul>${whyItems(r, 4)}</ul></div>`).join("");
  }


  function renderDots() {
    $("#dots").innerHTML = state.recs.map((r, i) =>
      `<button type="button" class="${i === state.selected ? "on" : ""}" data-i="${i}" aria-label="${i + 1}위 ${esc(r.menu.name)}" aria-pressed="${i === state.selected}"></button>`).join("");
  }


  /** 고른 메뉴를 근처에서 파는 곳 수 (히어로 칩 + 「지금 갈 수 있는 곳」 카드) */
  function renderNear() {
    const r = state.recs[state.selected];
    const num = $("#near-num");
    const text = $("#near-text");
    const chip = $("#chip-near");
    if (!r) {
      num.textContent = "";
      text.textContent = "추천 메뉴를 고르면 근처 식당 수를 알려드려요.";
      return;
    }
    const m = r.menu;
    const short = m.name.split("·")[0];
    const walk = Math.round(state.radius / 67); // 걸음 속도 약 67m/분
    const unit = dishOf(m).type === "plate" ? "한 끼" : "한 그릇";
    const h = state.source === "kakao" ? state.menuHits.get(m.name) : null;
    const n = state.restaurants === null ? null : nearbyCount(m);
    const waiting = state.restaurantsLoading || (state.source === "kakao" && !h);
    if (state.restaurants === null) {
      num.textContent = "?";
      text.textContent = "식당 정보를 불러오지 못했어요.\n지도 버튼으로 찾아보세요.";
    } else if (waiting || !n) {
      num.textContent = "…";
      text.textContent = `걸어서 ${walk}분 안에\n${short} ${unit} 찾는 중`;
    } else if (n.exact > 0) {
      num.innerHTML = `${n.exact >= 45 && h && !h.complete ? "45+" : n.exact}<small>곳</small>`;
      text.textContent = `걸어서 ${walk}분 안에\n${short} ${unit}`;
    } else {
      num.innerHTML = `0<small>곳</small>`;
      text.textContent = n.similar ? `${short} 파는 곳은 없지만\n비슷한 식당이 ${n.similar}곳 있어요` : `걸어서 ${walk}분 안에는\n${short} 파는 곳이 없어요`;
    }
    if (chip) {
      const show = !waiting && n && n.exact > 0;
      chip.hidden = !show;
      if (show) chip.textContent = `근처 ${n.exact}곳`;
    }
  }


  function renderPlaces() {
    const list = $("#place-list");
    const rec = state.recs[state.selected];
    mapView.setPlaces([]);
    recipes.setMenu(rec?.menu || null);
    renderNear();
    if (!rec) {
      list.innerHTML = "";
      return;
    }
    const m = rec.menu;
    const short = m.name.split("·")[0].trim();
    $("#places-title").textContent = short.length <= 4 && !short.includes(" ") ? `주변 ${short}집` : `${short} 먹을 수 있는 곳`;

    const kq = encodeURIComponent(`${state.place?.area || ""} ${short}`.trim());
    $("#ext-links").innerHTML =
      `<a href="https://map.kakao.com/link/search/${kq}" target="_blank" rel="noopener">카카오맵</a>` +
      `<a href="https://map.naver.com/p/search/${kq}" target="_blank" rel="noopener">네이버지도</a>`;

    if (state.restaurantsLoading) {
      list.innerHTML = '<li class="empty">주변 식당을 찾는 중…</li>';
      return;
    }
    if (state.restaurants === null) {
      list.innerHTML = '<li class="empty">식당 정보를 불러오지 못했어요. 잠시 후 위치를 다시 선택하거나 지도 버튼을 이용해 주세요.</li>';
      return;
    }

    let hits;
    if (state.source === "kakao") {
      const h = state.menuHits.get(m.name);
      // 선택한 메뉴는 최대 45곳까지 더 가져옴
      if (!h || (!h.complete && h.pages < window.KakaoPlaces.MAX_PAGES)) {
        menuHits(m, window.KakaoPlaces.MAX_PAGES)
          .then(() => { if (state.recs[state.selected]?.menu === m) renderPlaces(); })
          .catch(() => {});
      }
      if (!h) {
        list.innerHTML = `<li class="empty">카카오에서 '${esc(m.name)}' 식당을 찾는 중…</li>`;
        return;
      }
      const seen = new Set(h.items.map((p) => p.id));
      const fromPool = state.restaurants
        .filter((p) => !seen.has(p.id))
        .map((p) => ({ ...p, level: R.matchRestaurant(m, p.tags) }))
        .filter((p) => p.level > 0);
      hits = h.items.map((p) => ({ ...p, level: 2 })).concat(fromPool);
    } else {
      hits = state.restaurants
        .map((p) => ({ ...p, level: R.matchRestaurant(m, p.tags) }))
        .filter((p) => p.level > 0);
    }
    hits = hits.sort((a, b) => b.level - a.level || a.dist - b.dist).slice(0, 45);

    if (!hits.length) {
      list.innerHTML = `<li class="empty">반경 ${state.radius >= 1000 ? state.radius / 1000 + "km" : state.radius + "m"} 안에서 '${esc(m.name)}' 식당을 찾지 못했어요.<br/>설정에서 반경을 넓히거나 위의 카카오맵·네이버지도로 찾아보세요.</li>`;
      return;
    }

    list.innerHTML = hits.map((p) => {
      const t = p.tags;
      const d = p.dist < 1000 ? `${Math.round(p.dist)}m` : `${(p.dist / 1000).toFixed(1)}km`;
      const addr = t.addr || [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
      const kind = placeKind(t);
      const meta = [kind, `<span class="lv">${p.level === 2 ? "메뉴 일치" : "비슷한 종류"}</span>`, addr && esc(addr), t.phone && "☎ " + esc(t.phone)]
        .filter(Boolean).map((x, k) => (k === 0 && kind ? esc(x) : x)).join(" · ");
      return `<li class="place ${p.level === 2 ? "hit" : ""}" data-id="${esc(p.id)}" title="지도에서 보기">
        <span class="tx"><span class="pn">${esc(t.name)}</span><span class="meta">${meta}</span></span>
        <span class="dist">${d}</span>
      </li>`;
    }).join("");

    mapView.setPlaces(hits.map((p) => {
      const kakao = p.tags.url || `https://map.kakao.com/link/search/${encodeURIComponent(p.tags.name)}`;
      const kind = placeKind(p.tags);
      return {
        id: p.id, lat: p.lat, lon: p.lon, strong: p.level === 2, title: p.tags.name,
        html: `<b>${esc(p.tags.name)}</b><br/>${kind ? esc(kind) + "<br/>" : ""}<a href="${esc(kakao)}" target="_blank" rel="noopener">카카오맵에서 보기 →</a>`,
      };
    }));
  }


  /** 목록에 보여줄 업종: 카카오 "음식점 > 한식 > 해장국" → "해장국", OSM → cuisine */
  function placeKind(t) {
    if (t["kakao:category"]) return t["kakao:category"].split(">").pop().trim();
    return t.cuisine || "";
  }


  function renderSource() {
    const kakao = state.source === "kakao";
    $("#source-note").textContent = kakao
      ? "식당 정보는 카카오 로컬 검색 기준이에요. 한 메뉴당 가까운 순으로 최대 45곳까지 보여줘요."
      : "식당 정보는 OpenStreetMap 기준이라 누락된 곳이 있을 수 있어요. config.js 에 카카오 키를 넣으면 더 정확해져요.";
    const mapBy = mapView.kind === "kakao" ? "Kakao" : "OpenStreetMap contributors";
    const placeBy = kakao ? "Kakao" : "OpenStreetMap contributors";
    $("#footer").textContent = mapBy === placeBy
      ? `날씨 © Open-Meteo · 지도·식당 © ${mapBy}`
      : `날씨 © Open-Meteo · 식당 © ${placeBy} · 지도 © ${mapBy}`;
  }


  function renderChips() {
    $("#cat-chips").innerHTML = CATS.map((c) => `<button type="button" class="chip ${state.excludeCats.has(c) ? "off" : ""}" data-cat="${c}" aria-pressed="${!state.excludeCats.has(c)}">${c}</button>`).join("");
  }


  function renderKid() {
    const b = $("#btn-kid");
    b.classList.toggle("on", state.kidOnly);
    b.setAttribute("aria-pressed", String(state.kidOnly));
    b.title = state.kidOnly ? "아이와 함께: 켜짐 (누르면 끔)" : "아이와 함께 먹기 좋은 메뉴만 추천";
    $("#kid-toggle").checked = state.kidOnly;
  }


  function setKid(on) {
    state.kidOnly = on;
    saveKid(on);
    renderKid();
    if (state.recs.length || state.place) runRecommend({ keepSelection: true });
    toast(on ? "👶 아이와 함께 먹기 좋은 메뉴만 추천해요" : "아이와 함께 필터를 껐어요");
  }


  function renderLight() {
    $("#light-toggle").checked = state.lightOnly;
  }


  function setLight(on) {
    state.lightOnly = on;
    saveLight(on);
    renderLight();
    if (state.recs.length || state.place) runRecommend({ keepSelection: true });
    toast(on ? "🥗 가볍게 먹기 좋은 메뉴만 추천해요" : "가벼운 식사 필터를 껐어요");
  }


  function renderMeal() {
    document.querySelectorAll("#meal-seg button").forEach((b) => b.classList.toggle("on", b.dataset.meal === state.meal));
  }


  // ── 이벤트 ──────────────────────────────────
  /** 히어로 메뉴 바꾸기 (다른 추천·점 누름) */
  function select(i, { scroll = false } = {}) {
    if (!state.recs[i]) return;
    state.changed = i !== state.selected;
    state.selected = i;
    state.userPicked = true;
    recipes.setMenu(state.recs[i].menu, { follow: true });
    renderSky();
    renderRecs();
    renderPlaces();
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $("#alt-grid").addEventListener("click", (e) => {
    const b = e.target.closest(".alt");
    if (b) select(+b.dataset.i, { scroll: true });
  });

  $("#dots").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (b) select(+b.dataset.i, { scroll: true });
  });

  $("#btn-why").addEventListener("click", () => {
    state.whyOpen = !state.whyOpen;
    renderWhy();
  });

  // 히어로의 ♡: 좋아하는 메뉴 등록/해제
  $("#btn-fav").addEventListener("click", () => {
    const m = state.recs[state.selected]?.menu;
    if (!m) return;
    const on = Fav.toggle(m.name);
    toast(on ? `💗 '${m.name}'을(를) 좋아하는 메뉴로 등록했어요` : `'${m.name}'을(를) 좋아하는 메뉴에서 뺐어요`);
  });

  // 히어로의 🚫: 추천 제외 (되돌리기 가능, 좋아하는 메뉴였다면 거기서 빠짐)
  $("#btn-ex").addEventListener("click", () => {
    const name = state.recs[state.selected]?.menu.name;
    if (!name) return;
    const r = Ex.add(name);
    if (!r) return;
    const movedFromFav = r.moved;
    state.changed = true;
    toast(`🚫 '${name}'은(는) 이제 추천하지 않아요`, () => {
      const item = Ex.remove(name);
      if (movedFromFav) Fav.restore(movedFromFav);
      toast(`'${item?.name || name}'을(를) 다시 추천해요`);
    });
  });

  $("#place-list").addEventListener("click", (e) => {
    const li = e.target.closest(".place");
    if (li) mapView.focus(li.dataset.id);
  });

  $("#btn-reroll").addEventListener("click", () => runRecommend({ reroll: true }));
  $("#btn-kid").addEventListener("click", () => setKid(!state.kidOnly));
  $("#kid-toggle").addEventListener("change", (e) => setKid(e.target.checked));
  $("#light-toggle").addEventListener("change", (e) => setLight(e.target.checked));

  $("#meal-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.meal = b.dataset.meal;
    renderMeal();
    runRecommend();
  });

  $("#cat-chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip")?.dataset.cat;
    if (!c) return;
    state.excludeCats.has(c) ? state.excludeCats.delete(c) : state.excludeCats.add(c);
    renderChips();
    runRecommend();
  });

  $("#weather-override").addEventListener("change", (e) => {
    state.override = e.target.value;
    runRecommend();
  });

  $("#radius").addEventListener("change", (e) => {
    state.radius = +e.target.value;
    mapView.setRadius(state.radius);
    if (state.lat != null) loadRestaurants();
  });

  // 아래 내비의 돋보기: 위치 검색칸으로
  $("#nav-search").addEventListener("click", () => setTimeout(() => $("#search-input").focus({ preventScroll: true }), 400));

  $("#search-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("#search-input").value.trim();
    if (!q) return;
    setPlace("검색 중…");
    try {
      const pos = await geocode(q);
      if (pos) {
        $("#search-input").blur();
        setLocation(pos.lat, pos.lon);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      else {
        setPlace(state.place?.area || "위치");
        toast(`'${q}'을(를) 찾지 못했어요`);
      }
    } catch {
      setPlace(state.place?.area || "위치");
      toast("위치 검색에 실패했어요");
    }
  });

  $("#btn-locate").addEventListener("click", () => {
    locate();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });


  function locate() {
    if (!navigator.geolocation) {
      setLocation(DEFAULT_POS.lat, DEFAULT_POS.lon);
      return;
    }
    setPlace("현재 위치 확인 중…");
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation(pos.coords.latitude, pos.coords.longitude),
      () => setLocation(DEFAULT_POS.lat, DEFAULT_POS.lon), // 거부·실패 시 서울시청
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    );
  }


  // 좋아하는 메뉴·제외 메뉴가 바뀌면(다른 탭 포함) 강조·추천 목록과 개수 갱신
  function renderFavCount() {
    const n = Fav.count();
    const x = Ex.count();
    $("#fav-count").textContent = n ? String(n) : "";
    $("#ex-count").textContent = x ? `${x}개` : "없음";
  }

  Fav.onChange(() => {
    renderRecs();
    renderFavCount();
  });

  Ex.onChange(() => {
    renderFavCount();
    if (state.recs.length || state.place) runRecommend({ keepSelection: true });
  });


  // 다른 탭에서 아이와 함께·가벼운 식사를 바꾸면 따라감
  window.addEventListener("storage", (e) => {
    if (e.key === KID_KEY) {
      state.kidOnly = loadKid();
      renderKid();
    } else if (e.key === LIGHT_KEY) {
      state.lightOnly = loadLight();
      renderLight();
    } else return;
    if (state.recs.length || state.place) runRecommend({ keepSelection: true });
  });

  // 점수 곡선은 실제 너비로 그리므로 화면 크기가 바뀌면 다시 그림
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderCurve(state.recs.filter((_, i) => i !== state.selected)), 150);
  });


  let toastTimer;
  let toastUndo = null;
  /** 알림. undo 함수를 주면 되돌리기 버튼을 붙임 */
  function toast(msg, undo) {
    const t = $("#toast");
    toastUndo = undo || null;
    t.innerHTML = esc(msg) + (undo ? ' <button type="button" class="undo">되돌리기</button>' : "");
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), undo ? 4500 : 2200);
  }

  $("#toast").addEventListener("click", (e) => {
    if (!e.target.closest(".undo") || !toastUndo) return;
    const fn = toastUndo;
    toastUndo = null;
    fn();
  });


  // ── 시작 ────────────────────────────────────
  renderFavCount();
  renderChips();
  renderKid();
  renderLight();
  renderMeal();
  renderSky();
  renderRecs();
  locate();
})();

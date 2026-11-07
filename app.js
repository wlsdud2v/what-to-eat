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
    userPicked: false,  // 사용자가 카드를 직접 골랐으면 재정렬 후에도 그 메뉴 유지
    jitter: new Map(),  // 메뉴별 무작위값 (다시 추천 때만 바뀜)
  };

  const Fav = window.Favorites;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));


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
    setCtx("ctx-place", "📍", "위치", "확인 중…");
    setCtx("ctx-weather", "⏳", "날씨", "불러오는 중…");

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
    setCtx("ctx-season", { spring: "🌸", summer: "🌻", autumn: "🍁", winter: "⛄" }[season], "계절", `${R.SEASON_KO[season]} · ${R.MEAL_KO[state.meal]}`);

    state.ranked = R.recommend({
      season,
      meal: state.meal,
      tags: ew.tags,
      feels: ew.feels,
      region: state.place?.region || "",
      excludeCats: state.excludeCats,
      nearby: nearbyCount,
      jitter: (m) => {
        if (!state.jitter.has(m.name)) state.jitter.set(m.name, Math.random());
        return state.jitter.get(m.name);
      },
    });
    state.recs = R.pickTop(state.ranked, 6);
    if (!opts.keepSelection) state.userPicked = false;
    const keep = opts.keepSelection && state.userPicked ? state.recs.findIndex((r) => r.menu.name === prevName) : -1;
    state.selected = keep >= 0 ? keep : 0;
    renderSky();
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


  const SKY_WORD = {
    clear: "맑은", partly: "구름 조금 낀", cloudy: "흐린", fog: "안개 낀", rain: "비 내리는",
    storm: "천둥 치는", snow: "눈 내리는", hot: "무더운", cold: "꽁꽁 언",
  };
  const SKY_LINE = {
    clear: "이건 어때요?", partly: "이건 어때요?", cloudy: "따끈한 한 그릇 어때요?", fog: "포근한 한 끼 어때요?",
    rain: "이런 메뉴가 당기죠", storm: "든든하게 먹고 버텨요", snow: "따뜻한 이거 어때요?",
    hot: "시원하게 이거 어때요?", cold: "몸 녹일 메뉴예요",
  };
  const DAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

  function renderSky() {
    const kind = skyKind();
    const night = isNight();
    window.Sky.set({ kind, night });
    const day = DAYS[new Date().getDay()];
    const meal = night && state.meal === "dinner" ? "밤" : R.MEAL_KO[state.meal];
    $("#kicker").textContent = state.weather || state.override ? `${SKY_WORD[kind]} ${day} ${meal},` : `${day} ${meal},`;
    $("#headline").textContent = state.recs.length ? SKY_LINE[kind] : "오늘은 뭐 먹을까요?";
  }


  // ── 렌더링 ──────────────────────────────────
  function setCtx(id, ico, small, text) {
    $(`#${id}`).innerHTML = `<span class="ico">${ico}</span><div><small>${esc(small)}</small><b title="${esc(text)}">${esc(text)}</b></div>`;
  }


  function renderContext() {
    setCtx("ctx-place", "📍", "위치", state.place?.label || "-");
    const w = state.weather;
    if (!w) {
      setCtx("ctx-weather", "❔", "날씨", "날씨를 못 불러왔어요");
      return;
    }
    const [desc, ico] = R.describeWeather(w.weatherCode);
    setCtx("ctx-weather", ico, "날씨", `${desc} ${Math.round(w.temp)}° (체감 ${Math.round(w.feels)}°)`);
  }


  function renderRecs() {
    const box = $("#recs");
    if (!state.recs.length) {
      box.innerHTML = '<div class="placeholder">모든 분류를 제외했어요. 아래 설정에서 음식 종류를 다시 켜 주세요.</div>';
      return;
    }
    const cards = state.recs.map((r, i) => {
      const m = r.menu;
      // 근거마다 종류 꼬리표(날씨·계절·지역·근처·끼니)를 붙여 왜 추천됐는지 바로 보이게
      const reasons = r.reasons.slice(0, 3).map((x) =>
        `<li class="why why-${x.kind}"><span class="tag">${x.icon} ${R.KINDS[x.kind].label}</span>${esc(x.text)}</li>`).join("");
      const b = r.basis;
      const fav = Fav.has(m.name);
      // 카드가 <button> 이라 안쪽 하트는 span(role=button)으로 둠
      const favBtn = `<span class="fav-btn ${fav ? "on" : ""}" role="button" tabindex="0" aria-pressed="${fav}"
        data-fav="${esc(m.name)}" title="${fav ? "좋아하는 메뉴에서 빼기" : "좋아하는 메뉴로 등록"}"
        aria-label="${esc(m.name)} ${fav ? "좋아하는 메뉴에서 빼기" : "좋아하는 메뉴로 등록"}">${fav ? "♥" : "♡"}</span>`;
      return `<button class="rec ${i === 0 ? "top" : ""} ${i === state.selected ? "sel" : ""} ${fav ? "fav" : ""}" data-i="${i}">
        <span class="rank">${i === 0 ? "오늘의 추천" : `#${i + 1}`}</span>
        ${favBtn}
        <span class="emoji">${m.emoji}</span>
        <span class="basis basis-${b.kind}">${b.icon} ${esc(b.label)}</span>
        <div class="name">${esc(m.name)}${fav ? ' <span class="fav-flag">💗 내 최애</span>' : ""}</div>
        <p class="desc">${esc(m.cat)} · ${esc(m.desc)}</p>
        <ul>${reasons}</ul>
      </button>`;
    });
    box.innerHTML = cards[0] + `<div class="rec-row">${cards.slice(1).join("")}</div>`;
  }


  function renderPlaces() {
    const list = $("#place-list");
    const rec = state.recs[state.selected];
    mapView.setPlaces([]);
    recipes.setMenu(rec?.menu || null);
    if (!rec) {
      list.innerHTML = "";
      return;
    }
    const m = rec.menu;
    $("#places-title").textContent = `${m.emoji} ${m.name} 먹을 수 있는 곳`;

    const kq = encodeURIComponent(`${state.place?.area || ""} ${m.name.split("·")[0]}`.trim());
    $("#ext-links").innerHTML =
      `<a class="kakao" href="https://map.kakao.com/link/search/${kq}" target="_blank" rel="noopener">카카오맵</a>` +
      `<a class="naver" href="https://map.naver.com/p/search/${kq}" target="_blank" rel="noopener">네이버지도</a>`;

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
      list.innerHTML = `<li class="empty">반경 ${state.radius >= 1000 ? state.radius / 1000 + "km" : state.radius + "m"} 안에서 '${esc(m.name)}' 식당을 찾지 못했어요.<br/>반경을 넓히거나 위의 카카오맵·네이버지도 버튼으로 찾아보세요.</li>`;
      return;
    }

    list.innerHTML = hits.map((p) => {
      const t = p.tags;
      const badge = p.level === 2 ? '<span class="badge hit">메뉴 일치</span>' : '<span class="badge cat">비슷한 종류</span>';
      const d = p.dist < 1000 ? `${Math.round(p.dist)}m` : `${(p.dist / 1000).toFixed(1)}km`;
      const addr = t.addr || [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
      const kind = placeKind(t);
      return `<li class="place" data-id="${esc(p.id)}">
        <div class="pn">${badge}${esc(t.name)}${kind ? ` <span class="kind">${esc(kind)}</span>` : ""}</div>
        <div class="meta">🚶 ${d}${addr ? " · " + esc(addr) : ""}${t.phone ? " · ☎ " + esc(t.phone) : ""}${t.opening_hours ? " · ⏰ " + esc(t.opening_hours) : ""}</div>
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
    $("#cat-chips").innerHTML = CATS.map((c) => `<button class="chip ${state.excludeCats.has(c) ? "off" : ""}" data-cat="${c}">${c}</button>`).join("");
  }


  function renderMeal() {
    document.querySelectorAll("#meal-seg button").forEach((b) => b.classList.toggle("on", b.dataset.meal === state.meal));
  }


  // ── 이벤트 ──────────────────────────────────
  /** 카드의 하트: 좋아하는 메뉴 등록/해제 (카드 선택·스크롤은 하지 않음) */
  function toggleFav(el) {
    const on = Fav.toggle(el.dataset.fav);
    toast(on ? `💗 '${el.dataset.fav}'을(를) 좋아하는 메뉴로 등록했어요` : `'${el.dataset.fav}'을(를) 좋아하는 메뉴에서 뺐어요`);
  }

  $("#recs").addEventListener("keydown", (e) => {
    const fb = e.target.closest(".fav-btn");
    if (!fb || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    toggleFav(fb);
  });

  $("#recs").addEventListener("click", (e) => {
    const fb = e.target.closest(".fav-btn");
    if (fb) {
      e.preventDefault();
      toggleFav(fb);
      return;
    }
    const card = e.target.closest(".rec");
    if (!card) return;
    state.selected = +card.dataset.i;
    state.userPicked = true;
    recipes.setMenu(state.recs[state.selected].menu, { follow: true });
    renderRecs();
    renderPlaces();
    document.querySelector(".places").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#place-list").addEventListener("click", (e) => {
    const li = e.target.closest(".place");
    if (li) mapView.focus(li.dataset.id);
  });

  $("#btn-reroll").addEventListener("click", () => runRecommend({ reroll: true }));

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

  $("#search-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("#search-input").value.trim();
    if (!q) return;
    setCtx("ctx-place", "🔎", "위치", "검색 중…");
    try {
      const pos = await geocode(q);
      if (pos) {
        setLocation(pos.lat, pos.lon);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      else setCtx("ctx-place", "❔", "위치", `'${q}'을(를) 찾지 못했어요`);
    } catch {
      setCtx("ctx-place", "❔", "위치", "검색에 실패했어요");
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
    setCtx("ctx-place", "🎯", "위치", "현재 위치 확인 중…");
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation(pos.coords.latitude, pos.coords.longitude),
      () => setLocation(DEFAULT_POS.lat, DEFAULT_POS.lon), // 거부·실패 시 서울시청
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    );
  }


  // 좋아하는 메뉴가 바뀌면(다른 탭 포함) 카드 강조와 개수 갱신
  function renderFavCount() {
    const n = Fav.count();
    $("#fav-count").textContent = n ? String(n) : "";
  }

  Fav.onChange(() => {
    renderRecs();
    renderFavCount();
  });


  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }


  // ── 시작 ────────────────────────────────────
  renderFavCount();
  renderChips();
  renderMeal();
  renderSky();
  locate();
})();

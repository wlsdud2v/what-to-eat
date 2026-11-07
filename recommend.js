/**
 * 오늘 뭐 먹지? — 추천 로직 (DOM 의존 없음, Node 에서도 테스트 가능)
 * 메뉴 데이터와 필드 설명은 menus.js 에 있습니다.
 */
(function (root) {
  const MENUS = typeof module !== "undefined" && module.exports ? require("./menus.js") : root.MENUS_DATA;

  const SEASON_KO = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };
  const MEAL_KO = { lunch: "점심", dinner: "저녁" };
  const WEATHER_REASON = {
    rain: "비 오는 날 생각나는 메뉴",
    snow: "눈 오는 날 몸 녹이기 좋은 메뉴",
    hot: "더운 날씨에 잘 맞는 메뉴",
    humid: "후덥지근한 날에 어울리는 메뉴",
    cold: "추운 날씨에 딱인 메뉴",
    chilly: "쌀쌀한 날씨에 어울리는 메뉴",
    mild: "선선한 날씨에 가볍게",
    clear: "맑은 날 기분 좋게",
    cloudy: "흐린 날 무난하게",
    windy: "바람 부는 날 든든하게",
  };
  const WEATHER_ICON = {
    rain: "🌧️", snow: "❄️", hot: "☀️", humid: "💦", cold: "🥶",
    chilly: "🍃", mild: "🌤️", clear: "☀️", cloudy: "☁️", windy: "🌬️",
  };
  const SEASON_ICON = { spring: "🌸", summer: "🌻", autumn: "🍁", winter: "⛄" };

  /**
   * 추천 근거 종류 — 카드에 "날씨 추천 / 계절 추천 / 지역 추천" 처럼 표시
   * basis: true 면 카드의 대표 근거(가장 크게 기여한 것)가 될 수 있음
   */
  const KINDS = {
    weather: { label: "날씨", basis: true },
    season: { label: "계절", basis: true },
    region: { label: "지역", basis: true },
    nearby: { label: "근처", basis: false },
    meal: { label: "끼니", basis: false },
  };


  /** 월(1~12)과 위도로 계절 계산 (남반구면 반전) */
  function getSeason(month, lat) {
    let s;
    if (month >= 3 && month <= 5) s = "spring";
    else if (month >= 6 && month <= 8) s = "summer";
    else if (month >= 9 && month <= 11) s = "autumn";
    else s = "winter";
    if (lat < 0) s = { spring: "autumn", summer: "winter", autumn: "spring", winter: "summer" }[s];
    return s;
  }


  /** 시간으로 끼니 판단: 15시 이전 점심, 이후 저녁 */
  function getMeal(hour) {
    return hour < 15 ? "lunch" : "dinner";
  }


  /** Open-Meteo 현재 날씨 → 날씨 태그 목록 */
  function weatherTags(w) {
    const tags = new Set();
    const code = w.weatherCode;
    const feels = w.feels;
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) tags.add("rain");
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) tags.add("snow");
    if (code <= 1) tags.add("clear");
    else if (code <= 48) tags.add("cloudy");
    if (feels >= 27) tags.add("hot");
    else if (feels <= 5) tags.add("cold");
    else if (feels <= 13) tags.add("chilly");
    else tags.add("mild");
    if (w.humidity >= 75 && feels >= 22) tags.add("humid");
    if (w.wind >= 30) tags.add("windy");
    return [...tags];
  }


  /** WMO 날씨 코드 → 한글 설명과 아이콘 */
  function describeWeather(code) {
    if (code === 0) return ["맑음", "☀️"];
    if (code <= 2) return ["구름 조금", "🌤️"];
    if (code === 3) return ["흐림", "☁️"];
    if (code <= 48) return ["안개", "🌫️"];
    if (code <= 57) return ["이슬비", "🌦️"];
    if (code <= 67) return ["비", "🌧️"];
    if (code <= 77) return ["눈", "🌨️"];
    if (code <= 82) return ["소나기", "🌧️"];
    if (code <= 86) return ["눈보라", "❄️"];
    return ["뇌우", "⛈️"];
  }


  /**
   * 메뉴 점수 계산
   * ctx: { season, meal, tags:[], feels, region:"주소 문자열", excludeCats:Set,
   *        excludeNames:Set (추천 제외 메뉴), kidOnly:boolean (아이와 함께 — kid:false 메뉴 제외),
   *        lightOnly:boolean (가벼운 식사 — light:true 메뉴만),
   *        drinkOnly:boolean (반주·안주 — drink:true 메뉴만),
   *        nearOnly:boolean (근처 식당 메뉴만 — nearby().exact > 0 인 메뉴만, 가까울수록 가산점),
   *        radius:number (m, nearOnly 거리 가산점 기준),
   *        jitter:(menu)=>0~1, nearby:(menu)=>{ exact, similar, nearest? } | null }
   * 반환: [{ menu, score, reasons:[{ kind, icon, text, pts }], basis }] 점수 내림차순
   *   reasons  추천 근거 (기여 점수 큰 순). kind 는 KINDS 의 키
   *   basis    대표 근거 { kind, label, icon } — 날씨·계절·지역 중 가장 크게 기여한 것,
   *            셋 다 없으면 끼니 → 그것도 없으면 "오늘의 랜덤"
   */
  function recommend(ctx, menus) {
    menus = menus || MENUS;
    const jitter = ctx.jitter || Math.random;
    const results = [];

    for (const m of menus) {
      if (ctx.excludeCats && ctx.excludeCats.has(m.cat)) continue;
      if (ctx.excludeNames && ctx.excludeNames.has(m.name)) continue;
      if (ctx.kidOnly && m.kid === false) continue;
      if (ctx.lightOnly && !m.light) continue;
      if (ctx.drinkOnly && !m.drink) continue;
      // 근처 식당 메뉴만: 반경 안에 그 메뉴를 파는 식당이 확인된 메뉴만 남김
      const near = ctx.nearby ? ctx.nearby(m) : null;
      if (ctx.nearOnly && !(near && near.exact > 0)) continue;
      let score = 0;
      const reasons = [];
      const add = (kind, icon, text, pts) => reasons.push({ kind, icon, text, pts });

      // 지역 특산
      const region = (m.regions || []).find((r) => ctx.region && ctx.region.includes(r));
      if (region) {
        score += 6;
        add("region", "📍", `${region} 대표 메뉴`, 6);
      }

      // 계절
      if (m.seasons.length === 0) score += 1;
      else if (m.seasons.includes(ctx.season)) {
        score += 3;
        add("season", SEASON_ICON[ctx.season], `${SEASON_KO[ctx.season]} 제철·계절 메뉴`, 3);
      } else score -= 1;

      // 날씨 태그
      const matched = m.weather.filter((t) => ctx.tags.includes(t));
      const W = { rain: 5, snow: 5, hot: 4, cold: 4, humid: 2 };
      const weatherPts = matched.map((t) => W[t] || 2).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);
      score += weatherPts;
      const strong = matched.find((t) => ["rain", "snow", "hot", "cold", "humid"].includes(t)) || matched[0];

      // 체감온도와 음식 온도 (날씨 근거로 함께 묶음)
      const f = ctx.feels;
      let tempPts = 0;
      if (m.temp === "hot") {
        if (f <= 10) tempPts = 3;
        else if (f >= 27 && !m.weather.includes("hot")) tempPts = -3; // 이열치열 메뉴는 예외
      } else if (m.temp === "cold") {
        if (f >= 27) tempPts = 3;
        else if (f <= 8) tempPts = -6;
        else if (f <= 15) tempPts = -3;
      }
      score += tempPts;

      if (strong) {
        add("weather", WEATHER_ICON[strong] || "🌡️", WEATHER_REASON[strong], weatherPts + Math.max(tempPts, 0));
      } else if (tempPts > 0) {
        const text = m.temp === "hot" ? `체감 ${Math.round(f)}°, 뜨끈한 게 당기는 날` : `체감 ${Math.round(f)}°, 시원한 게 당기는 날`;
        add("weather", m.temp === "hot" ? "🥶" : "☀️", text, tempPts);
      }

      // 끼니
      if (m.meal !== "both" && m.meal !== ctx.meal) score -= 2;
      else if (m.meal === ctx.meal) {
        score += 2;
        add("meal", "🍽️", `${MEAL_KO[ctx.meal]} 메뉴로 좋아요`, 2);
      }

      // 주변에 파는 식당이 있으면 가산점
      if (near && near.exact > 0) {
        let pts = 2.5;
        let text = `근처에 파는 곳 ${near.exact}곳`;
        // 근처 식당 메뉴만: 가장 가까운 집이 가까울수록 최대 +3
        if (ctx.nearOnly && near.nearest != null) {
          pts += Math.round(3 * Math.max(0, 1 - near.nearest / (ctx.radius || 1000)) * 10) / 10;
          const min = Math.max(1, Math.round(near.nearest / 67)); // 걸음 속도 약 67m/분
          text = `걸어서 ${min}분(${fmtDist(near.nearest)}) 거리 · 근처 ${near.exact}곳`;
        }
        score += pts;
        add("nearby", "🏠", text, pts);
      } else if (near && near.similar > 0) score += 0.5;

      // 같은 조건에서도 매번 조금씩 다르게
      score += jitter(m) * 2;

      // 기여 점수 큰 순 (같으면 날씨 > 계절 > 지역 > 근처 > 끼니)
      const order = Object.keys(KINDS);
      reasons.sort((a, b) => b.pts - a.pts || order.indexOf(a.kind) - order.indexOf(b.kind));

      results.push({ menu: m, score, reasons, basis: pickBasis(reasons) });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }


  /**
   * 대표 근거: 지역 특산이면 지역(가장 구체적인 근거라 우선),
   * 아니면 날씨·계절 중 기여 점수가 큰 것 (reasons 는 이미 점수 순)
   */
  function pickBasis(reasons) {
    const r = reasons.find((x) => x.kind === "region")
      || reasons.find((x) => KINDS[x.kind].basis)
      || reasons.find((x) => x.kind === "meal");
    if (!r) return { kind: "random", label: "오늘의 랜덤", icon: "🎲" };
    return { kind: r.kind, label: `${KINDS[r.kind].label} 추천`, icon: r.icon };
  }


  /**
   * 점수 순 목록에서 화면에 보일 n개 고르기
   * 같은 분류가 perCat 개를 넘지 않게 골라 비슷한 메뉴(예: 떡볶이 여러 종)가 몰리지 않게 함.
   * 1위는 항상 점수 1위이고, 분류 제한으로 다 못 채우면 남은 순서대로 채움.
   */
  function pickTop(ranked, n = 6, perCat = 2) {
    const picked = [];
    const count = {};
    for (const r of ranked) {
      if (picked.length >= n) break;
      const c = r.menu.cat;
      if ((count[c] || 0) >= perCat) continue;
      count[c] = (count[c] || 0) + 1;
      picked.push(r);
    }
    for (const r of ranked) {
      if (picked.length >= n) break;
      if (!picked.includes(r)) picked.push(r);
    }
    return picked;
  }


  /**
   * 메뉴와 OSM 식당 매칭 정도
   * 2: 이름에 메뉴 키워드 포함 (판매 가능성 높음), 1: 요리 분류만 일치, 0: 무관
   */
  function matchRestaurant(menu, tags) {
    const name = `${tags.name || ""} ${tags["name:ko"] || ""} ${tags["name:en"] || ""}`.toLowerCase();
    if (menu.kw.some((k) => name.includes(k.toLowerCase()))) return 2;

    // 카카오 장소: category_name = "음식점 > 한식 > 해장국"
    const kc = tags["kakao:category"];
    if (kc != null) {
      const parts = kc.split(">").map((s) => s.trim());
      const group = parts[1] || "";
      const detail = parts.slice(2).join(" ");
      // 한 글자 키워드(예: "포")는 "포장마차" 같은 오탐이 많아 분류 매칭에서 제외
      if (menu.kw.some((k) => k.length >= 2 && (group === k || detail.includes(k)))) return 2;
      if ((KAKAO_GROUPS[menu.cat] || []).includes(group)) return 1;
      return 0;
    }

    const cuisines = (tags.cuisine || "").toLowerCase().split(/[;,]\s*/);
    if (menu.cuisine.some((c) => cuisines.includes(c))) return 1;
    return 0;
  }


  /** 메뉴 분류 → 카카오 음식점 2단계 분류 */
  const KAKAO_GROUPS = {
    한식: ["한식"],
    중식: ["중식"],
    일식: ["일식"],
    양식: ["양식", "치킨", "패스트푸드"],
    분식: ["분식"],
    아시안: ["아시아음식", "샤브샤브"],
  };


  /** 거리 표시: 950m, 1.2km */
  function fmtDist(m) {
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  }


  /** 두 좌표 사이 거리(m) */
  function distance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }


  const api = { MENUS, SEASON_KO, MEAL_KO, KINDS, getSeason, getMeal, weatherTags, describeWeather, recommend, pickTop, matchRestaurant, distance };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Recommend = api;
})(typeof window !== "undefined" ? window : globalThis);

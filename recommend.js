/**
 * 오늘 뭐 먹지? — 메뉴 데이터와 추천 로직 (DOM 의존 없음, Node 에서도 테스트 가능)
 *
 * 메뉴 필드
 *  name      표시 이름
 *  emoji     아이콘
 *  cat       분류 (한식/중식/일식/양식/분식/아시안)
 *  temp      음식 온도: hot(뜨거운 국물·탕) / cold(차가운 음식) / neutral
 *  seasons   어울리는 계절 (spring/summer/autumn/winter), 비어 있으면 사계절
 *  weather   어울리는 날씨 태그 (rain/snow/hot/cold/chilly/mild/clear/cloudy/humid/windy)
 *  regions   지역 특산 (역 지오코딩 주소에 포함되면 가산점)
 *  meal      lunch / dinner / both
 *  kw        식당 이름·카카오 분류 매칭 키워드 (첫 번째 값은 카카오 키워드 검색어로도 사용)
 *  cuisine   OSM cuisine 태그 매칭값 (카카오 키가 없을 때)
 *  desc      한 줄 설명
 */
(function (root) {
  const MENUS = [
    // ── 국물·탕 ──────────────────────────────
    { name: "김치찌개", emoji: "🍲", cat: "한식", temp: "hot", seasons: ["autumn", "winter"], weather: ["cold", "chilly", "rain"], meal: "both", kw: ["김치찌개", "찌개", "백반"], cuisine: ["korean"], desc: "칼칼한 국물에 밥 한 공기" },
    { name: "된장찌개", emoji: "🥘", cat: "한식", temp: "hot", seasons: [], weather: ["chilly", "cloudy"], meal: "lunch", kw: ["된장", "찌개", "백반", "청국장"], cuisine: ["korean"], desc: "실패 없는 집밥 메뉴" },
    { name: "순대국", emoji: "🍲", cat: "한식", temp: "hot", seasons: ["autumn", "winter"], weather: ["cold", "chilly", "rain"], meal: "both", kw: ["순대국", "순댓국", "국밥", "순대"], cuisine: ["korean"], desc: "든든한 뜨끈 국밥" },
    { name: "돼지국밥", emoji: "🍲", cat: "한식", temp: "hot", seasons: ["autumn", "winter"], weather: ["cold", "chilly"], regions: ["부산", "밀양"], meal: "both", kw: ["돼지국밥", "국밥"], cuisine: ["korean"], desc: "부산 사람의 소울푸드" },
    { name: "설렁탕·곰탕", emoji: "🥣", cat: "한식", temp: "hot", seasons: ["winter"], weather: ["cold", "snow"], regions: ["나주"], meal: "lunch", kw: ["설렁탕", "곰탕", "도가니"], cuisine: ["korean"], desc: "뽀얀 국물로 몸 녹이기" },
    { name: "감자탕", emoji: "🦴", cat: "한식", temp: "hot", seasons: ["winter"], weather: ["cold", "snow"], meal: "dinner", kw: ["감자탕", "뼈해장국", "해장국"], cuisine: ["korean"], desc: "뼈 발라 먹는 재미" },
    { name: "부대찌개", emoji: "🍲", cat: "한식", temp: "hot", seasons: ["autumn", "winter"], weather: ["cold", "snow", "chilly"], regions: ["의정부", "송탄"], meal: "both", kw: ["부대찌개", "부대"], cuisine: ["korean"], desc: "라면사리 필수" },
    { name: "칼국수", emoji: "🍜", cat: "한식", temp: "hot", seasons: ["autumn", "winter"], weather: ["rain", "chilly"], meal: "lunch", kw: ["칼국수", "손칼국수", "바지락"], cuisine: ["korean", "noodle"], desc: "비 오는 날 국룰" },
    { name: "수제비", emoji: "🥣", cat: "한식", temp: "hot", seasons: [], weather: ["rain", "cloudy"], meal: "lunch", kw: ["수제비", "칼국수"], cuisine: ["korean"], desc: "빗소리 들으며 후루룩" },
    { name: "굴국밥", emoji: "🦪", cat: "한식", temp: "hot", seasons: ["winter"], weather: ["cold"], regions: ["통영", "거제"], meal: "lunch", kw: ["굴국밥", "굴"], cuisine: ["korean", "seafood"], desc: "겨울이 제철인 굴" },
    { name: "콩나물국밥", emoji: "🍲", cat: "한식", temp: "hot", seasons: [], weather: ["cold", "chilly", "rain"], regions: ["전주"], meal: "lunch", kw: ["콩나물국밥", "국밥"], cuisine: ["korean"], desc: "시원하고 개운한 한 그릇" },
    { name: "샤브샤브", emoji: "🥬", cat: "아시안", temp: "hot", seasons: ["autumn", "winter"], weather: ["cold", "snow", "chilly"], meal: "dinner", kw: ["샤브"], cuisine: ["shabu-shabu", "hot_pot"], desc: "채소 듬뿍 따끈하게" },
    { name: "어묵탕", emoji: "🍢", cat: "분식", temp: "hot", seasons: ["winter"], weather: ["cold", "snow"], regions: ["부산"], meal: "dinner", kw: ["어묵", "오뎅", "이자카야"], cuisine: ["japanese", "izakaya"], desc: "추운 날 포장마차 감성" },
    { name: "삼계탕", emoji: "🐔", cat: "한식", temp: "hot", seasons: ["summer"], weather: ["hot", "humid"], meal: "both", kw: ["삼계탕", "백숙", "토종닭"], cuisine: ["korean"], desc: "이열치열 보양식" },

    // ── 면 ──────────────────────────────────
    { name: "짬뽕", emoji: "🌶️", cat: "중식", temp: "hot", seasons: [], weather: ["rain", "cold", "chilly"], meal: "both", kw: ["짬뽕", "중화", "반점", "중국집", "차이나"], cuisine: ["chinese"], desc: "얼큰한 해물 국물" },
    { name: "짜장면", emoji: "🍝", cat: "중식", temp: "neutral", seasons: [], weather: ["clear", "cloudy", "rain"], meal: "lunch", kw: ["짜장", "자장", "반점", "중화", "중국집"], cuisine: ["chinese"], desc: "고민될 땐 짜장" },
    { name: "마라탕", emoji: "🌶️", cat: "중식", temp: "hot", seasons: ["autumn", "winter"], weather: ["cold", "chilly", "cloudy"], meal: "both", kw: ["마라", "마라탕"], cuisine: ["chinese", "sichuan"], desc: "얼얼하게 땀 쭉" },
    { name: "쌀국수", emoji: "🍜", cat: "아시안", temp: "hot", seasons: [], weather: ["rain", "chilly"], meal: "lunch", kw: ["쌀국수", "포", "pho", "베트남"], cuisine: ["vietnamese"], desc: "가볍고 따뜻한 국물" },
    { name: "라멘", emoji: "🍜", cat: "일식", temp: "hot", seasons: ["autumn", "winter"], weather: ["chilly", "cold", "rain"], meal: "both", kw: ["라멘", "멘야", "ramen", "돈코츠"], cuisine: ["ramen", "japanese"], desc: "진한 국물에 차슈 한 장" },
    { name: "우동", emoji: "🍜", cat: "일식", temp: "hot", seasons: ["autumn", "winter"], weather: ["chilly", "rain", "snow"], meal: "lunch", kw: ["우동", "udon"], cuisine: ["japanese", "udon"], desc: "쫄깃한 면발" },
    { name: "냉면", emoji: "🧊", cat: "한식", temp: "cold", seasons: ["summer"], weather: ["hot", "humid"], meal: "lunch", kw: ["냉면", "면옥", "평양", "함흥"], cuisine: ["korean", "noodle"], desc: "더위 한 방에 날리기" },
    { name: "밀면", emoji: "🧊", cat: "한식", temp: "cold", seasons: ["summer"], weather: ["hot", "humid"], regions: ["부산"], meal: "lunch", kw: ["밀면"], cuisine: ["korean"], desc: "부산식 시원한 면" },
    { name: "막국수", emoji: "🥢", cat: "한식", temp: "cold", seasons: ["summer"], weather: ["hot", "clear"], regions: ["춘천", "강원", "홍천", "평창"], meal: "lunch", kw: ["막국수", "메밀"], cuisine: ["korean", "noodle"], desc: "메밀 향 가득" },
    { name: "콩국수", emoji: "🥛", cat: "한식", temp: "cold", seasons: ["summer"], weather: ["hot", "humid"], meal: "lunch", kw: ["콩국수", "국수"], cuisine: ["korean", "noodle"], desc: "고소하고 시원하게" },
    { name: "비빔국수", emoji: "🥢", cat: "한식", temp: "cold", seasons: ["spring", "summer"], weather: ["hot", "clear"], meal: "lunch", kw: ["비빔국수", "국수", "잔치국수"], cuisine: ["korean", "noodle"], desc: "새콤달콤 입맛 살리기" },
    { name: "고기국수", emoji: "🍜", cat: "한식", temp: "hot", seasons: [], weather: ["chilly", "windy", "rain"], regions: ["제주"], meal: "lunch", kw: ["고기국수", "국수"], cuisine: ["korean", "noodle"], desc: "제주의 든든한 국수" },

    // ── 밥·한식 ─────────────────────────────
    { name: "비빔밥", emoji: "🍚", cat: "한식", temp: "neutral", seasons: ["spring", "summer"], weather: ["clear", "mild"], regions: ["전주", "진주"], meal: "lunch", kw: ["비빔밥", "돌솥", "한정식"], cuisine: ["korean"], desc: "제철 나물 듬뿍" },
    { name: "제육볶음", emoji: "🍖", cat: "한식", temp: "neutral", seasons: [], weather: ["clear", "cloudy", "mild"], meal: "lunch", kw: ["제육", "백반", "기사식당", "한식뷔페"], cuisine: ["korean"], desc: "직장인 점심 1순위" },
    { name: "쭈꾸미볶음", emoji: "🐙", cat: "한식", temp: "neutral", seasons: ["spring"], weather: ["clear", "mild"], regions: ["서천", "보령"], meal: "both", kw: ["쭈꾸미", "주꾸미", "낙지"], cuisine: ["korean", "seafood"], desc: "봄이 제철인 쭈꾸미" },
    { name: "찜닭", emoji: "🍗", cat: "한식", temp: "neutral", seasons: ["autumn", "winter"], weather: ["chilly", "cloudy"], regions: ["안동"], meal: "both", kw: ["찜닭"], cuisine: ["korean", "chicken"], desc: "달짝지근 간장 양념" },
    { name: "간장게장", emoji: "🦀", cat: "한식", temp: "neutral", seasons: ["spring", "autumn"], weather: ["clear", "mild"], regions: ["여수", "서산"], meal: "both", kw: ["게장", "꽃게"], cuisine: ["korean", "seafood"], desc: "밥도둑" },
    { name: "꼬막비빔밥", emoji: "🐚", cat: "한식", temp: "neutral", seasons: ["winter"], weather: ["cold", "clear"], regions: ["강릉", "벌교", "보성"], meal: "lunch", kw: ["꼬막"], cuisine: ["korean", "seafood"], desc: "겨울 제철 꼬막" },

    // ── 고기·저녁 ───────────────────────────
    { name: "삼겹살", emoji: "🥓", cat: "한식", temp: "neutral", seasons: [], weather: ["clear", "chilly", "cloudy", "rain"], meal: "dinner", kw: ["삼겹살", "고기", "돼지", "숯불", "구이"], cuisine: ["korean", "barbecue", "korean_barbecue"], desc: "소주 한 잔과 함께" },
    { name: "흑돼지구이", emoji: "🐖", cat: "한식", temp: "neutral", seasons: [], weather: ["clear", "chilly", "windy"], regions: ["제주"], meal: "dinner", kw: ["흑돼지", "돼지", "고기"], cuisine: ["korean", "barbecue"], desc: "제주 오면 무조건" },
    { name: "닭갈비", emoji: "🍗", cat: "한식", temp: "neutral", seasons: ["autumn", "winter"], weather: ["chilly", "cold", "clear"], regions: ["춘천"], meal: "dinner", kw: ["닭갈비"], cuisine: ["korean"], desc: "볶음밥으로 마무리" },
    { name: "곱창·막창", emoji: "🔥", cat: "한식", temp: "neutral", seasons: ["autumn", "winter"], weather: ["cold", "chilly"], regions: ["대구"], meal: "dinner", kw: ["곱창", "막창", "대창"], cuisine: ["korean"], desc: "고소함의 끝판왕" },
    { name: "족발·보쌈", emoji: "🍖", cat: "한식", temp: "neutral", seasons: [], weather: ["chilly", "cloudy", "clear"], meal: "dinner", kw: ["족발", "보쌈"], cuisine: ["korean"], desc: "야들야들 쫀득" },
    { name: "해물파전·막걸리", emoji: "🥞", cat: "한식", temp: "neutral", seasons: ["spring", "summer", "autumn"], weather: ["rain", "humid"], meal: "dinner", kw: ["파전", "전집", "빈대떡", "막걸리", "주막"], cuisine: ["korean"], desc: "비 오면 전 부치는 소리" },
    { name: "치킨·맥주", emoji: "🍻", cat: "양식", temp: "neutral", seasons: ["summer"], weather: ["hot", "clear", "humid"], meal: "dinner", kw: ["치킨", "통닭", "호프", "BBQ", "bhc", "교촌"], cuisine: ["chicken", "fried_chicken"], desc: "더운 저녁엔 치맥" },
    { name: "장어구이", emoji: "🐍", cat: "한식", temp: "neutral", seasons: ["summer"], weather: ["hot", "humid"], regions: ["고창"], meal: "dinner", kw: ["장어"], cuisine: ["korean", "seafood"], desc: "여름 기력 보충" },

    // ── 해산물 ──────────────────────────────
    { name: "물회", emoji: "🐟", cat: "한식", temp: "cold", seasons: ["summer"], weather: ["hot", "clear"], regions: ["포항", "강릉", "속초", "제주"], meal: "lunch", kw: ["물회", "횟집"], cuisine: ["seafood"], desc: "새콤 시원한 바다 맛" },
    { name: "초밥", emoji: "🍣", cat: "일식", temp: "neutral", seasons: [], weather: ["clear", "mild", "hot"], meal: "both", kw: ["초밥", "스시", "sushi", "오마카세"], cuisine: ["sushi", "japanese"], desc: "깔끔하게 한 접시" },
    { name: "모둠회", emoji: "🐠", cat: "한식", temp: "neutral", seasons: ["spring", "autumn"], weather: ["clear", "mild"], regions: ["부산", "통영", "속초", "여수"], meal: "dinner", kw: ["횟집", "활어", "회센터", "수산"], cuisine: ["seafood"], desc: "제철 생선으로" },
    { name: "방어회", emoji: "🐟", cat: "한식", temp: "neutral", seasons: ["winter"], weather: ["cold", "clear"], regions: ["제주", "모슬포"], meal: "dinner", kw: ["방어", "횟집", "활어"], cuisine: ["seafood"], desc: "겨울 대방어 시즌" },
    { name: "전어·대하구이", emoji: "🦐", cat: "한식", temp: "neutral", seasons: ["autumn"], weather: ["clear", "mild", "chilly"], regions: ["보령", "광양", "남당"], meal: "dinner", kw: ["전어", "대하", "새우"], cuisine: ["seafood"], desc: "가을 바다의 맛" },

    // ── 간편·양식·기타 ──────────────────────
    { name: "떡볶이", emoji: "🌶️", cat: "분식", temp: "neutral", seasons: [], weather: ["cloudy", "rain", "chilly"], meal: "lunch", kw: ["떡볶이", "분식", "떡볶기"], cuisine: ["korean"], desc: "스트레스엔 매운맛" },
    { name: "김밥·라면", emoji: "🍙", cat: "분식", temp: "neutral", seasons: [], weather: ["rain", "cloudy"], meal: "lunch", kw: ["김밥", "분식", "라면"], cuisine: ["korean"], desc: "빠르고 간단하게" },
    { name: "돈가스", emoji: "🍛", cat: "일식", temp: "neutral", seasons: [], weather: ["clear", "cloudy", "mild"], meal: "lunch", kw: ["돈가스", "돈까스", "카츠", "katsu"], cuisine: ["japanese", "tonkatsu"], desc: "바삭바삭 실패 없는 맛" },
    { name: "카레", emoji: "🍛", cat: "아시안", temp: "neutral", seasons: [], weather: ["rain", "cloudy", "chilly"], meal: "lunch", kw: ["커리", "카레", "인도", "curry"], cuisine: ["indian", "curry"], desc: "향신료로 기분 전환" },
    { name: "파스타", emoji: "🍝", cat: "양식", temp: "neutral", seasons: [], weather: ["mild", "clear", "cloudy"], meal: "both", kw: ["파스타", "이탈리", "pasta", "trattoria", "비스트로"], cuisine: ["italian", "pasta"], desc: "분위기 내고 싶은 날" },
    { name: "피자", emoji: "🍕", cat: "양식", temp: "neutral", seasons: [], weather: ["cloudy", "rain"], meal: "dinner", kw: ["피자", "pizza"], cuisine: ["pizza"], desc: "나눠 먹기 좋은" },
    { name: "햄버거", emoji: "🍔", cat: "양식", temp: "neutral", seasons: [], weather: ["clear", "hot"], meal: "lunch", kw: ["버거", "burger", "맥도날드", "롯데리아", "버거킹", "맘스터치"], cuisine: ["burger"], desc: "빠르게 든든하게" },
    { name: "샐러드·포케", emoji: "🥗", cat: "양식", temp: "cold", seasons: ["spring", "summer"], weather: ["hot", "clear", "mild"], meal: "lunch", kw: ["샐러드", "포케", "salad", "poke"], cuisine: ["salad", "poke", "healthy"], desc: "가볍고 상큼하게" },
    { name: "타코", emoji: "🌮", cat: "양식", temp: "neutral", seasons: ["spring", "summer"], weather: ["hot", "clear"], meal: "both", kw: ["타코", "멕시칸", "taco", "부리또"], cuisine: ["mexican"], desc: "여름엔 이국적인 맛" },
  ];

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
   *        jitter:(menu)=>0~1, nearby:(menu)=>{ exact, similar } | null }
   * 반환: [{ menu, score, reasons:[] }] 점수 내림차순
   */
  function recommend(ctx, menus) {
    menus = menus || MENUS;
    const jitter = ctx.jitter || Math.random;
    const results = [];

    for (const m of menus) {
      if (ctx.excludeCats && ctx.excludeCats.has(m.cat)) continue;
      let score = 0;
      const reasons = [];

      // 지역 특산
      const region = (m.regions || []).find((r) => ctx.region && ctx.region.includes(r));
      if (region) {
        score += 6;
        reasons.push(`📍 ${region} 대표 메뉴`);
      }

      // 계절
      if (m.seasons.length === 0) score += 1;
      else if (m.seasons.includes(ctx.season)) {
        score += 3;
        reasons.push(`🗓️ ${SEASON_KO[ctx.season]} 제철·계절 메뉴`);
      } else score -= 1;

      // 날씨 태그
      const matched = m.weather.filter((t) => ctx.tags.includes(t));
      const W = { rain: 5, snow: 5, hot: 4, cold: 4, humid: 2 };
      score += matched.map((t) => W[t] || 2).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);
      const strong = matched.find((t) => ["rain", "snow", "hot", "cold", "humid"].includes(t)) || matched[0];
      if (strong) reasons.push(`🌡️ ${WEATHER_REASON[strong]}`);

      // 체감온도와 음식 온도
      const f = ctx.feels;
      if (m.temp === "hot") {
        if (f <= 10) score += 3;
        else if (f >= 27 && !m.weather.includes("hot")) score -= 3; // 이열치열 메뉴는 예외
      } else if (m.temp === "cold") {
        if (f >= 27) score += 3;
        else if (f <= 8) score -= 6;
        else if (f <= 15) score -= 3;
      }

      // 끼니
      if (m.meal !== "both" && m.meal !== ctx.meal) score -= 2;
      else if (m.meal === ctx.meal) {
        score += 2;
        reasons.push(`🍽️ ${MEAL_KO[ctx.meal]} 메뉴로 좋아요`);
      }

      // 주변에 파는 식당이 있으면 가산점
      const near = ctx.nearby ? ctx.nearby(m) : null;
      if (near && near.exact > 0) {
        score += 2.5;
        reasons.unshift(`🏠 근처에 파는 곳 ${near.exact}곳`);
      } else if (near && near.similar > 0) score += 0.5;

      // 같은 조건에서도 매번 조금씩 다르게
      score += jitter(m) * 2;

      results.push({ menu: m, score, reasons });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
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


  /** 두 좌표 사이 거리(m) */
  function distance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }


  const api = { MENUS, SEASON_KO, MEAL_KO, getSeason, getMeal, weatherTags, describeWeather, recommend, matchRestaurant, distance };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Recommend = api;
})(typeof window !== "undefined" ? window : globalThis);

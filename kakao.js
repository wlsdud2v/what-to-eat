/* 오늘 뭐 먹지? — 카카오 로컬(장소 검색) 래퍼
 *
 * 카카오맵 JavaScript SDK 를 불러오고 services 라이브러리로 장소·주소를 검색합니다 (지도 그리기는 map.js).
 * 결과는 app.js 가 쓰는 공통 형태로 바꿔서 돌려줍니다.
 *   { id, lat, lon, dist, tags: { name, "kakao:category", addr, phone, url } }
 * 위치 검색(geocode)·역지오코딩(reverseGeocode)도 여기서 담당합니다.
 */
(function (root) {
  const FOOD = "FD6";     // 카테고리 그룹: 음식점
  const PAGE_SIZE = 15;   // 카카오 최대값
  const MAX_PAGES = 3;    // 카카오는 한 검색당 최대 45건(3페이지)까지만 줌

  let readyP = null;


  /** SDK 를 불러오고 services 가 준비되면 resolve. 키가 없거나 실패하면 reject */
  function init(key) {
    if (readyP) return readyP;
    readyP = new Promise((resolve, reject) => {
      if (!key) return reject(new Error("KAKAO_JS_KEY 없음"));
      const s = document.createElement("script");
      s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`;
      s.onload = () => {
        if (!root.kakao?.maps?.load) return reject(new Error("카카오 SDK 로드 실패 (키·도메인 확인)"));
        root.kakao.maps.load(() => resolve());
      };
      // 카카오는 등록되지 않은 도메인(Referer)의 SDK 요청을 거부하고, 이때 onerror 가 납니다
      s.onerror = () => reject(new Error(
        `카카오 SDK 로드 실패 — Kakao Developers 에 "${location.origin}" 이 [플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인]에 등록돼 있는지 확인하세요`));
      document.head.appendChild(s);
    });
    return readyP;
  }


  function toPlace(d, lat, lon) {
    const plat = +d.y;
    const plon = +d.x;
    return {
      id: `kakao/${d.id}`,
      lat: plat,
      lon: plon,
      dist: d.distance ? +d.distance : root.Recommend.distance(lat, lon, plat, plon),
      tags: {
        name: d.place_name,
        "kakao:category": d.category_name || "",
        addr: d.road_address_name || d.address_name || "",
        phone: d.phone || "",
        url: d.place_url || "",
      },
    };
  }


  /** 한 페이지 검색. kind: "category" | "keyword" */
  function searchPage(kind, query, lat, lon, radius, page) {
    const svc = root.kakao.maps.services;
    const ps = new svc.Places();
    const opts = {
      location: new root.kakao.maps.LatLng(lat, lon),
      radius: Math.min(radius, 20000),
      sort: svc.SortBy.DISTANCE,
      size: PAGE_SIZE,
      page,
    };
    return new Promise((resolve, reject) => {
      const cb = (data, status, pagination) => {
        if (status === svc.Status.OK) resolve({ items: data.map((d) => toPlace(d, lat, lon)), total: pagination.totalCount, hasNext: pagination.hasNextPage });
        else if (status === svc.Status.ZERO_RESULT) resolve({ items: [], total: 0, hasNext: false });
        else reject(new Error(`카카오 검색 실패 (${kind} ${query})`));
      };
      if (kind === "category") ps.categorySearch(FOOD, cb, opts);
      else ps.keywordSearch(query, cb, { ...opts, category_group_code: FOOD });
    });
  }


  /** 여러 페이지를 이어서 가져옴 (최대 MAX_PAGES) */
  async function searchAll(kind, query, lat, lon, radius, pages) {
    const want = Math.min(pages || MAX_PAGES, MAX_PAGES);
    let items = [];
    let total = 0;
    let complete = true;
    for (let p = 1; p <= want; p++) {
      const r = await searchPage(kind, query, lat, lon, radius, p);
      items = items.concat(r.items);
      total = r.total;
      complete = !r.hasNext;
      if (!r.hasNext) break;
    }
    return { items, total, complete };
  }


  /** 반경 안의 음식점 (가까운 순 최대 45곳) */
  function nearbyFood(lat, lon, radius) {
    return searchAll("category", "", lat, lon, radius);
  }


  /** 반경 안에서 메뉴 키워드로 음식점 검색. total 은 카카오가 알려주는 전체 건수 */
  function searchMenu(query, lat, lon, radius, pages) {
    return searchAll("keyword", query, lat, lon, radius, pages);
  }


  /** 콜백형 SDK 호출을 Promise 로. ZERO_RESULT 는 빈 배열 */
  function call(fn) {
    const svc = root.kakao.maps.services;
    return new Promise((resolve, reject) => {
      fn((data, status) => {
        if (status === svc.Status.OK) resolve(data);
        else if (status === svc.Status.ZERO_RESULT) resolve([]);
        else reject(new Error("카카오 요청 실패"));
      });
    });
  }


  /** 주소·장소 이름 → 좌표. 주소 검색 먼저, 없으면 키워드(장소) 검색.
   *  near 를 주면 키워드 검색이 그 근처 결과를 우선합니다. 못 찾으면 null */
  async function geocode(q, near) {
    const svc = root.kakao.maps.services;
    const addr = await call((cb) => new svc.Geocoder().addressSearch(q, cb, { size: 1 }));
    if (addr.length) return { lat: +addr[0].y, lon: +addr[0].x, label: addr[0].address_name };

    const opts = { size: 1 };
    if (near) opts.location = new root.kakao.maps.LatLng(near.lat, near.lon);
    const kw = await call((cb) => new svc.Places().keywordSearch(q, cb, opts));
    if (kw.length) return { lat: +kw[0].y, lon: +kw[0].x, label: kw[0].place_name };
    return null;
  }


  /** 좌표 → 행정구역. app.js 의 place 형태 { label, region, area } 로 반환.
   *  국내가 아니라 결과가 없으면 null (호출 쪽에서 OSM 으로 대체) */
  async function reverseGeocode(lat, lon) {
    const svc = root.kakao.maps.services;
    const geo = new svc.Geocoder();
    const [regions, addrs] = await Promise.all([
      call((cb) => geo.coord2RegionCode(lon, lat, cb)),
      call((cb) => geo.coord2Address(lon, lat, cb)).catch(() => []),
    ]);
    if (!regions.length) return null;
    const h = regions.find((r) => r.region_type === "H") || regions[0];  // 행정동
    const b = regions.find((r) => r.region_type === "B") || h;           // 법정동
    const label = [h.region_1depth_name, h.region_2depth_name, h.region_3depth_name].filter(Boolean).join(" ");
    const road = addrs[0]?.road_address?.address_name || addrs[0]?.address?.address_name || "";
    return {
      label,
      // 지역 특산 매칭용 — 행정동·법정동·도로명 주소를 모두 담음
      region: [h.address_name, b.address_name, road].filter(Boolean).join(" "),
      // 카카오맵·네이버지도 링크용 동 이름 (법정동이 검색어로 더 자연스러움)
      area: b.region_3depth_name || h.region_3depth_name || h.region_2depth_name || h.region_1depth_name,
    };
  }


  root.KakaoPlaces = { init, nearbyFood, searchMenu, geocode, reverseGeocode, MAX_PAGES };
})(window);

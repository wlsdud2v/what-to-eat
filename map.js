/* 오늘 뭐 먹지? — 지도 래퍼
 *
 * 카카오맵을 기본으로 쓰고, 카카오 SDK 를 못 쓰면(키 없음·도메인 미등록·국외 등) Leaflet + OSM 타일을
 * 그때 불러와 대신 씁니다. app.js 는 어느 지도인지 몰라도 되도록 같은 메서드만 부릅니다.
 *
 *   const view = MapView.create("map", kakaoReadyPromise, { center, zoom, onClick })
 *   view.setView(lat, lon, zoom)   // zoom 은 Leaflet 기준(15 ≈ 카카오 레벨 5)
 *   view.setUser(lat, lon)
 *   view.setRadius(m)
 *   view.setPlaces([{ id, lat, lon, strong, html }])   // strong: 메뉴 일치(큰 주황 점)
 *   view.focus(id)                                      // 확대 + 말풍선 열기
 *   view.kind                                           // "kakao" | "leaflet" | null(준비 중)
 *
 * 지도가 준비되기 전에 부른 메서드는 마지막 값만 기억했다가 준비되면 한 번에 반영합니다.
 */
(function (root) {
  const ACCENT = "#e8590c";
  const LEAFLET_VER = "1.9.4";


  /** Leaflet 줌 ↔ 카카오 레벨 (카카오는 1이 가장 가깝고 14가 가장 멀다) */
  const toLevel = (zoom) => Math.min(14, Math.max(1, 20 - zoom));


  function loadLeaflet() {
    if (root.L) return Promise.resolve();
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.css`;
    document.head.appendChild(css);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.js`;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Leaflet 로드 실패"));
      document.head.appendChild(s);
    });
  }


  // ── 카카오맵 ─────────────────────────────────
  function kakaoImpl(el, s, onClick) {
    const k = root.kakao.maps;
    const ll = (lat, lon) => new k.LatLng(lat, lon);

    const map = new k.Map(el, { center: ll(s.view.lat, s.view.lon), level: toLevel(s.view.zoom) });
    map.addControl(new k.ZoomControl(), k.ControlPosition.RIGHT);
    k.event.addListener(map, "click", (e) => onClick(e.latLng.getLat(), e.latLng.getLng()));

    const userEl = document.createElement("div");
    userEl.className = "user-dot";
    const user = new k.CustomOverlay({ position: ll(s.view.lat, s.view.lon), content: userEl, zIndex: 5 });
    user.setMap(map);

    const circle = new k.Circle({
      center: ll(s.view.lat, s.view.lon), radius: 1000,
      strokeWeight: 1, strokeColor: ACCENT, strokeOpacity: 0.9, fillColor: ACCENT, fillOpacity: 0.04,
    });
    circle.setMap(map);

    // 말풍선은 하나만 두고 위치·내용만 바꿈
    const popEl = document.createElement("div");
    popEl.className = "map-pop";
    const popup = new k.CustomOverlay({ position: ll(s.view.lat, s.view.lon), content: popEl, yAnchor: 1, zIndex: 10, clickable: true });
    popEl.addEventListener("click", (e) => {
      if (e.target.closest(".map-pop-x")) popup.setMap(null);
    });

    let markers = new Map();  // id → { overlay, place }

    function openPopup(p) {
      popEl.innerHTML = `<button class="map-pop-x" aria-label="닫기">×</button>${p.html}`;
      popup.setPosition(ll(p.lat, p.lon));
      popup.setMap(map);
    }

    // 컨테이너 크기가 바뀌면(모바일 회전·레이아웃 변경) 다시 그림
    if (root.ResizeObserver) {
      let last = "";
      new ResizeObserver(() => {
        const sz = `${el.clientWidth}x${el.clientHeight}`;
        if (sz === last) return;
        last = sz;
        const c = map.getCenter();
        map.relayout();
        map.setCenter(c);
      }).observe(el);
    }

    return {
      setView(lat, lon, zoom) {
        map.setLevel(toLevel(zoom));
        map.setCenter(ll(lat, lon));
      },
      setUser(lat, lon) {
        user.setPosition(ll(lat, lon));
        circle.setPosition(ll(lat, lon));
      },
      setRadius(r) {
        circle.setRadius(r);
      },
      setPlaces(list) {
        popup.setMap(null);
        for (const m of markers.values()) m.overlay.setMap(null);
        markers = new Map();
        for (const p of list) {
          const dot = document.createElement("div");
          dot.className = `map-dot${p.strong ? " strong" : ""}`;
          dot.title = p.title || "";
          dot.addEventListener("click", () => openPopup(p));
          const overlay = new k.CustomOverlay({ position: ll(p.lat, p.lon), content: dot, zIndex: p.strong ? 3 : 2, clickable: true });
          overlay.setMap(map);
          markers.set(p.id, { overlay, place: p });
        }
      },
      focus(id) {
        const m = markers.get(id);
        if (!m) return;
        if (map.getLevel() > 3) map.setLevel(3);
        map.panTo(ll(m.place.lat, m.place.lon));
        openPopup(m.place);
      },
    };
  }


  // ── Leaflet (대체) ───────────────────────────
  function leafletImpl(el, s, onClick) {
    const L = root.L;
    const map = L.map(el, { zoomControl: true }).setView([s.view.lat, s.view.lon], s.view.zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    map.on("click", (e) => onClick(e.latlng.lat, e.latlng.lng));

    const user = L.marker([s.view.lat, s.view.lon], {
      icon: L.divIcon({ className: "", html: '<div class="user-dot"></div>', iconSize: [22, 22] }),
      zIndexOffset: 1000,
    }).addTo(map);
    const circle = L.circle([s.view.lat, s.view.lon], { radius: 1000, color: ACCENT, weight: 1, fillOpacity: 0.04 }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    let markers = new Map();

    return {
      setView(lat, lon, zoom) { map.setView([lat, lon], zoom); },
      setUser(lat, lon) { user.setLatLng([lat, lon]); circle.setLatLng([lat, lon]); },
      setRadius(r) { circle.setRadius(r); },
      setPlaces(list) {
        layer.clearLayers();
        markers = new Map();
        for (const p of list) {
          const mk = L.circleMarker([p.lat, p.lon], {
            radius: p.strong ? 9 : 6, color: "#fff", weight: 2,
            fillColor: p.strong ? ACCENT : "#868e96", fillOpacity: 0.95,
          });
          mk.bindPopup(p.html);
          mk.addTo(layer);
          markers.set(p.id, mk);
        }
      },
      focus(id) {
        const mk = markers.get(id);
        if (!mk) return;
        map.flyTo(mk.getLatLng(), 17, { duration: 0.6 });
        mk.openPopup();
      },
    };
  }


  // ── 공통 껍데기 ──────────────────────────────
  function create(id, kakaoReady, { center, zoom = 15, onClick = () => {} } = {}) {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    // 준비 전 호출을 기억해 두는 값 (마지막 값만)
    const s = { view: { lat: center.lat, lon: center.lon, zoom }, user: null, radius: null, places: null };
    let impl = null;

    const view = {
      kind: null,
      setView(lat, lon, z) { s.view = { lat, lon, zoom: z }; impl?.setView(lat, lon, z); },
      setUser(lat, lon) { s.user = { lat, lon }; impl?.setUser(lat, lon); },
      setRadius(r) { s.radius = r; impl?.setRadius(r); },
      setPlaces(list) { s.places = list; impl?.setPlaces(list); },
      focus(pid) { impl?.focus(pid); },
    };

    view.ready = Promise.resolve(kakaoReady)
      .then(async (ok) => {
        if (ok && root.kakao?.maps?.Map) {
          try {
            impl = kakaoImpl(el, s, onClick);
            view.kind = "kakao";
            return;
          } catch (e) {
            console.warn("[지도] 카카오맵 생성 실패, OpenStreetMap 으로 대체:", e.message);
            el.innerHTML = "";
          }
        }
        await loadLeaflet();
        impl = leafletImpl(el, s, onClick);
        view.kind = "leaflet";
      })
      .then(() => {
        // 준비 전에 들어온 값 반영
        impl.setView(s.view.lat, s.view.lon, s.view.zoom);
        if (s.user) impl.setUser(s.user.lat, s.user.lon);
        if (s.radius != null) impl.setRadius(s.radius);
        if (s.places) impl.setPlaces(s.places);
        return view.kind;
      })
      .catch((e) => {
        console.error("[지도] 지도를 띄우지 못했어요:", e);
        el.innerHTML = '<div class="map-fail">지도를 불러오지 못했어요. 목록과 카카오맵·네이버지도 버튼을 이용해 주세요.</div>';
        return null;
      });

    return view;
  }


  root.MapView = { create };
})(window);

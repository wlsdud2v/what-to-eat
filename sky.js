/* 오늘 뭐 먹지? — 날씨 하늘 배경 (그라데이션·구름·해·달·안개 + 캔버스 비·눈·별) 과 스크롤 전환 */
(function () {
  const el = document.getElementById("sky");
  const gradBox = el.querySelector(".sky-grads");
  const cloudBox = el.querySelector(".sky-clouds");
  const flash = el.querySelector(".sky-flash");
  const cv = el.querySelector("canvas");
  const ctx = cv.getContext("2d");
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 종류: clear, partly, cloudy, fog, rain, storm, snow, hot, cold
  const DAY = {
    clear:  "linear-gradient(180deg, #2f80d8 0%, #63aeea 42%, #b9def8 78%, #fde8c8 100%)",
    partly: "linear-gradient(180deg, #4688cc 0%, #7cb1e2 45%, #c4dcf0 80%, #f2e5d4 100%)",
    hot:    "linear-gradient(180deg, #2b86de 0%, #6fbaf0 38%, #ffd393 80%, #ffad66 100%)",
    cold:   "linear-gradient(180deg, #5b8fc4 0%, #9cc2e5 48%, #dde9f5 100%)",
    cloudy: "linear-gradient(180deg, #66788b 0%, #8e9cab 50%, #bcc5ce 100%)",
    fog:    "linear-gradient(180deg, #8c969f 0%, #b4bbc1 50%, #d9dcdf 100%)",
    rain:   "linear-gradient(180deg, #35434f 0%, #536271 50%, #808e9b 100%)",
    storm:  "linear-gradient(180deg, #1b222c 0%, #303a47 55%, #535d6a 100%)",
    snow:   "linear-gradient(180deg, #7489a3 0%, #a6b6c8 50%, #dbe3ec 100%)",
  };
  const NIGHT_CLEAR = "linear-gradient(180deg, #070d24 0%, #14214a 48%, #33456f 100%)";
  const NIGHT = {
    clear: NIGHT_CLEAR, partly: NIGHT_CLEAR, hot: NIGHT_CLEAR, cold: NIGHT_CLEAR,
    cloudy: "linear-gradient(180deg, #171c24 0%, #2a323c 55%, #414a55 100%)",
    fog:    "linear-gradient(180deg, #1d2229 0%, #333a42 55%, #4c545c 100%)",
    rain:   "linear-gradient(180deg, #0e1319 0%, #1c232c 55%, #313942 100%)",
    storm:  "linear-gradient(180deg, #090c11 0%, #161b22 55%, #2a3038 100%)",
    snow:   "linear-gradient(180deg, #19223a 0%, #303e58 55%, #536079 100%)",
  };
  // 아래쪽 바탕색 (스크롤하면 하늘이 이 색으로 녹아듦)
  const PAPER = {
    clear: "#fbf6ef", partly: "#faf6f0", hot: "#fdf3e6", cold: "#f1f6fb",
    cloudy: "#f3f3f1", fog: "#f2f3f3", rain: "#eef1f4", storm: "#eceef1", snow: "#f3f6f9",
  };
  // 구름 개수와 색
  const CLOUDS = {
    clear: [0], hot: [0], cold: [1, "#ffffff", 0.5], partly: [3, "#ffffff", 0.85],
    cloudy: [7, "#e9edf1", 0.9], fog: [3, "#e6e9ec", 0.6], rain: [6, "#7d8995", 0.85],
    storm: [7, "#4b5561", 0.95], snow: [5, "#eef2f6", 0.8],
  };
  const NIGHT_CLOUD = { "#ffffff": "#5a6787", "#e9edf1": "#4a535f", "#e6e9ec": "#59616a", "#eef2f6": "#6b7891" };

  let kind = null;
  let night = false;
  let parts = [];
  let W = 0, H = 0;
  let raf = 0;
  let onScreen = true;
  let flashTimer = 0;


  function set(next) {
    const k = DAY[next.kind] ? next.kind : "partly";
    const n = !!next.night;
    if (k === kind && n === night) return;
    kind = k;
    night = n;
    el.dataset.kind = k;
    el.classList.toggle("night", n);
    root.style.setProperty("--bg", PAPER[k]);
    swapGradient((n ? NIGHT : DAY)[k]);
    buildClouds();
    spawn();
    scheduleFlash();
    loop();
  }


  /** 새 그라데이션을 위에 깔고 서서히 나타나게 한 뒤 이전 것을 지움 */
  function swapGradient(bg) {
    const g = document.createElement("div");
    g.className = "sky-grad";
    g.style.background = bg;
    gradBox.appendChild(g);
    requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("on")));
    setTimeout(() => {
      while (gradBox.children.length > 1) gradBox.firstChild.remove();
    }, 1600);
  }


  function buildClouds() {
    const [count, color, alpha] = CLOUDS[kind];
    cloudBox.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const c = document.createElement("div");
      const w = 220 + Math.random() * 300;
      const dur = 70 + Math.random() * 80;
      c.className = "cloud";
      c.style.setProperty("--w", `${w}px`);
      c.style.setProperty("--c", night ? NIGHT_CLOUD[color] || color : color);
      c.style.setProperty("--o", (alpha * (0.7 + Math.random() * 0.3)).toFixed(2));
      c.style.top = `${-4 + Math.random() * 46}%`;
      c.style.animationDuration = `${dur}s`;
      c.style.animationDelay = `${-Math.random() * dur}s`;
      cloudBox.appendChild(c);
    }
  }


  // ── 캔버스 입자 ─────────────────────────────
  const rnd = (a, b) => a + Math.random() * (b - a);

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spawn();
  }


  function spawn() {
    parts = [];
    if (!kind || !W) return;
    const area = W * H;
    const scale = reduce ? 0.3 : 1;
    if (kind === "rain" || kind === "storm") {
      const n = Math.min(420, area / (kind === "storm" ? 4200 : 6500)) * scale;
      for (let i = 0; i < n; i++) parts.push({ t: "rain", x: rnd(0, W), y: rnd(-H, H), len: rnd(10, 24), v: rnd(11, 19), a: rnd(0.18, 0.5) });
    }
    if (kind === "snow") {
      const n = Math.min(240, area / 8000) * scale;
      for (let i = 0; i < n; i++) parts.push({ t: "snow", x: rnd(0, W), y: rnd(-H, H), r: rnd(1, 3.6), v: rnd(0.35, 1.2), ph: rnd(0, 6.28), a: rnd(0.55, 0.95) });
    }
    if (night && ["clear", "partly", "hot", "cold"].includes(kind)) {
      const n = Math.min(260, area / 5000);
      for (let i = 0; i < n; i++) parts.push({ t: "star", x: rnd(0, W), y: rnd(0, H * 0.75), r: rnd(0.3, 1.4), ph: rnd(0, 6.28), sp: rnd(0.6, 2) });
    }
    if (!night && ["clear", "partly", "hot"].includes(kind)) {
      for (let i = 0; i < 16 * scale; i++) parts.push({ t: "mote", x: rnd(0, W), y: rnd(0, H), r: rnd(2, 7), v: rnd(0.08, 0.3), ph: rnd(0, 6.28), a: rnd(0.08, 0.22) });
    }
    if (kind === "cold") {
      for (let i = 0; i < 40 * scale; i++) parts.push({ t: "snow", x: rnd(0, W), y: rnd(-H, H), r: rnd(0.6, 1.6), v: rnd(0.15, 0.4), ph: rnd(0, 6.28), a: rnd(0.4, 0.8) });
    }
  }


  function draw(time) {
    ctx.clearRect(0, 0, W, H);
    const s = time / 1000;
    ctx.lineCap = "round";
    for (const p of parts) {
      if (p.t === "rain") {
        p.y += p.v;
        p.x += p.v * 0.18;
        if (p.y > H) { p.y = rnd(-60, -10); p.x = rnd(-W * 0.2, W); }
        ctx.strokeStyle = `rgba(220,232,245,${p.a})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.len * 0.18, p.y - p.len);
        ctx.stroke();
      } else if (p.t === "snow") {
        p.y += p.v;
        p.x += Math.sin(s * 0.8 + p.ph) * 0.45;
        if (p.y > H + 5) { p.y = -5; p.x = rnd(0, W); }
        ctx.fillStyle = `rgba(255,255,255,${p.a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
      } else if (p.t === "star") {
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s * p.sp + p.ph));
        ctx.fillStyle = `rgba(255,250,235,${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
      } else if (p.t === "mote") {
        p.y -= p.v;
        p.x += Math.sin(s * 0.3 + p.ph) * 0.2;
        if (p.y < -10) { p.y = H + 10; p.x = rnd(0, W); }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(255,248,225,${p.a})`);
        g.addColorStop(1, "rgba(255,248,225,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
      }
    }
  }


  function loop() {
    if (raf || !onScreen || document.hidden) return;
    const tick = (t) => {
      if (!onScreen || document.hidden) { raf = 0; return; }
      draw(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }


  /** 뇌우일 때 가끔 번쩍 */
  function scheduleFlash() {
    clearTimeout(flashTimer);
    if (kind !== "storm" || reduce) return;
    flashTimer = setTimeout(() => {
      if (onScreen) {
        flash.classList.remove("go");
        void flash.offsetWidth;
        flash.classList.add("go");
      }
      scheduleFlash();
    }, rnd(4000, 11000));
  }


  // ── 스크롤 전환: --p (0 = 맨 위, 1 = 히어로를 지나감) ──
  const hero = document.querySelector(".hero");
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const h = hero ? hero.offsetHeight : window.innerHeight;
      const p = Math.min(1, Math.max(0, window.scrollY / (h * 0.85)));
      root.style.setProperty("--p", p.toFixed(3));
      const was = onScreen;
      onScreen = p < 0.995;
      el.classList.toggle("off", !onScreen);
      if (onScreen && !was) loop();
    });
  }


  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => { resize(); onScroll(); });
  document.addEventListener("visibilitychange", loop);
  resize();
  onScroll();

  window.Sky = { set };
})();

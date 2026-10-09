// Planetary Seasons Lab: three.js scene, charts and controls bound to the anywidget model.
// The physics below mirrors src/seasons_model.py (the reference implementation).

const THREE_URL = "https://esm.sh/three@0.160.0";
const ORBIT_URL = "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const YEAR = 365.0;
const POLE_EPS = 1e-12;
const EVENT_DAYS = [0, 91.25, 182.5, 273.75];
const EVENT_NAMES = ["March-like equinox", "June-like solstice", "September-like equinox", "December-like solstice"];
const GUIDE_LABELS = ["Mar eq.", "Jun sol.", "Sep eq.", "Dec sol."];
const NORTH = ["spring", "summer", "autumn", "winter"];
const SOUTH = ["autumn", "winter", "spring", "summer"];
const TRAITS = ["tilt_deg", "latitude_deg", "day_of_year", "playing", "speed", "camera_mode"];
const SYNC_MS = 100;
const RAD = Math.PI / 180;
const ORBIT_R = 8, PLANET_R = 1.22, STAR_R = 1.05;
const ORBIT_VIEW = [13.5, 8.5, 13.5];
const FOLLOW_OFFSET = [3.8, 2.6, 4.6];

// ---------- physics (mirror of seasons_model.py) ----------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function declination(day, tilt) {
  return Math.asin(clamp(Math.sin(tilt * RAD) * Math.sin((2 * Math.PI * day) / YEAR), -1, 1));
}
function daylight(lat, decl) {
  if (Math.abs(lat) === 90) {
    const s = Math.sign(lat) * decl;
    return s > POLE_EPS ? 24 : s < -POLE_EPS ? 0 : 12;
  }
  const c = -Math.tan(lat * RAD) * Math.tan(decl);
  const h = c >= 1 ? 0 : c <= -1 ? Math.PI : Math.acos(clamp(c, -1, 1));
  return (24 * h) / Math.PI;
}
function insolation(lat, decl, S = 1361) {
  const phi = lat * RAD, h = (daylight(lat, decl) * Math.PI) / 24;
  const q = (S / Math.PI) * (h * Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.sin(h));
  return Math.max(0, q);
}
function temperature(E, lag = 30, base = 14) {
  const n = E.length;
  let mean = 0, lo = Infinity, hi = -Infinity;
  for (const e of E) { mean += e; lo = Math.min(lo, e); hi = Math.max(hi, e); }
  mean /= n;
  if (mean <= POLE_EPS || hi - lo <= POLE_EPS) return new Array(n).fill(base);
  const target = E.map((e) => base + (20 * (e - mean)) / mean);
  const f = 1 - Math.exp(-1 / lag);
  let state = base;
  for (let p = 0; p < 20; p++) for (const t of target) state += f * (t - state);
  const out = target.map((t) => (state += f * (t - state)));
  const m = out.reduce((a, b) => a + b, 0) / n;
  return out.map((v) => v + (base - m));
}
function annual(tilt, lat, n = 365) {
  const day = [], hours = [], ins = [];
  for (let i = 0; i < n; i++) {
    const d = (i * YEAR) / n, dec = declination(d, tilt);
    day.push(d); hours.push(daylight(lat, dec)); ins.push(insolation(lat, dec));
  }
  return { day, hours, temp: temperature(ins) };
}
function eventName(day, tol) {
  for (let i = 0; i < 4; i++) {
    const dist = Math.abs((((day - EVENT_DAYS[i] + YEAR / 2) % YEAR) + YEAR) % YEAR - YEAR / 2);
    if (dist < tol) return EVENT_NAMES[i];
  }
  return null;
}
function season(day, lat) {
  const ev = eventName(day, 0.01);
  const suffix = ev ? ` • ${ev}` : "";
  if (lat === 0) return `Equatorial sunlight${suffix}`;
  const q = ((Math.floor(day / 91.25) % 4) + 4) % 4;
  return lat > 0 ? `Northern ${NORTH[q]}${suffix}` : `Southern ${SOUTH[q]}${suffix}`;
}
function latText(lat) {
  if (lat === 0) return "Equator";
  const m = Math.abs(lat);
  const t = Number.isInteger(m) ? String(m) : m.toFixed(1);
  return `${t}°${lat > 0 ? "N" : "S"}`;
}
function interpPeriodic(arr, day) {
  const n = arr.length, x = ((day % YEAR) + YEAR) % YEAR * (n / YEAR);
  const i = Math.floor(x) % n, j = (i + 1) % n, w = x - Math.floor(x);
  return arr[i] * (1 - w) + arr[j] * w;
}

// ---------- DOM helpers ----------
function h(tag, cls, text, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
const SVGNS = "http://www.w3.org/2000/svg";
function s(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const fmt = (v, d = 1) => v.toFixed(d);

// ---------- chart ----------
function makeChart({ title, cls, unit, yUnitText }) {
  const W = 480, H = 236, L = 42, R = 12, T = 20, B = 34;
  const card = h("section", "planet-lab__chart");
  card.appendChild(h("h3", null, title));
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title }, card);
  const gStatic = s("g", {}, svg);
  const gNow = s("g", {}, svg);
  const line = s("line", { class: "planet-lab__now", y1: T, y2: H - B }, gNow);
  const dot = s("circle", { class: "planet-lab__dot", r: 5 }, gNow);
  const xOf = (d) => L + (d / YEAR) * (W - L - R);
  return {
    card, svg,
    draw(days, values, yMin, yMax, ticks) {
      gStatic.replaceChildren();
      const yOf = (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
      this.yOf = yOf;
      for (const tv of ticks) {
        s("line", { class: "planet-lab__grid", x1: L, x2: W - R, y1: yOf(tv), y2: yOf(tv) }, gStatic);
        const t = s("text", { x: L - 6, y: yOf(tv) + 3.5, "text-anchor": "end" }, gStatic);
        t.textContent = Number.isInteger(tv) ? String(tv) : tv.toFixed(1);
      }
      const yl = s("text", { x: 4, y: 10, "text-anchor": "start" }, gStatic);
      yl.textContent = yUnitText;
      EVENT_DAYS.forEach((d, i) => {
        s("line", { class: "planet-lab__guide", x1: xOf(d), x2: xOf(d), y1: T, y2: H - B }, gStatic);
        const t = s("text", { x: xOf(d), y: H - B + 15, "text-anchor": i === 0 ? "start" : "middle" }, gStatic);
        t.textContent = GUIDE_LABELS[i];
      });
      const pts = days.map((d, i) => `${xOf(d).toFixed(1)},${yOf(values[i]).toFixed(1)}`);
      pts.push(`${xOf(YEAR).toFixed(1)},${yOf(values[0]).toFixed(1)}`);
      s("polyline", { class: `planet-lab__curve ${cls}`, points: pts.join(" ") }, gStatic);
    },
    cursor(day, value, aria) {
      const x = xOf(day);
      line.setAttribute("x1", x); line.setAttribute("x2", x);
      dot.setAttribute("cx", x); dot.setAttribute("cy", this.yOf(value));
      svg.setAttribute("aria-label", aria);
    },
  };
}

// ---------- procedural planet texture ----------
function makeTexture(THREE) {
  const W = 1024, Hh = 512;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = Hh;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, Hh);
  for (let y = 0; y < Hh; y++) {
    const lat = (0.5 - (y + 0.5) / Hh) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * 2 * Math.PI - Math.PI;
      const n =
        Math.sin(2 * lon + 1.3) * Math.cos(2.2 * lat + 0.4) +
        0.55 * Math.sin(5 * lon - 1.7 * lat + 0.8) * Math.sin(3 * lat + 1.1) +
        0.3 * Math.sin(11 * lon + 4 * lat) * Math.cos(7 * lat - 0.5) +
        0.16 * Math.sin(23 * lon - 9 * lat + 2);
      let r, g, b;
      if (Math.abs(lat) > 1.28) {
        const k = 235 + 20 * Math.sin(17 * lon + 5 * lat);
        r = k - 12; g = k; b = 255;
      } else if (n > 0.18) {
        const dry = 0.5 + 0.5 * Math.sin(7 * lat + 3 * lon + 0.6) + (Math.abs(lat) < 0.6 ? 0.15 : 0);
        const hgt = clamp((n - 0.18) * 0.8, 0, 1);
        if (dry > 0.62) { r = 196 - 40 * hgt; g = 170 - 40 * hgt; b = 110 - 30 * hgt; }
        else { r = 52 + 30 * hgt; g = 130 - 30 * hgt; b = 62 + 10 * hgt; }
      } else {
        const depth = clamp(0.5 - n * 0.35, 0, 1);
        r = 18 + 14 * (1 - depth); g = 70 + 50 * (1 - depth); b = 150 + 60 * (1 - depth);
      }
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------- widget ----------
function render({ model, el }) {
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  let disposed = false;

  const st = {
    tilt: model.get("tilt_deg"), lat: model.get("latitude_deg"), day: model.get("day_of_year"),
    playing: model.get("playing"), speed: model.get("speed"), mode: model.get("camera_mode"),
  };
  if (reduced && st.playing) { st.playing = false; model.set("playing", false); model.save_changes(); }

  // --- sync with model (throttled) ---
  const lastSent = {}, timers = {}, pending = {};
  let selfSet = false;
  function flush(name) {
    clearTimeout(timers[name]); timers[name] = null;
    if (!(name in pending)) return;
    const v = pending[name]; delete pending[name];
    lastSent[name] = performance.now();
    selfSet = true;
    model.set(name, v); model.save_changes();
    selfSet = false;
  }
  function commit(name, value, force = false) {
    pending[name] = value;
    const wait = SYNC_MS - (performance.now() - (lastSent[name] || 0));
    if (force || wait <= 0) flush(name);
    else if (!timers[name]) timers[name] = setTimeout(() => flush(name), wait);
  }

  // --- DOM ---
  const root = h("div", "planet-lab");
  const header = h("header", "planet-lab__header");
  header.appendChild(h("p", "planet-lab__intro",
    "Drag the space scene to look around, then change the planet's tilt and your latitude. Every view, number, and curve stays connected."));
  const pill = h("span", "planet-lab__season-pill", "", { "aria-live": "polite" });
  header.appendChild(pill);
  root.appendChild(header);

  const main = h("div", "planet-lab__main");
  const stage = h("div", "planet-lab__stage");
  const canvasHost = h("div", "planet-lab__canvas");
  const toolbar = h("div", "planet-lab__toolbar");
  const bOrbit = h("button", "planet-lab__tool", "Whole orbit", { type: "button" });
  const bFollow = h("button", "planet-lab__tool", "Follow planet", { type: "button" });
  const bReset = h("button", "planet-lab__tool", "Reset view", { type: "button" });
  toolbar.append(bOrbit, bFollow, bReset);
  const lblStar = h("div", "planet-lab__label planet-lab__label--star", "Our star");
  const lblAxis = h("div", "planet-lab__label planet-lab__label--axis", "Fixed axis");
  const lblSite = h("div", "planet-lab__label planet-lab__label--site", "");
  const hint = h("div", "planet-lab__hint", "Drag to orbit • scroll or pinch to zoom");
  const fallback = h("div", "planet-lab__fallback");
  fallback.innerHTML = "<div><strong>The 3D view could not start.</strong>The controls and charts still work.</div>";
  stage.append(canvasHost, toolbar, lblStar, lblAxis, lblSite, hint, fallback);

  const side = h("aside", "planet-lab__side");
  const shape = h("section", "planet-lab__panel");
  shape.appendChild(h("h3", null, "Shape the seasons"));
  function field(label, min, max, step) {
    const wrap = h("label", "planet-lab__field");
    const head = h("span", "planet-lab__field-head");
    const name = h("span", null, label);
    const out = h("output");
    head.append(name, out);
    const input = h("input", null, null, { type: "range", min, max, step });
    wrap.append(head, input);
    return { wrap, out, input, name };
  }
  const fTilt = field("Axial tilt", 0, 90, 0.5);
  const fLat = field("Your latitude", -90, 90, 1);
  shape.append(fTilt.wrap, fLat.wrap);
  const loc = h("section", "planet-lab__panel");
  loc.appendChild(h("h3", null, "At your location"));
  const dl = h("dl", "planet-lab__metrics");
  function metric(label) {
    const row = h("div", "planet-lab__metric");
    const dd = h("dd");
    row.append(h("dt", null, label), dd);
    dl.appendChild(row);
    return dd;
  }
  const mDay = metric("Daylight (h)"), mNight = metric("Nighttime (h)"), mTemp = metric("Temperature estimate (°C)");
  loc.appendChild(dl);
  side.append(shape, loc);
  main.append(stage, side);

  const timeline = h("div", "planet-lab__timeline");
  const bPlay = h("button", "planet-lab__play", "▶ Play year", { type: "button" });
  const fDay = field("Travel through the year", 0, 365, 0.1);
  timeline.append(bPlay, fDay.wrap);

  const dayChart = makeChart({ title: "Daylight through the year", cls: "planet-lab__curve--daylight", yUnitText: "hours" });
  const tempChart = makeChart({ title: "Seasonal temperature response", cls: "planet-lab__curve--temp", yUnitText: "°C" });
  const charts = h("div", "planet-lab__charts");
  charts.append(dayChart.card, tempChart.card);
  root.append(main, timeline, charts);
  el.appendChild(root);

  // --- UI update ---
  let cycle = null, cycleKey = "";
  function ensureCycle() {
    const key = `${st.tilt}|${st.lat}`;
    if (key === cycleKey) return;
    cycleKey = key;
    cycle = annual(st.tilt, st.lat);
    dayChart.draw(cycle.day, cycle.hours, 0, 24, [0, 6, 12, 18, 24]);
    const lo = Math.floor(Math.min(...cycle.temp) - 2), hi = Math.ceil(Math.max(...cycle.temp) + 2);
    tempChart.draw(cycle.day, cycle.temp, lo, hi, [lo, (lo + hi) / 2, hi]);
  }
  function dayLabel() {
    const near = EVENT_DAYS.findIndex((d) => Math.abs((((st.day - d + YEAR / 2) % YEAR) + YEAR) % YEAR - YEAR / 2) <= 2);
    return near >= 0 ? EVENT_NAMES[near] : `Day ${Math.round(st.day)}`;
  }
  function updateUI(skip) {
    ensureCycle();
    const decl = declination(st.day, st.tilt);
    const hours = daylight(st.lat, decl);
    const temp = interpPeriodic(cycle.temp, st.day);
    pill.textContent = season(st.day, st.lat);
    fTilt.out.textContent = `${fmt(st.tilt)}°`;
    fLat.out.textContent = latText(st.lat);
    fDay.out.textContent = dayLabel();
    if (skip !== "tilt") fTilt.input.value = st.tilt;
    if (skip !== "lat") fLat.input.value = st.lat;
    if (skip !== "day") fDay.input.value = st.day;
    mDay.textContent = fmt(hours); mNight.textContent = fmt(24 - hours); mTemp.textContent = fmt(temp);
    bPlay.textContent = st.playing ? "❚❚ Pause" : "▶ Play year";
    bPlay.setAttribute("aria-pressed", String(st.playing));
    bOrbit.setAttribute("aria-pressed", String(st.mode === "orbit"));
    bFollow.setAttribute("aria-pressed", String(st.mode === "planet"));
    const where = latText(st.lat);
    dayChart.cursor(st.day, hours, `Daylight through the year at ${where}: ${fmt(hours)} hours on day ${Math.round(st.day)}.`);
    tempChart.cursor(st.day, temp, `Seasonal temperature response at ${where}: ${fmt(temp)} degrees Celsius on day ${Math.round(st.day)}.`);
    scene3d.sync();
  }

  // --- inputs ---
  fTilt.input.addEventListener("input", () => { st.tilt = +fTilt.input.value; commit("tilt_deg", st.tilt); updateUI("tilt"); }, sig);
  fTilt.input.addEventListener("change", () => commit("tilt_deg", st.tilt, true), sig);
  fLat.input.addEventListener("input", () => { st.lat = +fLat.input.value; commit("latitude_deg", st.lat); updateUI("lat"); }, sig);
  fLat.input.addEventListener("change", () => commit("latitude_deg", st.lat, true), sig);
  const wrapDay = (d) => ((d % YEAR) + YEAR) % YEAR;
  fDay.input.addEventListener("input", () => { st.day = wrapDay(+fDay.input.value); commit("day_of_year", st.day); updateUI("day"); }, sig);
  fDay.input.addEventListener("change", () => commit("day_of_year", st.day, true), sig);
  bPlay.addEventListener("click", () => { st.playing = !st.playing; lastT = null; commit("playing", st.playing, true); commit("day_of_year", st.day, true); updateUI(); }, sig);
  function setMode(mode, tween = true) {
    st.mode = mode; commit("camera_mode", mode, true);
    scene3d.goTo(mode, tween); updateUI();
  }
  bOrbit.addEventListener("click", () => setMode("orbit"), sig);
  bFollow.addEventListener("click", () => setMode("planet"), sig);
  bReset.addEventListener("click", () => scene3d.goTo(st.mode, true), sig);

  // --- model -> UI ---
  const map = { tilt_deg: "tilt", latitude_deg: "lat", day_of_year: "day", playing: "playing", speed: "speed", camera_mode: "mode" };
  for (const t of TRAITS) {
    model.on(`change:${t}`, () => {
      if (selfSet) return;
      const v = model.get(t);
      if (t === "camera_mode") { if (v !== st.mode) { st.mode = v; scene3d.goTo(v, true); } }
      else if (t === "playing") { st.playing = reduced && v ? false : v; lastT = null; }
      else st[map[t]] = v;
      updateUI();
    });
  }

  // --- 3D scene (async: CDN import; failure leaves controls and charts working) ---
  const scene3d = {
    sync() {}, goTo() {}, dispose() {}, frame() {},
  };
  let lastT = null, raf = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (lastT == null) lastT = now;
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    if (st.playing) {
      st.day = wrapDay(st.day + 18 * st.speed * dt);
      commit("day_of_year", st.day);
      updateUI();
    }
    scene3d.frame(now, dt);
  }

  (async () => {
    let THREE, OrbitControls, renderer;
    try {
      THREE = await import(THREE_URL);
      ({ OrbitControls } = await import(ORBIT_URL));
      if (disposed) return;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      console.warn("planet-lab: 3D view unavailable", err);
      fallback.dataset.visible = "true";
      hint.style.display = "none";
      for (const b of [bOrbit, bFollow, bReset]) b.disabled = true;
      for (const l of [lblStar, lblAxis, lblSite]) l.style.display = "none";
      return;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    canvasHost.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    camera.position.set(...ORBIT_VIEW);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.07;
    controls.minDistance = 2.8; controls.maxDistance = 31;

    scene.add(new THREE.HemisphereLight(0x486caa, 0x061024, 0.48));
    const sun = new THREE.PointLight(0xfff0be, 185, 45, 1.7);
    scene.add(sun);
    const star = new THREE.Mesh(new THREE.SphereGeometry(STAR_R, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffce5b }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.46, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb735, transparent: true, opacity: 0.17, side: THREE.BackSide, depthWrite: false }));
    scene.add(star, glow);

    const ringPts = [];
    for (let i = 0; i < 256; i++) { const a = (i / 256) * 2 * Math.PI; ringPts.push(new THREE.Vector3(ORBIT_R * Math.cos(a), 0, ORBIT_R * Math.sin(a))); }
    scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineBasicMaterial({ color: 0x6f8fd6, transparent: true, opacity: 0.45 })));

    // planetGroup -> tiltGroup -> spinGroup
    const planetGroup = new THREE.Group();
    const tiltGroup = new THREE.Group();
    const spinGroup = new THREE.Group();
    planetGroup.add(tiltGroup); tiltGroup.add(spinGroup);
    scene.add(planetGroup);
    const tex = makeTexture(THREE);
    spinGroup.add(new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 64, 48),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 })));

    const circle = (r, n = 128) => {
      const p = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; p.push(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a))); }
      return new THREE.BufferGeometry().setFromPoints(p);
    };
    const equator = new THREE.LineLoop(circle(PLANET_R * 1.006), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    tiltGroup.add(equator);
    const latRing = new THREE.LineLoop(circle(1), new THREE.LineBasicMaterial({ color: 0x7ef0c2 }));
    tiltGroup.add(latRing);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 16), new THREE.MeshBasicMaterial({ color: 0xffe24a }));
    spinGroup.add(marker);

    const mint = new THREE.MeshBasicMaterial({ color: 0x7ef0c2 });
    const axisLen = PLANET_R * 2 + 1.4;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, axisLen, 12), mint);
    const coneN = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 16), mint);
    const coneS = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 16), mint);
    coneN.position.y = axisLen / 2 + 0.12;
    coneS.position.y = -axisLen / 2 - 0.12; coneS.rotation.x = Math.PI;
    tiltGroup.add(shaft, coneN, coneS);

    // --- camera tween / follow ---
    const v3 = (a) => new THREE.Vector3(...a);
    const planetPos = new THREE.Vector3();
    const prevPlanet = new THREE.Vector3();
    let tween = null;
    function desired(mode) {
      return mode === "planet"
        ? { pos: planetPos.clone().add(v3(FOLLOW_OFFSET)), target: planetPos.clone() }
        : { pos: v3(ORBIT_VIEW), target: new THREE.Vector3() };
    }
    function placePlanet() {
      const th = (2 * Math.PI * st.day) / YEAR;
      planetPos.set(ORBIT_R * Math.cos(th), 0, ORBIT_R * Math.sin(th));
      planetGroup.position.copy(planetPos);
      tiltGroup.rotation.x = -st.tilt * RAD;
      spinGroup.rotation.y = (2 * Math.PI * st.day) / 16;
    }
    placePlanet(); prevPlanet.copy(planetPos);
    scene3d.goTo = (mode, animate = true) => {
      const to = desired(mode);
      if (reduced || !animate) { camera.position.copy(to.pos); controls.target.copy(to.target); tween = null; return; }
      tween = { t0: performance.now(), p0: camera.position.clone(), g0: controls.target.clone(), mode };
    };
    if (st.mode === "planet") scene3d.goTo("planet", false);

    function updateGeometry() {
      placePlanet();
      const phi = st.lat * RAD, r = PLANET_R * 1.006;
      latRing.scale.setScalar(r * Math.cos(phi));
      latRing.position.y = r * Math.sin(phi);
      marker.position.set(r * 1.02 * Math.cos(phi), r * 1.02 * Math.sin(phi), 0);
      lblSite.textContent = `Latitude ${latText(st.lat)}`;
    }
    scene3d.sync = updateGeometry;
    updateGeometry();

    // --- labels ---
    const tmp = new THREE.Vector3();
    function placeLabel(label, world, dy = -14) {
      tmp.copy(world).project(camera);
      const w = stage.clientWidth, hh = stage.clientHeight;
      if (tmp.z > 1) { label.style.visibility = "hidden"; return; }
      label.style.visibility = "visible";
      const lw = label.offsetWidth, lh = label.offsetHeight;
      let x = (tmp.x * 0.5 + 0.5) * w - lw / 2, y = (-tmp.y * 0.5 + 0.5) * hh + dy - lh / 2;
      x = clamp(x, 4, Math.max(4, w - lw - 4));
      y = clamp(y, 44, Math.max(44, hh - lh - 26));
      label.style.transform = `translate(${x}px, ${y}px)`;
    }
    const wp = new THREE.Vector3();

    function resize() {
      const w = Math.max(stage.clientWidth, 1), hh = Math.max(stage.clientHeight, 1);
      renderer.setSize(w, hh, false);
      camera.aspect = w / hh; camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(stage); resize();

    const ease = (t) => 1 - Math.pow(1 - t, 3);
    scene3d.frame = (now) => {
      placePlanet();
      const dp = planetPos.clone().sub(prevPlanet);
      prevPlanet.copy(planetPos);
      if (tween) {
        const k = Math.min((now - tween.t0) / 650, 1), e = ease(k), to = desired(tween.mode);
        camera.position.lerpVectors(tween.p0, to.pos, e);
        controls.target.lerpVectors(tween.g0, to.target, e);
        if (k >= 1) tween = null;
      } else if (st.mode === "planet") {
        camera.position.add(dp); controls.target.add(dp);
      }
      controls.update();
      star.rotation.y += 0.002;
      renderer.render(scene, camera);
      placeLabel(lblStar, wp.set(0, STAR_R + 0.5, 0), -4);
      placeLabel(lblAxis, wp.set(0, 1, 0).applyEuler(tiltGroup.rotation).multiplyScalar(axisLen / 2 + 0.5).add(planetPos));
      marker.getWorldPosition(wp);
      placeLabel(lblSite, wp, 16);
    };
    scene3d.dispose = () => {
      ro.disconnect(); controls.dispose(); tex.dispose();
      renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss();
      renderer.domElement.remove();
    };
    el.__planetLab = { renderer, camera, controls }; // handle for tests
  })();

  updateUI();
  raf = requestAnimationFrame(tick);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    for (const t of Object.values(timers)) clearTimeout(t);
    ac.abort();
    scene3d.dispose();
  };
}

export default { render };

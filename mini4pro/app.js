// Planificador de misiones para el DJI Mini 4 Pro: la versión de PC del editor de la app Mini4Pro.
// Las misiones se guardan en este navegador y, si hay token, en GitHub para que las lea el teléfono.
import {
  CAPTURE_MODES,
  CAPTURE_PRIORITIES,
  COLOR_PROFILES,
  EV_VALUES,
  EXPOSURE_MODES,
  FINISH_ACTIONS,
  FOCUS_MODES,
  FRAME_RATES,
  HEADING_REFERENCES,
  ISO_VALUES,
  MAP_HEADINGS,
  MAP_PATTERNS,
  ORBIT_HEADINGS,
  PHOTO_FORMATS,
  PHOTO_RATIOS,
  PHOTO_SIZES,
  PHOTO_TYPES,
  SHUTTER_VALUES,
  SPACING_MODES,
  VIDEO_RESOLUTIONS,
  WHITE_BALANCES,
  Geo,
  MapPlanner,
  OrbitPlanner,
  cameraFor,
  formatDuration,
  geometry,
  newMapMission,
  newOrbitMission,
  normalizeMission,
  LOCALE,
  num,
  parseKml,
  summary,
} from "./planner.js";
import { GitHubSync, TOKEN_HELP_URL, syncAll } from "./sync.js";

const $ = (id) => document.getElementById(id);
const STATE_KEY = "mini4pro.state.v1";
const TOKEN_KEY = "mini4pro.githubToken";
const LABELS_KEY = "mini4pro.labels";
const BASE_KEY = "mini4pro.baseLayer";
const DEFAULT_VIEW = { center: [18.2, -66.45], zoom: 9 };
const ACCENT = "#2f9bff";
/** Más líneas que esto es un área demasiado grande para un vuelo; no se dibuja la ruta. */
const MAX_LEGS = 400;
/** Las velocidades se guardan en m/s y se muestran en km/h, como en Dronelink. */
const KMH = 3.6;

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Sin almacenamiento (ventana privada): la página sigue funcionando, solo no recuerda nada.
    }
  },
};

// ---------- Estado ----------

/** missions: misiones por id · shas: versión sincronizada · dirty: por subir · deleted: por borrar en GitHub */
const state = (() => {
  try {
    const saved = JSON.parse(storage.get(STATE_KEY));
    if (saved?.missions) {
      // Las misiones guardadas antes de agregar un parámetro nuevo lo reciben con su valor por defecto.
      for (const id of Object.keys(saved.missions)) saved.missions[id] = normalizeMission(saved.missions[id]);
      return { shas: {}, dirty: {}, deleted: {}, ...saved };
    }
  } catch {
    // Estado dañado: se empieza de cero.
  }
  return { missions: {}, shas: {}, dirty: {}, deleted: {} };
})();

const persist = () => storage.set(STATE_KEY, JSON.stringify(state));
let token = storage.get(TOKEN_KEY) || "";

/** Misión abierta en el editor (una copia); null en la lista. */
let current = null;
let undoStack = [];
let redoStack = [];
const clone = (value) => structuredClone(value);
const toPoint = (latlng) => [Math.round(latlng.lat * 1e7) / 1e7, Math.round(latlng.lng * 1e7) / 1e7];

// ---------- Mapa ----------

const map = L.map("map", { zoomControl: false, maxZoom: 21, worldCopyJump: true, attributionControl: true });

/** Imágenes de Bing: los mosaicos se piden por "quadkey" en vez de z/x/y. */
const BingLayer = L.TileLayer.extend({
  getTileUrl(coords) {
    let quadkey = "";
    for (let i = coords.z; i > 0; i--) {
      const mask = 1 << (i - 1);
      quadkey += ((coords.x & mask) ? 1 : 0) + ((coords.y & mask) ? 2 : 0);
    }
    return `https://ecn.t${(coords.x + coords.y) % 4}.tiles.virtualearth.net/tiles/a${quadkey}.jpeg?g=14000`;
  },
});

const baseLayers = {
  esri: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: "Imágenes © Esri, Maxar, Earthstar Geographics",
  }),
  bing: new BingLayer("", { maxZoom: 21, maxNativeZoom: 19, attribution: "Imágenes © Microsoft Bing" }),
};
const labels = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 21, maxNativeZoom: 19 },
);
L.control.zoom({ position: "bottomright" }).addTo(map);
map.attributionControl.setPrefix(false);

const listLayer = L.layerGroup().addTo(map);
const shapeLayer = L.layerGroup();
const handleLayer = L.layerGroup();

/** Espacio que tapa el panel, para centrar la misión en la parte visible del mapa. */
function fitPadding() {
  if (window.innerWidth <= 760) return { paddingTopLeft: [24, 72], paddingBottomRight: [24, window.innerHeight * 0.52 + 32] };
  return { paddingTopLeft: [$("panel").offsetWidth + 60, 80], paddingBottomRight: [80, 60] };
}

function fitTo(points, maxZoom = 19) {
  if (points.length === 0) return;
  if (points.length === 1) {
    map.setView(points[0], Math.max(map.getZoom(), 17));
    return;
  }
  map.fitBounds(L.latLngBounds(points), { ...fitPadding(), maxZoom });
}

function missionPoints(mission) {
  if (mission.type === "map") return mission.boundary;
  return OrbitPlanner.plan(mission)?.path ?? [];
}

function divIcon(className, size, html = "") {
  return L.divIcon({ className: "", html: `<div class="${className}">${html}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function arrow(at, bearing) {
  return L.marker(at, {
    icon: L.divIcon({ className: "", html: `<div class="route-arrow" style="transform: rotate(${bearing}deg)"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }),
    interactive: false,
    keyboard: false,
  });
}

/** Dibuja una misión: el área en blanco, la ruta en azul y el inicio en verde, como en Dronelink. */
function drawMission(mission, group, { faded = false, arrows = false, interactive = false, startLabel = !faded } = {}) {
  const layers = [];
  const routeStyle = { color: ACCENT, weight: faded ? 2.5 : 3, opacity: faded ? 0.75 : 1, lineJoin: "round", interactive };
  if (mission.type === "map") {
    if (mission.boundary.length >= 2) {
      layers.push(
        L.polygon(mission.boundary, {
          color: "#ffffff",
          weight: 2.5,
          opacity: faded ? 0.75 : 1,
          fillColor: "#ffffff",
          fillOpacity: faded ? 0.1 : 0.16,
          interactive,
        }),
      );
    }
    const plan = MapPlanner.plan(mission);
    if (plan.legs.length > MAX_LEGS) {
      // Un área enorme (marcada con el mapa muy alejado) no se dibuja: serían miles de líneas.
    } else if (plan.path.length) {
      layers.push(L.polyline(plan.path, routeStyle));
      if (arrows) {
        for (const leg of plan.legs) {
          const mid = [(leg.start[0] + leg.end[0]) / 2, (leg.start[1] + leg.end[1]) / 2];
          layers.push(arrow(mid, Geo.bearing(leg.start, leg.end)));
        }
      }
      layers.push(endMarker(plan.path.at(-1)));
      layers.push(startMarker(plan.path[0], startLabel));
    }
  } else {
    const plan = OrbitPlanner.plan(mission);
    if (plan) {
      layers.push(L.polyline(plan.path, routeStyle));
      if (arrows) {
        const step = Math.max(1, Math.round(plan.path.length / (8 * mission.rotations)));
        for (let i = step; i < plan.path.length - 1; i += step) layers.push(arrow(plan.path[i], Geo.bearing(plan.path[i], plan.path[i + 1])));
      }
      if (faded) layers.push(L.circleMarker(mission.center, { radius: 5, color: "#fff", weight: 2, fillColor: "#ffc107", fillOpacity: 1, interactive }));
      layers.push(startMarker(plan.start, !faded));
    }
  }
  layers.forEach((layer) => group.addLayer(layer));
  return layers;
}

function endMarker(at) {
  return L.marker(at, { icon: divIcon("end-dot", 12), interactive: false, keyboard: false });
}

function startMarker(at, label) {
  return L.marker(at, {
    icon: divIcon("start-dot", 16, label ? '<span class="start-label">Inicio</span>' : ""),
    interactive: false,
    keyboard: false,
  });
}

// ---------- Lista ----------

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

function whenText(time) {
  const minutes = Math.round((time - Date.now()) / 60000);
  if (minutes === 0) return "Editada hace un momento";
  if (minutes > -60) return `Editada ${relative.format(minutes, "minute")}`;
  const hours = Math.round(minutes / 60);
  if (hours > -24) return `Editada ${relative.format(hours, "hour")}`;
  return `Editada el ${new Date(time).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })}`;
}

function sortedMissions() {
  return Object.values(state.missions).sort((a, b) => b.updatedAt - a.updatedAt);
}

function renderList() {
  const missions = sortedMissions();
  const list = $("mission-list");
  list.replaceChildren();
  listLayer.clearLayers();
  $("list-empty").hidden = missions.length > 0;

  for (const mission of missions) {
    const card = document.createElement("div");
    card.className = "mission-card";
    card.innerHTML = `
      <div class="type"><svg><use href="#i-${mission.type === "map" ? "grid" : "orbit"}" /></svg></div>
      <div class="body"><div class="name"></div><div class="meta"></div><div class="when"></div></div>`;
    card.querySelector(".name").textContent = mission.name;
    card.querySelector(".meta").textContent = summary(mission);
    card.querySelector(".when").textContent = whenText(mission.updatedAt);
    card.addEventListener("click", () => openEditor(mission.id));
    list.append(card);

    const group = L.featureGroup().addTo(listLayer);
    drawMission(mission, group, { faded: true, interactive: true });
    group.bindTooltip(mission.name, { sticky: true, className: "mission-tooltip", direction: "top" });
    group.on("click", () => openEditor(mission.id));
    group.on("mouseover", () => card.classList.add("hover"));
    group.on("mouseout", () => card.classList.remove("hover"));
    card.addEventListener("mouseenter", () => group.eachLayer((l) => l.setStyle?.({ weight: 4 })));
    card.addEventListener("mouseleave", () => group.eachLayer((l) => l.setStyle?.({ weight: 2.5 })));
  }
}

function fitAll() {
  const points = sortedMissions().flatMap(missionPoints);
  if (points.length) fitTo(points, 17);
}

// ---------- Editor ----------

function openEditor(id, mission = null) {
  const source = mission ?? state.missions[id];
  if (!source) return;
  current = clone(source);
  undoStack = [];
  redoStack = [];
  $("list-view").hidden = true;
  $("editor-view").hidden = false;
  $("edit-tools").hidden = false;
  $("editor-name").value = current.name;
  $("editor-type-icon").querySelector("use").setAttribute("href", `#i-${current.type === "map" ? "grid" : "orbit"}`);
  map.removeLayer(listLayer);
  shapeLayer.addTo(map);
  handleLayer.addTo(map);
  map.doubleClickZoom.disable();
  history.replaceState(null, "", `#m/${current.id}`);
  buildParams();
  refresh();
  if (geometry(current).length) fitTo(missionPoints(current));
}

function closeEditor() {
  if (!current) return;
  document.activeElement?.blur?.();
  // Una misión nueva sin área ni centro no se guarda.
  if (geometry(current).length === 0 && !state.shas[current.id] && state.missions[current.id]) {
    delete state.missions[current.id];
    delete state.dirty[current.id];
    persist();
  }
  current = null;
  shapeLayer.clearLayers();
  handleLayer.clearLayers();
  map.removeLayer(shapeLayer);
  map.removeLayer(handleLayer);
  listLayer.addTo(map);
  map.doubleClickZoom.enable();
  $("editor-view").hidden = true;
  $("list-view").hidden = false;
  $("edit-tools").hidden = true;
  $("map-hint").hidden = true;
  history.replaceState(null, "", location.pathname);
  renderList();
}

/** Guarda la misión abierta (en este navegador y, en un momento, en GitHub). */
function save() {
  current.updatedAt = Date.now();
  state.missions[current.id] = clone(current);
  state.dirty[current.id] = true;
  persist();
  scheduleSync();
}

/** Guarda una copia para deshacer. */
function remember(snapshot = clone(current)) {
  undoStack.push(snapshot);
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (!current || !undoStack.length) return;
  redoStack.push(clone(current));
  current = undoStack.pop();
  afterHistoryJump();
}

function redo() {
  if (!current || !redoStack.length) return;
  undoStack.push(clone(current));
  current = redoStack.pop();
  afterHistoryJump();
}

function afterHistoryJump() {
  $("editor-name").value = current.name;
  save();
  buildParams();
  refresh();
}

/** Cambio de esquinas o centro: se puede deshacer y redibuja todo. */
function editGeometry(change) {
  remember();
  change();
  save();
  refresh();
}

function refresh() {
  redrawShapes();
  drawHandles();
  updateHint();
}

/** Redibuja el área y la ruta, y actualiza el resumen y las ayudas. Sirve también mientras se arrastra. */
function redrawShapes() {
  shapeLayer.clearLayers();
  // En un mapa, la etiqueta de Inicio es la que se arrastra (drawAreaHandles).
  drawMission(current, shapeLayer, { arrows: true, startLabel: current.type !== "map" });
  $("editor-summary").textContent = summary(current);
  renderStats();
  helpUpdaters.forEach((update) => update());
  $("tool-undo").disabled = undoStack.length === 0;
  $("tool-redo").disabled = redoStack.length === 0;
  $("tool-clear").disabled = geometry(current).length === 0;
}

function distanceText(meters) {
  return meters >= 1000 ? `${num(meters / 1000, 2)} km` : `${num(meters)} m`;
}

function renderStats() {
  let stats;
  if (current.type === "map") {
    const plan = MapPlanner.plan(current);
    stats = [
      ["Duración", plan.legs.length ? formatDuration(plan.durationSeconds) : "—"],
      current.captureMode === "photo"
        ? ["Fotos", plan.legs.length ? String(plan.photoCount) : "—"]
        : ["Captura", current.captureMode === "video" ? "Video" : "Nada"],
      ["Distancia", plan.legs.length ? distanceText(plan.lengthMeters) : "—"],
      ["Área", plan.areaHectares ? `${num(plan.areaHectares, 2)} ha` : "—"],
      ["GSD", `${num(plan.gsdCmPerPx, 2)} cm/px`],
      ["Líneas", plan.legs.length ? String(plan.legs.length) : "—"],
    ];
  } else {
    const plan = OrbitPlanner.plan(current);
    stats = [
      ["Duración", plan ? formatDuration(plan.durationSeconds) : "—"],
      ["Distancia", plan ? distanceText(plan.lengthMeters) : "—"],
      ["Fotos", plan && plan.photoCount ? String(plan.photoCount) : "—"],
    ];
  }
  $("editor-stats").innerHTML = stats.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
}

function updateHint() {
  const hint = $("map-hint");
  if (current.type === "map") {
    const n = current.boundary.length;
    hint.textContent =
      MapPlanner.plan(current).legs.length > MAX_LEGS
        ? "El área es demasiado grande para un vuelo: acércate en el mapa y márcala de nuevo"
        : n === 0
        ? "Haz clic en el mapa para marcar las esquinas del área"
        : n < 3
          ? "Sigue marcando esquinas: hacen falta al menos 3"
          : "Arrastra una esquina para moverla · clic en ella para quitarla · arrastra un punto pequeño para agregar otra";
  } else {
    hint.textContent = current.center
      ? "Arrastra el centro para moverlo, o el cuadrito azul para cambiar el radio y dónde empieza"
      : "Haz clic en el mapa para poner el centro de la órbita";
  }
  hint.hidden = false;
}

map.on("click", (event) => {
  if (!current) return;
  const point = toPoint(event.latlng);
  editGeometry(() => {
    if (current.type === "map") current.boundary = Geo.insertIntoPolygon(current.boundary, point);
    else current.center = point;
  });
});

function drawHandles() {
  handleLayer.clearLayers();
  if (current.type === "map") drawAreaHandles();
  else if (current.center) drawOrbitHandles();
}

function drawAreaHandles() {
  const points = current.boundary;
  const midpoints = [];
  const edgeCount = points.length >= 3 ? points.length : points.length - 1;
  const midpointOf = (i) => {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };

  // Puntos pequeños a mitad de cada lado: al arrastrarlos se agrega una esquina.
  for (let i = 0; i < edgeCount; i++) {
    const marker = L.marker(midpointOf(i), { icon: divIcon("mid-handle", 12), draggable: true, zIndexOffset: 500, title: "Arrastra para agregar una esquina" });
    let inserted = -1;
    marker.on("dragstart", () => {
      remember();
      inserted = i + 1;
      current.boundary.splice(inserted, 0, toPoint(marker.getLatLng()));
    });
    marker.on("drag", () => {
      current.boundary[inserted] = toPoint(marker.getLatLng());
      redrawShapes();
    });
    marker.on("dragend", () => {
      save();
      refresh();
    });
    marker.on("click", () => editGeometry(() => current.boundary.splice(i + 1, 0, midpointOf(i))));
    midpoints.push(marker);
    handleLayer.addLayer(marker);
  }

  points.forEach((point, i) => {
    const marker = L.marker(point, { icon: divIcon("vertex-handle", 18), draggable: true, zIndexOffset: 1000, title: "Arrastra para mover · clic para quitar" });
    marker.on("dragstart", () => remember());
    marker.on("drag", () => {
      current.boundary[i] = toPoint(marker.getLatLng());
      // Mueve los puntos medios de los dos lados que tocan esta esquina.
      [i - 1 < 0 ? edgeCount - 1 : i - 1, i].forEach((edge) => {
        if (midpoints[edge] && edge < edgeCount) midpoints[edge].setLatLng(midpointOf(edge));
      });
      redrawShapes();
    });
    marker.on("dragend", () => {
      save();
      refresh();
    });
    const removeVertex = () => editGeometry(() => current.boundary.splice(i, 1));
    marker.on("click", removeVertex);
    marker.on("contextmenu", removeVertex);
    handleLayer.addLayer(marker);
  });

  // El punto de inicio se arrastra a otra esquina para empezar por ahí.
  const plan = MapPlanner.plan(current);
  if (plan.path.length && plan.legs.length <= MAX_LEGS) {
    const start = L.marker(plan.path[0], {
      // La etiqueta queda a la derecha del punto, para no tapar la esquina.
      icon: L.divIcon({ className: "", html: '<div class="start-handle">Inicio</div>', iconSize: [64, 22], iconAnchor: [-12, 11] }),
      draggable: true,
      zIndexOffset: 1500,
      title: "Arrastra a otra esquina para empezar por ahí",
    });
    start.on("dragstart", () => remember());
    start.on("drag", () => {
      current.start = toPoint(start.getLatLng());
      redrawShapes();
    });
    start.on("dragend", () => {
      save();
      refresh();
    });
    handleLayer.addLayer(start);
  }
}

function drawOrbitHandles() {
  const radiusPoint = () => OrbitPlanner.plan({ ...current, finalRadius: null, rotations: 1 }).start;
  const center = L.marker(current.center, { icon: divIcon("vertex-handle center", 18), draggable: true, zIndexOffset: 1000, title: "Arrastra para mover el centro" });
  const radius = L.marker(radiusPoint(), {
    icon: divIcon("radius-handle", 16),
    draggable: true,
    zIndexOffset: 1000,
    title: "Arrastra para cambiar el radio y dónde empieza",
  });

  center.on("dragstart", () => remember());
  center.on("drag", () => {
    current.center = toPoint(center.getLatLng());
    radius.setLatLng(radiusPoint());
    redrawShapes();
  });
  center.on("dragend", () => {
    save();
    refresh();
  });

  radius.on("dragstart", () => remember());
  radius.on("drag", () => {
    const point = toPoint(radius.getLatLng());
    current.radius = Math.min(500, Math.max(5, Math.round(Geo.distance(current.center, point))));
    current.startBearing = Math.round(Geo.bearing(current.center, point));
    fieldSetters.radius?.(current.radius);
    redrawShapes();
  });
  radius.on("dragend", () => {
    save();
    refresh();
  });

  handleLayer.addLayer(center);
  handleLayer.addLayer(radius);
}

// ---------- Parámetros ----------

const helpUpdaters = [];
const fieldSetters = {};
const fmt = (value, decimals) => value.toLocaleString(LOCALE, { maximumFractionDigits: decimals, useGrouping: false });
const parse = (text) => {
  const value = Number(String(text).trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};

function buildParams() {
  const params = $("editor-params");
  const scroll = params.scrollTop;
  params.replaceChildren();
  helpUpdaters.length = 0;
  for (const key of Object.keys(fieldSetters)) delete fieldSetters[key];
  if (current.type === "map") buildMapParams(params);
  else buildOrbitParams(params);
  params.scrollTop = scroll;
}

/** Texto de ayuda suelto dentro de una sección. */
function note(params, text) {
  const el = document.createElement("div");
  el.className = "section-note";
  el.textContent = text;
  params.append(el);
}

/** Guarda un cambio de un parámetro de opciones; con `rebuild`, redibuja el panel (cambian los campos visibles). */
function setChoice(key, value, { rebuild = false, onChange } = {}) {
  remember();
  current[key] = value;
  onChange?.(value);
  save();
  redrawShapes();
  if (rebuild) buildParams();
}

function section(params, title) {
  const el = document.createElement("div");
  el.className = "section-title";
  el.textContent = title;
  params.append(el);
}

/**
 * Un parámetro numérico. Se aplica mientras se escribe si está dentro de los límites; si no,
 * se avisa en amarillo y al salir del campo se corrige. Con `optional`, vacío vale null.
 * Con `scale`, se muestra el valor guardado multiplicado (por ejemplo m/s × 3,6 = km/h);
 * `min` y `max` van en las unidades que se muestran.
 */
function numberParam(params, { key, label, unit = "", min, max, step = 1, decimals = 0, scale = 1, slider = false, optional = false, placeholder = "", help }) {
  const el = document.createElement("div");
  el.className = "param";
  el.innerHTML = `
    <div class="param-head">
      <label></label>
      <div class="value-box"><input inputmode="decimal" autocomplete="off" /><span class="unit"></span></div>
    </div>
    ${slider ? `<input type="range" min="${min}" max="${max}" step="${step}" />` : ""}
    <div class="help"></div>`;
  const id = `param-${key}`;
  const input = el.querySelector(".value-box input");
  const box = el.querySelector(".value-box");
  const range = el.querySelector('input[type="range"]');
  const helpEl = el.querySelector(".help");
  el.querySelector("label").textContent = label;
  el.querySelector("label").htmlFor = id;
  input.id = id;
  input.placeholder = placeholder;
  el.querySelector(".unit").textContent = unit;

  let error = null;
  let snapshot = null;
  const shown = (value) => (value === null || value === undefined ? null : value * scale);
  const show = (value) => {
    const display = shown(value);
    input.value = display === null ? "" : fmt(display, decimals);
    if (range) range.value = display ?? min;
  };
  const showHelp = () => {
    const text = error ?? help?.() ?? "";
    helpEl.textContent = text;
    helpEl.hidden = !text;
    helpEl.classList.toggle("warn", Boolean(error));
    box.classList.toggle("invalid", Boolean(error));
  };
  const begin = () => {
    snapshot ??= clone(current);
  };
  const commit = () => {
    if (snapshot && JSON.stringify(snapshot[key]) !== JSON.stringify(current[key])) remember(snapshot);
    snapshot = null;
    save();
    redrawShapes();
  };
  const apply = (display) => {
    current[key] = display === null ? null : display / scale;
    redrawShapes();
  };

  show(current[key]);
  fieldSetters[key] = show;
  helpUpdaters.push(showHelp);

  input.addEventListener("focus", begin);
  input.addEventListener("input", () => {
    begin();
    const value = parse(input.value);
    if (value === null && optional && input.value.trim() === "") {
      error = null;
      apply(null);
    } else if (value !== null && value >= min && value <= max) {
      error = null;
      if (range) range.value = value;
      apply(value);
    } else {
      error = `Escoge entre ${fmt(min, decimals)} y ${fmt(max, decimals)} ${unit}`.trim();
      showHelp();
    }
  });
  input.addEventListener("blur", () => {
    if (error) {
      const value = parse(input.value);
      const fixed = value === null ? current[key] : Math.min(max, Math.max(min, value)) / scale;
      error = null;
      show(fixed);
      current[key] = fixed;
    } else {
      show(current[key]);
    }
    commit();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
    if (event.key === "Escape") {
      if (snapshot) current[key] = snapshot[key];
      error = null;
      show(current[key]);
      snapshot = null;
      input.blur();
      event.stopPropagation();
    }
  });
  range?.addEventListener("pointerdown", begin);
  range?.addEventListener("focus", begin);
  range?.addEventListener("input", () => {
    begin();
    const value = Number(range.value);
    input.value = fmt(value, decimals);
    error = null;
    apply(value);
  });
  range?.addEventListener("change", commit);
  params.append(el);
  return { show };
}

function choiceParam(params, { key, label, options, help, rebuild, onChange }) {
  const el = document.createElement("div");
  el.className = "param";
  el.innerHTML = `<div class="label"></div><div class="segmented"></div><div class="help"></div>`;
  el.querySelector(".label").textContent = label;
  const segmented = el.querySelector(".segmented");
  const helpEl = el.querySelector(".help");
  const showHelp = () => {
    const text = help?.() ?? "";
    helpEl.textContent = text;
    helpEl.hidden = !text;
  };
  const buttons = options.map(([value, text]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.classList.toggle("selected", current[key] === value);
    button.addEventListener("click", () => {
      if (current[key] === value) return;
      buttons.forEach((b) => b.classList.toggle("selected", b === button));
      setChoice(key, value, { rebuild, onChange });
    });
    segmented.append(button);
    return button;
  });
  helpUpdaters.push(showHelp);
  showHelp();
  params.append(el);
}

/** Una lista desplegable, para opciones largas. Con `unset`, la primera opción es "Sin cambiar" (null). */
function selectParam(params, { key, label, options, unset = false, help, rebuild, onChange }) {
  const el = document.createElement("div");
  el.className = "param";
  el.innerHTML = `
    <div class="param-head">
      <label></label>
      <div class="select-box"><select></select></div>
    </div>
    <div class="help"></div>`;
  const select = el.querySelector("select");
  const helpEl = el.querySelector(".help");
  select.id = `param-${key}`;
  el.querySelector("label").textContent = label;
  el.querySelector("label").htmlFor = select.id;
  const all = unset ? [[null, "Sin cambiar"], ...options] : options;
  all.forEach(([value, text], i) => {
    const option = new Option(text, String(i));
    option.selected = current[key] === value;
    select.append(option);
  });
  el.querySelector(".select-box").classList.toggle("unset", current[key] === null);
  select.addEventListener("change", () => {
    const value = all[Number(select.value)][0];
    el.querySelector(".select-box").classList.toggle("unset", value === null);
    setChoice(key, value, { rebuild, onChange });
  });
  const showHelp = () => {
    const text = help?.() ?? "";
    helpEl.textContent = text;
    helpEl.hidden = !text;
  };
  helpUpdaters.push(showHelp);
  showHelp();
  params.append(el);
}

/** Un interruptor de sí o no. */
function toggleParam(params, { key, label, help }) {
  const el = document.createElement("label");
  el.className = "param toggle";
  el.innerHTML = `
    <span class="toggle-text"><span class="label"></span><span class="help"></span></span>
    <input type="checkbox" role="switch" />`;
  el.querySelector(".label").textContent = label;
  el.querySelector(".help").textContent = help ?? "";
  const input = el.querySelector("input");
  input.id = `param-${key}`;
  input.checked = Boolean(current[key]);
  input.addEventListener("change", () => setChoice(key, input.checked));
  params.append(el);
}

function buttonParam(params, label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button outline small wide param-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  params.append(button);
}

function buildMapParams(params) {
  const plan = () => MapPlanner.plan(current);
  const photos = current.captureMode === "photo";
  const byDistance = photos && current.capturePriority !== "time";

  section(params, "VUELO");
  numberParam(params, {
    key: "altitude",
    label: "Altura sobre el despegue",
    unit: "m",
    min: 5,
    max: 120,
    slider: true,
    help: () => {
      const [w, h] = MapPlanner.footprint(cameraFor(current), current.altitude);
      return `GSD ${num(plan().gsdCmPerPx, 2)} cm/px · cada foto cubre ${num(w)} × ${num(h)} m`;
    },
  });
  numberParam(params, {
    key: "maxSpeed",
    label: "Velocidad máxima",
    unit: "km/h",
    scale: KMH,
    min: 3,
    max: 54,
    step: 0.5,
    decimals: 1,
    help: () => {
      const speed = plan().speed;
      const limited = speed < current.maxSpeed - 0.05;
      return `Volará a ${num(speed * KMH, 1)} km/h${limited ? ", limitada por el tiempo entre fotos" : ""}`;
    },
  });
  choiceParam(params, { key: "finishAction", label: "Al terminar", options: FINISH_ACTIONS });

  section(params, "CAPTURA");
  choiceParam(params, { key: "captureMode", label: "Durante las líneas", options: CAPTURE_MODES, rebuild: true });
  if (photos) {
    choiceParam(params, {
      key: "photoSize",
      label: "Tamaño de foto",
      options: PHOTO_SIZES,
      help: () => (current.photoSize === "12mp" ? "Menos detalle, pero guarda cada foto en unos 2 s" : "Más detalle; guarda cada foto en unos 5 s"),
    });
    choiceParam(params, {
      key: "capturePriority",
      label: "Tomar las fotos por",
      options: CAPTURE_PRIORITIES,
      rebuild: true,
      help: () =>
        current.capturePriority === "time"
          ? "Una foto cada cierto tiempo a velocidad fija; arranca antes del área para tomar velocidad"
          : "La foto se toma al llegar a cada punto: traslape exacto aunque haya viento",
    });
    numberParam(params, {
      key: "minPhotoInterval",
      label: current.capturePriority === "time" ? "Foto cada" : "Tiempo mínimo entre fotos",
      unit: "s",
      min: 1,
      max: 10,
      step: 0.5,
      decimals: 1,
      help: () => "Lo más rápido que la cámara guarda cada foto",
    });
    if (byDistance) {
      choiceParam(params, {
        key: "photoType",
        label: "Tipo de foto",
        options: PHOTO_TYPES,
        help: () => (current.photoType === "single" ? "" : "Varias fotos con distinta exposición en cada punto, para HDR"),
      });
      numberParam(params, {
        key: "captureSpeed",
        label: "Velocidad al tomar la foto",
        unit: "km/h",
        scale: KMH,
        min: 0,
        max: 54,
        step: 0.5,
        decimals: 1,
        optional: true,
        placeholder: "Sin frenar",
        help: () =>
          current.captureSpeed === null
            ? "Déjalo vacío para no frenar; 0 = se detiene en cada foto"
            : current.captureSpeed === 0
              ? "Se detiene en cada foto: más nítidas, vuelo más largo"
              : "Frena en cada foto: más nítidas, vuelo más largo",
      });
      toggleParam(params, { key: "verifyFileCreated", label: "Comprobar cada foto", help: "Si una foto no se guardó, la repite antes de seguir" });
    }
  }

  section(params, "ESPACIADO");
  choiceParam(params, {
    key: "spacing",
    label: "Separar por",
    options: SPACING_MODES,
    rebuild: true,
    onChange: (value) => {
      if (value !== "distance") return;
      // Empieza con la separación que daba el traslape.
      const before = MapPlanner.plan({ ...current, spacing: "overlap" });
      current.frontDistance = Math.round(before.photoSpacing * 10) / 10;
      current.sideDistance = Math.round(before.lineSpacing * 10) / 10;
    },
  });
  if (current.spacing === "distance") {
    numberParam(params, { key: "frontDistance", label: "Entre fotos", unit: "m", min: 0.5, max: 200, step: 0.5, decimals: 1 });
    numberParam(params, { key: "sideDistance", label: "Entre líneas", unit: "m", min: 1, max: 200, step: 0.5, decimals: 1 });
  } else {
    numberParam(params, {
      key: "frontOverlap",
      label: "Traslape frontal",
      unit: "%",
      min: 10,
      max: 95,
      slider: true,
      help: () => `Una foto cada ${num(plan().photoSpacing, 1)} m`,
    });
    numberParam(params, {
      key: "sideOverlap",
      label: "Traslape lateral",
      unit: "%",
      min: 10,
      max: 95,
      slider: true,
      help: () => `Líneas separadas ${num(plan().lineSpacing, 1)} m`,
    });
  }

  section(params, "CUADRÍCULA");
  choiceParam(params, { key: "pattern", label: "Patrón", options: MAP_PATTERNS });
  const direction = numberParam(params, {
    key: "direction",
    label: "Dirección de las líneas",
    unit: "°",
    min: 0,
    max: 359,
    slider: true,
    help: () => "0° = norte-sur · 90° = este-oeste",
  });
  const setDirection = (value) => {
    remember();
    current.direction = value;
    direction.show(value);
    save();
    redrawShapes();
  };
  buttonParam(params, "Alinear con el lado más largo", () => {
    const best = MapPlanner.longestEdgeDirection(current.boundary);
    if (best === null) toast("Primero marca el área en el mapa");
    else setDirection(best);
  });
  buttonParam(params, "Girar 90°", () => setDirection((Math.round(current.direction) + 90) % 360));
  note(params, "Para empezar por otra esquina, arrastra el punto verde de Inicio hasta ella.");

  section(params, "RUMBO Y GIMBAL");
  choiceParam(params, {
    key: "heading",
    label: "El dron mira",
    options: MAP_HEADINGS,
    rebuild: true,
    help: () =>
      ({
        forward: "Hacia donde vuela; gira en cada línea",
        left: "A la izquierda de la línea, sin girar entre líneas",
        right: "A la derecha de la línea, sin girar entre líneas",
        custom: "",
      })[current.heading],
  });
  if (current.heading === "custom") {
    numberParam(params, { key: "headingAngle", label: "Ángulo", unit: "°", min: 0, max: 359, slider: true });
    choiceParam(params, {
      key: "headingReference",
      label: "Medido",
      options: HEADING_REFERENCES,
      help: () => (current.headingReference === "north" ? "Mismo rumbo en todas las líneas (0° = norte)" : "Gira con cada línea (0° = adelante)"),
    });
  }
  numberParam(params, {
    key: "gimbalPitch",
    label: "Inclinación del gimbal",
    unit: "°",
    min: -90,
    max: 0,
    slider: true,
    help: () => (current.gimbalPitch <= -89 ? "-90° = mirando hacia abajo" : "Fotos oblicuas, útiles para fachadas y modelos 3D"),
  });

  if (current.captureMode !== "none") cameraSettingsParams(params, { photo: photos });

  section(params, "SEGURIDAD");
  toggleParam(params, { key: "highWindTolerance", label: "Tolerancia a viento fuerte", help: "Corrige más fuerte cuando el viento lo saca de la línea" });
}

function buildOrbitParams(params) {
  section(params, "ÓRBITA");
  numberParam(params, { key: "radius", label: "Radio", unit: "m", min: 5, max: 500, slider: true });
  numberParam(params, { key: "altitude", label: "Altura sobre el despegue", unit: "m", min: 5, max: 120, slider: true });
  choiceParam(params, {
    key: "clockwise",
    label: "Sentido",
    options: [
      [true, "Horario"],
      [false, "Antihorario"],
    ],
  });
  numberParam(params, {
    key: "rotations",
    label: "Vueltas",
    min: 0.05,
    max: 10,
    step: 0.05,
    decimals: 2,
    help: () => `Recorre ${num(current.rotations * 360)}° alrededor del centro`,
  });
  numberParam(params, {
    key: "speed",
    label: "Velocidad",
    unit: "km/h",
    scale: KMH,
    min: 3,
    max: 43,
    step: 0.5,
    decimals: 1,
    help: () => `${num(OrbitPlanner.angularSpeed(current.radius, current.speed), 1)}° por segundo alrededor del centro`,
  });
  choiceParam(params, { key: "finishAction", label: "Al terminar", options: FINISH_ACTIONS });
  note(params, "Arrastra el cuadrito azul para cambiar el radio y el punto donde empieza.");

  section(params, "ESPIRAL (OPCIONAL)");
  numberParam(params, { key: "finalAltitude", label: "Altura final", unit: "m", min: 5, max: 120, optional: true, placeholder: "Igual" });
  numberParam(params, { key: "finalRadius", label: "Radio final", unit: "m", min: 5, max: 500, optional: true, placeholder: "Igual" });

  section(params, "RUMBO Y GIMBAL");
  selectParam(params, { key: "heading", label: "El dron mira", options: ORBIT_HEADINGS, rebuild: true });
  if (current.heading === "custom") {
    numberParam(params, { key: "headingAngle", label: "Rumbo", unit: "°", min: 0, max: 359, slider: true, help: () => "0° = norte · 90° = este" });
  }
  numberParam(params, {
    key: "poiAltitude",
    label: "Altura del objetivo",
    unit: "m",
    min: -50,
    max: 120,
    optional: true,
    placeholder: "Sin objetivo",
    help: () =>
      current.poiAltitude === null
        ? "Con un objetivo en el centro, el gimbal lo sigue solo"
        : `El gimbal apunta al objetivo: ${num(OrbitPlanner.gimbalPitch(current))}°`,
  });
  numberParam(params, {
    key: "gimbalPitch",
    label: "Inclinación del gimbal",
    unit: "°",
    min: -90,
    max: 30,
    slider: true,
    help: () => (current.poiAltitude === null ? "0° = al horizonte · -90° = hacia abajo" : "No se usa: el gimbal apunta al objetivo"),
  });

  section(params, "CAPTURA");
  choiceParam(params, { key: "captureMode", label: "Durante la órbita", options: CAPTURE_MODES, rebuild: true });
  if (current.captureMode === "photo") {
    numberParam(params, {
      key: "photoInterval",
      label: "Foto cada",
      unit: "s",
      min: 1,
      max: 60,
      step: 0.5,
      decimals: 1,
      help: () => `Unas ${OrbitPlanner.plan(current)?.photoCount ?? 0} fotos`,
    });
    choiceParam(params, { key: "photoSize", label: "Tamaño de foto", options: PHOTO_SIZES });
  }
  if (current.captureMode !== "none") cameraSettingsParams(params, { photo: current.captureMode === "photo" });
}

/** Ajustes que la misión pone en la cámara al empezar. "Sin cambiar" deja lo que tenga la cámara. */
function cameraSettingsParams(params, { photo }) {
  section(params, "AJUSTES DE CÁMARA");
  note(params, "“Sin cambiar” deja el ajuste que ya tenga la cámara.");
  if (photo) {
    selectParam(params, { key: "photoFormat", label: "Formato", options: PHOTO_FORMATS, unset: true });
    selectParam(params, { key: "photoRatio", label: "Relación de aspecto", options: PHOTO_RATIOS, unset: true });
  } else {
    selectParam(params, { key: "videoResolution", label: "Resolución", options: VIDEO_RESOLUTIONS, unset: true });
    selectParam(params, { key: "frameRate", label: "Cuadros por segundo", options: FRAME_RATES, unset: true });
    selectParam(params, { key: "colorProfile", label: "Perfil de color", options: COLOR_PROFILES, unset: true });
  }
  selectParam(params, { key: "exposureMode", label: "Exposición", options: EXPOSURE_MODES, unset: true, rebuild: true });
  if (current.exposureMode === "auto") {
    selectParam(params, { key: "ev", label: "Compensación (EV)", options: EV_VALUES, unset: true });
  } else if (current.exposureMode === "manual") {
    selectParam(params, { key: "iso", label: "ISO", options: ISO_VALUES, unset: true });
    selectParam(params, { key: "shutter", label: "Obturador", options: SHUTTER_VALUES, unset: true });
  }
  selectParam(params, {
    key: "whiteBalance",
    label: "Balance de blancos",
    options: WHITE_BALANCES,
    unset: true,
    rebuild: true,
    onChange: (value) => {
      if (value === "custom" && current.whiteBalanceKelvin === null) current.whiteBalanceKelvin = 5500;
    },
  });
  if (current.whiteBalance === "custom") {
    numberParam(params, { key: "whiteBalanceKelvin", label: "Temperatura", unit: "K", min: 2000, max: 10000, step: 100, slider: true });
  }
  selectParam(params, {
    key: "focusMode",
    label: "Enfoque",
    options: FOCUS_MODES,
    unset: true,
    help: () => (current.focusMode === "infinity" ? "Enfoque fijo al infinito: bueno para mapas a más de 10 m" : ""),
  });
}

// ---------- Crear, importar y borrar ----------

function nextName(type) {
  const base = type === "map" ? "Mapa" : "Órbita";
  const count = Object.values(state.missions).filter((m) => m.type === type).length;
  return `${base} ${count + 1}`;
}

$("new-map").addEventListener("click", () => {
  const mission = newMapMission(nextName("map"));
  openEditor(mission.id, mission);
});

$("new-orbit").addEventListener("click", () => {
  const mission = newOrbitMission(nextName("orbit"));
  openEditor(mission.id, mission);
});

$("import-kml").addEventListener("click", () => $("kml-file").click());
$("kml-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    const text = await readKml(file);
    const result = text && parseKml(text);
    if (!result) {
      toast("Ese archivo no tiene un área (polígono) que se pueda usar", true);
      return;
    }
    const mission = newMapMission(result.name || file.name.replace(/\.km[lz]$/i, ""), result.points);
    mission.direction = MapPlanner.longestEdgeDirection(mission.boundary) ?? 0;
    state.missions[mission.id] = mission;
    state.dirty[mission.id] = true;
    persist();
    scheduleSync();
    openEditor(mission.id);
    toast(`Área importada: ${mission.boundary.length} esquinas`);
  } catch (error) {
    toast(`No se pudo leer el archivo: ${error.message}`, true);
  }
});

/** Un KMZ es un ZIP con el KML adentro; JSZip se carga solo cuando hace falta. */
async function readKml(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) return new TextDecoder().decode(bytes);
  if (!window.JSZip) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("no se pudo cargar el lector de KMZ"));
      document.head.append(script);
    });
  }
  const zip = await window.JSZip.loadAsync(bytes);
  const entry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".kml"));
  return entry ? entry.async("string") : null;
}

$("editor-delete").addEventListener("click", () => {
  if (!current || !confirm(`¿Borrar «${current.name}»? También se borra del teléfono.`)) return;
  const id = current.id;
  if (state.shas[id]) state.deleted[id] = current.name;
  delete state.missions[id];
  delete state.dirty[id];
  persist();
  current = { ...current, boundary: [], center: null }; // Para que closeEditor no la vuelva a guardar.
  closeEditor();
  scheduleSync();
});

$("editor-name").addEventListener("input", (event) => {
  const name = event.target.value.trim();
  if (!current || !name) return;
  current.name = name;
  save();
  $("editor-summary").textContent = summary(current);
});
$("editor-name").addEventListener("keydown", (event) => {
  if (event.key === "Enter") event.target.blur();
});
$("editor-back").addEventListener("click", closeEditor);
$("editor-done").addEventListener("click", closeEditor);

// ---------- Herramientas del mapa ----------

$("tool-undo").addEventListener("click", undo);
$("tool-redo").addEventListener("click", redo);
$("tool-clear").addEventListener("click", () => {
  if (!current || geometry(current).length === 0) return;
  editGeometry(() => {
    if (current.type === "map") current.boundary = [];
    else current.center = null;
  });
});
$("tool-fit").addEventListener("click", () => (current ? fitTo(missionPoints(current)) : fitAll()));
$("tool-locate").addEventListener("click", () => {
  if (!navigator.geolocation) return toast("Este navegador no da la ubicación", true);
  navigator.geolocation.getCurrentPosition(
    (position) => map.setView([position.coords.latitude, position.coords.longitude], 18),
    () => toast("No se pudo obtener tu ubicación", true),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

// Capas: imágenes de Esri o de Bing, y nombres de lugares encima.
function setBase(key) {
  for (const [name, layer] of Object.entries(baseLayers)) {
    if (name === key) layer.addTo(map).bringToBack();
    else map.removeLayer(layer);
  }
  document.querySelectorAll("#layer-menu [data-base]").forEach((b) => b.classList.toggle("selected", b.dataset.base === key));
  storage.set(BASE_KEY, key);
}

function setLabels(on) {
  if (on) labels.addTo(map);
  else map.removeLayer(labels);
  $("layer-labels").classList.toggle("selected", on);
  storage.set(LABELS_KEY, on ? "1" : "0");
}

$("tool-layers").addEventListener("click", (event) => {
  event.stopPropagation();
  $("layer-menu").hidden = !$("layer-menu").hidden;
});
document.querySelectorAll("#layer-menu [data-base]").forEach((button) =>
  button.addEventListener("click", () => setBase(button.dataset.base)),
);
$("layer-labels").addEventListener("click", () => setLabels(!map.hasLayer(labels)));
document.addEventListener("click", (event) => {
  if (!$("layer-menu").contains(event.target)) $("layer-menu").hidden = true;
});
setBase(baseLayers[storage.get(BASE_KEY)] ? storage.get(BASE_KEY) : "bing");
setLabels(storage.get(LABELS_KEY) !== "0");

document.addEventListener("keydown", (event) => {
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !typing && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (mod && !typing && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
  } else if (event.key === "Escape" && !$("layer-menu").hidden) {
    $("layer-menu").hidden = true;
  } else if (event.key === "Escape" && !typing && current && !$("sync-dialog").open) {
    closeEditor();
  }
});

// ---------- Buscar lugares ----------

let searchTimer = null;
let searchResults = [];
const searchInput = $("search-input");
const resultsBox = $("search-results");

function showResults(results) {
  searchResults = results;
  resultsBox.replaceChildren(
    ...results.map((result) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = result.label;
      button.addEventListener("click", () => goToResult(result));
      return button;
    }),
  );
  resultsBox.hidden = results.length === 0;
}

function goToResult(result) {
  resultsBox.hidden = true;
  searchInput.blur();
  if (result.bounds) map.fitBounds(result.bounds, { ...fitPadding(), maxZoom: 18 });
  else map.setView(result.center, 18);
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();
  if (query.length < 3) return showResults([]);
  const coords = query.match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (coords) {
    const lat = Number(coords[1].replace(",", "."));
    const lon = Number(coords[2].replace(",", "."));
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return showResults([{ label: `Ir a ${lat}, ${lon}`, center: [lat, lon] }]);
  }
  searchTimer = setTimeout(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=es&q=${encodeURIComponent(query)}`;
      const results = await (await fetch(url)).json();
      if (searchInput.value.trim() !== query) return;
      showResults(
        results.map((r) => ({
          label: r.display_name,
          center: [Number(r.lat), Number(r.lon)],
          bounds: r.boundingbox && [
            [Number(r.boundingbox[0]), Number(r.boundingbox[2])],
            [Number(r.boundingbox[1]), Number(r.boundingbox[3])],
          ],
        })),
      );
    } catch {
      showResults([]);
    }
  }, 450);
});
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && searchResults[0]) goToResult(searchResults[0]);
  if (event.key === "Escape") {
    searchInput.value = "";
    showResults([]);
    searchInput.blur();
  }
});
document.addEventListener("click", (event) => {
  if (!$("map-search").contains(event.target)) resultsBox.hidden = true;
});

// ---------- Avisos ----------

let toastTimer = null;
function toast(message, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 5000 : 2500);
}

// ---------- Sincronización ----------

let syncTimer = null;
let syncing = false;
let syncAgain = false;
let lastSync = 0;
let lastError = "";

function setChip(kind, label) {
  const chip = $("sync-chip");
  chip.dataset.state = kind;
  chip.querySelector(".label").textContent = label;
  chip.title = kind === "error" ? lastError : "Sincronización con el teléfono";
}

function scheduleSync(delay = 1500) {
  if (!token) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

async function runSync() {
  if (!token) return setChip("off", "Conectar teléfono");
  if (syncing) {
    syncAgain = true;
    return;
  }
  syncing = true;
  setChip("busy", "Sincronizando…");
  try {
    await syncAll(new GitHubSync(token), state);
    persist();
    lastSync = Date.now();
    lastError = "";
    setChip("ok", "Sincronizado");
    if (!current) {
      renderList();
    } else {
      const latest = state.missions[current.id];
      if (latest && latest.updatedAt > current.updatedAt) {
        // La misión abierta cambió en el teléfono.
        current = clone(latest);
        undoStack = [];
        redoStack = [];
        $("editor-name").value = current.name;
        buildParams();
        refresh();
        toast("La misión se actualizó con cambios del teléfono");
      }
    }
  } catch (error) {
    lastError = error.message;
    setChip("error", error.offline ? "Sin conexión" : "Error al sincronizar");
    if (error.status === 401 || error.status === 403 || error.status === 404) toast(error.message, true);
  } finally {
    syncing = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync(300);
    }
  }
}

const dialog = $("sync-dialog");
$("token-link").href = TOKEN_HELP_URL;
$("sync-chip").addEventListener("click", () => {
  $("token-input").value = token;
  $("token-remove").hidden = !token;
  $("sync-error").hidden = !lastError;
  $("sync-error").textContent = lastError;
  dialog.showModal();
});
$("token-save").addEventListener("click", async () => {
  const candidate = $("token-input").value.trim();
  if (!candidate) return;
  const button = $("token-save");
  button.disabled = true;
  button.textContent = "Probando…";
  try {
    await new GitHubSync(candidate).check();
    token = candidate;
    storage.set(TOKEN_KEY, token);
    dialog.close();
    toast("Conectado. Las misiones se sincronizan con el teléfono.");
    runSync();
  } catch (error) {
    $("sync-error").textContent = error.message;
    $("sync-error").hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Conectar";
  }
});
$("token-remove").addEventListener("click", () => {
  token = "";
  storage.set(TOKEN_KEY, null);
  lastError = "";
  dialog.close();
  setChip("off", "Conectar teléfono");
});

// Trae los cambios del teléfono al volver a esta pestaña y cada minuto.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastSync > 15000) scheduleSync(0);
});
setInterval(() => {
  if (document.visibilityState === "visible") scheduleSync(0);
}, 60000);

// ---------- Inicio ----------

renderList();
const fromHash = location.hash.match(/^#m\/(.+)$/)?.[1];
if (fromHash && state.missions[fromHash]) {
  map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
  openEditor(fromHash);
} else if (Object.keys(state.missions).length) {
  map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
  fitAll();
} else {
  map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
}
if (token) runSync();
else setChip("off", "Conectar teléfono");

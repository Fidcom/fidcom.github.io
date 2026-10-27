// Planificador de misiones para el DJI Mini 4 Pro: la versión de PC del editor de la app Mini4Pro.
// Una misión es un plan con componentes en fila (mapas y órbitas), como en Dronelink. Se guardan en
// este navegador y, si hay token, en GitHub para que las lea el teléfono.
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
  LOCALE,
  MapPlanner,
  OrbitPlanner,
  PlanPlanner,
  cameraFor,
  componentName,
  componentSummary,
  copyComponent,
  endAltitude,
  formatDuration,
  hasGeometry,
  newMapComponent,
  newOrbitComponent,
  newPlan,
  normalizePlan,
  num,
  parseKml,
  planPoints,
  componentPoints,
  projection,
  summary,
  takeoffOf,
} from "./planner.js?v=20261027e";
import { GitHubSync, TOKEN_HELP_URL, syncAll } from "./sync.js?v=20261027e";

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

/** missions: planes por id · shas: versión sincronizada · dirty: por subir · deleted: por borrar en GitHub */
const state = (() => {
  try {
    const saved = JSON.parse(storage.get(STATE_KEY));
    if (saved?.missions) {
      // Las misiones de antes (un solo mapa u órbita, o sin algún parámetro nuevo) se vuelven planes completos.
      for (const id of Object.keys(saved.missions)) saved.missions[id] = normalizePlan(saved.missions[id]);
      return { shas: {}, dirty: {}, deleted: {}, ...saved };
    }
  } catch {
    // Estado dañado: se empieza de cero.
  }
  return { missions: {}, shas: {}, dirty: {}, deleted: {} };
})();

const persist = () => storage.set(STATE_KEY, JSON.stringify(state));
let token = storage.get(TOKEN_KEY) || "";

/** Plan abierto en el editor (una copia); null en la lista. */
let current = null;
/** Componente abierto dentro del plan; null = la vista del plan. */
let selectedId = null;
/** Última ruta calculada del plan abierto (PlanPlanner.plan). */
let planResult = null;
let undoStack = [];
let redoStack = [];
const clone = (value) => structuredClone(value);
const round7 = (x) => Math.round(x * 1e7) / 1e7;
const toPoint = (latlng) => [round7(latlng.lat), round7(latlng.lng)];
const rad = (d) => (d * Math.PI) / 180;

const selected = () => current?.components.find((c) => c.id === selectedId) ?? null;
const selectedItem = () => planResult?.items.find((item) => item.component.id === selectedId) ?? null;
const typeIcon = (component) => (component.type === "map" ? "grid" : "orbit");

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

const PIN_PATH = "M14 1C6.8 1 1 6.7 1 13.9 1 23.6 14 35 14 35s13-11.4 13-21.1C27 6.7 21.2 1 14 1z";
const altitudeText = (meters) => `${num(meters)} m`;

/** Pin como los de Dronelink: azul con el número del componente, o morado (H) para el despegue. */
function pinIcon(kind, text, label) {
  return L.divIcon({
    className: "",
    html: `<div class="pin ${kind}"><span class="pin-halo"></span><svg viewBox="0 0 28 36"><path d="${PIN_PATH}" /></svg><span class="pin-text">${text}</span>${
      label ? `<span class="pin-label">${label}</span>` : ""
    }</div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
  });
}

function startPin(item, draggable = false) {
  const off = item.component.enabled ? "" : " off";
  return L.marker(item.result.path[0], {
    icon: pinIcon(`start${off}${draggable ? " draggable" : ""}`, String(item.number), altitudeText(item.component.altitude)),
    draggable,
    interactive: draggable,
    keyboard: false,
    zIndexOffset: draggable ? 1500 : 400,
  });
}

function endMarker(item) {
  const label = altitudeText(endAltitude(item.component));
  return L.marker(item.result.path.at(-1), {
    icon: L.divIcon({ className: "", html: `<div class="end-dot"></div><span class="end-label">${label}</span>`, iconSize: [12, 12], iconAnchor: [6, 6] }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 300,
  });
}

/** Área y ruta de un componente. Uno apagado (que no se vuela) va gris y punteado. */
function drawComponent({ component, result }, { faded, dim, arrows, interactive }) {
  const layers = [];
  const off = !component.enabled;
  const route = {
    color: off ? "#a7b0b8" : ACCENT,
    weight: faded || dim ? 2.5 : 3.5,
    opacity: faded ? 0.75 : dim ? 0.65 : 1,
    lineJoin: "round",
    dashArray: off ? "4 7" : null,
    interactive,
  };
  if (component.type === "map") {
    if (component.boundary.length >= 2) {
      layers.push(
        L.polygon(component.boundary, {
          color: "#ffffff",
          weight: dim ? 1.5 : 2.5,
          opacity: faded || dim ? 0.7 : 1,
          fillColor: "#ffffff",
          fillOpacity: faded || dim ? 0.08 : 0.16,
          interactive,
        }),
      );
    }
    // Un área enorme (marcada con el mapa muy alejado) no se dibuja: serían miles de líneas.
    if (result && result.legs.length <= MAX_LEGS) {
      layers.push(L.polyline(result.path, route));
      if (arrows) {
        for (const leg of result.legs) {
          const mid = [(leg.start[0] + leg.end[0]) / 2, (leg.start[1] + leg.end[1]) / 2];
          layers.push(arrow(mid, Geo.bearing(leg.start, leg.end)));
        }
      }
    }
  } else if (result) {
    layers.push(L.polyline(result.path, route));
    if (arrows) {
      const step = Math.max(1, Math.round(result.path.length / (8 * component.rotations)));
      for (let i = step; i < result.path.length - 1; i += step) layers.push(arrow(result.path[i], Geo.bearing(result.path[i], result.path[i + 1])));
    }
    if (faded || dim) layers.push(L.circleMarker(component.center, { radius: 4, color: "#fff", weight: 2, fillColor: "#3ddc84", fillOpacity: 1, interactive }));
  }
  return layers;
}

/**
 * Dibuja un plan: cada componente, los tránsitos entre ellos en blanco (despegue → componentes →
 * regreso), un pin con el número y la altura donde empieza cada uno y un punto rojo donde termina.
 * En el editor, el componente abierto va resaltado y los demás se pueden tocar para abrirlos.
 */
function drawPlan(plan, group, { faded = false, interactive = false, selectedId = null, editing = false, onSelect = null } = {}) {
  const result = PlanPlanner.plan(plan);
  for (const t of result.transits) {
    group.addLayer(
      L.polyline([t.from, t.to], {
        color: "#ffffff",
        weight: faded ? 1.5 : 2,
        opacity: faded ? 0.55 : 0.9,
        dashArray: t.kind === "home" ? "6 6" : null,
        interactive: false,
      }),
    );
  }
  for (const item of result.items) {
    const isSelected = item.component.id === selectedId;
    const dim = selectedId !== null && !isSelected;
    const clickable = interactive || (Boolean(onSelect) && !isSelected);
    const layers = drawComponent(item, { faded, dim, arrows: editing && (selectedId === null || isSelected), interactive: clickable });
    for (const layer of layers) {
      if (onSelect && !isSelected) {
        layer.on("click", (event) => {
          L.DomEvent.stop(event);
          onSelect(item.component.id);
        });
      }
      group.addLayer(layer);
    }
    if (item.result && !faded && (item.component.type === "orbit" || item.result.legs.length <= MAX_LEGS)) {
      // El pin del componente abierto se arrastra: lo pone drawHandles.
      if (!(editing && isSelected)) group.addLayer(startPin(item));
      // Una órbita de vueltas completas termina donde empezó: basta con el pin.
      const closed = Geo.distance(item.result.path[0], item.result.path.at(-1)) < 5 && endAltitude(item.component) === item.component.altitude;
      if (!closed) group.addLayer(endMarker(item));
    }
  }
  return result;
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

function sortedPlans() {
  return Object.values(state.missions).sort((a, b) => b.updatedAt - a.updatedAt);
}

const planIcon = (plan) => (plan.components.length === 1 ? typeIcon(plan.components[0]) : "plan");

function renderList() {
  const plans = sortedPlans();
  const list = $("mission-list");
  list.replaceChildren();
  listLayer.clearLayers();
  $("list-empty").hidden = plans.length > 0;

  for (const plan of plans) {
    const card = document.createElement("div");
    card.className = "mission-card";
    card.innerHTML = `
      <div class="type"><svg><use href="#i-${planIcon(plan)}" /></svg></div>
      <div class="body"><div class="name"></div><div class="meta"></div><div class="when"></div></div>`;
    card.querySelector(".name").textContent = plan.name;
    card.querySelector(".meta").textContent = summary(plan);
    card.querySelector(".when").textContent = whenText(plan.updatedAt);
    card.addEventListener("click", () => openPlan(plan.id));
    list.append(card);

    const group = L.featureGroup().addTo(listLayer);
    drawPlan(plan, group, { faded: true, interactive: true });
    group.bindTooltip(plan.name, { sticky: true, className: "mission-tooltip", direction: "top" });
    group.on("click", () => openPlan(plan.id));
    group.on("mouseover", () => card.classList.add("hover"));
    group.on("mouseout", () => card.classList.remove("hover"));
    card.addEventListener("mouseenter", () => group.eachLayer((l) => l.setStyle?.({ weight: 4 })));
    card.addEventListener("mouseleave", () => group.eachLayer((l) => l.setStyle?.({ weight: 2.5 })));
  }
}

function fitAll() {
  const points = sortedPlans().flatMap(planPoints);
  if (points.length) fitTo(points, 17);
}

// ---------- Editor ----------

/** Abre un plan; con `componentId`, directo en ese componente. */
function openPlan(id, plan = null, componentId = null) {
  const source = plan ?? state.missions[id];
  if (!source) return;
  current = clone(source);
  undoStack = [];
  redoStack = [];
  $("list-view").hidden = true;
  $("edit-tools").hidden = false;
  map.removeLayer(listLayer);
  shapeLayer.addTo(map);
  handleLayer.addTo(map);
  map.doubleClickZoom.disable();
  showView(componentId);
  const points = planPoints(current);
  if (points.length) fitTo(points);
}

/** Muestra el plan (null) o uno de sus componentes. */
function showView(componentId) {
  document.activeElement?.blur?.();
  selectedId = current.components.some((c) => c.id === componentId) ? componentId : null;
  $("plan-view").hidden = selectedId !== null;
  $("component-view").hidden = selectedId === null;
  $("add-menu")?.remove();
  history.replaceState(null, "", selectedId ? `#m/${current.id}/${selectedId}` : `#m/${current.id}`);
  refresh();
  buildPanel();
}

function closeEditor() {
  if (!current) return;
  document.activeElement?.blur?.();
  // Una misión nueva sin área ni centro no se guarda.
  if (!hasGeometry(current) && !state.shas[current.id] && state.missions[current.id]) {
    delete state.missions[current.id];
    delete state.dirty[current.id];
    persist();
  }
  current = null;
  selectedId = null;
  planResult = null;
  shapeLayer.clearLayers();
  handleLayer.clearLayers();
  map.removeLayer(shapeLayer);
  map.removeLayer(handleLayer);
  listLayer.addTo(map);
  map.doubleClickZoom.enable();
  $("plan-view").hidden = true;
  $("component-view").hidden = true;
  $("list-view").hidden = false;
  $("edit-tools").hidden = true;
  $("map-hint").hidden = true;
  history.replaceState(null, "", location.pathname);
  renderList();
}

/** Guarda el plan abierto (en este navegador y, en un momento, en GitHub). */
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
  save();
  showView(selectedId);
}

/** Cambio en el mapa (esquinas, centro, despegue): se puede deshacer y redibuja todo. */
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

/** Redibuja la ruta y actualiza los números del panel. Sirve también mientras se arrastra. */
function redrawShapes() {
  shapeLayer.clearLayers();
  planResult = drawPlan(current, shapeLayer, { selectedId, editing: true, onSelect: (id) => showView(id) });
  renderStats();
  helpUpdaters.forEach((update) => update());
  $("tool-undo").disabled = undoStack.length === 0;
  $("tool-redo").disabled = redoStack.length === 0;
  const component = selected();
  $("tool-clear").disabled = !component || (component.type === "map" ? component.boundary.length === 0 : !component.center);
}

function distanceText(meters) {
  return meters >= 1000 ? `${num(meters / 1000, 2)} km` : `${num(meters)} m`;
}

function statsHtml(stats) {
  return stats.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
}

function renderStats() {
  const component = selected();
  if (!component) {
    const r = planResult;
    const n = current.components.length;
    const parts = [`${n} ${n === 1 ? "componente" : "componentes"}`];
    if (r.flown === 0) parts.push("sin área todavía");
    else parts.push(`${formatDuration(r.durationSeconds)} en total`);
    $("plan-summary").textContent = n === 0 ? "Sin componentes: añade un mapa o una órbita" : parts.join(" · ");
    $("plan-stats").innerHTML = statsHtml([
      ["Duración", r.flown ? formatDuration(r.durationSeconds) : "—"],
      ["Distancia", r.flown ? distanceText(r.lengthMeters) : "—"],
      ["Fotos", r.photoCount ? String(r.photoCount) : "—"],
    ]);
    return;
  }
  $("component-summary").textContent = componentSummary(component);
  const result = selectedItem()?.result;
  let stats;
  if (component.type === "map") {
    const info = result ?? MapPlanner.plan(component);
    stats = [
      ["Duración", result ? formatDuration(result.durationSeconds) : "—"],
      component.captureMode === "photo"
        ? ["Fotos", result ? String(result.photoCount) : "—"]
        : ["Captura", component.captureMode === "video" ? "Video" : "Nada"],
      ["Distancia", result ? distanceText(result.lengthMeters) : "—"],
      ["Área", info.areaHectares ? `${num(info.areaHectares, 2)} ha` : "—"],
      ["GSD", `${num(info.gsdCmPerPx, 2)} cm/px`],
      ["Líneas", result ? String(result.legs.length) : "—"],
    ];
  } else {
    stats = [
      ["Duración", result ? formatDuration(result.durationSeconds) : "—"],
      ["Distancia", result ? distanceText(result.lengthMeters) : "—"],
      ["Fotos", result?.photoCount ? String(result.photoCount) : "—"],
    ];
  }
  $("component-stats").innerHTML = statsHtml(stats);
}

function updateHint() {
  const hint = $("map-hint");
  const component = selected();
  if (!component) {
    hint.textContent = current.components.length
      ? "Haz clic en un componente para editarlo · arrastra la H morada para mover el despegue"
      : "Añade un mapa o una órbita a la misión";
  } else if (component.type === "map") {
    const n = component.boundary.length;
    hint.textContent =
      selectedItem()?.result?.legs.length > MAX_LEGS
        ? "El área es demasiado grande para un vuelo: acércate en el mapa y márcala de nuevo"
        : n === 0
          ? "Haz clic en el mapa para marcar las esquinas del área"
          : n < 3
            ? "Sigue marcando esquinas: hacen falta al menos 3"
            : "Arrastra el centro para mover el área · las esquinas para cambiarla · el + para agregar otra · el pin para empezar en otra esquina";
  } else {
    hint.textContent = component.center
      ? "Arrastra el centro para mover la órbita · el cuadrito para cambiar el radio · el pin para cambiar dónde empieza"
      : "Haz clic en el mapa para poner el centro de la órbita";
  }
  hint.hidden = false;
}

map.on("click", (event) => {
  const component = selected();
  if (!component) return;
  const point = toPoint(event.latlng);
  if (component.type === "map") editGeometry(() => (component.boundary = Geo.insertIntoPolygon(component.boundary, point)));
  else if (!component.center) editGeometry(() => (component.center = point));
});

// ---------- Puntos que se arrastran ----------

/** Cada punto arrastrable con la función que dice dónde va, para moverlos juntos mientras se arrastra otro. */
let handles = [];

function addHandle(marker, at) {
  handles.push({ marker, at });
  handleLayer.addLayer(marker);
}

function followHandles(dragged) {
  for (const { marker, at } of handles) {
    if (marker === dragged) continue;
    const point = at();
    if (point) marker.setLatLng(point);
  }
}

/** Conecta un punto arrastrable: guarda para deshacer al empezar, aplica `move` al moverlo y guarda al soltarlo. */
function draggable(marker, move, { follow = true, done } = {}) {
  marker.on("dragstart", () => remember());
  marker.on("drag", () => {
    move(toPoint(marker.getLatLng()));
    redrawShapes();
    if (follow) followHandles(marker);
  });
  marker.on("dragend", () => {
    save();
    refresh();
    done?.();
  });
}

function drawHandles() {
  handleLayer.clearLayers();
  handles = [];
  drawTakeoffHandle();
  const component = selected();
  if (component?.type === "map") drawAreaHandles(component);
  else if (component?.center) drawOrbitHandles(component);
}

/** La H morada: dónde despega el dron. Sin marcarla, va en el centro del primer componente. */
function drawTakeoffHandle() {
  const at = () => takeoffOf(current);
  if (!at()) return;
  const marker = L.marker(at(), {
    icon: pinIcon("takeoff draggable", "H", current.takeoff ? "Despegue" : "Despegue (auto)"),
    draggable: true,
    zIndexOffset: 1400,
    title: "Despegue: arrástralo a donde vas a despegar",
  });
  const wasAuto = !current.takeoff;
  draggable(marker, (point) => (current.takeoff = point), { done: () => wasAuto && !selectedId && buildPanel() });
  addHandle(marker, at);
}

function drawAreaHandles(component) {
  const count = component.boundary.length;
  const edgeCount = count >= 3 ? count : count - 1;
  const midpointOf = (i) => {
    const a = component.boundary[i];
    const b = component.boundary[(i + 1) % component.boundary.length];
    return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null;
  };

  // Un + a mitad de cada lado: al tocarlo o arrastrarlo se agrega una esquina.
  for (let i = 0; i < edgeCount; i++) {
    const marker = L.marker(midpointOf(i), {
      icon: divIcon("mid-handle", 16, "+"),
      draggable: true,
      zIndexOffset: 500,
      title: "Arrastra o toca para agregar una esquina",
    });
    let inserted = -1;
    marker.on("dragstart", () => {
      remember();
      inserted = i + 1;
      component.boundary.splice(inserted, 0, toPoint(marker.getLatLng()));
    });
    marker.on("drag", () => {
      component.boundary[inserted] = toPoint(marker.getLatLng());
      redrawShapes();
    });
    marker.on("dragend", () => {
      save();
      refresh();
    });
    marker.on("click", (event) => {
      L.DomEvent.stop(event);
      editGeometry(() => component.boundary.splice(i + 1, 0, midpointOf(i)));
    });
    addHandle(marker, () => midpointOf(i));
  }

  component.boundary.forEach((point, i) => {
    const marker = L.marker(point, { icon: divIcon("vertex-handle", 20), draggable: true, zIndexOffset: 1000, title: "Arrastra para mover · clic para quitar" });
    draggable(marker, (p) => (component.boundary[i] = p));
    const removeVertex = (event) => {
      L.DomEvent.stop(event);
      editGeometry(() => component.boundary.splice(i, 1));
    };
    marker.on("click", removeVertex);
    marker.on("contextmenu", removeVertex);
    addHandle(marker, () => component.boundary[i]);
  });

  // El círculo del centro mueve toda el área (y la esquina de inicio con ella).
  if (count >= 3) {
    const at = () => Geo.centroid(component.boundary);
    const marker = L.marker(at(), {
      icon: divIcon("move-handle", 32, '<svg><use href="#i-move" /></svg>'),
      draggable: true,
      zIndexOffset: 1100,
      title: "Arrastra para mover toda el área",
    });
    let from = null;
    let boundary = null;
    let start = null;
    marker.on("dragstart", () => {
      from = at();
      boundary = component.boundary;
      start = component.start;
    });
    const roundPoint = ([lat, lon]) => [round7(lat), round7(lon)];
    draggable(marker, (to) => {
      component.boundary = Geo.translate(boundary, from, to).map(roundPoint);
      if (start) component.start = roundPoint(Geo.translate([start], from, to)[0]);
    });
    addHandle(marker, at);
  }

  // El pin azul de inicio se arrastra a otra esquina para empezar por ahí.
  const item = selectedItem();
  if (item?.result && item.result.legs.length <= MAX_LEGS) {
    const marker = startPin(item, true);
    marker.options.title = "Arrastra a otra esquina para empezar por ahí";
    const wasAuto = component.start === null;
    draggable(marker, (point) => (component.start = point), { follow: false, done: () => wasAuto && buildPanel() });
    addHandle(marker, () => selectedItem()?.result?.path[0]);
  }
}

function drawOrbitHandles(component) {
  const effectiveBearing = () => selectedItem()?.result?.startBearing ?? 180;
  const onCircle = (bearing) => {
    const b = rad(bearing);
    return projection(component.center).toGeo({ x: component.radius * Math.sin(b), y: component.radius * Math.cos(b) });
  };

  const center = L.marker(component.center, {
    icon: divIcon("orbit-center", 34, '<svg><use href="#i-orbit" /></svg>'),
    draggable: true,
    zIndexOffset: 1000,
    title: "Arrastra para mover la órbita",
  });
  draggable(center, (point) => (component.center = point));
  addHandle(center, () => component.center);

  // El cuadrito, en el lado opuesto al inicio, cambia el radio.
  const radius = L.marker(onCircle(effectiveBearing() + 180), {
    icon: divIcon("radius-handle", 16),
    draggable: true,
    zIndexOffset: 1000,
    title: "Arrastra para cambiar el radio",
  });
  draggable(radius, (point) => {
    component.radius = Math.min(500, Math.max(5, Math.round(Geo.distance(component.center, point))));
    fieldSetters.radius?.(component.radius);
  });
  addHandle(radius, () => onCircle(effectiveBearing() + 180));

  // El pin azul se arrastra por el círculo para cambiar dónde empieza.
  const item = selectedItem();
  if (item?.result) {
    const marker = startPin(item, true);
    marker.options.title = "Arrastra por el círculo para cambiar dónde empieza";
    const wasAuto = component.startBearing === null;
    draggable(
      marker,
      (point) => {
        component.startBearing = Math.round(Geo.bearing(component.center, point)) % 360;
        fieldSetters.startBearing?.(component.startBearing);
      },
      { done: () => wasAuto && buildPanel() },
    );
    addHandle(marker, () => selectedItem()?.result?.start);
  }
}

// ---------- Panel ----------

const helpUpdaters = [];
const fieldSetters = {};
const fmt = (value, decimals) => value.toLocaleString(LOCALE, { maximumFractionDigits: decimals, useGrouping: false });
const parse = (text) => {
  const value = Number(String(text).trim().replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};

/** Qué muestra el panel ahora, para no conservar el desplazamiento al pasar a otro componente. */
let panelShown = null;

function buildPanel() {
  const container = selectedId ? $("component-params") : $("plan-body");
  const shown = `${current.id}/${selectedId}`;
  const scroll = shown === panelShown ? container.scrollTop : 0;
  panelShown = shown;
  container.replaceChildren();
  helpUpdaters.length = 0;
  for (const key of Object.keys(fieldSetters)) delete fieldSetters[key];
  const component = selected();
  if (component) {
    buildComponentHeader(component);
    if (component.type === "map") buildMapParams(container, component);
    else buildOrbitParams(container, component);
  } else {
    $("plan-name").value = current.name;
    buildPlanBody(container);
  }
  container.scrollTop = scroll;
  helpUpdaters.forEach((update) => update());
}

/** Texto de ayuda suelto dentro de una sección. */
function note(params, text) {
  const el = document.createElement("div");
  el.className = "section-note";
  el.textContent = text;
  params.append(el);
}

function section(params, title) {
  const el = document.createElement("div");
  el.className = "section-title";
  el.textContent = title;
  params.append(el);
}

/** Guarda un cambio de un parámetro de opciones; con `rebuild`, redibuja el panel (cambian los campos visibles). */
function setChoice(obj, key, value, { rebuild = false, onChange } = {}) {
  remember();
  obj[key] = value;
  onChange?.(value);
  save();
  redrawShapes();
  if (rebuild) buildPanel();
}

/**
 * Un parámetro numérico de `obj` (el componente abierto o el plan). Se aplica mientras se escribe
 * si está dentro de los límites; si no, se avisa en amarillo y al salir del campo se corrige.
 * Con `optional`, vacío vale null. Con `scale`, se muestra el valor guardado multiplicado (por
 * ejemplo m/s × 3,6 = km/h); `min` y `max` van en las unidades que se muestran.
 */
function numberParam(params, obj, { key, label, unit = "", min, max, step = 1, decimals = 0, scale = 1, slider = false, optional = false, placeholder = "", help }) {
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
    snapshot ??= { plan: clone(current), value: obj[key] };
  };
  const commit = () => {
    if (snapshot && snapshot.value !== obj[key]) remember(snapshot.plan);
    snapshot = null;
    save();
    redrawShapes();
  };
  const apply = (display) => {
    obj[key] = display === null ? null : display / scale;
    redrawShapes();
  };

  show(obj[key]);
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
    if (!snapshot) return;
    if (error) {
      const value = parse(input.value);
      const fixed = value === null ? obj[key] : Math.min(max, Math.max(min, value)) / scale;
      error = null;
      show(fixed);
      obj[key] = fixed;
    } else {
      show(obj[key]);
    }
    commit();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
    if (event.key === "Escape") {
      if (snapshot) obj[key] = snapshot.value;
      error = null;
      show(obj[key]);
      snapshot = null;
      redrawShapes();
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

function choiceParam(params, obj, { key, label, options, help, rebuild, onChange }) {
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
    button.classList.toggle("selected", obj[key] === value);
    button.addEventListener("click", () => {
      if (obj[key] === value) return;
      buttons.forEach((b) => b.classList.toggle("selected", b === button));
      setChoice(obj, key, value, { rebuild, onChange });
    });
    segmented.append(button);
    return button;
  });
  helpUpdaters.push(showHelp);
  params.append(el);
}

/** Una lista desplegable, para opciones largas. Con `unset`, la primera opción es "Sin cambiar" (null). */
function selectParam(params, obj, { key, label, options, unset = false, help, rebuild, onChange }) {
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
    option.selected = obj[key] === value;
    select.append(option);
  });
  el.querySelector(".select-box").classList.toggle("unset", obj[key] === null);
  select.addEventListener("change", () => {
    const value = all[Number(select.value)][0];
    el.querySelector(".select-box").classList.toggle("unset", value === null);
    setChoice(obj, key, value, { rebuild, onChange });
  });
  const showHelp = () => {
    const text = help?.() ?? "";
    helpEl.textContent = text;
    helpEl.hidden = !text;
  };
  helpUpdaters.push(showHelp);
  params.append(el);
}

/** Un interruptor de sí o no. */
function toggleParam(params, obj, { key, label, help }) {
  const el = document.createElement("label");
  el.className = "param toggle";
  el.innerHTML = `
    <span class="toggle-text"><span class="label"></span><span class="help"></span></span>
    <input type="checkbox" role="switch" />`;
  el.querySelector(".label").textContent = label;
  el.querySelector(".help").textContent = help ?? "";
  const input = el.querySelector("input");
  input.id = `param-${key}`;
  input.checked = Boolean(obj[key]);
  input.addEventListener("change", () => setChoice(obj, key, input.checked));
  params.append(el);
}

function buttonParam(params, label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button outline small wide param-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  params.append(button);
  return button;
}

// ---------- Panel del plan ----------

function buildPlanBody(body) {
  section(body, "COMPONENTES");
  if (current.components.length === 0) note(body, "La misión está vacía. Añade un mapa (un área para fotografiar) o una órbita (un círculo alrededor de algo).");
  current.components.forEach((component, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `component-card${component.enabled ? "" : " off"}`;
    card.innerHTML = `
      <span class="component-icon"><svg><use href="#i-${typeIcon(component)}" /></svg><span class="n">${index + 1}</span></span>
      <span class="body"><span class="name"></span><span class="meta"></span></span>
      <svg class="chevron"><use href="#i-chevron" /></svg>`;
    card.querySelector(".name").textContent = componentName(component);
    card.querySelector(".meta").textContent = componentSummary(component) + (component.enabled ? "" : " · no se vuela");
    card.addEventListener("click", () => showView(component.id));
    body.append(card);
  });

  const add = document.createElement("button");
  add.type = "button";
  add.id = "add-component";
  add.className = "button outline small add-button";
  add.innerHTML = '<svg><use href="#i-add" /></svg>Añadir';
  add.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleAddMenu(add);
  });
  body.append(add);

  section(body, "ESTIMADO");
  const estimate = document.createElement("div");
  estimate.className = "estimate";
  body.append(estimate);
  helpUpdaters.push(() => renderEstimate(estimate));

  section(body, "AL TERMINAR Y ENTRE COMPONENTES");
  choiceParam(body, current, {
    key: "finishAction",
    label: "Al terminar la misión",
    options: FINISH_ACTIONS,
    help: () =>
      ({
        HOVER: "Se queda en el aire donde terminó",
        GO_HOME: "Vuelve al despegue y aterriza",
        LAND: "Aterriza donde terminó",
      })[current.finishAction],
  });
  numberParam(body, current, {
    key: "transitSpeed",
    label: "Velocidad entre componentes",
    unit: "km/h",
    scale: KMH,
    min: 3,
    max: 54,
    step: 0.5,
    decimals: 1,
    help: () => "Al ir del despegue al primero, de uno al siguiente y al volver",
  });
  note(body, "La H morada es el despegue: arrástrala a donde vas a despegar. Cada componente empieza en el punto más cerca de donde viene el dron, salvo que muevas su pin.");
  if (current.takeoff) {
    buttonParam(body, "Despegue automático (junto al primer componente)", () => {
      editGeometry(() => (current.takeoff = null));
      buildPanel();
    });
  }
}

/** Tiempo de cada tramo del plan, como el "Mission Estimate" de Dronelink. */
function renderEstimate(el) {
  const rows = [];
  const row = (label, seconds, meters, kind = "") => rows.push({ label, seconds, meters, kind });
  for (const item of planResult.items) {
    if (!item.component.enabled || !item.result) continue;
    const name = `${item.number}. ${componentName(item.component)}`;
    if (item.approach) row(item.approach.kind === "takeoff" ? `Despegue → ${name}` : `→ ${name}`, item.approach.durationSeconds, item.approach.lengthMeters, "transit");
    row(name, item.result.durationSeconds, item.result.lengthMeters);
  }
  if (planResult.home) row("Regreso al despegue", planResult.home.durationSeconds, planResult.home.lengthMeters, "transit");
  if (planResult.landingSeconds) row("Aterrizaje", planResult.landingSeconds, 0, "transit");
  el.innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<div class="estimate-row ${r.kind}"><span class="label"></span><span class="dist">${r.meters ? distanceText(r.meters) : ""}</span><span class="time">${formatDuration(r.seconds)}</span></div>`,
        )
        .join("")
    : '<div class="section-note">Marca un área o una órbita para ver el tiempo de vuelo.</div>';
  el.querySelectorAll(".estimate-row .label").forEach((span, i) => (span.textContent = rows[i].label));
}

function toggleAddMenu(anchor) {
  if ($("add-menu")) {
    $("add-menu").remove();
    return;
  }
  const menu = document.createElement("div");
  menu.id = "add-menu";
  menu.className = "add-menu";
  const items = [
    ["grid", "Mapa", "Un área para fotografiar en líneas", () => addComponent(newMapComponent())],
    ["orbit", "Órbita", "Un círculo alrededor de un punto", () => addComponent(newOrbitComponent())],
    ["upload", "Mapa desde KML o KMZ", "Importa el área de un archivo", () => importKml("component")],
  ];
  for (const [icon, title, detail, action] of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `<svg><use href="#i-${icon}" /></svg><span><b></b><small></small></span>`;
    button.querySelector("b").textContent = title;
    button.querySelector("small").textContent = detail;
    button.addEventListener("click", () => {
      menu.remove();
      action();
    });
    menu.append(button);
  }
  anchor.after(menu);
}

document.addEventListener("click", (event) => {
  const menu = $("add-menu");
  if (menu && !menu.contains(event.target)) menu.remove();
});

function addComponent(component) {
  remember();
  current.components.push(component);
  save();
  showView(component.id);
  const points = componentPoints(component);
  if (points.length) fitTo(points);
}

// ---------- Panel del componente ----------

function buildComponentHeader(component) {
  const index = current.components.indexOf(component);
  const badge = $("component-badge");
  badge.querySelector("use").setAttribute("href", `#i-${typeIcon(component)}`);
  badge.querySelector(".n").textContent = String(index + 1);
  badge.classList.toggle("off", !component.enabled);
  $("component-name").value = component.name ?? "";
  $("component-name").placeholder = componentName({ ...component, name: null });
  $("comp-enabled").querySelector("use").setAttribute("href", component.enabled ? "#i-eye" : "#i-eye-off");
  $("comp-enabled").title = component.enabled ? "No volar este componente (se queda guardado)" : "Volver a volar este componente";
  $("comp-enabled").classList.toggle("active", !component.enabled);
  $("comp-off-note").hidden = component.enabled;
  $("comp-up").disabled = index === 0;
  $("comp-down").disabled = index === current.components.length - 1;
}

/** Cambia el plan desde los botones del componente y vuelve a dibujar todo. */
function changePlan(change, view = selectedId) {
  remember();
  change();
  save();
  showView(view);
}

$("comp-enabled").addEventListener("click", () => {
  const component = selected();
  if (component) changePlan(() => (component.enabled = !component.enabled));
});

function moveSelected(delta) {
  const index = current.components.findIndex((c) => c.id === selectedId);
  const to = index + delta;
  if (index < 0 || to < 0 || to >= current.components.length) return;
  changePlan(() => {
    const [component] = current.components.splice(index, 1);
    current.components.splice(to, 0, component);
  });
}

$("comp-up").addEventListener("click", () => moveSelected(-1));
$("comp-down").addEventListener("click", () => moveSelected(1));

$("comp-duplicate").addEventListener("click", () => {
  const component = selected();
  if (!component) return;
  const copy = copyComponent(component);
  if (copy.name) copy.name = `${copy.name} (copia)`;
  changePlan(() => current.components.splice(current.components.indexOf(component) + 1, 0, copy), copy.id);
  toast("Duplicado al lado: arrastra su centro para moverlo");
});

$("comp-delete").addEventListener("click", () => {
  const component = selected();
  if (!component || !confirm(`¿Quitar «${componentName(component)}» de la misión?`)) return;
  changePlan(() => current.components.splice(current.components.indexOf(component), 1), null);
});

$("component-name").addEventListener("input", (event) => {
  const component = selected();
  if (!component) return;
  component.name = event.target.value.trim() || null;
  save();
});
$("component-name").addEventListener("keydown", (event) => {
  if (event.key === "Enter") event.target.blur();
});
$("component-back").addEventListener("click", () => showView(null));
$("component-done").addEventListener("click", () => showView(null));

function buildMapParams(params, c) {
  const plan = () => selectedItem()?.result ?? MapPlanner.plan(c);
  const photos = c.captureMode === "photo";
  const byDistance = photos && c.capturePriority !== "time";

  section(params, "VUELO");
  numberParam(params, c, {
    key: "altitude",
    label: "Altura sobre el despegue",
    unit: "m",
    min: 5,
    max: 120,
    slider: true,
    help: () => {
      const [w, h] = MapPlanner.footprint(cameraFor(c), c.altitude);
      return `GSD ${num(plan().gsdCmPerPx, 2)} cm/px · cada foto cubre ${num(w)} × ${num(h)} m`;
    },
  });
  numberParam(params, c, {
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
      const limited = speed < c.maxSpeed - 0.05;
      return `Volará a ${num(speed * KMH, 1)} km/h${limited ? ", limitada por el tiempo entre fotos" : ""}`;
    },
  });

  section(params, "CAPTURA");
  choiceParam(params, c, { key: "captureMode", label: "Durante las líneas", options: CAPTURE_MODES, rebuild: true });
  if (photos) {
    choiceParam(params, c, {
      key: "photoSize",
      label: "Tamaño de foto",
      options: PHOTO_SIZES,
      help: () => (c.photoSize === "12mp" ? "Menos detalle, pero guarda cada foto en unos 2 s" : "Más detalle; guarda cada foto en unos 5 s"),
    });
    choiceParam(params, c, {
      key: "capturePriority",
      label: "Tomar las fotos por",
      options: CAPTURE_PRIORITIES,
      rebuild: true,
      help: () =>
        c.capturePriority === "time"
          ? "Una foto cada cierto tiempo a velocidad fija; arranca antes del área para tomar velocidad"
          : "La foto se toma al llegar a cada punto: traslape exacto aunque haya viento",
    });
    numberParam(params, c, {
      key: "minPhotoInterval",
      label: c.capturePriority === "time" ? "Foto cada" : "Tiempo mínimo entre fotos",
      unit: "s",
      min: 1,
      max: 10,
      step: 0.5,
      decimals: 1,
      help: () => "Lo más rápido que la cámara guarda cada foto",
    });
    if (byDistance) {
      choiceParam(params, c, {
        key: "photoType",
        label: "Tipo de foto",
        options: PHOTO_TYPES,
        help: () => (c.photoType === "single" ? "" : "Varias fotos con distinta exposición en cada punto, para HDR"),
      });
      numberParam(params, c, {
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
          c.captureSpeed === null
            ? "Déjalo vacío para no frenar; 0 = se detiene en cada foto"
            : c.captureSpeed === 0
              ? "Se detiene en cada foto: más nítidas, vuelo más largo"
              : "Frena en cada foto: más nítidas, vuelo más largo",
      });
      toggleParam(params, c, { key: "verifyFileCreated", label: "Comprobar cada foto", help: "Si una foto no se guardó, la repite antes de seguir" });
    }
  }

  section(params, "ESPACIADO");
  choiceParam(params, c, {
    key: "spacing",
    label: "Separar por",
    options: SPACING_MODES,
    rebuild: true,
    onChange: (value) => {
      if (value !== "distance") return;
      // Empieza con la separación que daba el traslape.
      const before = MapPlanner.plan({ ...c, spacing: "overlap" });
      c.frontDistance = Math.round(before.photoSpacing * 10) / 10;
      c.sideDistance = Math.round(before.lineSpacing * 10) / 10;
    },
  });
  if (c.spacing === "distance") {
    numberParam(params, c, { key: "frontDistance", label: "Entre fotos", unit: "m", min: 0.5, max: 200, step: 0.5, decimals: 1 });
    numberParam(params, c, { key: "sideDistance", label: "Entre líneas", unit: "m", min: 1, max: 200, step: 0.5, decimals: 1 });
  } else {
    numberParam(params, c, {
      key: "frontOverlap",
      label: "Traslape frontal",
      unit: "%",
      min: 10,
      max: 95,
      slider: true,
      help: () => `Una foto cada ${num(plan().photoSpacing, 1)} m`,
    });
    numberParam(params, c, {
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
  choiceParam(params, c, { key: "pattern", label: "Patrón", options: MAP_PATTERNS });
  const direction = numberParam(params, c, {
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
    c.direction = value;
    direction.show(value);
    save();
    redrawShapes();
  };
  buttonParam(params, "Alinear con el lado más largo", () => {
    const best = MapPlanner.longestEdgeDirection(c.boundary);
    if (best === null) toast("Primero marca el área en el mapa");
    else setDirection(best);
  });
  buttonParam(params, "Girar 90°", () => setDirection((Math.round(c.direction) + 90) % 360));
  if (c.start) {
    note(params, "Empieza en la esquina donde pusiste el pin azul.");
    buttonParam(params, "Empezar en la esquina más cercana (automático)", () => {
      editGeometry(() => (c.start = null));
      buildPanel();
    });
  } else {
    note(params, "Empieza en la esquina más cerca de donde viene el dron. Para escoger otra, arrastra el pin azul hasta ella.");
  }

  section(params, "RUMBO Y GIMBAL");
  choiceParam(params, c, {
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
      })[c.heading],
  });
  if (c.heading === "custom") {
    numberParam(params, c, { key: "headingAngle", label: "Ángulo", unit: "°", min: 0, max: 359, slider: true });
    choiceParam(params, c, {
      key: "headingReference",
      label: "Medido",
      options: HEADING_REFERENCES,
      help: () => (c.headingReference === "north" ? "Mismo rumbo en todas las líneas (0° = norte)" : "Gira con cada línea (0° = adelante)"),
    });
  }
  numberParam(params, c, {
    key: "gimbalPitch",
    label: "Inclinación del gimbal",
    unit: "°",
    min: -90,
    max: 0,
    slider: true,
    help: () => (c.gimbalPitch <= -89 ? "-90° = mirando hacia abajo" : "Fotos oblicuas, útiles para fachadas y modelos 3D"),
  });

  if (c.captureMode !== "none") cameraSettingsParams(params, c, { photo: photos });

  section(params, "SEGURIDAD");
  toggleParam(params, c, { key: "highWindTolerance", label: "Tolerancia a viento fuerte", help: "Corrige más fuerte cuando el viento lo saca de la línea" });
}

function buildOrbitParams(params, c) {
  section(params, "ÓRBITA");
  numberParam(params, c, { key: "radius", label: "Radio", unit: "m", min: 5, max: 500, slider: true });
  numberParam(params, c, { key: "altitude", label: "Altura sobre el despegue", unit: "m", min: 5, max: 120, slider: true });
  choiceParam(params, c, {
    key: "clockwise",
    label: "Sentido",
    options: [
      [true, "Horario"],
      [false, "Antihorario"],
    ],
  });
  numberParam(params, c, {
    key: "rotations",
    label: "Vueltas",
    min: 0.05,
    max: 10,
    step: 0.05,
    decimals: 2,
    help: () => `Recorre ${num(c.rotations * 360)}° alrededor del centro`,
  });
  numberParam(params, c, {
    key: "speed",
    label: "Velocidad",
    unit: "km/h",
    scale: KMH,
    min: 3,
    max: 43,
    step: 0.5,
    decimals: 1,
    help: () => `${num(OrbitPlanner.angularSpeed(c.radius, c.speed), 1)}° por segundo alrededor del centro`,
  });
  numberParam(params, c, {
    key: "startBearing",
    label: "Empieza en el rumbo",
    unit: "°",
    min: 0,
    max: 359,
    optional: true,
    placeholder: "Automático",
    help: () =>
      c.startBearing === null
        ? "Vacío: en el punto del círculo más cerca de donde viene el dron. También puedes arrastrar el pin azul."
        : "0° = al norte del centro · 90° = al este. Bórralo para que sea automático.",
  });

  section(params, "ESPIRAL (OPCIONAL)");
  numberParam(params, c, { key: "finalAltitude", label: "Altura final", unit: "m", min: 5, max: 120, optional: true, placeholder: "Igual" });
  numberParam(params, c, { key: "finalRadius", label: "Radio final", unit: "m", min: 5, max: 500, optional: true, placeholder: "Igual" });

  section(params, "RUMBO Y GIMBAL");
  selectParam(params, c, { key: "heading", label: "El dron mira", options: ORBIT_HEADINGS, rebuild: true });
  if (c.heading === "custom") {
    numberParam(params, c, { key: "headingAngle", label: "Rumbo", unit: "°", min: 0, max: 359, slider: true, help: () => "0° = norte · 90° = este" });
  }
  numberParam(params, c, {
    key: "poiAltitude",
    label: "Altura del objetivo",
    unit: "m",
    min: -50,
    max: 120,
    optional: true,
    placeholder: "Sin objetivo",
    help: () =>
      c.poiAltitude === null ? "Con un objetivo en el centro, el gimbal lo sigue solo" : `El gimbal apunta al objetivo: ${num(OrbitPlanner.gimbalPitch(c))}°`,
  });
  numberParam(params, c, {
    key: "gimbalPitch",
    label: "Inclinación del gimbal",
    unit: "°",
    min: -90,
    max: 30,
    slider: true,
    help: () => (c.poiAltitude === null ? "0° = al horizonte · -90° = hacia abajo" : "No se usa: el gimbal apunta al objetivo"),
  });

  section(params, "CAPTURA");
  choiceParam(params, c, { key: "captureMode", label: "Durante la órbita", options: CAPTURE_MODES, rebuild: true });
  if (c.captureMode === "photo") {
    numberParam(params, c, {
      key: "photoInterval",
      label: "Foto cada",
      unit: "s",
      min: 1,
      max: 60,
      step: 0.5,
      decimals: 1,
      help: () => `Unas ${selectedItem()?.result?.photoCount ?? 0} fotos`,
    });
    choiceParam(params, c, { key: "photoSize", label: "Tamaño de foto", options: PHOTO_SIZES });
  }
  if (c.captureMode !== "none") cameraSettingsParams(params, c, { photo: c.captureMode === "photo" });
}

/** Ajustes que el componente pone en la cámara al empezar. "Sin cambiar" deja lo que tenga la cámara. */
function cameraSettingsParams(params, c, { photo }) {
  section(params, "AJUSTES DE CÁMARA");
  note(params, "“Sin cambiar” deja el ajuste que ya tenga la cámara.");
  if (photo) {
    selectParam(params, c, { key: "photoFormat", label: "Formato", options: PHOTO_FORMATS, unset: true });
    selectParam(params, c, { key: "photoRatio", label: "Relación de aspecto", options: PHOTO_RATIOS, unset: true });
  } else {
    selectParam(params, c, { key: "videoResolution", label: "Resolución", options: VIDEO_RESOLUTIONS, unset: true });
    selectParam(params, c, { key: "frameRate", label: "Cuadros por segundo", options: FRAME_RATES, unset: true });
    selectParam(params, c, { key: "colorProfile", label: "Perfil de color", options: COLOR_PROFILES, unset: true });
  }
  selectParam(params, c, { key: "exposureMode", label: "Exposición", options: EXPOSURE_MODES, unset: true, rebuild: true });
  if (c.exposureMode === "auto") {
    selectParam(params, c, { key: "ev", label: "Compensación (EV)", options: EV_VALUES, unset: true });
  } else if (c.exposureMode === "manual") {
    selectParam(params, c, { key: "iso", label: "ISO", options: ISO_VALUES, unset: true });
    selectParam(params, c, { key: "shutter", label: "Obturador", options: SHUTTER_VALUES, unset: true });
  }
  selectParam(params, c, {
    key: "whiteBalance",
    label: "Balance de blancos",
    options: WHITE_BALANCES,
    unset: true,
    rebuild: true,
    onChange: (value) => {
      if (value === "custom" && c.whiteBalanceKelvin === null) c.whiteBalanceKelvin = 5500;
    },
  });
  if (c.whiteBalance === "custom") {
    numberParam(params, c, { key: "whiteBalanceKelvin", label: "Temperatura", unit: "K", min: 2000, max: 10000, step: 100, slider: true });
  }
  selectParam(params, c, {
    key: "focusMode",
    label: "Enfoque",
    options: FOCUS_MODES,
    unset: true,
    help: () => (c.focusMode === "infinity" ? "Enfoque fijo al infinito: bueno para mapas a más de 10 m" : ""),
  });
}

// ---------- Crear, importar y borrar ----------

function nextName(type) {
  const base = type === "map" ? "Mapa" : "Órbita";
  const count = Object.values(state.missions).filter((m) => m.components[0]?.type === type).length;
  return `${base} ${count + 1}`;
}

$("new-map").addEventListener("click", () => {
  const component = newMapComponent();
  openPlan(null, newPlan(nextName("map"), [component]), component.id);
});

$("new-orbit").addEventListener("click", () => {
  const component = newOrbitComponent();
  openPlan(null, newPlan(nextName("orbit"), [component]), component.id);
});

/** Dónde va el área del próximo KML: una misión nueva ("plan") o un componente del plan abierto. */
let kmlTarget = "plan";

function importKml(target) {
  kmlTarget = target;
  $("kml-file").click();
}

$("import-kml").addEventListener("click", () => importKml("plan"));
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
    const component = newMapComponent(result.points);
    component.direction = MapPlanner.longestEdgeDirection(component.boundary) ?? 0;
    if (kmlTarget === "component" && current) {
      addComponent(component);
    } else {
      const plan = newPlan(result.name || file.name.replace(/\.km[lz]$/i, ""), [component]);
      state.missions[plan.id] = plan;
      state.dirty[plan.id] = true;
      persist();
      scheduleSync();
      openPlan(plan.id, null, component.id);
    }
    toast(`Área importada: ${component.boundary.length} esquinas`);
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

$("plan-delete").addEventListener("click", () => {
  if (!current || !confirm(`¿Borrar «${current.name}»? También se borra del teléfono.`)) return;
  const id = current.id;
  if (state.shas[id]) state.deleted[id] = current.name;
  delete state.missions[id];
  delete state.dirty[id];
  persist();
  current = { ...current, components: [] }; // Para que closeEditor no la vuelva a guardar.
  closeEditor();
  scheduleSync();
});

$("plan-name").addEventListener("input", (event) => {
  const name = event.target.value.trim();
  if (!current || !name) return;
  current.name = name;
  save();
});
$("plan-name").addEventListener("keydown", (event) => {
  if (event.key === "Enter") event.target.blur();
});
$("plan-back").addEventListener("click", closeEditor);
$("plan-done").addEventListener("click", closeEditor);

// ---------- Herramientas del mapa ----------

$("tool-undo").addEventListener("click", undo);
$("tool-redo").addEventListener("click", redo);
$("tool-clear").addEventListener("click", () => {
  const component = selected();
  if (!component) return;
  editGeometry(() => {
    if (component.type === "map") {
      component.boundary = [];
      component.start = null;
    } else {
      component.center = null;
    }
  });
});
$("tool-fit").addEventListener("click", () => {
  if (!current) return fitAll();
  const component = selected();
  fitTo(component ? componentPoints(component) : planPoints(current));
});
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
  } else if (event.key === "Escape" && $("add-menu")) {
    $("add-menu").remove();
  } else if (event.key === "Escape" && !typing && current && !$("sync-dialog").open) {
    if (selectedId) showView(null);
    else closeEditor();
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
        showView(selectedId);
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
  updateQrButton();
  dialog.showModal();
});

// ---------- QR del token, para pasarlo al teléfono sin escribirlo ----------

let qrLibrary = null;

/** Carga el generador de QR solo cuando hace falta. */
function loadQrLibrary() {
  qrLibrary ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "vendor/qrcode.js?v=1.4.4";
    script.onload = () => resolve(window.qrcode);
    script.onerror = () => {
      qrLibrary = null;
      script.remove();
      reject(new Error("No se pudo cargar el generador de QR. Revisa la conexión."));
    };
    document.head.append(script);
  });
  return qrLibrary;
}

/** El texto como QR en SVG, con fondo blanco y margen para que la cámara lo lea bien. */
function qrSvg(qrcode, text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const margin = 4;
  const size = count + margin * 2;
  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR del token">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
}

function hideQr() {
  $("token-qr").hidden = true;
  $("token-qr-code").innerHTML = "";
  $("token-qr-button").querySelector("span").textContent = "Mostrar QR para el teléfono";
}

function updateQrButton() {
  $("token-qr-button").hidden = !$("token-input").value.trim();
  hideQr();
}

$("token-input").addEventListener("input", updateQrButton);
dialog.addEventListener("close", hideQr);
$("token-qr-button").addEventListener("click", async () => {
  if (!$("token-qr").hidden) return hideQr();
  const text = $("token-input").value.trim();
  if (!text) return;
  try {
    $("token-qr-code").innerHTML = qrSvg(await loadQrLibrary(), text);
    $("token-qr").hidden = false;
    $("token-qr").scrollIntoView({ block: "nearest" });
    $("token-qr-button").querySelector("span").textContent = "Ocultar QR";
    $("sync-error").hidden = true;
  } catch (error) {
    $("sync-error").textContent = error.message;
    $("sync-error").hidden = false;
  }
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
const [, fromHash, componentFromHash] = location.hash.match(/^#m\/([^/]+)(?:\/(.+))?$/) ?? [];
map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
if (fromHash && state.missions[fromHash]) openPlan(fromHash, null, componentFromHash);
else if (Object.keys(state.missions).length) fitAll();
if (token) runSync();
else setChip("off", "Conectar teléfono");

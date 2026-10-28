// Planificador de misiones para el DJI Mini 4 Pro: la versión de PC del editor de la app Mini4Pro.
// Una misión es un plan con componentes en fila (mapas, corredores, órbitas, waypoints, fotos y panorámicas),
// como en Dronelink. Se guardan en este navegador y, si hay token, en GitHub para que las lea el teléfono.
import {
  CAPTURE_MODES,
  CAPTURE_PRIORITIES,
  COLOR_PROFILES,
  COMMAND_TYPES,
  EV_VALUES,
  EXPOSURE_MODES,
  FACADE_FACES,
  FACADE_PATTERNS,
  FACADE_SIDES,
  FINISH_ACTIONS,
  FOCUS_MODES,
  FRAME_RATES,
  HEADING_REFERENCES,
  ISO_VALUES,
  MAP_HEADINGS,
  MAP_PATTERNS,
  ORBIT_HEADINGS,
  PANO_DESCRIPTIONS,
  PANO_TYPES,
  PHOTO_FORMATS,
  PHOTO_RATIOS,
  PHOTO_SIZES,
  PHOTO_TYPES,
  SHUTTER_VALUES,
  SPACING_MODES,
  VIDEO_RESOLUTIONS,
  WAYPOINT_ACTIONS,
  WHITE_BALANCES,
  ZONE_SHAPES,
  CorridorPlanner,
  FacadePlanner,
  Geo,
  LENS_DEGREES,
  LOCALE,
  MapPlanner,
  OrbitPlanner,
  PanoPlan,
  PlanPlanner,
  ZonePlanner,
  anchorOf,
  cameraFor,
  commandAltitudes,
  commandsCaptureMode,
  compass,
  componentName,
  componentSummary,
  copyComponent,
  endAltitude,
  formatDuration,
  hasGeometry,
  isKnown,
  newCommand,
  newCommandsComponent,
  newCorridorComponent,
  newFacadeComponent,
  newMapComponent,
  newOrbitComponent,
  newPanoComponent,
  newPhotoComponent,
  newPlan,
  newWaypoint,
  newWaypointsComponent,
  newZoneComponent,
  normalizePlan,
  num,
  importKml as readKmlText,
  FlightPreview,
  exportKml,
  planPoints,
  componentPoints,
  projection,
  startAltitude,
  summary,
  takeoffOf,
  transitPath,
  typeName,
  waypointHeading,
  zoneHeights,
  TerrainFollow,
} from "./planner.js?v=20261029d";
import { GitHubSync, TOKEN_HELP_URL, syncAll } from "./sync.js?v=20261029d";
import { ensureTerrain, terrain, terrainLoading } from "./terrain.js?v=20261029d";

const $ = (id) => document.getElementById(id);
const STATE_KEY = "mini4pro.state.v1";
const TOKEN_KEY = "mini4pro.githubToken";
const LABELS_KEY = "mini4pro.labels";
const BASE_KEY = "mini4pro.baseLayer";
const DEFAULT_VIEW = { center: [18.2, -66.45], zoom: 9 };
const ACCENT = "#2f9bff";
/** Las zonas restringidas y lo que entra en ellas. */
const DANGER = "#ff453a";
/** Más líneas que esto es un área demasiado grande para un vuelo; no se dibuja la ruta. */
const MAX_LEGS = 400;
/** Las velocidades se guardan en m/s y se muestran en km/h, como en Dronelink. */
const KMH = 3.6;
/** Largo en pantalla del abanico de la cámara del punto abierto, y distancia de su flecha. */
const CONE_PX = 60;

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
/** Waypoint abierto del componente abierto; null = la lista de puntos. */
let selectedPoint = null;
/** Última ruta calculada del plan abierto (PlanPlanner.plan). */
let planResult = null;
/** Lo que de esa ruta entra en las zonas restringidas (ZonePlanner.violations). */
let zoneViolations = [];
let undoStack = [];
let redoStack = [];
const clone = (value) => structuredClone(value);
const round7 = (x) => Math.round(x * 1e7) / 1e7;
const toPoint = (latlng) => [round7(latlng.lat), round7(latlng.lng)];
const rad = (d) => (d * Math.PI) / 180;

const selected = () => current?.components.find((c) => c.id === selectedId) ?? null;
const selectedItem = () => planResult?.items.find((item) => item.component.id === selectedId) ?? null;
const TYPE_ICONS = {
  map: "grid",
  corridor: "corridor",
  orbit: "orbit",
  waypoints: "waypoints",
  photo: "camera",
  pano: "pano",
  facade: "facade",
  commands: "commands",
  zone: "zone",
};
const COMMAND_ICONS = { wait: "pause", photo: "camera", videoStart: "video", videoStop: "stop", gimbal: "down", heading: "heading", altitude: "altitude" };
const COMMAND_DETAILS = {
  wait: "Se queda quieto unos segundos",
  photo: "Una foto hacia donde mira",
  videoStart: "Empieza a grabar video",
  videoStop: "Deja de grabar",
  gimbal: "Sube o baja la cámara",
  heading: "Gira el dron hacia un rumbo",
  altitude: "Sube o baja sin moverse",
};
const typeIcon = (component) => (component.type === "facade" && component.face !== "line" ? "inspection" : TYPE_ICONS[component.type] ?? "plan");
const isPointType = (component) => component?.type === "photo" || component?.type === "pano";

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
// Lo que ve la cámara va debajo de las rutas.
map.createPane("cones").style.zIndex = 390;
map.getPane("cones").style.pointerEvents = "none";

const listLayer = L.layerGroup().addTo(map);
const shapeLayer = L.layerGroup();
const handleLayer = L.layerGroup();

/** Espacio que tapa el panel, para centrar la misión en la parte visible del mapa. */
function fitPadding() {
  const padding =
    window.innerWidth <= 760
      ? // En el teléfono la vista previa esconde el panel.
        { paddingTopLeft: [24, 72], paddingBottomRight: [24, document.body.classList.contains("previewing") ? 24 : window.innerHeight * 0.52 + 32] }
      : { paddingTopLeft: [$("panel").offsetWidth + 60, 80], paddingBottomRight: [80, 60] };
  // Con la vista previa abierta, tampoco debajo de su barra.
  const bar = $("preview-bar");
  if (!bar.hidden) padding.paddingBottomRight[1] = Math.max(padding.paddingBottomRight[1], window.innerHeight - bar.getBoundingClientRect().top + 24);
  return padding;
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
    icon: pinIcon(`start${off}${draggable ? " draggable" : ""}`, String(item.number), altitudeText(startAltitude(item.component))),
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

/**
 * Abanico de lo que ve la cámara desde `at` hacia `heading` (0 = norte), de `span`° (360 = un
 * círculo) y `radius` px, del mismo tamaño con cualquier acercamiento.
 */
function viewCone(at, heading, span, radius, dim) {
  const r = radius - 1;
  let shape;
  if (span >= 359) {
    shape = `<circle cx="${radius}" cy="${radius}" r="${r}" />`;
  } else {
    const end = (bearing) => [radius + r * Math.sin(rad(bearing)), radius - r * Math.cos(rad(bearing))].map((v) => v.toFixed(1)).join(",");
    shape = `<path d="M${radius},${radius} L${end(heading - span / 2)} A${r},${r} 0 ${span > 180 ? 1 : 0} 1 ${end(heading + span / 2)} Z" />`;
  }
  const size = radius * 2;
  return L.marker(at, {
    icon: L.divIcon({
      className: "",
      html: `<svg class="view-cone${dim ? " dim" : ""}" style="width: ${size}px; height: ${size}px" viewBox="0 0 ${size} ${size}">${shape}</svg>`,
      iconSize: [size, size],
      iconAnchor: [radius, radius],
    }),
    pane: "cones",
    interactive: false,
    keyboard: false,
  });
}

/** Puntito de un waypoint o del punto de una foto, para tocarlo desde el plan o verlo en la lista. */
function dot(at, color, interactive, off) {
  return L.circleMarker(at, { radius: 4.5, color: "#fff", weight: 2, fillColor: off ? "#a7b0b8" : color, fillOpacity: 1, interactive });
}

/**
 * Área y ruta de un componente. Uno apagado (que no se vuela) va gris y punteado. Con `editing`
 * (el componente abierto) no lleva lo que el editor pone encima para arrastrarlo, y `focusPoint`
 * es el waypoint abierto, con su abanico grande.
 */
function drawComponent({ component, result }, { faded, dim, arrows, interactive, editing = false, focusPoint = null }) {
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
  } else if (component.type === "corridor") {
    const outline = CorridorPlanner.outline(component);
    if (outline.length >= 3) {
      layers.push(
        L.polygon(outline, {
          color: "#ffffff",
          weight: dim ? 1.5 : 2.5,
          opacity: faded || dim ? 0.7 : 1,
          fillColor: "#ffffff",
          fillOpacity: faded || dim ? 0.08 : 0.16,
          interactive,
        }),
      );
    }
    // La línea del centro, punteada, para ver lo que se dibujó.
    if (component.path.length >= 2 && !faded) {
      layers.push(L.polyline(component.path, { color: "#ffffff", weight: 1.5, opacity: dim ? 0.6 : 0.9, dashArray: "5 5", interactive }));
    }
    if (result) {
      layers.push(L.polyline(result.path, route));
      if (arrows) {
        for (const pass of result.passes) {
          pass.slice(1).forEach((to, i) => {
            const from = pass[i];
            if (Geo.distance(from, to) > 15) layers.push(arrow([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], Geo.bearing(from, to)));
          });
        }
      }
    }
  } else if (component.type === "orbit" && result) {
    layers.push(L.polyline(result.path, route));
    if (arrows) {
      const step = Math.max(1, Math.round(result.path.length / (8 * component.rotations)));
      for (let i = step; i < result.path.length - 1; i += step) layers.push(arrow(result.path[i], Geo.bearing(result.path[i], result.path[i + 1])));
    }
    if (faded || dim) layers.push(L.circleMarker(component.center, { radius: 4, color: "#fff", weight: 2, fillColor: "#3ddc84", fillOpacity: 1, interactive }));
  } else if (component.type === "waypoints" && result) {
    if (!faded) {
      // Lo que ve la cámara en los puntos con foto o con rumbo propio, y en el abierto, más grande.
      component.points.forEach((point, i) => {
        const open = editing && i === focusPoint;
        if (open || point.action === "photo" || (point.heading !== null && point.heading !== undefined)) {
          layers.push(viewCone(point.position, waypointHeading(component, i), LENS_DEGREES, open ? CONE_PX : 24, dim));
        }
      });
    }
    layers.push(L.polyline(result.path, route));
    if (arrows) {
      result.path.slice(1).forEach((to, i) => {
        const from = result.path[i];
        if (Geo.distance(from, to) > 8) layers.push(arrow([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], Geo.bearing(from, to)));
      });
    }
    if (!editing) result.path.forEach((at) => layers.push(dot(at, ACCENT, interactive, off)));
  } else if (component.type === "facade") {
    // La cara: una pared gruesa (un lado) o la planta de la estructura.
    const shape = FacadePlanner.points(component);
    const outline = { color: "#ffffff", opacity: faded || dim ? 0.7 : 1, interactive };
    if (component.face === "line" && shape.length >= 2) {
      layers.push(L.polyline(shape, { ...outline, weight: dim ? 3 : 5, lineCap: "square", lineJoin: "miter" }));
    } else if (component.face !== "line" && shape.length >= 2) {
      layers.push(L.polygon(shape, { ...outline, weight: dim ? 1.5 : 2.5, fillColor: "#ffffff", fillOpacity: faded || dim ? 0.08 : 0.16 }));
    }
    if (result) {
      layers.push(L.polyline(result.path, route));
      // Hacia dónde mira la cámara en la primera parada.
      if (editing) layers.push(viewCone(result.stations[0].position, result.stations[0].heading, LENS_DEGREES, 30, dim));
      // Las columnas: donde se detiene a tomar las fotos.
      if (!faded) {
        const seen = new Set();
        for (const { position } of result.stations) {
          const key = position.join();
          if (!seen.has(key)) layers.push(dot(position, ACCENT, interactive, off));
          seen.add(key);
        }
      }
    }
  } else if (component.type === "zone") {
    // En rojo, por debajo de todo; apagada, punteada.
    const outline = ZonePlanner.outline(component);
    const zone = { color: DANGER, weight: dim ? 1.5 : 2.5, opacity: faded || dim ? 0.7 : 1, dashArray: off ? "4 7" : null, interactive };
    if (outline.length >= 3) layers.push(L.polygon(outline, { ...zone, fillColor: DANGER, fillOpacity: off ? 0.06 : faded || dim ? 0.14 : 0.24 }));
    else if (outline.length === 2) layers.push(L.polyline(outline, zone));
  } else if (component.type === "commands" && component.position) {
    if (!editing) layers.push(dot(component.position, "#12b76a", interactive, off));
  } else if (isPointType(component) && component.position) {
    const span = component.type === "pano" ? PanoPlan.coverage(component.panoType) : LENS_DEGREES;
    // Más largo que el pin del componente, para que se vea por debajo de él.
    layers.push(viewCone(component.position, component.heading, span, editing ? CONE_PX : faded ? 18 : 34, dim || faded));
    if (!editing) layers.push(dot(component.position, "#12b76a", interactive, off));
  }
  return layers;
}

/**
 * Dibuja un plan: cada componente, los tránsitos entre ellos en blanco (despegue → componentes →
 * regreso), un pin con el número y la altura donde empieza cada uno y un punto rojo donde termina.
 * En el editor, el componente abierto va resaltado y los demás se pueden tocar para abrirlos.
 */
function drawPlan(plan, group, { faded = false, interactive = false, selectedId = null, editing = false, focusPoint = null, onSelect = null } = {}) {
  const result = PlanPlanner.plan(plan);
  const isZone = (item) => item.component.type === "zone";
  // Las zonas van debajo de los tránsitos, que pueden pasar rozándolas.
  result.items.filter(isZone).forEach(drawItem);
  for (const t of result.transits) {
    group.addLayer(
      L.polyline(transitPath(t), {
        color: "#ffffff",
        weight: faded ? 1.5 : 2,
        opacity: faded ? 0.55 : 0.9,
        dashArray: t.kind === "home" ? "6 6" : null,
        lineJoin: "round",
        interactive: false,
      }),
    );
  }
  result.items.filter((item) => !isZone(item)).forEach(drawItem);
  return result;

  function drawItem(item) {
    const isSelected = item.component.id === selectedId;
    const dim = selectedId !== null && !isSelected;
    const clickable = interactive || (Boolean(onSelect) && !isSelected);
    const layers = drawComponent(item, {
      faded,
      dim,
      arrows: editing && (selectedId === null || isSelected),
      interactive: clickable,
      editing: editing && isSelected,
      focusPoint: isSelected ? focusPoint : null,
    });
    for (const layer of layers) {
      if (onSelect && !isSelected) {
        layer.on("click", (event) => {
          L.DomEvent.stop(event);
          onSelect(item.component.id);
        });
      }
      group.addLayer(layer);
    }
    if (item.result && !faded && !(item.result.legs?.length > MAX_LEGS)) {
      // El pin del componente abierto se arrastra: lo pone drawHandles. Unos comandos sin punto no
      // tienen qué arrastrar: el pin dice dónde se hacen.
      const floating = item.component.type === "commands" && !item.component.position;
      if (!(editing && isSelected) || floating) group.addLayer(startPin(item));
      // Una órbita de vueltas completas termina donde empezó: basta con el pin.
      const closed = Geo.distance(item.result.path[0], item.result.path.at(-1)) < 5 && endAltitude(item.component) === startAltitude(item.component);
      // En los waypoints abiertos, el último punto ya dice su altura.
      const editingPoints = editing && isSelected && item.component.type === "waypoints";
      if (!closed && !editingPoints) group.addLayer(endMarker(item));
    }
  }
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
  closePreview();
  const next = current.components.some((c) => c.id === componentId) ? componentId : null;
  if (next !== selectedId) selectedPoint = null;
  selectedId = next;
  // Un deshacer puede quitar el punto abierto.
  if (selectedPoint !== null && !selected()?.points?.[selectedPoint]) selectedPoint = null;
  $("plan-view").hidden = selectedId !== null;
  $("component-view").hidden = selectedId === null;
  $("add-menu")?.remove();
  history.replaceState(null, "", selectedId ? `#m/${current.id}/${selectedId}` : `#m/${current.id}`);
  refresh();
  buildPanel();
}

function closeEditor() {
  if (!current) return;
  closePreview();
  document.activeElement?.blur?.();
  // Una misión nueva sin área ni centro no se guarda.
  if (!hasGeometry(current) && !state.shas[current.id] && state.missions[current.id]) {
    delete state.missions[current.id];
    delete state.dirty[current.id];
    persist();
  }
  current = null;
  selectedId = null;
  selectedPoint = null;
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
  $("zone-warning").hidden = true;
  zoneViolations = [];
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
  loadTerrain();
  redrawShapes();
  drawHandles();
  updateHint();
}

/** Redibuja la ruta y actualiza los números del panel. Sirve también mientras se arrastra. */
function redrawShapes() {
  shapeLayer.clearLayers();
  planResult = drawPlan(current, shapeLayer, { selectedId, editing: true, focusPoint: selectedPoint, onSelect: (id) => showView(id) });
  zoneViolations = ZonePlanner.violations(current, planResult);
  // Un anillo rojo donde la ruta entra en una zona.
  for (const { at } of zoneViolations) shapeLayer.addLayer(L.circleMarker(at, { radius: 9, color: DANGER, weight: 3, fill: false, interactive: false }));
  renderZoneWarning();
  renderStats();
  helpUpdaters.forEach((update) => update());
  $("tool-undo").disabled = undoStack.length === 0;
  $("tool-redo").disabled = redoStack.length === 0;
  const component = selected();
  $("tool-clear").disabled = !component || !anchorOf(component);
}

/**
 * El aviso rojo sobre el mapa cuando algo de la misión entra en una zona restringida: así el
 * teléfono no la deja volar. Al tocarlo se abre la zona, que dice todo lo que entra.
 */
function renderZoneWarning() {
  const el = $("zone-warning");
  const first = zoneViolations[0];
  el.hidden = !first;
  if (!first) return;
  const more = zoneViolations.length - 1;
  el.querySelector("span").textContent = first.message + (more > 0 ? `  ·  +${more}` : "");
  el.title = `${zoneViolations.map((v) => `${v.message}.`).join("\n")}\nAsí no se deja volar: mueve la ruta o la zona, cambia sus alturas o apágala con el ojo.`;
  el.onclick = () => {
    if (selectedId !== first.zone.id) showView(first.zone.id);
  };
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
    $("plan-summary").textContent = n === 0 ? "Sin componentes: añade uno" : parts.join(" · ");
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
  } else if (component.type === "corridor") {
    stats = [
      ["Duración", result ? formatDuration(result.durationSeconds) : "—"],
      component.captureMode === "photo"
        ? ["Fotos", result ? String(result.photoCount) : "—"]
        : ["Captura", component.captureMode === "video" ? "Video" : "Nada"],
      ["Distancia", result ? distanceText(result.lengthMeters) : "—"],
      ["Largo", result ? distanceText(result.centerMeters) : "—"],
      ["GSD", `${num(MapPlanner.gsd(cameraFor(component), component.altitude), 2)} cm/px`],
      ["Pasadas", result ? String(result.passes.length) : "—"],
    ];
  } else if (isPointType(component)) {
    stats = [
      ["Duración", result ? formatDuration(result.durationSeconds) : "—"],
      ["Fotos", result ? String(result.photoCount) : "—"],
      ["Altura", altitudeText(component.altitude)],
    ];
  } else if (component.type === "facade") {
    stats = [
      ["Duración", result ? formatDuration(result.durationSeconds) : "—"],
      component.captureMode === "photo"
        ? ["Fotos", result ? String(result.photoCount) : "—"]
        : ["Captura", component.captureMode === "video" ? "Video" : "Nada"],
      ["Distancia", result ? distanceText(result.lengthMeters) : "—"],
      ["Columnas", result ? String(result.columns) : "—"],
      ["Filas", result ? String(result.rows) : "—"],
      ["GSD", `${num(MapPlanner.gsd(cameraFor(component), component.distance), 2)} cm/px`],
    ];
  } else if (component.type === "commands") {
    stats = [
      ["Duración", result ? formatDuration(result.durationSeconds) : "—"],
      ["Comandos", String(component.commands.length)],
      ["Fotos", result?.photoCount ? String(result.photoCount) : "—"],
    ];
  } else if (component.type === "zone") {
    const shaped = ZonePlanner.hasShape(component);
    const hits = zoneViolations.filter((v) => v.zone.id === component.id).length;
    const heights = zoneHeights(component);
    stats = [
      ["Alturas", heights[0].toUpperCase() + heights.slice(1)],
      component.shape === "circle"
        ? ["Radio", shaped ? `${num(Geo.distance(component.boundary[0], component.boundary[1]))} m` : "—"]
        : ["Área", shaped ? `${num(Geo.area(component.boundary) / 10000, 2)} ha` : "—"],
      ["Entra", !component.enabled ? "No cuenta" : hits === 0 ? "Nada" : `${hits} ${hits === 1 ? "cosa" : "cosas"}`],
    ];
  } else if (!isKnown(component)) {
    stats = [["Tipo", component.type]];
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
      : "Añade un componente a la misión: un mapa, un corredor, una órbita, waypoints, una foto, una panorámica, una fachada o comandos";
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
  } else if (component.type === "corridor") {
    const n = component.path.length;
    hint.textContent =
      n === 0
        ? "Haz clic en el mapa donde empieza el corredor: vas a marcar la línea de su centro"
        : n === 1
          ? "Sigue haciendo clic por el centro del corredor, punto por punto"
          : "Haz clic en el mapa para alargar la línea · arrastra un punto o un + para cambiarla, o el centro para mover todo · clic en un punto para quitarlo";
  } else if (component.type === "orbit") {
    hint.textContent = component.center
      ? "Arrastra el centro para mover la órbita · el cuadrito para cambiar el radio · el pin para cambiar dónde empieza"
      : "Haz clic en el mapa para poner el centro de la órbita";
  } else if (component.type === "waypoints") {
    const n = component.points.length;
    hint.textContent =
      n === 0
        ? "Haz clic en el mapa para poner el primer punto"
        : selectedPoint !== null
          ? `Haz clic en el mapa para poner un punto después del ${selectedPoint + 1} · arrastra un punto para moverlo o la flecha para cambiar hacia dónde mira`
          : n === 1
            ? "Haz clic en el mapa para poner el siguiente punto"
            : "Haz clic en un punto para editarlo, en el mapa para poner otro al final o en un + para meter uno en medio · arrastra un punto para moverlo";
  } else if (isPointType(component)) {
    const what = component.type === "pano" ? "la panorámica" : "la foto";
    hint.textContent = !component.position
      ? `Haz clic en el mapa donde quieres tomar ${what}`
      : component.type === "pano" && component.panoType === "sphere"
        ? "Arrastra el punto para moverlo"
        : "Arrastra el punto para moverlo o la flecha para cambiar hacia dónde mira la cámara";
  } else if (component.type === "facade") {
    hint.textContent = facadeHint(component);
  } else if (component.type === "commands") {
    hint.textContent = component.position
      ? "Arrastra el punto para moverlo"
      : "Sin punto, hace los comandos donde terminó el componente anterior · haz clic en el mapa para ponerle un punto";
  } else if (component.type === "zone") {
    const n = component.boundary.length;
    hint.textContent =
      component.shape === "circle"
        ? n < 2
          ? "Haz clic en el mapa en el centro de la zona"
          : "Arrastra el centro para mover la zona o el cuadrito para cambiar su tamaño"
        : n === 0
          ? "Haz clic en el mapa en las esquinas de la zona donde el dron no debe entrar"
          : n < 3
            ? "Sigue marcando esquinas: hacen falta al menos 3"
            : "Arrastra el centro para mover la zona · las esquinas para cambiarla · el + para agregar otra · clic en una esquina para quitarla";
  } else {
    hint.textContent = "Este componente es de una versión más nueva: aquí no se puede editar";
  }
  hint.hidden = false;
}

function facadeHint(component) {
  const n = component.boundary.length;
  if (FacadePlanner.hasShape(component) && !selectedItem()?.result) {
    return "Es demasiado grande para un vuelo (más de 3000 paradas): acércate en el mapa y márcala de nuevo";
  }
  if (component.face === "line") {
    if (n === 0) return "Haz clic en el mapa en un extremo de la pared que vas a fotografiar";
    if (n === 1) return "Haz clic en el otro extremo de la pared; si dobla en una esquina, marca también la esquina antes";
    return "La línea azul es por donde vuela; el lado se cambia en el panel · arrastra un punto, un + o el centro para cambiar la pared · clic en un punto para quitarlo";
  }
  if (component.face === "circle") {
    return n < 2
      ? "Haz clic en el mapa en el centro de la estructura: una torre, un tanque, un árbol"
      : "Arrastra el centro para mover la estructura o el cuadrito para cambiar su tamaño";
  }
  if (n === 0) return "Haz clic en el mapa en las esquinas de la estructura (el borde del techo)";
  if (n < 3) return "Sigue marcando esquinas: hacen falta al menos 3";
  return "Arrastra el centro para mover la estructura · las esquinas para cambiarla · el + para agregar otra · clic en una esquina para quitarla";
}

map.on("click", (event) => {
  const component = selected();
  if (!component) return;
  const point = toPoint(event.latlng);
  if (component.type === "map") {
    editGeometry(() => (component.boundary = Geo.insertIntoPolygon(component.boundary, point)));
  } else if (component.type === "corridor") {
    editGeometry(() => component.path.push(point));
  } else if (component.type === "orbit") {
    if (!component.center) editGeometry(() => (component.center = point));
  } else if (component.type === "facade") {
    if (component.face === "line") editGeometry(() => component.boundary.push(point));
    else if (component.face === "polygon") editGeometry(() => (component.boundary = Geo.insertIntoPolygon(component.boundary, point)));
    // Redonda: empieza con 10 m de radio; el cuadrito lo cambia (y aparece en el panel).
    else if (component.boundary.length < 2) {
      editGeometry(() => (component.boundary = [point, projection(point).toGeo({ x: 10, y: 0 }).map(round7)]));
      buildPanel();
    }
  } else if (component.type === "zone") {
    if (component.shape === "polygon") editGeometry(() => (component.boundary = Geo.insertIntoPolygon(component.boundary, point)));
    // Redonda: empieza con 15 m de radio.
    else if (component.boundary.length < 2) {
      editGeometry(() => (component.boundary = [point, projection(point).toGeo({ x: 15, y: 0 }).map(round7)]));
      buildPanel();
    }
  } else if (component.type === "commands") {
    if (!component.position) {
      editGeometry(() => (component.position = point));
      buildPanel();
    }
  } else if (component.type === "waypoints") {
    insertWaypoint(component, selectedPoint !== null ? selectedPoint + 1 : component.points.length, point);
  } else if (isPointType(component) && !component.position) {
    editGeometry(() => {
      component.position = point;
      component.heading = facingFrom(point) ?? component.heading;
    });
    buildPanel();
  }
});

// La flecha del rumbo va a una distancia fija en pantalla: se acomoda al acercar o alejar.
map.on("zoomend", () => {
  if (current) followHandles(null);
});

/** Al poner una foto o una panorámica, mira hacia afuera: en la dirección en que llega desde el despegue. */
function facingFrom(point) {
  const from = takeoffOf(current);
  if (!from || Geo.distance(from, point) < 5) return null;
  return Math.round(Geo.bearing(from, point)) % 360;
}

/** Agrega un waypoint en `index` a la altura del anterior (o la del componente) y lo abre. */
function insertWaypoint(component, index, at) {
  const before = component.points[index - 1];
  const after = component.points[index];
  const altitude = before && after ? Math.round((before.altitude + after.altitude) / 2) : (before?.altitude ?? component.altitude);
  editGeometry(() => component.points.splice(index, 0, newWaypoint(at, altitude)));
  selectPoint(index);
}

/** Abre el waypoint `index` del componente abierto (null vuelve a la lista de puntos). */
function selectPoint(index) {
  document.activeElement?.blur?.();
  selectedPoint = index;
  refresh();
  buildPanel();
  const point = index === null ? null : selected()?.points?.[index];
  if (point && !map.getBounds().contains(point.position)) map.panTo(point.position);
}

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
  else if (component?.type === "corridor") drawCorridorHandles(component);
  else if (component?.type === "orbit" && component.center) drawOrbitHandles(component);
  else if (component?.type === "waypoints") drawWaypointHandles(component);
  else if (isPointType(component) && component.position) drawPointHandles(component);
  else if (component?.type === "facade") drawFacadeHandles(component);
  else if (component?.type === "commands" && component.position) drawPointHandles(component);
  else if (component?.type === "zone") drawZoneHandles(component);
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

/**
 * La línea del centro de un corredor: sus puntos se arrastran para cambiarla y se quitan con clic,
 * un + entre dos mete otro en medio y el círculo del centro la mueve entera.
 */
function drawCorridorHandles(component) {
  const midpointOf = (i) => {
    const a = component.path[i];
    const b = component.path[i + 1];
    return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null;
  };

  for (let i = 0; i < component.path.length - 1; i++) {
    const marker = L.marker(midpointOf(i), {
      icon: divIcon("mid-handle", 16, "+"),
      draggable: true,
      zIndexOffset: 500,
      title: "Arrastra o toca para agregar un punto",
    });
    let inserted = -1;
    marker.on("dragstart", () => {
      remember();
      inserted = i + 1;
      component.path.splice(inserted, 0, toPoint(marker.getLatLng()));
    });
    marker.on("drag", () => {
      component.path[inserted] = toPoint(marker.getLatLng());
      redrawShapes();
    });
    marker.on("dragend", () => {
      save();
      refresh();
    });
    marker.on("click", (event) => {
      L.DomEvent.stop(event);
      editGeometry(() => component.path.splice(i + 1, 0, midpointOf(i)));
    });
    addHandle(marker, () => midpointOf(i));
  }

  component.path.forEach((point, i) => {
    const marker = L.marker(point, { icon: divIcon("vertex-handle", 20), draggable: true, zIndexOffset: 1000, title: "Arrastra para mover · clic para quitar" });
    draggable(marker, (p) => (component.path[i] = p));
    const removeVertex = (event) => {
      L.DomEvent.stop(event);
      editGeometry(() => component.path.splice(i, 1));
    };
    marker.on("click", removeVertex);
    marker.on("contextmenu", removeVertex);
    addHandle(marker, () => component.path[i]);
  });

  if (component.path.length >= 2) {
    const at = () => Geo.centroid(component.path);
    const marker = L.marker(at(), {
      icon: divIcon("move-handle", 32, '<svg><use href="#i-move" /></svg>'),
      draggable: true,
      zIndexOffset: 1100,
      title: "Arrastra para mover todo el corredor",
    });
    let from = null;
    let path = null;
    marker.on("dragstart", () => {
      from = at();
      path = component.path;
    });
    draggable(marker, (to) => (component.path = Geo.translate(path, from, to).map(([lat, lon]) => [round7(lat), round7(lon)])));
    addHandle(marker, at);
  }

  // El pin de inicio: empieza en el extremo (y el lado) más cerca de donde viene el dron.
  const item = selectedItem();
  if (item?.result) {
    const marker = startPin(item);
    addHandle(marker, () => selectedItem()?.result?.path[0]);
  }
}

/** La cara de una fachada: un lado, la planta con esquinas o la redonda. */
function drawFacadeHandles(component) {
  const closed = component.face === "polygon";
  drawShapeHandles(component, {
    circle: component.face === "circle",
    closed,
    complete: FacadePlanner.hasShape(component),
    icon: "inspection",
    what: component.face === "line" ? "la pared" : "la estructura",
    radiusKey: "structureRadius",
  });

  // El pin de inicio: la columna más cerca de donde viene el dron.
  const item = selectedItem();
  if (item?.result) addHandle(startPin(item), () => selectedItem()?.result?.path[0]);
}

/** Una zona restringida: con esquinas o redonda. */
function drawZoneHandles(component) {
  drawShapeHandles(component, {
    circle: component.shape === "circle",
    closed: true,
    complete: ZonePlanner.hasShape(component),
    icon: "zone",
    what: "la zona",
    radiusKey: "zoneRadius",
  });
}

/**
 * Los puntos de una forma marcada en `component.boundary`. Una línea o con esquinas (`closed`): sus
 * puntos se arrastran y se quitan con clic, un + mete otro en medio y el círculo del centro la
 * mueve entera (ya `complete`). Redonda (`circle`, [centro, borde]): el centro la mueve y el
 * cuadrito cambia el radio, que se ve en el campo `radiusKey` del panel. `what` es "la zona".
 */
function drawShapeHandles(component, { circle, closed, complete, icon, what, radiusKey }) {
  const roundPoint = ([lat, lon]) => [round7(lat), round7(lon)];
  const moveHandle = (at, markerIcon, title) => {
    const marker = L.marker(at(), { icon: markerIcon, draggable: true, zIndexOffset: 1100, title });
    let from = null;
    let boundary = null;
    marker.on("dragstart", () => {
      from = at();
      boundary = component.boundary;
    });
    draggable(marker, (to) => (component.boundary = Geo.translate(boundary, from, to).map(roundPoint)));
    addHandle(marker, at);
  };

  if (circle) {
    if (component.boundary.length < 2) return;
    moveHandle(() => component.boundary[0], divIcon("orbit-center", 34, `<svg><use href="#i-${icon}" /></svg>`), `Arrastra para mover ${what}`);
    const radius = L.marker(component.boundary[1], { icon: divIcon("radius-handle", 16), draggable: true, zIndexOffset: 1000, title: "Arrastra para cambiar el tamaño" });
    draggable(radius, (point) => {
      if (Geo.distance(component.boundary[0], point) < 1) return;
      component.boundary[1] = point;
      fieldSetters[radiusKey]?.(Math.round(Geo.distance(component.boundary[0], point) * 10) / 10);
    });
    addHandle(radius, () => component.boundary[1]);
    return;
  }

  const count = component.boundary.length;
  const midpointOf = (i) => {
    const a = component.boundary[i];
    const b = closed && component.boundary.length >= 3 ? component.boundary[(i + 1) % component.boundary.length] : component.boundary[i + 1];
    return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null;
  };
  const edges = closed && count >= 3 ? count : count - 1;
  for (let i = 0; i < edges; i++) {
    const marker = L.marker(midpointOf(i), { icon: divIcon("mid-handle", 16, "+"), draggable: true, zIndexOffset: 500, title: "Arrastra o toca para agregar un punto" });
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
  if (complete) {
    moveHandle(() => Geo.centroid(component.boundary), divIcon("move-handle", 32, '<svg><use href="#i-move" /></svg>'), `Arrastra para mover toda ${what}`);
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

/** El punto a CONE_PX de `at` en la dirección `heading`, en la pantalla. */
function headingTip(at, heading) {
  const p = map.latLngToLayerPoint(at);
  return toPoint(map.layerPointToLatLng(L.point(p.x + CONE_PX * Math.sin(rad(heading)), p.y - CONE_PX * Math.cos(rad(heading)))));
}

function headingIcon(heading) {
  return divIcon("heading-handle", 26, `<span style="transform: rotate(${heading}deg)"></span>`);
}

/**
 * La flecha al final del abanico: se arrastra alrededor de `at()` para cambiar hacia dónde mira
 * el dron, y `onTurn` recibe el rumbo nuevo.
 */
function drawHeadingHandle(at, heading, onTurn) {
  const tip = () => {
    const point = at();
    const value = heading();
    return point && value !== null && value !== undefined ? headingTip(point, value) : null;
  };
  if (!tip()) return;
  const marker = L.marker(tip(), { icon: headingIcon(heading()), draggable: true, zIndexOffset: 1600, title: "Arrastra para cambiar hacia dónde mira" });
  draggable(marker, (point) => {
    const value = Math.round(Geo.bearing(at(), point)) % 360;
    onTurn(value);
    // Durante el arrastre no se cambia el ícono (Leaflet perdería el arrastre): solo se gira la flecha.
    const arrowEl = marker.getElement()?.querySelector(".heading-handle span");
    if (arrowEl) arrowEl.style.transform = `rotate(${value}deg)`;
  });
  addHandle(marker, tip);
}

/** El punto de una foto, una panorámica o unos comandos, y la flecha de hacia dónde mira la foto o la panorámica (no la esfera). */
function drawPointHandles(component) {
  const center = L.marker(component.position, {
    icon: divIcon("orbit-center", 34, `<svg><use href="#i-${typeIcon(component)}" /></svg>`),
    draggable: true,
    zIndexOffset: 1000,
    title: "Arrastra para mover el punto",
  });
  draggable(center, (point) => (component.position = point));
  addHandle(center, () => component.position);
  if (component.type === "commands" || (component.type === "pano" && component.panoType === "sphere")) return;
  drawHeadingHandle(
    () => component.position,
    () => component.heading,
    (value) => {
      component.heading = value;
      fieldSetters.heading?.(value);
    },
  );
}

/** Un waypoint: círculo azul con su número y la altura debajo; con rumbo propio, un triángulo hacia donde mira. */
function waypointIcon(number, point, open, enabled) {
  const hasHeading = point.heading !== null && point.heading !== undefined;
  const arrowHtml = hasHeading ? `<span class="wp-arrow" style="transform: rotate(${point.heading}deg)"></span>` : "";
  return L.divIcon({
    className: "",
    html: `<div class="wp${open ? " open" : ""}${enabled ? "" : " off"}">${arrowHtml}<span class="wp-n">${number}</span><span class="wp-label">${altitudeText(point.altitude)}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Los waypoints: cada uno se abre con un clic y se arrastra para moverlo; un + entre dos mete
 * otro en medio. El abierto lleva la flecha para cambiar hacia dónde mira.
 */
function drawWaypointHandles(component) {
  const points = component.points;
  const midpointOf = (i) => {
    const a = component.points[i]?.position;
    const b = component.points[i + 1]?.position;
    return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null;
  };

  // Un + a mitad de cada tramo: con un clic se mete un punto ahí; arrastrándolo, donde se suelte.
  for (let i = 0; i < points.length - 1; i++) {
    const marker = L.marker(midpointOf(i), { icon: divIcon("mid-handle", 16, "+"), draggable: true, zIndexOffset: 500, title: "Clic o arrastra para meter un punto aquí" });
    marker.on("dragstart", () => {
      remember();
      const a = component.points[i];
      const b = component.points[i + 1];
      component.points.splice(i + 1, 0, newWaypoint(toPoint(marker.getLatLng()), Math.round((a.altitude + b.altitude) / 2)));
    });
    marker.on("drag", () => {
      component.points[i + 1].position = toPoint(marker.getLatLng());
      redrawShapes();
    });
    marker.on("dragend", () => {
      save();
      selectPoint(i + 1);
    });
    marker.on("click", (event) => {
      L.DomEvent.stop(event);
      insertWaypoint(component, i + 1, midpointOf(i));
    });
    addHandle(marker, () => midpointOf(i));
  }

  points.forEach((point, i) => {
    const open = i === selectedPoint;
    const marker = L.marker(point.position, {
      icon: waypointIcon(i + 1, point, open, component.enabled),
      draggable: true,
      zIndexOffset: open ? 1300 : 1000,
      title: "Clic para editarlo · arrastra para moverlo · clic derecho para quitarlo",
    });
    draggable(marker, (p) => (component.points[i].position = p));
    marker.on("click", (event) => {
      L.DomEvent.stop(event);
      if (selectedPoint !== i) selectPoint(i);
    });
    marker.on("contextmenu", (event) => {
      L.DomEvent.stop(event);
      removeWaypoint(component, i);
    });
    addHandle(marker, () => component.points[i]?.position);
  });

  // Con tres o más puntos, el círculo del medio mueve el recorrido entero.
  if (points.length >= 3) {
    const at = () => Geo.centroid(component.points.map((p) => p.position));
    const marker = L.marker(at(), {
      icon: divIcon("move-handle", 32, '<svg><use href="#i-move" /></svg>'),
      draggable: true,
      zIndexOffset: 1100,
      title: "Arrastra para mover todos los puntos",
    });
    let from = null;
    let original = null;
    marker.on("dragstart", () => {
      from = at();
      original = component.points.map((p) => p.position);
    });
    draggable(marker, (to) => {
      const moved = Geo.translate(original, from, to);
      component.points.forEach((p, i) => (p.position = [round7(moved[i][0]), round7(moved[i][1])]));
    });
    addHandle(marker, at);
  }

  const open = selectedPoint;
  if (open !== null && points[open]) {
    drawHeadingHandle(
      () => component.points[open]?.position,
      () => (component.points[open] ? waypointHeading(component, open) : null),
      (value) => {
        component.points[open].heading = value;
        fieldSetters.heading?.(value);
      },
    );
  }
}

function removeWaypoint(component, index) {
  remember();
  component.points.splice(index, 1);
  // El punto abierto sigue abierto; si era el que se quitó, se abre el anterior.
  if (!component.points.length) selectedPoint = null;
  else if (selectedPoint !== null && index <= selectedPoint) selectedPoint = Math.max(0, selectedPoint - 1);
  save();
  refresh();
  buildPanel();
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
  const shown = `${current.id}/${selectedId}/${selectedPoint}`;
  const scroll = shown === panelShown ? container.scrollTop : 0;
  panelShown = shown;
  container.replaceChildren();
  helpUpdaters.length = 0;
  for (const key of Object.keys(fieldSetters)) delete fieldSetters[key];
  const component = selected();
  if (component) {
    buildComponentHeader(component);
    if (component.type === "map") buildMapParams(container, component);
    else if (component.type === "corridor") buildCorridorParams(container, component);
    else if (component.type === "orbit") buildOrbitParams(container, component);
    else if (component.type === "waypoints" && component.points[selectedPoint]) buildWaypointParams(container, component, selectedPoint);
    else if (component.type === "waypoints") buildWaypointsParams(container, component);
    else if (component.type === "photo") buildPhotoParams(container, component);
    else if (component.type === "pano") buildPanoParams(container, component);
    else if (component.type === "facade") buildFacadeParams(container, component);
    else if (component.type === "commands") buildCommandsParams(container, component);
    else if (component.type === "zone") buildZoneParams(container, component);
    else buildUnknownParams(container, component);
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
  if (rebuild) {
    // Puede cambiar también lo que se arrastra en el mapa (la flecha de la panorámica).
    refresh();
    buildPanel();
  } else {
    redrawShapes();
  }
}

/**
 * Un parámetro numérico de `obj` (el componente abierto o el plan). Se aplica mientras se escribe
 * si está dentro de los límites; si no, se avisa en amarillo y al salir del campo se corrige.
 * Con `optional`, vacío vale null. Con `scale`, se muestra el valor guardado multiplicado (por
 * ejemplo m/s × 3,6 = km/h); `min` y `max` van en las unidades que se muestran. Con `handles`,
 * también se redibujan los puntos del mapa (cuando el valor se ve en ellos, como el rumbo).
 */
function numberParam(params, obj, { key, label, unit = "", min, max, step = 1, decimals = 0, scale = 1, slider = false, optional = false, placeholder = "", help, handles = false }) {
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
    if (handles) drawHandles();
  };
  const apply = (display) => {
    obj[key] = display === null ? null : display / scale;
    redrawShapes();
    if (handles) drawHandles();
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
function toggleParam(params, obj, { key, label, help, rebuild = false }) {
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
  input.addEventListener("change", () => setChoice(obj, key, input.checked, { rebuild }));
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

/** Botones uno al lado del otro; los que no tienen acción quedan apagados. */
function buttonRow(params, buttons) {
  const row = document.createElement("div");
  row.className = "button-row";
  for (const [label, onClick] of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button outline small";
    button.textContent = label;
    button.disabled = !onClick;
    if (onClick) button.addEventListener("click", onClick);
    row.append(button);
  }
  params.append(row);
}

// ---------- Panel del plan ----------

function buildPlanBody(body) {
  if (planResult?.flown) {
    const play = buttonParam(body, "Ver el vuelo", () => openPreview());
    play.className = "button primary small wide preview-button";
    play.insertAdjacentHTML("afterbegin", '<svg><use href="#i-play" /></svg>');
  }
  section(body, "COMPONENTES");
  if (current.components.length === 0) {
    note(
      body,
      "La misión está vacía. Añade un mapa (un área para fotografiar), un corredor (franjas a lo largo de un río o un camino), una órbita (un círculo alrededor de algo), waypoints (un recorrido por puntos), una foto o una panorámica.",
    );
  }
  current.components.forEach((component, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `component-card${component.enabled ? "" : " off"}`;
    card.innerHTML = `
      <span class="component-icon"><svg><use href="#i-${typeIcon(component)}" /></svg><span class="n">${index + 1}</span></span>
      <span class="body"><span class="name"></span><span class="meta"></span></span>
      <svg class="chevron"><use href="#i-chevron" /></svg>`;
    card.querySelector(".name").textContent = componentName(component);
    card.querySelector(".meta").textContent = componentSummary(component) + (component.enabled || component.type === "zone" ? "" : " · no se vuela");
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
    toggleAddMenu(add, [
      ["grid", "Mapa", "Un área para fotografiar en líneas", () => addComponent(newMapComponent())],
      ["corridor", "Corredor", "Franjas a lo largo de un río, un camino o una costa", () => addComponent(newCorridorComponent())],
      ["orbit", "Órbita", "Un círculo alrededor de un punto", () => addComponent(newOrbitComponent())],
      ["waypoints", "Waypoints", "Un recorrido por puntos, con foto o espera en cada uno", () => addComponent(newWaypointsComponent())],
      ["camera", "Foto", "Una foto desde un punto, mirando hacia donde quieras", () => addComponent(newPhotoComponent())],
      ["pano", "Panorámica", "Esfera, 180°, angular o vertical desde un punto", () => addComponent(newPanoComponent())],
      ["facade", "Fachada", "Fotos frente a un lado de un edificio, por columnas o filas", () => addComponent(newFacadeComponent())],
      ["inspection", "Inspección", "Alrededor de una torre, un tanque o un edificio", () => addComponent(newFacadeComponent("polygon"))],
      ["commands", "Comandos", "Esperar, fotos, video, gimbal, girar o cambiar de altura, en orden", () => addComponent(newCommandsComponent())],
      ["zone", "Zona restringida", "Por donde el dron no debe pasar: los caminos la rodean", () => addComponent(newZoneComponent())],
      ["upload", "Desde un KML o KMZ", "Áreas, líneas o puntos de Google Earth, Dronelink o DJI", () => importKml("component")],
    ]);
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

  section(body, "ARCHIVO");
  buttonRow(body, [
    ["Exportar KMZ", hasGeometry(current) ? () => exportPlan(true) : null],
    ["Exportar KML", hasGeometry(current) ? () => exportPlan(false) : null],
  ]);
  note(body, "Para verla en 3D en Google Earth. El archivo trae la misión entera: al importarlo aquí o en el teléfono queda igual.");
}

/** Tiempo de cada tramo del plan, como el "Mission Estimate" de Dronelink. */
function renderEstimate(el) {
  const rows = [];
  const row = (label, seconds, meters, kind = "") => rows.push({ label, seconds, meters, kind });
  for (const item of planResult.items) {
    if (!item.component.enabled || !item.result) continue;
    const name = `${item.number}. ${componentName(item.component)}`;
    if (item.approach) {
      const around = item.approach.via.length ? " (rodea una zona)" : "";
      row(`${item.approach.kind === "takeoff" ? "Despegue " : ""}→ ${name}${around}`, item.approach.durationSeconds, item.approach.lengthMeters, "transit");
    }
    row(name, item.result.durationSeconds, item.result.lengthMeters);
  }
  if (planResult.home) row(`Regreso al despegue${planResult.home.via.length ? " (rodea una zona)" : ""}`, planResult.home.durationSeconds, planResult.home.lengthMeters, "transit");
  if (planResult.landingSeconds) row("Aterrizaje", planResult.landingSeconds, 0, "transit");
  el.innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<div class="estimate-row ${r.kind}"><span class="label"></span><span class="dist">${r.meters ? distanceText(r.meters) : ""}</span><span class="time">${formatDuration(r.seconds)}</span></div>`,
        )
        .join("")
    : '<div class="section-note">Marca un área, una órbita o unos puntos para ver el tiempo de vuelo.</div>';
  el.querySelectorAll(".estimate-row .label").forEach((span, i) => (span.textContent = rows[i].label));
}

/** Menú de opciones debajo de `after` (o de `anchor`); se cierra al tocar fuera. */
function toggleAddMenu(anchor, items, after = anchor) {
  if ($("add-menu")) {
    $("add-menu").remove();
    return;
  }
  const menu = document.createElement("div");
  menu.id = "add-menu";
  menu.className = "add-menu";
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
  after.after(menu);
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
  const zone = component.type === "zone";
  $("comp-enabled").title = zone
    ? component.enabled
      ? "Dejar de usar esta zona (se queda guardada)"
      : "Volver a usar esta zona"
    : component.enabled
      ? "No volar este componente (se queda guardado)"
      : "Volver a volar este componente";
  $("comp-enabled").classList.toggle("active", !component.enabled);
  $("comp-off-note").hidden = component.enabled;
  $("comp-off-note").textContent = zone ? "No cuenta" : "No se vuela";
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
  toast(
    component.type === "waypoints"
      ? "Duplicado al lado"
      : isPointType(component) || component.type === "commands"
        ? "Duplicado al lado: arrastra su punto para moverlo"
        : "Duplicado al lado: arrastra su centro para moverlo",
  );
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
/** Atrás: del waypoint a sus puntos, y del componente al plan. */
function componentBack() {
  if (selectedPoint !== null) selectPoint(null);
  else showView(null);
}

$("component-back").addEventListener("click", componentBack);
$("component-done").addEventListener("click", () => showView(null));

function buildMapParams(params, c) {
  const plan = () => selectedItem()?.result ?? MapPlanner.plan(c);
  const photos = c.captureMode === "photo";
  const byDistance = photos && c.capturePriority !== "time";

  section(params, "VUELO");
  terrainToggle(params, c);
  numberParam(params, c, {
    key: "altitude",
    label: altitudeLabel(c),
    unit: "m",
    min: 5,
    max: 120,
    slider: true,
    help: () => {
      const [w, h] = MapPlanner.footprint(cameraFor(c), c.altitude);
      return withTerrain(c, `GSD ${num(plan().gsdCmPerPx, 2)} cm/px · cada foto cubre ${num(w)} × ${num(h)} m`);
    },
  });
  terrainChart(params, c);
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

function buildCorridorParams(params, c) {
  const plan = () => selectedItem()?.result ?? CorridorPlanner.plan(c);
  const photos = c.captureMode === "photo";

  section(params, "CORREDOR");
  numberParam(params, c, {
    key: "width",
    label: "Ancho",
    unit: "m",
    min: 0,
    max: 500,
    slider: true,
    help: () => {
      const spacing = CorridorPlanner.spacing(c);
      const passes = CorridorPlanner.passCount(c.width, spacing.line);
      if (passes === 1) return `Una sola pasada por el centro${c.width < 1 ? " (0 = solo la línea, útil para video)" : ""}`;
      return `${passes} pasadas separadas ${num(spacing.line, 1)} m, la mitad a cada lado de la línea`;
    },
  });
  note(params, "Empieza en el extremo más cerca de donde viene el dron y va y vuelve por pasadas paralelas a la línea, mirando hacia adelante.");

  section(params, "VUELO");
  terrainToggle(params, c);
  numberParam(params, c, {
    key: "altitude",
    label: altitudeLabel(c),
    unit: "m",
    min: 5,
    max: 120,
    slider: true,
    help: () => {
      const [w, h] = MapPlanner.footprint(cameraFor(c), c.altitude);
      return withTerrain(c, `GSD ${num(MapPlanner.gsd(cameraFor(c), c.altitude), 2)} cm/px · cada foto cubre ${num(w)} × ${num(h)} m`);
    },
  });
  terrainChart(params, c);
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
      const speed = plan()?.speed ?? c.maxSpeed;
      const limited = speed < c.maxSpeed - 0.05;
      return `Volará a ${num(speed * KMH, 1)} km/h${limited ? ", limitada por el tiempo entre fotos" : ""}`;
    },
  });

  section(params, "CAPTURA");
  choiceParam(params, c, { key: "captureMode", label: "Durante las pasadas", options: CAPTURE_MODES, rebuild: true });
  if (photos) {
    choiceParam(params, c, {
      key: "photoSize",
      label: "Tamaño de foto",
      options: PHOTO_SIZES,
      help: () => (c.photoSize === "12mp" ? "Menos detalle, pero guarda cada foto en unos 2 s" : "Más detalle; guarda cada foto en unos 5 s"),
    });
    numberParam(params, c, {
      key: "minPhotoInterval",
      label: "Tiempo mínimo entre fotos",
      unit: "s",
      min: 1,
      max: 10,
      step: 0.5,
      decimals: 1,
      help: () => "Lo más rápido que la cámara guarda cada foto",
    });
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
  }

  section(params, "TRASLAPE");
  if (photos) {
    numberParam(params, c, {
      key: "frontOverlap",
      label: "Traslape frontal",
      unit: "%",
      min: 10,
      max: 95,
      slider: true,
      help: () => `Una foto cada ${num(CorridorPlanner.spacing(c).photo, 1)} m`,
    });
  }
  numberParam(params, c, {
    key: "sideOverlap",
    label: "Traslape lateral",
    unit: "%",
    min: 10,
    max: 95,
    slider: true,
    help: () => `Pasadas separadas ${num(CorridorPlanner.spacing(c).line, 1)} m`,
  });

  section(params, "GIMBAL");
  numberParam(params, c, {
    key: "gimbalPitch",
    label: "Inclinación del gimbal",
    unit: "°",
    min: -90,
    max: 0,
    slider: true,
    help: () => (c.gimbalPitch <= -89 ? "-90° = mirando hacia abajo" : "Mirando hacia adelante a lo largo de la línea"),
  });

  if (c.captureMode !== "none") cameraSettingsParams(params, c, { photo: photos });
}

function buildFacadeParams(params, c) {
  const plan = () => selectedItem()?.result ?? FacadePlanner.plan(c);
  const photos = c.captureMode === "photo";
  const line = c.face === "line";
  const before = c.face;

  section(params, line ? "FACHADA" : "ESTRUCTURA");
  choiceParam(params, c, {
    key: "face",
    label: "Forma",
    options: FACADE_FACES,
    rebuild: true,
    help: () =>
      ({
        line: "Un lado: marca la pared con una línea (puede doblar en las esquinas)",
        circle: "Una torre, un tanque o un árbol: da la vuelta completa mirando al centro",
        polygon: "Un edificio o una casa: marca sus esquinas y da la vuelta completa",
      })[c.face],
    onChange: (face) => (c.boundary = facadeShape(c.boundary, before, face)),
  });
  if (line) {
    choiceParam(params, c, {
      key: "side",
      label: "El dron vuela a la",
      options: FACADE_SIDES,
      help: () => "Yendo del primer punto de la línea al último; la línea azul muestra por dónde",
    });
    note(params, "Si despegas del otro lado de la pared, llega dándole la vuelta por el extremo más cercano, sin cruzarla.");
  }
  if (c.face === "circle" && c.boundary.length >= 2) {
    // El radio no se guarda aparte: es la distancia del centro al segundo punto.
    const size = {
      get structureRadius() {
        return Math.round(Geo.distance(c.boundary[0], c.boundary[1]) * 10) / 10;
      },
      set structureRadius(value) {
        const b = rad(Geo.bearing(c.boundary[0], c.boundary[1]));
        c.boundary[1] = projection(c.boundary[0]).toGeo({ x: value * Math.sin(b), y: value * Math.cos(b) }).map(round7);
      },
    };
    numberParam(params, size, { key: "structureRadius", label: "Radio de la estructura", unit: "m", min: 1, max: 300, step: 0.5, decimals: 1, handles: true });
  }
  numberParam(params, c, {
    key: "distance",
    label: "Distancia a la cara",
    unit: "m",
    min: 3,
    max: 100,
    step: 0.5,
    decimals: 1,
    slider: true,
    help: () => {
      const [w, h] = MapPlanner.footprint(cameraFor(c), c.distance);
      return `GSD ${num(MapPlanner.gsd(cameraFor(c), c.distance), 2)} cm/px · cada foto cubre ${num(w)} × ${num(h)} m de la cara`;
    },
  });

  section(params, "ALTURA");
  numberParam(params, c, {
    key: "altitude",
    label: "Primera fila",
    unit: "m",
    min: 2,
    max: 120,
    slider: true,
    help: () => "Sobre el despegue. Empieza por aquí: puede ser la más baja o la más alta",
  });
  numberParam(params, c, {
    key: "finalAltitude",
    label: "Última fila",
    unit: "m",
    min: 2,
    max: 120,
    slider: true,
    help: () => {
      const r = plan();
      return r ? `${r.rows} ${r.rows === 1 ? "fila" : "filas"} separadas ${num(r.verticalSpacing, 1)} m` : "";
    },
  });
  choiceParam(params, c, {
    key: "pattern",
    label: "Recorrido",
    options: FACADE_PATTERNS,
    help: () =>
      c.pattern === "vertical"
        ? "Sube y baja frente a la cara, columna por columna"
        : line
          ? "Recorre la cara de lado a lado a cada altura"
          : "Da una vuelta completa a cada altura",
  });

  section(params, "ESPACIADO");
  choiceParam(params, c, {
    key: "spacing",
    label: "Separar por",
    options: SPACING_MODES,
    rebuild: true,
    onChange: (value) => {
      if (value !== "distance") return;
      // Empieza con la separación que daba el traslape.
      const [h, v] = FacadePlanner.spacing({ ...c, spacing: "overlap" });
      c.horizontalDistance = Math.round(h * 10) / 10;
      c.verticalDistance = Math.round(v * 10) / 10;
    },
  });
  if (c.spacing === "distance") {
    numberParam(params, c, { key: "horizontalDistance", label: "Entre columnas", unit: "m", min: 0.5, max: 100, step: 0.5, decimals: 1 });
    numberParam(params, c, { key: "verticalDistance", label: "Entre filas", unit: "m", min: 0.5, max: 100, step: 0.5, decimals: 1 });
  } else {
    numberParam(params, c, {
      key: "horizontalOverlap",
      label: "Traslape horizontal",
      unit: "%",
      min: 10,
      max: 95,
      slider: true,
      help: () => `Columnas separadas ${num(FacadePlanner.spacing(c)[0], 1)} m (o menos, para que queden parejas)`,
    });
    numberParam(params, c, {
      key: "verticalOverlap",
      label: "Traslape vertical",
      unit: "%",
      min: 10,
      max: 95,
      slider: true,
      help: () => `Filas separadas ${num(FacadePlanner.spacing(c)[1], 1)} m (o menos)`,
    });
  }

  section(params, "VUELO Y GIMBAL");
  numberParam(params, c, {
    key: "speed",
    label: "Velocidad entre paradas",
    unit: "km/h",
    scale: KMH,
    min: 1,
    max: 36,
    step: 0.5,
    decimals: 1,
    help: () => `Se detiene en cada parada mirando a la cara; sube y baja a ${num(FacadePlanner.CLIMB_SPEED * KMH)} km/h`,
  });
  numberParam(params, c, {
    key: "gimbalPitch",
    label: "Inclinación del gimbal",
    unit: "°",
    min: -90,
    max: 30,
    slider: true,
    help: () =>
      Math.abs(c.gimbalPitch) < 1
        ? "0° = de frente a la cara"
        : `Se para a ${num(FacadePlanner.standoff(c), 1)} m de la cara en el suelo para mantener la distancia por donde mira`,
  });
  note(params, "Revisa que no haya cables, ramas ni postes entre el dron y la cara: vuela a la distancia marcada sin desviarse.");

  section(params, "CAPTURA");
  choiceParam(params, c, {
    key: "captureMode",
    label: "Durante el recorrido",
    options: CAPTURE_MODES,
    rebuild: true,
    help: () => ({ photo: "Una foto en cada parada", video: "Graba todo el recorrido", none: "" })[c.captureMode],
  });
  if (photos) {
    choiceParam(params, c, {
      key: "photoSize",
      label: "Tamaño de foto",
      options: PHOTO_SIZES,
      help: () => (c.photoSize === "12mp" ? "Menos detalle, pero guarda cada foto en unos 2 s" : "Más detalle; guarda cada foto en unos 5 s"),
    });
    choiceParam(params, c, {
      key: "photoType",
      label: "Tipo de foto",
      options: PHOTO_TYPES,
      help: () => (c.photoType === "single" ? "" : "Varias fotos con distinta exposición en cada parada, para HDR"),
    });
  }
  if (c.captureMode !== "none") cameraSettingsParams(params, c, { photo: photos });
}

/**
 * La cara marcada al cambiar de forma: la línea y las esquinas se pasan tal cual; a redonda, el
 * círculo que las encierra; de redonda a otra, hay que marcarla de nuevo.
 */
function facadeShape(boundary, from, to) {
  if (from === to) return boundary;
  if (from === "circle") return [];
  if (to === "circle") {
    if (boundary.length < 2) return [];
    const center = Geo.centroid(boundary);
    const far = boundary.reduce((best, p) => (Geo.distance(center, p) > Geo.distance(center, best) ? p : best));
    return [center.map(round7), far];
  }
  return boundary;
}

/** Cambia la lista de comandos de `c` (se puede deshacer) y vuelve a armar el panel. */
function editCommands(c, change) {
  remember();
  change(c.commands);
  save();
  refresh();
  buildPanel();
}

function buildCommandsParams(params, c) {
  const photos = c.commands.some((command) => command.type === "photo");

  section(params, "PUNTO");
  if (!c.position) {
    note(params, "Sin punto: hace los comandos donde terminó el componente anterior. Haz clic en el mapa para que vaya a un punto.");
  } else {
    buttonParam(params, "Hacerlos donde terminó lo anterior", () => {
      editGeometry(() => (c.position = null));
      buildPanel();
    });
  }
  numberParam(params, c, {
    key: "altitude",
    label: "Altura al llegar",
    unit: "m",
    min: 2,
    max: 120,
    slider: true,
    help: () => "Sobre el despegue. Llega a esta altura antes del primer comando",
  });
  numberParam(params, c, {
    key: "gimbalPitch",
    label: "Inclinación del gimbal al llegar",
    unit: "°",
    min: -90,
    max: 30,
    slider: true,
    help: () => "Hasta que un comando «Mover el gimbal» la cambie · 0° = horizonte · -90° = hacia abajo",
  });

  section(params, "COMANDOS");
  if (!c.commands.length) note(params, "Añade lo que hace el dron al llegar, en orden.");
  c.commands.forEach((command, i) => {
    const [, label] = COMMAND_TYPES.find(([key]) => key === command.type);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `component-card${c.enabled ? "" : " off"}`;
    card.innerHTML = `
      <span class="component-icon"><svg><use href="#i-${COMMAND_ICONS[command.type]}" /></svg><span class="n">${i + 1}</span></span>
      <span class="body"><span class="name"></span><span class="meta">Clic para subirlo, bajarlo o quitarlo</span></span>`;
    card.querySelector(".name").textContent = label;
    card.addEventListener("click", (event) => {
      event.stopPropagation();
      // Con el menú de otro comando abierto, se cierra ese y se abre este.
      if ($("add-menu") && $("add-menu").previousElementSibling !== card) $("add-menu").remove();
      const move = (to) => editCommands(c, (list) => list.splice(to, 0, ...list.splice(i, 1)));
      toggleAddMenu(card, [
        ...(i > 0 ? [["up", "Subir", "Lo hace antes", () => move(i - 1)]] : []),
        ...(i < c.commands.length - 1 ? [["down", "Bajar", "Lo hace después", () => move(i + 1)]] : []),
        ["delete", "Quitar", "Lo saca de la lista", () => editCommands(c, (list) => list.splice(i, 1))],
      ]);
    });
    params.append(card);

    const field = {
      wait: { label: "Segundos", min: 0, max: 600, decimals: 1 },
      gimbal: { label: "Inclinación", min: -90, max: 30, help: () => "0° = horizonte · -90° = hacia abajo" },
      heading: { label: "Rumbo", min: 0, max: 359, help: () => `Mira al ${compass(command.value)} · 0° = norte · 90° = este` },
      altitude: { label: "Altura", min: 2, max: 120, help: () => "Sube o baja sin moverse, sobre el despegue" },
    }[command.type];
    if (!field) return;
    // Cada comando con su propia clave, para que los campos no se confundan entre sí.
    const key = `command${i}`;
    const holder = {
      get [key]() {
        return command.value;
      },
      set [key](value) {
        command.value = value;
      },
    };
    numberParam(params, holder, { key, unit: COMMAND_TYPES.find(([type]) => type === command.type)[2] ?? "", step: 1, ...field });
  });
  const add = buttonParam(params, "Añadir comando", (event) => {
    event.stopPropagation();
    toggleAddMenu(
      add,
      COMMAND_TYPES.map(([type, label]) => [
        COMMAND_ICONS[type],
        label,
        COMMAND_DETAILS[type],
        // Una altura nueva empieza en la que tiene en ese momento.
        () => editCommands(c, (list) => list.push(newCommand(type, type === "altitude" ? commandAltitudes(c).at(-1) : null))),
      ]),
    );
  });
  add.insertAdjacentHTML("afterbegin", '<svg><use href="#i-add" /></svg>');
  note(params, "Si no gira antes, la foto sale hacia donde llegó mirando. Para tomar una foto deja de grabar, y si al terminar los comandos sigue grabando, para.");

  if (photos) {
    section(params, "CAPTURA");
    choiceParam(params, c, { key: "photoSize", label: "Tamaño de foto", options: PHOTO_SIZES });
  }
  if (commandsCaptureMode(c) !== "none") cameraSettingsParams(params, c, { photo: photos });
}

function buildZoneParams(params, c) {
  const before = c.shape;
  if (!c.enabled) note(params, "Esta zona está apagada: se queda en la misión pero no cuenta. Toca el ojo para volver a usarla.");

  section(params, "ZONA");
  note(
    params,
    `El dron no debe entrar aquí: los caminos entre componentes y el regreso a casa la rodean a ${ZonePlanner.MARGIN} m, y si la ruta de un componente entra, el teléfono no deja volar la misión.`,
  );
  choiceParam(params, c, {
    key: "shape",
    label: "Forma",
    options: ZONE_SHAPES,
    rebuild: true,
    onChange: (shape) => (c.boundary = facadeShape(c.boundary, before, shape)),
  });
  if (c.shape === "circle" && c.boundary.length >= 2) {
    // El radio no se guarda aparte: es la distancia del centro al segundo punto.
    const size = {
      get zoneRadius() {
        return Math.round(Geo.distance(c.boundary[0], c.boundary[1]) * 10) / 10;
      },
      set zoneRadius(value) {
        const b = rad(Geo.bearing(c.boundary[0], c.boundary[1]));
        c.boundary[1] = projection(c.boundary[0]).toGeo({ x: value * Math.sin(b), y: value * Math.cos(b) }).map(round7);
      },
    };
    numberParam(params, size, { key: "zoneRadius", label: "Radio", unit: "m", min: 1, max: 2000, step: 0.5, decimals: 1, handles: true });
  }

  section(params, "ALTURAS");
  numberParam(params, c, {
    key: "minAltitude",
    label: "Desde",
    unit: "m",
    min: 0,
    max: 500,
    optional: true,
    placeholder: "El suelo",
    help: () => (c.minAltitude === null ? "Vacío: desde el suelo" : "Sobre el despegue; por debajo se puede pasar"),
  });
  numberParam(params, c, {
    key: "maxAltitude",
    label: "Hasta",
    unit: "m",
    min: 1,
    max: 500,
    optional: true,
    placeholder: "Todas",
    help: () =>
      c.maxAltitude === null ? "Vacío: a todas las alturas, hay que rodearla" : "Sobre el despegue; por encima se puede pasar. Deja unos metros de más sobre lo más alto",
  });

  section(params, "LO QUE ENTRA");
  const status = document.createElement("div");
  status.className = "section-note";
  params.append(status);
  helpUpdaters.push(() => {
    const hits = zoneViolations.filter((v) => v.zone.id === c.id);
    status.textContent = !ZonePlanner.hasShape(c)
      ? "Marca la zona en el mapa."
      : !c.enabled
        ? "Está apagada: no se revisa."
        : hits.length
          ? hits.map((v) => `• ${v.message}`).join("\n")
          : "Nada de la misión entra en esta zona.";
    status.classList.toggle("zone-status", hits.length > 0);
  });
  note(params, "Si el dron regresa a casa solo (batería baja o sin señal), va en línea recta y no rodea las zonas.");
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

function buildWaypointsParams(params, c) {
  const photoPoints = c.points.filter((p) => p.action === "photo").length;

  section(params, "PUNTOS");
  if (!c.points.length) {
    note(params, "Haz clic en el mapa para poner los puntos en el orden en que se vuelan. En cada uno puedes cambiar la altura, hacia dónde mira, la cámara y si toma una foto o espera.");
  }
  c.points.forEach((point, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `component-card${c.enabled ? "" : " off"}`;
    const icon = point.action === "photo" ? "camera" : point.action === "hover" ? "pause" : "waypoints";
    card.innerHTML = `
      <span class="component-icon"><svg><use href="#i-${icon}" /></svg><span class="n">${i + 1}</span></span>
      <span class="body"><span class="name"></span><span class="meta"></span></span>
      <svg class="chevron"><use href="#i-chevron" /></svg>`;
    card.querySelector(".name").textContent = `Punto ${i + 1}`;
    card.querySelector(".meta").textContent = [
      altitudeText(point.altitude),
      point.heading !== null ? `mira al ${compass(point.heading)}` : null,
      point.gimbalPitch !== null ? `cámara ${num(point.gimbalPitch)}°` : null,
      point.action === "photo" ? "foto" : point.action === "hover" ? `espera ${num(point.hoverSeconds)} s` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    card.addEventListener("click", () => selectPoint(i));
    params.append(card);
  });
  if (c.points.length >= 2) {
    buttonParam(params, "Invertir el orden", () => {
      editGeometry(() => c.points.reverse());
      buildPanel();
    });
  }

  section(params, "VUELO");
  numberParam(params, c, {
    key: "speed",
    label: "Velocidad",
    unit: "km/h",
    scale: KMH,
    min: 3,
    max: 54,
    step: 0.5,
    decimals: 1,
    help: () => "Entre un punto y el siguiente; frena en cada uno",
  });
  terrainToggle(params, c);
  numberParam(params, c, {
    key: "altitude",
    label: "Altura de los puntos nuevos",
    unit: "m",
    min: 5,
    max: 120,
    help: () =>
      withTerrain(c, `${c.terrainFollow ? "Sobre el suelo de cada punto" : "Sobre el despegue"}. Cada punto nuevo toma la del anterior; el primero, esta.`),
  });
  if (c.points.length >= 2) {
    buttonParam(params, "Poner todos los puntos a esa altura", () => {
      editGeometry(() => c.points.forEach((p) => (p.altitude = c.altitude)));
      buildPanel();
    });
  }
  terrainChart(params, c);

  section(params, "GIMBAL");
  numberParam(params, c, {
    key: "gimbalPitch",
    label: "Inclinación del gimbal",
    unit: "°",
    min: -90,
    max: 30,
    slider: true,
    help: () => "En los puntos que no tienen una propia · 0° = horizonte · -90° = hacia abajo",
  });

  section(params, "CAPTURA");
  choiceParam(params, c, {
    key: "captureMode",
    label: "Mientras vuela",
    options: CAPTURE_MODES,
    rebuild: true,
    help: () =>
      ({
        photo: "Fotos cada cierto tiempo, además de las de los puntos con foto",
        video: photoPoints ? "Graba todo el recorrido; los puntos con foto no toman foto" : "Graba todo el recorrido",
        none: photoPoints ? `Solo las fotos de los puntos con foto (${photoPoints})` : "Para tomar fotos, ponle Foto a algún punto",
      })[c.captureMode],
  });
  if (c.captureMode === "photo") {
    numberParam(params, c, {
      key: "photoInterval",
      label: "Foto cada",
      unit: "s",
      min: 1,
      max: 60,
      step: 0.5,
      decimals: 1,
      help: () => `Unas ${selectedItem()?.result?.photoCount ?? 0} fotos en total`,
    });
  }
  const photos = c.captureMode === "photo" || (c.captureMode === "none" && photoPoints > 0);
  if (photos) choiceParam(params, c, { key: "photoSize", label: "Tamaño de foto", options: PHOTO_SIZES });
  if (photos || c.captureMode === "video") cameraSettingsParams(params, c, { photo: photos });
}

/** Un waypoint: su altura, lo que hace al llegar, hacia dónde mira y la cámara. */
function buildWaypointParams(params, c, index) {
  const point = c.points[index];
  const count = c.points.length;
  section(params, `PUNTO ${index + 1} DE ${count}`);
  buttonRow(params, [
    ["‹ Anterior", index > 0 ? () => selectPoint(index - 1) : null],
    ["Siguiente ›", index < count - 1 ? () => selectPoint(index + 1) : null],
  ]);
  numberParam(params, point, { key: "altitude", label: altitudeLabel(c), unit: "m", min: 5, max: 120, slider: true, handles: true });
  choiceParam(params, point, {
    key: "action",
    label: "Al llegar",
    options: WAYPOINT_ACTIONS,
    rebuild: true,
    help: () =>
      ({
        none: "Sigue al siguiente punto",
        photo: c.captureMode === "video" ? "Con el componente en video no toma la foto" : "Se detiene, apunta y toma una foto",
        hover: "Se queda quieto en el punto",
      })[point.action],
  });
  if (point.action === "hover") numberParam(params, point, { key: "hoverSeconds", label: "Esperar", unit: "s", min: 1, max: 600 });

  section(params, "RUMBO Y GIMBAL");
  numberParam(params, point, {
    key: "heading",
    label: "Rumbo",
    unit: "°",
    min: 0,
    max: 359,
    optional: true,
    placeholder: "Hacia donde vuela",
    handles: true,
    help: () =>
      point.heading === null
        ? "Vacío: mira hacia donde llega volando. También puedes arrastrar la flecha en el mapa."
        : "0° = norte · 90° = este. Bórralo para que mire hacia donde vuela.",
  });
  numberParam(params, point, {
    key: "gimbalPitch",
    label: "Inclinación del gimbal",
    unit: "°",
    min: -90,
    max: 30,
    optional: true,
    placeholder: "La del componente",
    help: () => (point.gimbalPitch === null ? `Vacío: ${num(c.gimbalPitch)}° como el resto de los puntos` : "0° = horizonte · -90° = hacia abajo"),
  });

  section(params, "PUNTO");
  const remove = buttonParam(params, "Quitar este punto", () => removeWaypoint(c, index));
  remove.className = "button danger-outline small wide param-button";
}

function buildPhotoParams(params, c) {
  section(params, "FOTO");
  if (!c.position) note(params, "Haz clic en el mapa donde quieres tomar la foto.");
  terrainToggle(params, c);
  numberParam(params, c, { key: "altitude", label: altitudeLabel(c), unit: "m", min: 5, max: 120, slider: true, help: () => withTerrain(c, "") });
  numberParam(params, c, {
    key: "heading",
    label: "Rumbo",
    unit: "°",
    min: 0,
    max: 359,
    slider: true,
    handles: true,
    help: () => `Mira al ${compass(c.heading)} · también puedes arrastrar la flecha en el mapa`,
  });
  numberParam(params, c, { key: "gimbalPitch", label: "Inclinación del gimbal", unit: "°", min: -90, max: 30, slider: true, help: () => "0° = horizonte · -90° = hacia abajo" });
  choiceParam(params, c, {
    key: "photoType",
    label: "Tipo de foto",
    options: PHOTO_TYPES,
    help: () => (c.photoType === "single" ? "" : "Varias fotos con distinta exposición, para unirlas en HDR"),
  });
  choiceParam(params, c, { key: "photoSize", label: "Tamaño de foto", options: PHOTO_SIZES });
  cameraSettingsParams(params, c, { photo: true });
}

function buildPanoParams(params, c) {
  const shots = () => PanoPlan.shots(c.panoType, c.heading, c.gimbalPitch);
  section(params, "PANORÁMICA");
  if (!c.position) note(params, "Haz clic en el mapa donde quieres tomar la panorámica.");
  choiceParam(params, c, {
    key: "panoType",
    label: "Tipo",
    options: PANO_TYPES,
    rebuild: true,
    help: () => `${PANO_DESCRIPTIONS[c.panoType]} Toma ${shots().length} fotos.`,
  });
  terrainToggle(params, c);
  numberParam(params, c, { key: "altitude", label: altitudeLabel(c), unit: "m", min: 5, max: 120, slider: true, help: () => withTerrain(c, "") });
  if (c.panoType !== "sphere") {
    numberParam(params, c, {
      key: "heading",
      label: "Rumbo del centro",
      unit: "°",
      min: 0,
      max: 359,
      slider: true,
      handles: true,
      help: () => `Mira al ${compass(c.heading)} · también puedes arrastrar la flecha en el mapa`,
    });
  }
  if (c.panoType === "wide" || c.panoType === "vertical") {
    numberParam(params, c, {
      key: "gimbalPitch",
      label: "Inclinación del centro",
      unit: "°",
      min: -90,
      max: 0,
      slider: true,
      help: () => {
        const pitches = shots().map((s) => s.pitch);
        return `La cámara va de ${num(Math.max(...pitches))}° a ${num(Math.min(...pitches))}°`;
      },
    });
  }
  choiceParam(params, c, { key: "photoSize", label: "Tamaño de foto", options: PHOTO_SIZES });
  note(params, "Quieto en el punto, gira el dron y la cámara y toma las fotos una por una. Se guardan por separado: únelas en la computadora, por ejemplo con Hugin o Lightroom.");
  cameraSettingsParams(params, c, { photo: true });
}

// ---------- Seguir el terreno ----------

/** No se pudo bajar parte del suelo (sin internet o sin datos). */
let terrainFailed = false;

/** Baja el suelo de la zona si algún componente lo sigue; al llegar, actualiza las ayudas y el perfil. */
function loadTerrain() {
  if (!current || !TerrainFollow.needed(current)) return;
  const plan = current;
  ensureTerrain(planPoints(plan)).then((failed) => {
    terrainFailed = failed > 0;
    if (current === plan) helpUpdaters.forEach((update) => update());
  });
}

/** El interruptor "Seguir el terreno", como en Dronelink: la altura pasa a medirse sobre el suelo de cada punto. */
function terrainToggle(params, c) {
  toggleParam(params, c, {
    key: "terrainFollow",
    label: "Seguir el terreno",
    help: c.terrainFollow
      ? "Usa el suelo sin árboles ni edificios (datos cada 10 m): deja margen para lo que haya encima"
      : "Sube y baja con el suelo para mantener siempre la misma altura sobre él",
    rebuild: true,
  });
}

const altitudeLabel = (c) => (c.terrainFollow ? "Altura sobre el suelo" : "Altura sobre el despegue");

/**
 * El suelo bajo la ruta del componente y la altura del dron, sobre el despegue: {profile} cada
 * 5 m, {message} si faltan los datos, o null si todavía no hay ruta.
 */
function terrainProfile(component) {
  const path = planResult?.items.find((item) => item.component.id === component.id)?.result?.path;
  const takeoff = takeoffOf(current);
  if (!path?.length || !takeoff) return null;
  const message = terrainLoading()
    ? "Bajando los datos del terreno de la zona…"
    : terrainFailed
      ? "Sin datos del terreno: revisa la conexión a internet"
      : "Sin datos del terreno de esta zona";
  const base = terrain.elevation(takeoff);
  if (base === null) return { message };
  try {
    const ref = TerrainFollow.reference(terrain, base);
    return { profile: TerrainFollow.alongRoute(ref, path, TerrainFollow.aglAlong(component, path)) };
  } catch {
    return { message };
  }
}

/** `text` y, siguiendo el terreno, cuánto cambia el suelo y entre qué alturas sobre el despegue vuela. */
function withTerrain(c, text) {
  if (!TerrainFollow.follows(c)) return text;
  const result = terrainProfile(c);
  if (!result) return text;
  let line = result.message;
  if (result.profile) {
    const p = result.profile;
    const low = Math.min(...p.map((s) => s.altitude));
    const high = Math.max(...p.map((s) => s.altitude));
    if (p.length === 1) {
      const ground = p[0].ground;
      line = `El suelo ahí está ${num(Math.abs(ground))} m ${ground >= 0 ? "por encima" : "por debajo"} del despegue: el dron queda a ${num(high)} m sobre el despegue`;
    } else {
      const rise = Math.max(...p.map((s) => s.ground)) - Math.min(...p.map((s) => s.ground));
      line = `El suelo cambia ${num(rise)} m bajo la ruta: vuela entre ${num(low)} y ${num(high)} m sobre el despegue`;
    }
  }
  return text ? `${text}\n${line}` : line;
}

const CHART_DRONE = "#2b8ff2";
const CHART_GROUND = "#b5792a";
const CHART_SURFACE = "#12171c";
const SVG_NS = "http://www.w3.org/2000/svg";

/** Números redondos para el eje: unos 4 entre `low` y `high`. */
function niceTicks(low, high) {
  const raw = (high - low) / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * power).find((k) => k >= raw);
  const ticks = [];
  // + 0 convierte el -0 en 0.
  for (let i = Math.ceil(low / step); i * step <= high + 1e-9; i++) ticks.push(i * step + 0);
  return ticks;
}

function svgEl(name, attributes) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  return el;
}

/**
 * El perfil de la ruta como en Dronelink: el suelo y el dron a lo largo del recorrido, con una
 * línea que sigue al puntero y la misma información en una tabla.
 */
function terrainChart(params, c) {
  if (!c.terrainFollow) return;
  const box = document.createElement("div");
  box.className = "terrain-chart";
  box.hidden = true;
  params.append(box);
  helpUpdaters.push(() => renderTerrainChart(box, c));
}

function renderTerrainChart(box, c) {
  const profile = terrainProfile(c)?.profile;
  box.hidden = !profile || profile.length < 2;
  if (box.hidden) {
    box.replaceChildren();
    return;
  }
  const width = Math.max(240, box.clientWidth || 320);
  const height = 132;
  const pad = { left: 36, right: 8, top: 8, bottom: 20 };
  const total = profile.at(-1).distance;
  const grounds = profile.map((s) => s.ground);
  const altitudes = profile.map((s) => s.altitude);
  let low = Math.min(0, ...grounds);
  let high = Math.max(0, ...altitudes);
  const margin = Math.max(5, (high - low) * 0.08);
  low -= margin;
  high += margin;
  const ticks = niceTicks(low, high);
  low = Math.min(low, ticks[0]);
  high = Math.max(high, ticks.at(-1));
  const x = (d) => pad.left + (d / total) * (width - pad.left - pad.right);
  const y = (h) => pad.top + ((high - h) / (high - low)) * (height - pad.top - pad.bottom);
  const line = (key) => profile.map((s, i) => `${i ? "L" : "M"}${x(s.distance).toFixed(1)},${y(s[key]).toFixed(1)}`).join("");

  const head = document.createElement("div");
  head.className = "terrain-chart-head";
  head.innerHTML = `
    <span class="key"><i style="background:${CHART_DRONE}"></i>Dron</span>
    <span class="key"><i style="background:${CHART_GROUND}"></i>Suelo</span>
    <span class="unit">m sobre el despegue</span>`;

  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, width, height, tabindex: 0, role: "img" });
  svg.setAttribute("aria-label", `Perfil de la ruta: ${num(total)} m; el dron vuela entre ${num(Math.min(...altitudes))} y ${num(Math.max(...altitudes))} m sobre el despegue`);
  for (const t of ticks) {
    svg.append(svgEl("line", { x1: pad.left, x2: width - pad.right, y1: y(t), y2: y(t), class: t === 0 ? "grid zero" : "grid" }));
    const label = svgEl("text", { x: pad.left - 6, y: y(t) + 4, class: "tick", "text-anchor": "end" });
    label.textContent = num(t);
    svg.append(label);
  }
  for (const [d, anchor] of [[0, "start"], [total, "end"]]) {
    const label = svgEl("text", { x: x(d), y: height - 4, class: "tick", "text-anchor": anchor });
    label.textContent = distanceText(d);
    svg.append(label);
  }
  const bottom = y(low);
  svg.append(svgEl("path", { d: `${line("ground")}L${x(total).toFixed(1)},${bottom}L${x(0).toFixed(1)},${bottom}Z`, fill: CHART_GROUND, "fill-opacity": 0.14 }));
  svg.append(svgEl("path", { d: line("ground"), class: "series", stroke: CHART_GROUND }));
  svg.append(svgEl("path", { d: line("altitude"), class: "series", stroke: CHART_DRONE }));

  // La línea que sigue al puntero (o a las flechas del teclado) y lo que hay en ese punto.
  const cursor = svgEl("line", { y1: pad.top, y2: height - pad.bottom, class: "cursor", visibility: "hidden" });
  const groundDot = svgEl("circle", { r: 4, fill: CHART_GROUND, stroke: CHART_SURFACE, "stroke-width": 2, visibility: "hidden" });
  const droneDot = svgEl("circle", { r: 4, fill: CHART_DRONE, stroke: CHART_SURFACE, "stroke-width": 2, visibility: "hidden" });
  svg.append(cursor, groundDot, droneDot);
  const tip = document.createElement("div");
  tip.className = "terrain-tip";
  tip.hidden = true;
  let shown = -1;
  const show = (index) => {
    shown = Math.max(0, Math.min(profile.length - 1, index));
    const s = profile[shown];
    const px = x(s.distance);
    cursor.setAttribute("x1", px);
    cursor.setAttribute("x2", px);
    groundDot.setAttribute("cx", px);
    groundDot.setAttribute("cy", y(s.ground));
    droneDot.setAttribute("cx", px);
    droneDot.setAttribute("cy", y(s.altitude));
    for (const el of [cursor, groundDot, droneDot]) el.setAttribute("visibility", "visible");
    tip.replaceChildren();
    for (const [value, label, color] of [
      [s.altitude, "dron", CHART_DRONE],
      [s.ground, "suelo", CHART_GROUND],
    ]) {
      const row = document.createElement("div");
      row.innerHTML = `<i style="background:${color}"></i><strong></strong> <span></span>`;
      row.querySelector("strong").textContent = `${num(value)} m`;
      row.querySelector("span").textContent = label;
      tip.append(row);
    }
    const foot = document.createElement("div");
    foot.className = "foot";
    foot.textContent = `a ${distanceText(s.distance)} · ${num(s.altitude - s.ground)} m sobre el suelo`;
    tip.append(foot);
    tip.hidden = false;
    // Del lado contrario al puntero, para no taparlo.
    const left = px > width / 2;
    tip.style.left = left ? "" : `${px + 10}px`;
    tip.style.right = left ? `${width - px + 10}px` : "";
  };
  const hide = () => {
    shown = -1;
    tip.hidden = true;
    for (const el of [cursor, groundDot, droneDot]) el.setAttribute("visibility", "hidden");
  };
  const nearest = (d) => {
    let best = 0;
    for (let i = 1; i < profile.length; i++) if (Math.abs(profile[i].distance - d) < Math.abs(profile[best].distance - d)) best = i;
    return best;
  };
  svg.addEventListener("pointermove", (event) => {
    const bounds = svg.getBoundingClientRect();
    const px = ((event.clientX - bounds.left) / bounds.width) * width;
    show(nearest(((px - pad.left) / (width - pad.left - pad.right)) * total));
  });
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", (event) => {
    const step = Math.max(1, Math.round(profile.length / 40));
    if (event.key === "ArrowRight") show(shown < 0 ? 0 : shown + step);
    else if (event.key === "ArrowLeft") show(shown < 0 ? profile.length - 1 : shown - step);
    else return;
    event.preventDefault();
  });

  // Lo mismo en una tabla, unas 10 filas a lo largo de la ruta.
  const details = document.createElement("details");
  details.className = "terrain-table";
  details.innerHTML = `<summary>Ver como tabla</summary><table><thead><tr><th>Distancia</th><th>Suelo</th><th>Dron</th><th>Sobre el suelo</th></tr></thead><tbody></tbody></table>`;
  const body = details.querySelector("tbody");
  const rows = new Set(Array.from({ length: 11 }, (_, i) => nearest((total * i) / 10)));
  for (const i of rows) {
    const s = profile[i];
    const tr = document.createElement("tr");
    for (const text of [distanceText(s.distance), `${num(s.ground)} m`, `${num(s.altitude)} m`, `${num(s.altitude - s.ground)} m`]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    body.append(tr);
  }
  const open = box.querySelector("details")?.open ?? false;
  details.open = open;

  const plot = document.createElement("div");
  plot.className = "terrain-plot";
  plot.append(svg, tip);
  box.replaceChildren(head, plot, details);
}

function buildUnknownParams(params, c) {
  section(params, "COMPONENTE NUEVO");
  note(
    params,
    `Este componente («${c.type}») se hizo con una versión más nueva de la app o del planificador. Se guarda tal cual, pero esta versión no lo puede editar ni volar: la misión se lo salta. Recarga la página para tener la versión nueva.`,
  );
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

/** "Órbita 3": el nombre del tipo de `component` (o del tipo dado) y cuántas misiones empiezan con uno así. */
function nextName(component) {
  const name = typeName(typeof component === "string" ? { type: component } : component);
  const count = Object.values(state.missions).filter((m) => m.components[0] && typeName(m.components[0]) === name).length;
  return `${name} ${count + 1}`;
}

/** Una misión nueva con un solo componente, abierta en él. */
function newMission(component) {
  openPlan(null, newPlan(nextName(component), [component]), component.id);
}

$("new-map").addEventListener("click", () => {
  const component = newMapComponent();
  openPlan(null, newPlan(nextName("map"), [component]), component.id);
});

$("new-orbit").addEventListener("click", () => {
  const component = newOrbitComponent();
  openPlan(null, newPlan(nextName("orbit"), [component]), component.id);
});

$("new-more").addEventListener("click", (event) => {
  event.stopPropagation();
  toggleAddMenu(
    $("new-more"),
    [
      ["corridor", "Corredor", "Franjas a lo largo de un río, un camino o una costa", () => newMission(newCorridorComponent())],
      ["waypoints", "Waypoints", "Un recorrido por puntos, con foto o espera en cada uno", () => newMission(newWaypointsComponent())],
      ["camera", "Foto", "Una foto desde un punto, mirando hacia donde quieras", () => newMission(newPhotoComponent())],
      ["pano", "Panorámica", "Esfera, 180°, angular o vertical desde un punto", () => newMission(newPanoComponent())],
      ["facade", "Fachada", "Fotos frente a un lado de un edificio, por columnas o filas", () => newMission(newFacadeComponent())],
      ["inspection", "Inspección", "Alrededor de una torre, un tanque o un edificio", () => newMission(newFacadeComponent("polygon"))],
      ["commands", "Comandos", "Esperar, fotos, video, gimbal, girar o cambiar de altura, en orden", () => newMission(newCommandsComponent())],
    ],
    $("new-more").parentElement,
  );
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
    const result = text ? readKmlText(text) : null;
    const imported = result?.plan?.components ?? result?.components ?? [];
    if (!imported.length) {
      toast("Ese archivo no tiene áreas, líneas ni puntos que se puedan usar", true);
      return;
    }
    if (kmlTarget === "component" && current) {
      // Se añaden a la misión abierta; uno que repita el identificador de otro recibe uno nuevo.
      const ids = new Set(current.components.map((c) => c.id));
      const added = imported.map((c) => (ids.has(c.id) ? { ...c, id: newMapComponent().id } : c));
      changePlan(() => current.components.push(...added), added.length === 1 ? added[0].id : null);
    } else {
      const plan = result.plan ? { ...result.plan, id: newPlan().id, updatedAt: Date.now() } : newPlan(result.name || file.name.replace(/\.km[lz]$/i, ""), imported);
      state.missions[plan.id] = plan;
      state.dirty[plan.id] = true;
      persist();
      scheduleSync();
      openPlan(plan.id, null, plan.components.length === 1 ? plan.components[0].id : null);
    }
    toast(result.plan ? `Misión importada: ${imported.length} ${imported.length === 1 ? "componente" : "componentes"}` : `Importado: ${importedText(imported)}`);
  } catch (error) {
    toast(`No se pudo leer el archivo: ${error.message}`, true);
  }
});

/** "1 mapa, 2 corredores y 1 recorrido de 12 puntos". */
function importedText(components) {
  const count = (type) => components.filter((c) => c.type === type).length;
  const parts = [];
  const add = (n, one, many) => n && parts.push(`${n} ${n === 1 ? one : many}`);
  add(count("map"), "mapa", "mapas");
  add(count("corridor"), "corredor", "corredores");
  add(count("orbit"), "órbita", "órbitas");
  add(count("facade"), "fachada", "fachadas");
  add(count("zone"), "zona restringida", "zonas restringidas");
  for (const c of components.filter((c) => c.type === "waypoints")) parts.push(`un recorrido de ${c.points.length} puntos`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : parts[0];
}

/** JSZip se carga solo cuando hace falta (para leer o crear un KMZ). */
async function loadJsZip() {
  if (window.JSZip) return window.JSZip;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("no se pudo cargar el lector de KMZ"));
    document.head.append(script);
  });
  return window.JSZip;
}

/**
 * Guarda la misión como KMZ (o KML) para Google Earth. Con internet, las alturas van sobre el nivel
 * del mar con los datos del suelo; sin ellos, sobre el suelo.
 */
async function exportPlan(kmz) {
  const plan = current;
  if (!plan || !hasGeometry(plan)) return toast("La misión todavía no tiene nada que exportar", true);
  let ground = null;
  const takeoff = takeoffOf(plan);
  if (takeoff) {
    await ensureTerrain(planPoints(plan));
    const base = terrain.elevation(takeoff);
    if (base !== null) ground = TerrainFollow.reference(terrain, base);
  }
  let kml;
  try {
    kml = exportKml(plan, ground);
  } catch {
    // Falta el suelo en parte de la ruta: mejor todo sobre el suelo que a medias.
    ground = null;
    kml = exportKml(plan);
  }
  const name = plan.name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Misión";
  let blob;
  if (kmz) {
    const JSZip = await loadJsZip();
    const zip = new JSZip();
    zip.file("doc.kml", kml);
    blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz", compression: "DEFLATE" });
  } else {
    blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${name}.${kmz ? "kmz" : "kml"}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  toast(ground ? `Exportado ${link.download}` : `Exportado ${link.download} (sin datos del terreno: alturas sobre el suelo)`);
}

/**
 * Un KMZ es un ZIP con el KML adentro (DJI lo guarda en wpmz/template.kml). Las rutas de DJI Fly
 * (y las que exporta la app del teléfono) traen los puntos solo en waylines.wpml.
 */
async function readKml(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) return new TextDecoder().decode(bytes);
  const zip = await (await loadJsZip()).loadAsync(bytes);
  const files = Object.values(zip.files);
  const entries = files.filter((f) => f.name.toLowerCase().endsWith(".kml"));
  const doc = entries.find((f) => /(^|\/)doc\.kml$/i.test(f.name));
  if (doc) return doc.async("string");
  const found = entries[0] ? await entries[0].async("string") : null;
  const waylines = files.find((f) => f.name.toLowerCase().endsWith(".wpml"));
  if (!found?.includes("<Placemark") && waylines) return waylines.async("string");
  return found;
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
    } else if (component.type === "corridor") {
      component.path = [];
    } else if (component.type === "orbit") {
      component.center = null;
    } else if (component.type === "waypoints") {
      component.points = [];
      selectedPoint = null;
    } else if (isPointType(component)) {
      component.position = null;
    } else if (component.type === "facade" || component.type === "zone") {
      component.boundary = [];
    } else if (component.type === "commands") {
      component.position = null;
    }
  });
  buildPanel();
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
  const active = document.activeElement;
  // Una barra deslizante no es para escribir: ahí siguen andando los atajos.
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(active?.tagName) && active.type !== "range";
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
  } else if (preview.timeline && event.key === "Escape") {
    closePreview();
  } else if (preview.timeline && event.key === " " && !typing) {
    event.preventDefault();
    togglePreview();
  } else if (event.key === "Escape" && !typing && current && !$("sync-dialog").open) {
    if (selectedId) componentBack();
    else closeEditor();
  }
});

// ---------- Vista previa del vuelo ----------

/** La vista previa animada, como la de Dronelink: el dron recorre la misión a ×10, ×30 o ×100. */
const preview = { timeline: null, time: 0, speed: 30, playing: false, frame: 0, last: 0, layer: L.layerGroup(), drone: null, trail: [], footprint: null };
const PREVIEW_SPEED_KEY = "mini4pro.previewSpeed";
preview.speed = Number(storage.get(PREVIEW_SPEED_KEY)) || 30;

const clock = (seconds) => {
  const s = Math.max(0, Math.round(seconds));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function openPreview() {
  if (!current) return;
  closePreview();
  const timeline = FlightPreview.timeline(current);
  if (!timeline.segments.length) return toast("La misión todavía no tiene nada que volar", true);
  preview.timeline = timeline;
  preview.time = 0;
  const path = [timeline.segments[0].from.position, ...timeline.segments.map((s) => s.to.position)];
  // Toda la ruta tenue y lo ya volado en blanco, que se distinga de las líneas de los componentes.
  L.polyline(path, { color: "#fff", weight: 2, opacity: 0.4, dashArray: "4 6", interactive: false }).addTo(preview.layer);
  preview.trail = [
    L.polyline([], { color: "#000", weight: 7, opacity: 0.3, interactive: false }),
    L.polyline([], { color: "#fff", weight: 3.5, opacity: 1, interactive: false }),
  ];
  preview.trail.forEach((line) => line.addTo(preview.layer));
  preview.footprint = L.polygon([], { color: "#fff", weight: 1.5, fillColor: ACCENT, fillOpacity: 0.18, interactive: false }).addTo(preview.layer);
  preview.drone = L.marker(path[0], {
    icon: L.divIcon({
      className: "",
      html: `<div class="preview-drone"><svg class="cone" viewBox="0 0 120 120"><path d="M60,60 L${60 + 58 * Math.sin(rad(-LENS_DEGREES / 2))},${60 - 58 * Math.cos(rad(-LENS_DEGREES / 2))} A58,58 0 0 1 ${60 + 58 * Math.sin(rad(LENS_DEGREES / 2))},${60 - 58 * Math.cos(rad(LENS_DEGREES / 2))} Z" /></svg><span class="body"><svg viewBox="0 0 24 24"><path d="M12,3 L19,20 L12,16 L5,20 Z" /></svg></span></div>`,
      iconSize: [120, 120],
      iconAnchor: [60, 60],
    }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 2000,
  }).addTo(preview.layer);
  preview.layer.addTo(map);
  $("map-hint").hidden = true;
  $("preview-bar").hidden = false;
  document.body.classList.add("previewing");
  $("preview-total").textContent = clock(timeline.duration);
  document.querySelectorAll("#preview-bar [data-speed]").forEach((b) => b.classList.toggle("selected", Number(b.dataset.speed) === preview.speed));
  fitTo(planPoints(current));
  showPreviewFrame();
  playPreview(true);
}

function closePreview() {
  if (!preview.timeline) return;
  playPreview(false);
  preview.timeline = null;
  preview.layer.clearLayers();
  map.removeLayer(preview.layer);
  $("preview-bar").hidden = true;
  document.body.classList.remove("previewing");
  if (current) updateHint();
}

function playPreview(on) {
  preview.playing = on;
  cancelAnimationFrame(preview.frame);
  const button = $("preview-play");
  button.querySelector("use").setAttribute("href", on ? "#i-pause" : "#i-play");
  button.title = on ? "Pausar (espacio)" : "Reproducir (espacio)";
  button.setAttribute("aria-label", on ? "Pausar" : "Reproducir");
  if (!on) return;
  // Al final, vuelve a empezar.
  if (preview.time >= preview.timeline.duration) preview.time = 0;
  preview.last = performance.now();
  const step = (now) => {
    if (!preview.playing || !preview.timeline) return;
    preview.time = Math.min(preview.timeline.duration, preview.time + ((now - preview.last) / 1000) * preview.speed);
    preview.last = now;
    showPreviewFrame(true);
    if (preview.time >= preview.timeline.duration) playPreview(false);
    else preview.frame = requestAnimationFrame(step);
  };
  preview.frame = requestAnimationFrame(step);
}

const togglePreview = () => playPreview(!preview.playing);

/** Pone el dron, su rastro y lo que ve en el momento `preview.time`. Con `follow`, mueve el mapa si se sale. */
function showPreviewFrame(follow = false) {
  const { timeline } = preview;
  const state = FlightPreview.at(timeline, preview.time);
  if (!state) return;
  preview.drone.setLatLng(state.position);
  const el = preview.drone.getElement()?.querySelector(".preview-drone");
  if (el) {
    el.style.setProperty("--heading", `${state.heading}deg`);
    // En un mapa o un corredor la cámara mira hacia abajo: se ve lo que cubre la foto, no un abanico.
    const c = state.component;
    const down = state.kind === "route" && (c?.type === "map" || c?.type === "corridor") && c.gimbalPitch <= -60;
    el.classList.toggle("down", down || state.kind === "transit");
  }
  const done = timeline.segments.slice(0, state.index).map((s) => s.from.position);
  const flown = [...done, timeline.segments[state.index].from.position, state.position];
  preview.trail.forEach((line) => line.setLatLngs(flown));

  const c = state.component;
  if (state.kind === "route" && (c?.type === "map" || c?.type === "corridor") && c.gimbalPitch <= -60) {
    const [w, h] = MapPlanner.footprint(cameraFor(c), Math.max(1, state.altitude));
    const local = projection(state.position);
    const a = rad(state.heading);
    const corner = (x, y) => local.toGeo({ x: x * Math.cos(a) + y * Math.sin(a), y: -x * Math.sin(a) + y * Math.cos(a) });
    preview.footprint.setLatLngs([corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)]);
  } else {
    preview.footprint.setLatLngs([]);
  }

  $("preview-label").textContent = state.label;
  const above = c && TerrainFollow.follows(c) && state.kind !== "transit" ? " sobre el suelo" : "";
  const stats = [`${num(state.altitude)} m${above}`];
  if (timeline.photoCount) stats.push(`${state.photos} de ${timeline.photoCount} fotos`);
  $("preview-stats").textContent = stats.join(" · ");
  $("preview-time").textContent = clock(preview.time);
  $("preview-scrub").value = String(Math.round((preview.time / timeline.duration) * 1000));
  if (follow) keepInView(state.position);
}

/** Si el dron se sale de lo que se ve (fuera del panel y de la barra), centra el mapa en él. */
function keepInView(position) {
  const {
    paddingTopLeft: [left, top],
    paddingBottomRight: [right, bottom],
  } = fitPadding();
  const size = map.getSize();
  const box = { left: left - 40, top: top - 40, right: size.x - right + 40, bottom: size.y - bottom + 20 };
  const p = map.latLngToContainerPoint(position);
  if (p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom) return;
  map.panBy([p.x - (box.left + box.right) / 2, p.y - (box.top + box.bottom) / 2], { animate: true, duration: 0.4 });
}

$("preview-play").addEventListener("click", togglePreview);
$("preview-close").addEventListener("click", closePreview);
$("preview-scrub").addEventListener("input", (event) => {
  if (!preview.timeline) return;
  playPreview(false);
  preview.time = (Number(event.target.value) / 1000) * preview.timeline.duration;
  showPreviewFrame(true);
});
document.querySelectorAll("#preview-bar [data-speed]").forEach((button) =>
  button.addEventListener("click", () => {
    preview.speed = Number(button.dataset.speed);
    storage.set(PREVIEW_SPEED_KEY, String(preview.speed));
    document.querySelectorAll("#preview-bar [data-speed]").forEach((b) => b.classList.toggle("selected", b === button));
  }),
);

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

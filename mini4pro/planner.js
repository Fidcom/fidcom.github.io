// Cálculos de misiones: los mismos que la app del teléfono (mission/Planner.kt y Geo.kt).
// Los puntos son [latitud, longitud]; las distancias en metros, velocidades en m/s y ángulos en grados.

const EARTH_RADIUS = 6371000;
const METERS_PER_DEG = 111320;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Español de Puerto Rico: punto decimal, como en el teléfono. */
export const LOCALE = "es-PR";

/** DJI Mini 4 Pro en modo de 48 MP (los mismos datos que usa Dronelink). */
export const MINI_4_PRO = {
  name: "Mini 4 Pro (48 MP)",
  sensorWidthMm: 9.65,
  sensorHeightMm: 7.24,
  focalLengthMm: 6.72,
  imageWidthPx: 8064,
  imageHeightPx: 6048,
};

/** El mismo sensor en modo de 12 MP: píxeles más grandes, menos detalle, guarda más rápido. */
export const MINI_4_PRO_12MP = { ...MINI_4_PRO, name: "Mini 4 Pro (12 MP)", imageWidthPx: 4032, imageHeightPx: 3024 };

export const cameraFor = (mission) => (mission.photoSize === "12mp" ? MINI_4_PRO_12MP : MINI_4_PRO);

// Opciones de cada parámetro: [valor en el JSON, texto]. Son las mismas que los enum de Mission.kt.

/** Patrón del mapa: líneas en una dirección, o cruzadas (dos pasadas a 90°) como "Grid" en Dronelink. */
export const MAP_PATTERNS = [
  ["normal", "Normal"],
  ["grid", "Cruzado"],
];

export const FINISH_ACTIONS = [
  ["HOVER", "Quedarse"],
  ["GO_HOME", "Volver a casa"],
  ["LAND", "Aterrizar"],
];

export const CAPTURE_MODES = [
  ["photo", "Fotos"],
  ["video", "Video"],
  ["none", "Nada"],
];

export const PHOTO_SIZES = [
  ["48mp", "48 MP"],
  ["12mp", "12 MP"],
];

/** Distancia: la foto se toma al llegar a cada punto. Tiempo: cada N segundos a velocidad fija. */
export const CAPTURE_PRIORITIES = [
  ["distance", "Distancia"],
  ["time", "Tiempo"],
];

/** Fotos por punto: una, o varias con distinta exposición (AEB) para HDR. */
export const PHOTO_TYPES = [
  ["single", "Simple"],
  ["aeb3", "AEB 3"],
  ["aeb5", "AEB 5"],
];

export const SPACING_MODES = [
  ["overlap", "Traslape"],
  ["distance", "Distancia"],
];

export const MAP_HEADINGS = [
  ["forward", "Adelante"],
  ["left", "Izquierda"],
  ["right", "Derecha"],
  ["custom", "Otro"],
];

export const HEADING_REFERENCES = [
  ["path", "Respecto a la ruta"],
  ["north", "Respecto al norte"],
];

export const ORBIT_HEADINGS = [
  ["center", "Mirando al centro"],
  ["forward", "Hacia adelante"],
  ["backward", "Hacia atrás"],
  ["outward", "Hacia afuera"],
  ["custom", "Rumbo fijo"],
];

// Ajustes de cámara de la misión. null = "Sin cambiar": se usa lo que tenga la cámara.

export const PHOTO_FORMATS = [
  ["jpeg", "JPEG"],
  ["raw", "RAW"],
  ["jpeg_raw", "JPEG + RAW"],
];

export const PHOTO_RATIOS = [
  ["4:3", "4:3"],
  ["16:9", "16:9"],
];

export const EXPOSURE_MODES = [
  ["auto", "Automática"],
  ["manual", "Manual"],
];

/** Compensación de exposición, de -3 a +3 en tercios. */
export const EV_VALUES = Array.from({ length: 19 }, (_, i) => Math.round(((i - 9) / 3) * 10) / 10).map((v) => [
  v,
  `${v > 0 ? "+" : ""}${v.toLocaleString(LOCALE, { minimumFractionDigits: 1 })}`,
]);

export const ISO_VALUES = [100, 200, 400, 800, 1600, 3200, 6400].map((v) => [v, String(v)]);

export const SHUTTER_VALUES = [
  "1/8000", "1/6400", "1/5000", "1/4000", "1/3200", "1/2500", "1/2000", "1/1600", "1/1250", "1/1000",
  "1/800", "1/640", "1/500", "1/400", "1/320", "1/240", "1/200", "1/160", "1/120", "1/100", "1/80",
  "1/60", "1/50", "1/40", "1/30", "1/25", "1/20", "1/15", "1/10", "1/8", "1/5", "1/4", "1/3", "1/2",
  "1", "2",
].map((v) => [v, v.includes("/") ? `${v} s` : `${v} s`]);

export const WHITE_BALANCES = [
  ["auto", "Automático"],
  ["sunny", "Soleado"],
  ["cloudy", "Nublado"],
  ["incandescent", "Incandescente"],
  ["fluorescent", "Fluorescente"],
  ["custom", "Temperatura fija"],
];

export const FOCUS_MODES = [
  ["afc", "AF continuo"],
  ["af", "AF una vez"],
  ["infinity", "Infinito"],
];

export const VIDEO_RESOLUTIONS = [
  ["4k", "4K"],
  ["2.7k", "2.7K"],
  ["1080p", "1080p"],
];

export const FRAME_RATES = [24, 25, 30, 48, 50, 60, 100].map((v) => [v, `${v} fps`]);

export const COLOR_PROFILES = [
  ["normal", "Normal"],
  ["hlg", "HLG"],
  ["dlogm", "D-Log M"],
];

/** Ajustes de cámara que una misión puede fijar al empezar. */
export const CAMERA_SETTING_KEYS = [
  "photoFormat",
  "photoRatio",
  "exposureMode",
  "ev",
  "iso",
  "shutter",
  "whiteBalance",
  "whiteBalanceKelvin",
  "focusMode",
  "videoResolution",
  "frameRate",
  "colorProfile",
];

/** Aceleración típica del Mini 4 Pro para frenar y arrancar en cada foto (m/s²). */
const ACCELERATION = 2;

/** Proyección plana alrededor de un origen: x hacia el este, y hacia el norte. */
export function projection(origin) {
  const [lat0, lon0] = origin;
  const mLat = METERS_PER_DEG;
  const mLon = METERS_PER_DEG * Math.cos(rad(lat0));
  return {
    toLocal: ([lat, lon]) => ({ x: (lon - lon0) * mLon, y: (lat - lat0) * mLat }),
    toGeo: ({ x, y }) => [lat0 + y / mLat, lon0 + x / mLon],
  };
}

export const Geo = {
  distance(a, b) {
    const dLat = rad(b[0] - a[0]);
    const dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
  },

  /** Rumbo de a hacia b, 0 = norte, sentido horario. */
  bearing(a, b) {
    const v = projection(a).toLocal(b);
    return Geo.normalize(deg(Math.atan2(v.x, v.y)));
  },

  normalize: (d) => ((d % 360) + 360) % 360,

  centroid(points) {
    const n = points.length;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  },

  /** Área del polígono en m². */
  area(polygon) {
    if (polygon.length < 3) return 0;
    const pr = projection(Geo.centroid(polygon));
    const v = polygon.map(pr.toLocal);
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
      const a = v[i];
      const b = v[(i + 1) % v.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  },

  /** Mueve los puntos como un bloque, de `from` a `to`, sin deformarlos. */
  translate(points, from, to) {
    const a = projection(from);
    const b = projection(to);
    return points.map((p) => b.toGeo(a.toLocal(p)));
  },

  pathLength(path) {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += Geo.distance(path[i - 1], path[i]);
    return total;
  },

  /** Agrega el punto entre los dos vértices donde menos alarga el perímetro, para no cruzar el área. */
  insertIntoPolygon(polygon, point) {
    if (polygon.length < 3) return [...polygon, point];
    let best = 0;
    let bestCost = Infinity;
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      const cost = Geo.distance(a, point) + Geo.distance(point, b) - Geo.distance(a, b);
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    });
    const result = [...polygon];
    result.splice(best + 1, 0, point);
    return result;
  },
};

export const MapPlanner = {
  /** Resolución en el suelo, en cm por píxel. */
  gsd: (camera, altitude) => (camera.sensorWidthMm * altitude * 100) / (camera.focalLengthMm * camera.imageWidthPx),

  /** Huella de una foto: [ancho perpendicular al vuelo, alto a lo largo del vuelo]. */
  footprint: (camera, altitude) => [
    (camera.sensorWidthMm * altitude) / camera.focalLengthMm,
    (camera.sensorHeightMm * altitude) / camera.focalLengthMm,
  ],

  /**
   * Ángulo entre el frente del dron (y de la cámara) y la línea de vuelo con rumbo `direction`:
   * 0 = mira hacia adelante, ±90 = de lado.
   */
  headingOffset(mission, direction) {
    switch (mission.heading) {
      case "left":
        return -90;
      case "right":
        return 90;
      case "custom":
        return mission.headingReference === "path" ? mission.headingAngle : mission.headingAngle - direction;
      default:
        return 0;
    }
  },

  /** Separación entre líneas y entre fotos para líneas con rumbo `direction`. */
  spacing(mission, direction) {
    if (mission.spacing === "distance") return { line: mission.sideDistance, photo: mission.frontDistance };
    let [footWidth, footHeight] = MapPlanner.footprint(cameraFor(mission), mission.altitude);
    // Con el dron de lado, el lado largo de la foto queda a lo largo de la línea.
    const offset = Math.abs(Geo.normalize(MapPlanner.headingOffset(mission, direction)) % 180);
    if (offset > 45 && offset < 135) [footWidth, footHeight] = [footHeight, footWidth];
    return {
      line: Math.max(1, footWidth * (1 - mission.sideOverlap / 100)),
      photo: Math.max(0.5, footHeight * (1 - mission.frontOverlap / 100)),
    };
  },

  /** `from`: de dónde viene el dron (despegue o fin del componente anterior), para empezar cerca. */
  plan(mission, from = null) {
    const camera = cameraFor(mission);
    const photos = mission.captureMode === "photo";
    const directions = mission.pattern === "grid" ? [mission.direction, mission.direction + 90] : [mission.direction];
    const spacings = directions.map((d) => MapPlanner.spacing(mission, d));
    const photoSpacing = Math.min(...spacings.map((sp) => sp.photo));
    // La cámara no puede tomar fotos más rápido que minPhotoInterval.
    const speed = photos ? Math.max(0.5, Math.min(mission.maxSpeed, photoSpacing / mission.minPhotoInterval)) : mission.maxSpeed;

    let legs = [];
    let positions = 0;
    if (mission.boundary.length >= 3) {
      directions.forEach((direction, pass) => {
        let passLegs = MapPlanner.gridLegs(mission.boundary, direction, spacings[pass].line);
        // La primera pasada empieza donde se puso el inicio (o lo más cerca de donde viene el dron);
        // la segunda, cerca de donde acabó la primera.
        const near = pass === 0 ? (mission.start ?? from) : legs.at(-1)?.end;
        if (near) passLegs = startNearest(near, passLegs);
        positions += passLegs.reduce((sum, leg) => sum + Math.floor(Geo.distance(leg.start, leg.end) / spacings[pass].photo) + 1, 0);
        legs = legs.concat(passLegs);
      });
    }
    // Con prioridad por tiempo, el dron arranca antes del área para llegar a velocidad.
    if (photos && mission.capturePriority === "time") {
      const runUp = Math.max(3, speed * 2);
      legs = legs.map((leg) => extendLeg(leg, runUp));
    }
    const path = legs.flatMap((leg) => [leg.start, leg.end]);
    const length = Geo.pathLength(path);
    const shots = mission.photoType === "aeb5" ? 5 : mission.photoType === "aeb3" ? 3 : 1;
    const stops =
      photos && mission.capturePriority !== "time" && mission.captureSpeed !== null && mission.captureSpeed < speed
        ? positions * ((speed - mission.captureSpeed) / ACCELERATION + (mission.captureSpeed === 0 ? 1 : 0))
        : 0;
    return {
      legs,
      path,
      lineSpacing: spacings[0].line,
      photoSpacing,
      speed,
      positions: photos ? positions : 0,
      photoCount: photos ? positions * (mission.capturePriority === "time" ? 1 : shots) : 0,
      lengthMeters: length,
      // Más unos segundos por giro en cada extremo.
      durationSeconds: legs.length === 0 ? 0 : length / speed + legs.length * 4 + stops,
      gsdCmPerPx: MapPlanner.gsd(camera, mission.altitude),
      areaHectares: Geo.area(mission.boundary) / 10000,
    };
  },

  /** Rumbo del lado más largo (0 a 179°): volar paralelo a él da menos líneas y giros. */
  longestEdgeDirection(boundary) {
    if (boundary.length < 2) return null;
    let best = 0;
    let bestLength = -1;
    boundary.forEach((a, i) => {
      const d = Geo.distance(a, boundary[(i + 1) % boundary.length]);
      if (d > bestLength) {
        bestLength = d;
        best = i;
      }
    });
    return Math.round(Geo.bearing(boundary[best], boundary[(best + 1) % boundary.length])) % 180;
  },

  /** Líneas paralelas con rumbo `direction`, separadas `spacing` m, recortadas al área y en sentidos alternos. */
  gridLegs(boundary, direction, spacing) {
    const pr = projection(Geo.centroid(boundary));
    const polygon = boundary.map(pr.toLocal);
    const t = rad(direction);
    const along = { x: Math.sin(t), y: Math.cos(t) };
    const across = { x: Math.cos(t), y: -Math.sin(t) };
    const dot = (a, b) => a.x * b.x + a.y * b.y;

    const offsets = polygon.map((p) => dot(p, across));
    const minOffset = Math.min(...offsets);
    const maxOffset = Math.max(...offsets);
    const lineCount = Math.max(1, Math.ceil((maxOffset - minOffset) / spacing));
    const firstOffset = minOffset + (maxOffset - minOffset - (lineCount - 1) * spacing) / 2;

    const legs = [];
    for (let i = 0; i < lineCount; i++) {
      const c = firstOffset + i * spacing;
      const hits = [];
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[j];
        const b = polygon[(j + 1) % polygon.length];
        const sa = dot(a, across) - c;
        const sb = dot(b, across) - c;
        if (sa < 0 !== sb < 0) {
          const k = sa / (sa - sb);
          hits.push(dot({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, along));
        }
      }
      if (hits.length < 2) continue;
      hits.sort((p, q) => p - q);
      let from = hits[0];
      let to = hits[hits.length - 1];
      if (legs.length % 2 === 1) [from, to] = [to, from];
      const base = { x: across.x * c, y: across.y * c };
      const at = (s) => pr.toGeo({ x: base.x + along.x * s, y: base.y + along.y * s });
      legs.push({ start: at(from), end: at(to) });
    }
    return legs;
  },
};

/**
 * Ordena los tramos para empezar en la esquina más cercana a `point`: la cuadrícula puede
 * recorrerse al derecho o al revés, y cada tramo en un sentido u otro.
 */
function startNearest(point, legs) {
  if (legs.length === 0) return legs;
  const flipped = legs.map((leg) => ({ start: leg.end, end: leg.start }));
  const options = [legs, flipped, [...legs].reverse(), [...flipped].reverse()];
  return options.reduce((best, option) =>
    Geo.distance(point, option[0].start) < Geo.distance(point, best[0].start) ? option : best,
  );
}

/** Alarga un tramo `meters` metros por cada extremo. */
function extendLeg(leg, meters) {
  const pr = projection(leg.start);
  const a = pr.toLocal(leg.start);
  const b = pr.toLocal(leg.end);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  return {
    start: pr.toGeo({ x: a.x - ux * meters, y: a.y - uy * meters }),
    end: pr.toGeo({ x: b.x + ux * meters, y: b.y + uy * meters }),
  };
}

export const OrbitPlanner = {
  /**
   * Rumbo desde el centro donde empieza: el que se escogió, o el punto del círculo más cercano a
   * `from` (de donde viene el dron). Sin ninguno de los dos, al sur.
   */
  startBearing(mission, from = null) {
    if (mission.startBearing !== null && mission.startBearing !== undefined) return mission.startBearing;
    if (from && mission.center && Geo.distance(mission.center, from) > 1) return Geo.bearing(mission.center, from);
    return 180;
  },

  plan(mission, from = null) {
    if (!mission.center) return null;
    const pr = projection(mission.center);
    const startBearing = OrbitPlanner.startBearing(mission, from);
    const totalDegrees = 360 * mission.rotations;
    const steps = Math.max(8, Math.trunc(totalDegrees / 5));
    const startRadius = mission.radius;
    const endRadius = mission.finalRadius ?? mission.radius;
    const sign = mission.clockwise ? 1 : -1;
    const path = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const r = startRadius + (endRadius - startRadius) * f;
      // Empieza en el rumbo startBearing desde el centro (180 = al sur); el ángulo es un rumbo (0 = norte).
      const b = rad(startBearing + sign * totalDegrees * f);
      path.push(pr.toGeo({ x: r * Math.sin(b), y: r * Math.cos(b) }));
    }
    const horizontal = Geo.pathLength(path);
    const climb = (mission.finalAltitude ?? mission.altitude) - mission.altitude;
    const length = Math.sqrt(horizontal ** 2 + climb ** 2);
    const duration = length / Math.max(0.5, mission.speed);
    const photoCount = mission.captureMode === "photo" ? Math.floor(duration / mission.photoInterval) + 1 : 0;
    return { path, start: path[0], startBearing, lengthMeters: length, durationSeconds: duration, photoCount };
  },

  /** Inclinación del gimbal: apunta al punto de interés si lo hay; si no, la fija. */
  gimbalPitch(mission) {
    if (mission.poiAltitude === null || mission.poiAltitude === undefined) return mission.gimbalPitch;
    return -deg(Math.atan2(mission.altitude - mission.poiAltitude, Math.max(1, mission.radius)));
  },

  /** Grados por segundo para recorrer el círculo a `speed` m/s. */
  angularSpeed: (radius, speed) => (speed / (2 * Math.PI * radius)) * 360,
};

// ---- Planes (formato JSON v2, igual que MissionJson.kt) ----
// Una misión es un plan con varios componentes en fila (mapas y órbitas), como en Dronelink:
// el dron despega, vuela cada componente empezando cerca de donde terminó el anterior y al final
// hace lo que diga finishAction.

/** Subida y bajada entre componentes, en m/s (los límites de Dronelink). */
export const VERTICAL_SPEED = 3;

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

/** Identificador corto de un componente; solo tiene que ser único dentro de su plan. */
const componentId = () => `c${Math.random().toString(36).slice(2, 10)}`;

export function newPlan(name = "Misión", components = []) {
  return {
    version: 2,
    id: uuid(),
    name,
    updatedAt: Date.now(),
    finishAction: "GO_HOME",
    takeoff: null,
    transitSpeed: 8,
    components,
  };
}

export function newMapComponent(boundary = []) {
  return {
    id: componentId(),
    type: "map",
    name: null,
    enabled: true,
    altitude: 30,
    boundary,
    frontOverlap: 75,
    sideOverlap: 70,
    direction: 0,
    pattern: "normal",
    start: null,
    gimbalPitch: -90,
    maxSpeed: 8,
    minPhotoInterval: 5,
    captureMode: "photo",
    photoSize: "48mp",
    capturePriority: "distance",
    photoType: "single",
    captureSpeed: null,
    spacing: "overlap",
    frontDistance: 10,
    sideDistance: 10,
    heading: "forward",
    headingAngle: 0,
    headingReference: "north",
    verifyFileCreated: false,
    highWindTolerance: false,
    ...emptyCameraSettings(),
  };
}

function emptyCameraSettings() {
  return Object.fromEntries(CAMERA_SETTING_KEYS.map((key) => [key, null]));
}

export function newOrbitComponent(center = null) {
  return {
    id: componentId(),
    type: "orbit",
    name: null,
    enabled: true,
    altitude: 20,
    center,
    radius: 30,
    finalAltitude: null,
    finalRadius: null,
    clockwise: true,
    rotations: 1,
    // null = empieza en el punto del círculo más cercano a donde viene el dron.
    startBearing: null,
    speed: 4,
    heading: "center",
    headingAngle: 0,
    poiAltitude: null,
    gimbalPitch: -20,
    captureMode: "none",
    photoInterval: 3,
    photoSize: "48mp",
    ...emptyCameraSettings(),
  };
}

/** Completa un componente leído de un archivo con los valores por defecto, como en Kotlin. */
export function normalizeComponent(json) {
  const base = json.type === "orbit" ? newOrbitComponent() : newMapComponent();
  const component = { ...base, ...json, type: base.type };
  if (typeof component.id !== "string" || !component.id) component.id = base.id;
  if (typeof component.name !== "string" || !component.name.trim()) component.name = null;
  component.enabled = component.enabled !== false;
  if (component.type === "orbit" && json.captureMode === undefined) {
    // Formato anterior: photoInterval null quería decir "sin fotos".
    component.captureMode = json.photoInterval ? "photo" : "none";
    component.photoInterval = json.photoInterval || base.photoInterval;
  }
  // Un valor desconocido (de otra versión) vuelve al valor por defecto.
  const choices = {
    pattern: MAP_PATTERNS,
    captureMode: CAPTURE_MODES,
    photoSize: PHOTO_SIZES,
    capturePriority: CAPTURE_PRIORITIES,
    photoType: PHOTO_TYPES,
    spacing: SPACING_MODES,
    heading: component.type === "map" ? MAP_HEADINGS : ORBIT_HEADINGS,
    headingReference: HEADING_REFERENCES,
  };
  for (const [key, options] of Object.entries(choices)) {
    if (key in base && !options.some(([value]) => value === component[key])) component[key] = base[key];
  }
  // Los campos de la misión entera no van dentro del componente.
  for (const key of ["version", "updatedAt", "finishAction"]) delete component[key];
  return component;
}

const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/**
 * Lee un plan guardado. Las misiones del formato anterior (v1: un solo mapa u órbita) se
 * convierten en un plan con ese único componente, igual que en el teléfono.
 */
export function normalizePlan(json) {
  if (!Array.isArray(json.components)) {
    const { version, id, name, updatedAt, finishAction, ...rest } = json;
    // En v1 la órbita siempre empezaba al sur si no decía otra cosa.
    const component = rest.type === "orbit" ? { ...rest, startBearing: rest.startBearing ?? 180 } : rest;
    json = {
      id,
      name,
      updatedAt,
      finishAction: finishAction ?? (rest.type === "orbit" ? "HOVER" : "GO_HOME"),
      components: [{ ...component, id: "c1" }],
    };
  }
  const base = newPlan();
  const plan = { ...base, ...json, version: 2 };
  if (typeof plan.id !== "string" || !plan.id) plan.id = base.id;
  if (typeof plan.name !== "string" || !plan.name.trim()) plan.name = base.name;
  if (!Number.isFinite(plan.updatedAt)) plan.updatedAt = base.updatedAt;
  if (!FINISH_ACTIONS.some(([key]) => key === plan.finishAction)) plan.finishAction = base.finishAction;
  if (!isPoint(plan.takeoff)) plan.takeoff = null;
  if (!Number.isFinite(plan.transitSpeed) || plan.transitSpeed <= 0) plan.transitSpeed = base.transitSpeed;
  const seen = new Set();
  plan.components = json.components
    .filter((c) => c && typeof c === "object")
    .map((c) => {
      const component = normalizeComponent(c);
      while (seen.has(component.id)) component.id = componentId();
      seen.add(component.id);
      return component;
    });
  return plan;
}

/** El JSON que se guarda: sin campos vacíos, igual que lo escribe el teléfono. */
export function serializePlan(plan) {
  const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined));
  return JSON.stringify({ ...compact(plan), components: plan.components.map(compact) }, null, 2) + "\n";
}

/** Copia de un componente con otro identificador, para duplicarlo. */
export function copyComponent(component) {
  return { ...structuredClone(component), id: componentId() };
}

export const componentName = (component) => component.name || (component.type === "map" ? "Mapa" : "Órbita");

/** Punto de referencia del componente: el centro del área o de la órbita. */
export function anchorOf(component) {
  if (component.type === "map") return component.boundary.length ? Geo.centroid(component.boundary) : null;
  return component.center;
}

/** Sin marcarlo, el despegue va a esta distancia al sur del primer componente, para no tapar sus puntos. */
const AUTO_TAKEOFF_METERS = 20;

/** Despegue automático junto a un componente: al sur del área o de la órbita. */
export function autoTakeoff(component) {
  const anchor = anchorOf(component);
  if (!anchor) return null;
  const pr = projection(anchor);
  if (component.type === "map") {
    const south = Math.min(...component.boundary.map((p) => pr.toLocal(p).y));
    return pr.toGeo({ x: 0, y: south - AUTO_TAKEOFF_METERS });
  }
  const radius = Math.max(component.radius, component.finalRadius ?? 0);
  return pr.toGeo({ x: 0, y: -(radius + AUTO_TAKEOFF_METERS) });
}

/** Dónde despega el dron: el que se marcó, o junto al primer componente que se vuela. */
export function takeoffOf(plan) {
  if (plan.takeoff) return plan.takeoff;
  const flown = plan.components.filter((c) => c.enabled);
  for (const component of [...flown, ...plan.components]) {
    const point = autoTakeoff(component);
    if (point) return point;
  }
  return null;
}

export function componentPlan(component, from = null) {
  return component.type === "map" ? MapPlanner.plan(component, from) : OrbitPlanner.plan(component, from);
}

/** Altura al terminar el componente (una espiral puede acabar más alta o más baja). */
export const endAltitude = (component) => (component.type === "orbit" ? (component.finalAltitude ?? component.altitude) : component.altitude);

export const PlanPlanner = {
  /**
   * Ruta completa del plan: cada componente con su ruta (empezando cerca de donde terminó el
   * anterior), los tránsitos entre ellos y los totales.
   */
  plan(plan) {
    const takeoff = takeoffOf(plan);
    const items = [];
    const transits = [];
    let position = takeoff;
    let altitude = 0;
    let flown = 0;
    let durationSeconds = 0;
    let lengthMeters = 0;
    let photoCount = 0;
    const transit = (from, to, fromAltitude, toAltitude, kind) => {
      const horizontal = Geo.distance(from, to);
      const seconds = horizontal / plan.transitSpeed + Math.abs(toAltitude - fromAltitude) / VERTICAL_SPEED;
      const t = { from, to, fromAltitude, toAltitude, kind, lengthMeters: horizontal, durationSeconds: seconds };
      transits.push(t);
      durationSeconds += seconds;
      lengthMeters += horizontal;
      return t;
    };

    plan.components.forEach((component, index) => {
      const result = componentPlan(component, position);
      // approach: el tránsito para llegar al inicio de este componente.
      const item = { component, index, number: index + 1, result: result?.path.length ? result : null, approach: null };
      items.push(item);
      if (!component.enabled || !item.result) return;
      const start = item.result.path[0];
      if (position) item.approach = transit(position, start, altitude, component.altitude, flown === 0 ? "takeoff" : "between");
      durationSeconds += item.result.durationSeconds;
      lengthMeters += item.result.lengthMeters;
      photoCount += item.result.photoCount;
      position = item.result.path.at(-1);
      altitude = endAltitude(component);
      flown++;
    });

    let home = null;
    let landingSeconds = 0;
    if (flown > 0 && plan.finishAction === "GO_HOME" && takeoff) home = transit(position, takeoff, altitude, 0, "home");
    if (flown > 0 && plan.finishAction === "LAND") {
      landingSeconds = altitude / VERTICAL_SPEED;
      durationSeconds += landingSeconds;
    }
    return { takeoff, items, transits, home, landingSeconds, flown, durationSeconds, lengthMeters, photoCount };
  },
};

/** Todos los puntos del plan, para encuadrarlo en el mapa. */
export function planPoints(plan) {
  const points = [];
  for (const component of plan.components) {
    if (component.type === "map") points.push(...component.boundary);
    else {
      const orbit = OrbitPlanner.plan(component);
      if (orbit) points.push(...orbit.path);
    }
  }
  if (plan.takeoff) points.push(plan.takeoff);
  return points;
}

export const hasGeometry = (plan) => plan.components.some((c) => anchorOf(c));

// ---- Textos ----

export function formatDuration(seconds) {
  const s = Math.trunc(seconds);
  return `${Math.trunc(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}

const num = (value, decimals = 0) =>
  value.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Resumen de un componente, como "10 m | 0.1 ha | Grid | 75% | 70%" en Dronelink. */
export function componentSummary(component) {
  if (component.type === "map") {
    if (component.boundary.length < 3) return `${num(component.altitude)} m · sin área`;
    const area = Geo.area(component.boundary) / 10000;
    const pattern = component.pattern === "grid" ? "Cruzado" : "Normal";
    const spacing =
      component.spacing === "distance"
        ? `${num(component.frontDistance, 1)} × ${num(component.sideDistance, 1)} m`
        : `${num(component.frontOverlap)} % · ${num(component.sideOverlap)} %`;
    return `${num(component.altitude)} m · ${num(area, 2)} ha · ${pattern} · ${spacing}`;
  }
  if (!component.center) return `${num(component.altitude)} m · sin centro`;
  const altitude =
    component.finalAltitude !== null && component.finalAltitude !== component.altitude
      ? `${num(component.altitude)} → ${num(component.finalAltitude)} m`
      : `${num(component.altitude)} m`;
  const radius =
    component.finalRadius !== null && component.finalRadius !== component.radius
      ? `radio ${num(component.radius)} → ${num(component.finalRadius)} m`
      : `radio ${num(component.radius)} m`;
  return `${altitude} · ${num(component.rotations * 360)}° ${component.clockwise ? "horario" : "antihorario"} · ${radius}`;
}

/** Resumen del plan para la lista: componentes, duración y fotos. */
export function summary(plan) {
  const parts = [plan.components.length ? plan.components.map(componentName).join(" + ") : "Sin componentes"];
  const result = PlanPlanner.plan(plan);
  if (result.flown === 0) {
    parts.push("sin área todavía");
  } else {
    parts.push(formatDuration(result.durationSeconds));
    if (result.photoCount) parts.push(`${result.photoCount} fotos`);
  }
  return parts.join(" · ");
}

export { num };

// ---- Importar KML ----

/** Lee el primer polígono (o la primera línea) de un KML. Devuelve {name, points} o null. */
export function parseKml(text) {
  const polygon = text.match(/<(?:\w+:)?Polygon\b[\s\S]*?<\/(?:\w+:)?Polygon>/);
  const source = polygon ? polygon[0] : text;
  const coords = source.match(/<(?:\w+:)?coordinates>([\s\S]*?)<\/(?:\w+:)?coordinates>/);
  if (!coords) return null;
  let points = coords[1]
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(",").map(Number))
    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([lon, lat]) => [lat, lon]);
  // El KML repite el primer punto al final para cerrar el polígono.
  if (points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points = points.slice(0, -1);
  if (points.length < 3) return null;
  const name = text.match(/<(?:\w+:)?name>([\s\S]*?)<\/(?:\w+:)?name>/)?.[1]?.trim() || null;
  return { name, points };
}

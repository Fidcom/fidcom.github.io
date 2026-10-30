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

/**
 * Lo más seguido que el Mini 4 Pro toma fotos (s): los mínimos del modo «Temporizado» en la ficha
 * de DJI (5 s en 48 MP, 2 s en 12 MP), que no distingue JPEG de RAW. Igual que PhotoSize.minInterval.
 */
export const minPhotoInterval = (photoSize) => (photoSize === "12mp" ? 2 : 5);

/**
 * Los segundos entre fotos que de verdad se usan: el tiempo mínimo entre fotos (mapa y corredor) o
 * la foto cada tantos segundos (órbita y waypoints), pero nunca menos de lo que aguanta la cámara.
 */
export const captureInterval = (c) => Math.max(c.minPhotoInterval ?? c.photoInterval, minPhotoInterval(c.photoSize));

// Opciones de cada parámetro: [valor en el JSON, texto]. Son las mismas que los enum de Mission.kt.

/**
 * Patrón del mapa: líneas en una dirección, cruzadas (dos pasadas a 90°) como "Grid" en Dronelink,
 * u oblicuo (una pasada mirando abajo y cuatro con la cámara inclinada hacia cada lado, para modelos
 * 3D con las paredes).
 */
export const MAP_PATTERNS = [
  ["normal", "Normal"],
  ["grid", "Cruzado"],
  ["oblique", "Oblicuo"],
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

/** Qué hace el dron al llegar a un waypoint. */
export const WAYPOINT_ACTIONS = [
  ["none", "Nada"],
  ["photo", "Foto"],
  ["hover", "Esperar"],
];

/** Las panorámicas de DJI Fly (PanoType en Panorama.kt). */
/** Fachada: un lado (una línea) o todo alrededor de una estructura. */
export const FACADE_FACES = [
  ["line", "Un lado"],
  ["circle", "Redonda"],
  ["polygon", "Con esquinas"],
];

/** De qué lado de la línea vuela el dron, yendo del primer punto al último. */
export const FACADE_SIDES = [
  ["left", "Izquierda"],
  ["right", "Derecha"],
];

/** Columnas: sube y baja frente a la cara. Filas: la recorre de lado a lado a cada altura. */
export const FACADE_PATTERNS = [
  ["vertical", "Columnas"],
  ["horizontal", "Filas"],
];

/** Lo que hace un comando: [clave, nombre, unidad de su número (null = no lleva), valor por defecto] (CommandType en Kotlin). */
export const COMMAND_TYPES = [
  ["wait", "Esperar", "s", 5],
  ["photo", "Tomar foto", null, 0],
  ["videoStart", "Empezar a grabar", null, 0],
  ["videoStop", "Parar de grabar", null, 0],
  ["gimbal", "Mover el gimbal", "°", -90],
  ["heading", "Girar", "°", 0],
  ["altitude", "Cambiar de altura", "m", 30],
];

/** Forma de una zona restringida. */
export const ZONE_SHAPES = [
  ["polygon", "Con esquinas"],
  ["circle", "Redonda"],
];

export const PANO_TYPES = [
  ["sphere", "Esfera"],
  ["180", "180°"],
  ["wide", "Angular"],
  ["vertical", "Vertical"],
];

export const PANO_DESCRIPTIONS = {
  sphere: "Todo alrededor y hacia abajo, para verla como una esfera de 360°.",
  180: "Media vuelta de horizonte, de un lado al otro de lo que ves.",
  wide: "Más ancha y más alta que una foto, centrada en lo que ves.",
  vertical: "Del horizonte hacia abajo, en una columna.",
};

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

/**
 * Cómo se toman las fotos a lo largo de las líneas de un mapa o un corredor sin pedirle a la cámara
 * fotos más seguidas de las que aguanta, igual que PhotoPace en Planner.kt.
 */
export const PhotoPace = {
  /** Lo más lento que el piloto automático vuela una línea (m/s); si hace falta menos, se detiene en cada foto. */
  MIN_SPEED: 0.3,
  /** Aceleración típica del Mini 4 Pro para frenar y arrancar en cada foto (m/s²). */
  ACCELERATION: 2,
  /** Segundos quieto en cada foto al detenerse, antes de disparar. */
  STOP_SECONDS: 1,

  /** Velocidad para una foto cada `spacing` m con `interval` s entre fotos como mínimo, sin pasar de `maxSpeed`. */
  speed: (maxSpeed, spacing, interval) => Math.max(PhotoPace.MIN_SPEED, Math.min(maxSpeed, spacing / interval)),

  /** Si ni a MIN_SPEED le da tiempo a la cámara: entonces se detiene en cada foto. */
  mustStop: (spacing, interval) => spacing / interval < PhotoPace.MIN_SPEED - 1e-9,

  /**
   * Segundos de más por foto al frenar a `captureSpeed` (0 = detenerse) volando a `speed`: frenar
   * y arrancar, y detenido, esperar a que la cámara esté lista para la siguiente.
   */
  stopSeconds(speed, captureSpeed, spacing, interval) {
    if (captureSpeed === null || captureSpeed === undefined || captureSpeed >= speed) return 0;
    const brake = (speed - captureSpeed) / PhotoPace.ACCELERATION;
    if (captureSpeed > 0) return brake;
    const wait = Math.max(0, interval - (spacing / speed + brake + PhotoPace.STOP_SECONDS));
    return brake + PhotoPace.STOP_SECONDS + wait;
  },
};

/**
 * Cuánto tarda el piloto automático (Autopilot.kt) en cada movimiento, para que el tiempo estimado
 * y la vista previa sean lo que de verdad vuela. Igual que MotionTimes en Planner.kt.
 */
export const MotionTimes = {
  // Como Control: acelera y frena a 1.5 m/s², arranca a 1 m/s, gira a 45°/s y sube a 3 m/s.
  ACCELERATION: 1.5,
  START_SPEED: 1,
  YAW_RATE: 45,
  CLIMB_SPEED: 3,
  MAX_SPEED: 12,
  /** Lo que tarda en quedarse quieto al final de un tramo. */
  SETTLE_SECONDS: 0.8,
  /** Un giro de hasta estos grados lo hace volando; uno mayor, quieto antes de seguir. */
  TURN_IN_FLIGHT: 20,
  /** Lo que tarda en afinar el rumbo al final de un giro. */
  TURN_EXTRA: 0.5,
  /** Lo que tarda en afinar la altura al final de una subida o bajada. */
  CLIMB_EXTRA: 1,
  /** Detenido en una foto: lo que espera a que la cámara la guarde antes de seguir. */
  CAMERA_DONE: 1,
  /** Más cerca que esto, el punto ya se dio por alcanzado (Control.ARRIVAL). */
  ARRIVAL: 0.8,

  /** Un tramo recto de `length` m a `speed` m/s, desde quieto hasta quieto. */
  straight(length, speed) {
    if (length <= 0) return 0;
    const a = MotionTimes.ACCELERATION;
    const v = Math.min(MotionTimes.MAX_SPEED, Math.max(0.3, speed));
    const v0 = Math.min(MotionTimes.START_SPEED, v);
    const up = (v * v - v0 * v0) / (2 * a);
    const down = (v * v) / (2 * a);
    let moving;
    if (length >= up + down) {
      moving = (v - v0) / a + v / a + (length - up - down) / v;
    } else {
      const peak = Math.sqrt((2 * a * length + v0 * v0) / 2);
      moving = (peak - v0) / a + peak / a;
    }
    return moving + MotionTimes.settle(v);
  },

  /** Lo que tarda en quedarse quieto al final de un tramo a `speed` m/s: casi nada si va lento. */
  settle: (speed) => MotionTimes.SETTLE_SECONDS * Math.min(1, Math.max(0, (speed - 2) / 2)),

  /** Cuándo pasa por `distance` m de un tramo recto de `length` m a `speed` m/s que empieza quieto. */
  timeAt(distance, length, speed) {
    if (length <= 0) return 0;
    const a = MotionTimes.ACCELERATION;
    const v = Math.min(MotionTimes.MAX_SPEED, Math.max(0.3, speed));
    const v0 = Math.min(MotionTimes.START_SPEED, v);
    const peak = length >= (2 * v * v - v0 * v0) / (2 * a) ? v : Math.sqrt((2 * a * length + v0 * v0) / 2);
    const up = (peak * peak - v0 * v0) / (2 * a);
    const down = length - (peak * peak) / (2 * a);
    const d = Math.min(length, Math.max(0, distance));
    if (d <= up) return (Math.sqrt(v0 * v0 + 2 * a * d) - v0) / a;
    if (d <= down) return (peak - v0) / a + (d - up) / peak;
    return (peak - v0) / a + (down - up) / peak + (peak - Math.sqrt(Math.max(0, peak * peak - 2 * a * (d - down)))) / a;
  },

  /** Girar `degrees` grados quieto (los giros pequeños los hace volando: 0). */
  turn: (degrees) => (Math.abs(degrees) <= MotionTimes.TURN_IN_FLIGHT ? 0 : Math.abs(degrees) / MotionTimes.YAW_RATE + MotionTimes.TURN_EXTRA),

  /** Subir (o bajar) `meters` m quieto. */
  climb: (meters) => (Math.abs(meters) < 0.4 ? 0 : Math.abs(meters) / MotionTimes.CLIMB_SPEED + MotionTimes.CLIMB_EXTRA),
};

/** Diferencia más corta entre dos rumbos, de -180 a 180. */
const angleDifference = (from, to) => {
  let d = Geo.normalize(to) - Geo.normalize(from);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

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

  /**
   * Las pasadas del mapa: una, dos cruzadas, o la vertical y cuatro oblicuas. Cada una tiene líneas
   * con rumbo `direction`; en las oblicuas la cámara mira siempre a `facing`, inclinada `pitch`.
   */
  passes(mission) {
    if (mission.pattern === "grid") return [{ direction: mission.direction }, { direction: mission.direction + 90 }];
    if (mission.pattern !== "oblique") return [{ direction: mission.direction }];
    const pitch = MapPlanner.obliquePitch(mission);
    return [{ direction: mission.direction }].concat(
      [0, 1, 2, 3].map((k) => ({ direction: mission.direction, facing: Geo.normalize(mission.direction + 90 * k), pitch })),
    );
  },

  obliquePitch: (mission) => Math.min(-20, Math.max(-80, mission.obliquePitch ?? -45)),

  /**
   * Cuánto se corre una pasada oblicua hacia atrás para que la cámara, inclinada `pitch`, mire al
   * área desde `altitude` metros: lo que hay entre el dron y donde apunta en el suelo.
   */
  obliqueShift: (altitude, pitch) => altitude / Math.tan(rad(Math.abs(pitch))),

  /**
   * Separación de una pasada oblicua: entre líneas, con la huella vista de lejos (más ancha que
   * mirando abajo); entre fotos, la misma de la pasada vertical (`nadir`).
   */
  obliqueSpacing(mission, pass, nadir) {
    if (mission.spacing === "distance") return nadir;
    const slant = mission.altitude / Math.sin(rad(Math.abs(pass.pitch ?? -90)));
    const [footWidth, footHeight] = MapPlanner.footprint(cameraFor(mission), slant);
    // Mirando de lado respecto a las líneas, el lado corto de la foto queda entre una línea y otra.
    const offset = Geo.normalize((pass.facing ?? pass.direction) - pass.direction) % 180;
    const across = offset > 45 && offset < 135 ? footHeight : footWidth;
    return { line: Math.max(1, across * (1 - mission.sideOverlap / 100)), photo: nadir.photo };
  },

  /** El área corrida `meters` metros hacia el rumbo `bearing`. */
  shifted(boundary, bearing, meters) {
    if (boundary.length === 0) return boundary;
    const pr = projection(Geo.centroid(boundary));
    const dx = Math.sin(rad(bearing)) * meters;
    const dy = Math.cos(rad(bearing)) * meters;
    return boundary.map((p) => {
      const v = pr.toLocal(p);
      return pr.toGeo({ x: v.x + dx, y: v.y + dy });
    });
  },

  /** `from`: de dónde viene el dron (despegue o fin del componente anterior), para empezar cerca. */
  plan(mission, from = null) {
    const camera = cameraFor(mission);
    const photos = mission.captureMode === "photo";
    const passes = MapPlanner.passes(mission);
    const nadir = MapPlanner.spacing(mission, mission.direction);
    const spacings = passes.map((pass) =>
      pass.facing === undefined ? MapPlanner.spacing(mission, pass.direction) : MapPlanner.obliqueSpacing(mission, pass, nadir),
    );
    const crossings = photos && mission.pattern === "grid" && mission.gridPhotos === true;
    // Con las fotos en los cruces, cada tramo entre cruces se parte en partes iguales: al menos en
    // dos (una foto a la mitad) y en más si el traslape frontal lo pide.
    const divisions = crossings ? spacings.map((sp, p) => MapPlanner.crossingDivisions(spacings[1 - p].line, sp.photo)) : [];
    const photoSpacing = crossings
      ? Math.min(...spacings.map((sp, p) => spacings[1 - p].line / divisions[p]))
      : Math.min(...spacings.map((sp) => sp.photo));
    // La cámara no puede tomar fotos más seguidas que el tiempo mínimo entre fotos: se vuela más
    // lento y, si ni así alcanza, se detiene en cada foto.
    const interval = captureInterval(mission);
    const cameraStops = photos && PhotoPace.mustStop(photoSpacing, interval);
    const speed = photos ? PhotoPace.speed(mission.maxSpeed, photoSpacing, interval) : mission.maxSpeed;
    // Las fotos en los cruces van siempre por distancia.
    const byTime = photos && mission.capturePriority === "time" && !cameraStops && !crossings;

    let legs = [];
    let positions = 0;
    if (mission.boundary.length >= 3) {
      const byPass = [];
      passes.forEach((it, pass) => {
        // Las pasadas oblicuas se corren hacia atrás para que la cámara mire al área.
        const oblique = it.facing !== undefined;
        const area = oblique ? MapPlanner.shifted(mission.boundary, it.facing, -MapPlanner.obliqueShift(mission.altitude, it.pitch)) : mission.boundary;
        let passLegs = MapPlanner.gridLegs(area, it.direction, spacings[pass].line);
        if (oblique) passLegs = passLegs.map((leg) => ({ ...leg, heading: it.facing, gimbalPitch: it.pitch }));
        // La primera pasada empieza donde se puso el inicio (o lo más cerca de donde viene el dron);
        // las demás, cerca de donde acabó la anterior.
        const near = pass === 0 ? (mission.start ?? from) : legs.at(-1)?.end;
        if (near) passLegs = startNearest(near, passLegs);
        positions += passLegs.reduce((sum, leg) => sum + Math.floor(Geo.distance(leg.start, leg.end) / spacings[pass].photo) + 1, 0);
        legs = legs.concat(passLegs);
        byPass.push(passLegs);
      });
      if (crossings) {
        legs = MapPlanner.crossingPhotos(
          mission.boundary,
          passes.map((it) => it.direction),
          spacings.map((sp) => sp.line),
          divisions,
          byPass[0],
          byPass[1],
        );
        positions = legs.reduce((sum, leg) => sum + (leg.photos?.length ?? 0), 0);
      }
    }
    // Con prioridad por tiempo, el dron arranca antes del área para llegar a velocidad.
    const runUp = byTime ? Math.max(3, speed * 2) : 0;
    if (runUp > 0) legs = legs.map((leg) => extendLeg(leg, runUp));
    const path = legs.flatMap((leg) => [leg.start, leg.end]);
    const length = Geo.pathLength(path);
    // AEB solo por distancia (la cámara se pone en AEB así).
    const byDistance = photos && (mission.capturePriority !== "time" || crossings);
    const captureSpeed = cameraStops ? 0 : byTime || !photos ? null : mission.captureSpeed;
    const draft = {
      legs,
      path,
      lineSpacing: spacings[0].line,
      photoSpacing,
      speed,
      positions: photos ? positions : 0,
      photoCount: 0,
      lengthMeters: length,
      durationSeconds: 0,
      gsdCmPerPx: MapPlanner.gsd(camera, mission.altitude),
      areaHectares: Geo.area(mission.boundary) / 10000,
      runUp,
      byTime,
      captureSpeed,
      cameraStops,
    };
    // Las fotos que de verdad toma el piloto automático en cada tramo.
    if (photos) positions = legs.reduce((sum, leg) => sum + MapPlanner.photoDistances(draft, leg).length, 0);
    draft.positions = photos ? positions : 0;
    // Llega mirando hacia donde vuela desde `from`.
    const arrival = from && legs.length && Geo.distance(from, legs[0].start) > 1 ? Geo.bearing(from, legs[0].start) : null;
    const timing = MapPlanner.timing(mission, draft, arrival);
    return {
      ...draft,
      photoCount: photos ? positions * (byDistance ? shotsOf(mission.photoType) : 1) : 0,
      durationSeconds: timing.segments.reduce((a, b) => a + b, 0),
      // Segundos de cada parte de `path` (tramo, cambio de línea, tramo…) como los vuela el piloto.
      segmentSeconds: timing.segments,
      // Cuándo toma cada foto, en segundos desde que empieza el mapa, en el orden de PhotoPoints.
      photoSeconds: timing.photos,
    };
  },

  /** Dónde toma las fotos el piloto automático en `leg`, en metros desde su inicio. */
  photoDistances(plan, leg) {
    if (!plan.positions) return [];
    const length = Geo.distance(leg.start, leg.end);
    if (leg.photos) return leg.photos.map((f) => f * length);
    const count = Math.floor((length - 2 * plan.runUp) / plan.photoSpacing) + 1;
    return Array.from({ length: Math.max(0, count) }, (_, k) => plan.runUp + k * plan.photoSpacing);
  },

  /**
   * Cuánto tarda el mapa, como lo vuela el piloto automático (FlightCompiler.mapSteps): cada tramo
   * arranca y frena; antes de cada uno gira quieto hacia su rumbo (de lado a lado de una línea a la
   * siguiente da media vuelta) y vuela el cambio de línea a la velocidad máxima; deteniéndose en las
   * fotos, entre una y otra pasa al menos el tiempo mínimo de la cámara. `arrival`: el rumbo con el
   * que llega al primer tramo (null = ya mirando hacia él). Devuelve {segments, photos}: los
   * segundos de cada parte de `path` y cuándo toma cada foto.
   */
  timing(mission, plan, arrival) {
    const segments = [];
    const photos = [];
    let clock = 0;
    let heading = arrival;
    const interval = captureInterval(mission);
    const stops = plan.captureSpeed === 0;
    plan.legs.forEach((leg, i) => {
      const bearing = Geo.bearing(leg.start, leg.end);
      const off = Math.abs(angleDifference(bearing % 180, mission.direction % 180));
      const secondPass = Math.min(off, 180 - off) > 45;
      const legHeading = leg.heading ?? mapHeading(mission, bearing, secondPass ? mission.direction + 90 : mission.direction);
      let seconds = heading === null || heading === undefined ? 0 : MotionTimes.turn(angleDifference(heading, legHeading));
      heading = legHeading;
      if (i > 0) {
        const gap = Geo.distance(plan.legs[i - 1].end, leg.start);
        if (gap > MotionTimes.ARRIVAL) seconds += MotionTimes.straight(gap, mission.maxSpeed);
        segments.push(seconds);
        clock += seconds;
        seconds = 0;
      }
      const length = Geo.distance(leg.start, leg.end);
      const distances = MapPlanner.photoDistances(plan, leg);
      if (stops && distances.length) {
        // De foto en foto: frena, dispara cuando la cámara puede, espera a que guarde y sigue.
        let previous = 0;
        distances.forEach((d, k) => {
          const hop = d - previous > MotionTimes.ARRIVAL ? MotionTimes.straight(d - previous, plan.speed) : 0;
          seconds += k === 0 ? hop : Math.max(interval, hop + MotionTimes.CAMERA_DONE);
          photos.push(clock + seconds);
          previous = d;
        });
        seconds += MotionTimes.CAMERA_DONE;
        if (length - previous > MotionTimes.ARRIVAL) seconds += MotionTimes.straight(length - previous, plan.speed);
      } else {
        // Sin detenerse: con velocidad al pasar por cada foto, frena y vuelve a acelerar en cada una.
        const slow = PhotoPace.stopSeconds(plan.speed, plan.captureSpeed, plan.photoSpacing, interval);
        distances.forEach((d, k) => photos.push(clock + seconds + MotionTimes.timeAt(d, length, plan.speed) + k * slow));
        seconds += MotionTimes.straight(length, plan.speed) + distances.length * slow;
      }
      segments.push(seconds);
      clock += seconds;
    });
    return { segments, photos };
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

    const [firstOffset, lineCount] = lineLayout(polygon, across, spacing);

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

  /**
   * En cuántas partes se divide el tramo entre dos cruces (`crossing` m, la separación de las
   * líneas de la otra pasada) para que entre foto y foto no haya más de `photo` m: al menos dos.
   */
  crossingDivisions: (crossing, photo) => Math.max(2, Math.ceil(crossing / photo - 1e-9)),

  /**
   * Fotos en los cruces del patrón cruzado: cada línea de una pasada toma una foto donde la cruza
   * cada línea de la otra y `divisions` - 1 más repartidas entre cruce y cruce (y siguiendo igual
   * hasta los bordes). La segunda pasada no repite los cruces que ya fotografió la primera, así no
   * quedan dos fotos en el mismo sitio. Cada tramo lleva `photos`: dónde toma cada foto, en orden y
   * como fracción del tramo (0 = start, 1 = end).
   *
   * `directions`, `lines` y `divisions`: el rumbo, la separación entre líneas y las partes entre
   * cruces de cada pasada; `first` y `second`, los tramos de cada una ya ordenados.
   */
  crossingPhotos(boundary, directions, lines, divisions, first, second) {
    const pr = projection(Geo.centroid(boundary));
    const polygon = boundary.map(pr.toLocal);
    const dot = (a, b) => a.x * b.x + a.y * b.y;
    const alongs = directions.map((d) => ({ x: Math.sin(rad(d)), y: Math.cos(rad(d)) }));
    const acrosses = directions.map((d) => ({ x: Math.cos(rad(d)), y: -Math.sin(rad(d)) }));
    const firsts = directions.map((d, i) => lineLayout(polygon, acrosses[i], lines[i])[0]);
    // Los cruces que fotografía la primera pasada: por línea, de qué foto a qué foto (contadas
    // desde la primera línea de la otra pasada).
    const shot = new Map();

    const photos = (pass, leg) => {
      const other = 1 - pass;
      const a = pr.toLocal(leg.start);
      const b = pr.toLocal(leg.end);
      // A lo largo de esta línea, las de la otra pasada están en first + j·separación (en su eje).
      const sign = dot(alongs[pass], acrosses[other]);
      const step = lines[other] / divisions[pass];
      const ua = dot(a, alongs[pass]);
      const va = ua * sign;
      const vb = dot(b, alongs[pass]) * sign;
      const from = Math.ceil((Math.min(va, vb) - firsts[other]) / step - 1e-6);
      const to = Math.floor((Math.max(va, vb) - firsts[other]) / step + 1e-6);
      const line = Math.round((dot(a, acrosses[pass]) - firsts[pass]) / lines[pass]);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const fractions = [];
      for (let k = from; k <= to; k++) {
        if (pass === 1 && k % divisions[1] === 0) {
          // Un cruce con la línea k / divisiones de la primera pasada: si ya tiene foto, no se repite.
          const range = shot.get(k / divisions[1]);
          const crossing = line * divisions[0];
          if (range && crossing >= range[0] && crossing <= range[1]) continue;
        }
        const u = (firsts[other] + k * step) / sign;
        fractions.push(length > 0 ? Math.min(1, Math.abs(u - ua) / length) : 0);
      }
      if (pass === 0) shot.set(line, [from, to]);
      return { ...leg, photos: fractions.sort((p, q) => p - q) };
    };

    return first.map((leg) => photos(0, leg)).concat(second.map((leg) => photos(1, leg)));
  },
};

/** Hacia dónde mira el dron en un tramo del mapa con rumbo `legBearing`, en una pasada con rumbo `passDirection` (FlightCompiler.mapHeading). */
function mapHeading(mission, legBearing, passDirection) {
  switch (mission.heading) {
    case "left":
      return Geo.normalize(passDirection - 90);
    case "right":
      return Geo.normalize(passDirection + 90);
    case "custom":
      return Geo.normalize(mission.headingReference === "path" ? legBearing + mission.headingAngle : mission.headingAngle);
    default:
      return Geo.normalize(legBearing);
  }
}

/** Las líneas que cruzan el área (de lado a lado según `across`): [la primera, cuántas], centradas en su ancho. */
function lineLayout(polygon, across, spacing) {
  const offsets = polygon.map((p) => p.x * across.x + p.y * across.y);
  const minOffset = Math.min(...offsets);
  const maxOffset = Math.max(...offsets);
  const lineCount = Math.max(1, Math.ceil((maxOffset - minOffset) / spacing));
  // Centra las líneas dentro del ancho del área.
  return [minOffset + (maxOffset - minOffset - (lineCount - 1) * spacing) / 2, lineCount];
}

/**
 * Ordena los tramos para empezar en la esquina más cercana a `point`: la cuadrícula puede
 * recorrerse al derecho o al revés, y cada tramo en un sentido u otro.
 */
function startNearest(point, legs) {
  if (legs.length === 0) return legs;
  const flipped = legs.map((leg) => ({ ...leg, start: leg.end, end: leg.start }));
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
    ...leg,
    start: pr.toGeo({ x: a.x - ux * meters, y: a.y - uy * meters }),
    end: pr.toGeo({ x: b.x + ux * meters, y: b.y + uy * meters }),
  };
}

// ---- Corredor ----

/** Una esquina por fuera que haría una punta más larga que esto (en veces la distancia) se corta. */
const MITER_LIMIT = 2;
/** Puntos más cerca que esto (m) cuentan como uno. */
const SAME_POINT = 0.5;
/** Segundos para frenar, girar y arrancar en cada tramo de un corredor. */
const CORRIDOR_TURN_SECONDS = 4;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k });
const dotV = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const lengthV = (a) => Math.hypot(a.x, a.y);

function dedupe(points) {
  const out = [];
  for (const p of points) if (!out.length || lengthV(sub(p, out.at(-1))) >= SAME_POINT) out.push(p);
  return out;
}

/** Dónde se unen dos tramos corridos: en la esquina donde se cruzan, o cortada si haría mucha punta. */
function joinEdges(a, b, d) {
  const turn = cross(a.dir, b.dir);
  const cos = dotV(a.dir, b.dir);
  if (Math.abs(turn) < 1e-9) return cos > 0 ? [a.end] : [a.end, b.start];
  // Gira a la derecha (turn < 0) con la línea a la derecha (d > 0): esa esquina queda por dentro.
  const inside = turn < 0 === d > 0;
  if (!inside && 1 / Math.sqrt((1 + cos) / 2) > MITER_LIMIT) return [a.end, b.start];
  const t = cross(sub(b.start, a.start), b.dir) / turn;
  return [add(a.start, scale(a.dir, t))];
}

/** Las pasadas de un corredor, igual que CorridorPlanner en Kotlin. */
export const CorridorPlanner = {
  /** Separación entre pasadas y entre fotos; el dron mira hacia donde vuela. */
  spacing(c) {
    const [footWidth, footHeight] = MapPlanner.footprint(cameraFor(c), c.altitude);
    return {
      line: Math.max(1, footWidth * (1 - c.sideOverlap / 100)),
      photo: Math.max(0.5, footHeight * (1 - c.frontOverlap / 100)),
    };
  },

  /** Cuántas pasadas cubren `width` metros con pasadas cada `line` metros (como las líneas de un mapa). */
  passCount: (width, line) => Math.max(1, Math.ceil(width / line - 1e-9)),

  /**
   * La línea `points` (en metros) corrida `d` metros a la derecha según el sentido en que va
   * (negativo: a la izquierda). Por fuera de una curva cerrada corta la esquina; por dentro, los
   * tramos que quedarían al revés se quitan para no hacer un rizo.
   */
  offset(points, d) {
    const line = dedupe(points);
    if (line.length < 2 || Math.abs(d) < 1e-9) return line;
    const edges = [];
    for (let i = 1; i < line.length; i++) {
      const v = sub(line[i], line[i - 1]);
      const dir = scale(v, 1 / lengthV(v));
      const normal = { x: dir.y, y: -dir.x };
      edges.push({ start: add(line[i - 1], scale(normal, d)), end: add(line[i], scale(normal, d)), dir });
    }
    for (;;) {
      const joins = edges.slice(0, -1).map((edge, i) => joinEdges(edge, edges[i + 1], d));
      const entries = edges.map((edge, i) => (i === 0 ? edge.start : joins[i - 1].at(-1)));
      const exits = edges.map((edge, i) => (i === edges.length - 1 ? edge.end : joins[i][0]));
      const reversed = edges.findIndex((edge, i) => dotV(sub(exits[i], entries[i]), edge.dir) < 0);
      if (reversed < 0 || edges.length === 1) return dedupe([entries[0], ...joins.flat(), exits.at(-1)]);
      edges.splice(reversed, 1);
    }
  },

  /** `from`: de dónde viene el dron, para empezar en el extremo más cercano. */
  plan(c, from = null) {
    if (c.path.length < 2) return null;
    const pr = projection(Geo.centroid(c.path));
    const center = dedupe(c.path.map(pr.toLocal));
    if (center.length < 2) return null;
    const photos = c.captureMode === "photo";
    const spacing = CorridorPlanner.spacing(c);
    // La cámara no puede tomar fotos más seguidas que el tiempo mínimo entre fotos: se vuela más
    // lento y, si ni así alcanza, se detiene en cada foto.
    const interval = captureInterval(c);
    const cameraStops = photos && PhotoPace.mustStop(spacing.photo, interval);
    const speed = photos ? PhotoPace.speed(c.maxSpeed, spacing.photo, interval) : c.maxSpeed;
    const count = CorridorPlanner.passCount(c.width, spacing.line);
    let passes = [];
    for (let i = 0; i < count; i++) {
      // De izquierda a derecha, en sentidos alternos.
      const line = CorridorPlanner.offset(center, (i - (count - 1) / 2) * spacing.line);
      passes.push((i % 2 === 0 ? line : [...line].reverse()).map(pr.toGeo));
    }
    if (from) {
      const flipped = passes.map((pass) => [...pass].reverse());
      const options = [passes, flipped, [...passes].reverse(), [...flipped].reverse()];
      passes = options.reduce((best, option) => (Geo.distance(from, option[0][0]) < Geo.distance(from, best[0][0]) ? option : best));
    }
    const positions = passes.reduce((sum, pass) => sum + Math.floor(Geo.pathLength(pass) / spacing.photo + 1e-9) + 1, 0);
    const path = passes.flat();
    const length = Geo.pathLength(path);
    const segments = passes.reduce((sum, pass) => sum + pass.length - 1, 0);
    const captureSpeed = cameraStops ? 0 : photos ? c.captureSpeed : null;
    const stops = positions * PhotoPace.stopSeconds(speed, captureSpeed, spacing.photo, interval);
    return {
      passes,
      path,
      lineSpacing: spacing.line,
      photoSpacing: spacing.photo,
      speed,
      positions: photos ? positions : 0,
      photoCount: photos ? positions * shotsOf(c.photoType) : 0,
      lengthMeters: length,
      durationSeconds: length / speed + segments * CORRIDOR_TURN_SECONDS + stops,
      gsdCmPerPx: MapPlanner.gsd(cameraFor(c), c.altitude),
      centerMeters: Geo.pathLength(c.path),
      captureSpeed,
      cameraStops,
    };
  },

  /** El borde del corredor (el lado izquierdo de ida y el derecho de vuelta), o vacío sin ancho. */
  outline(c) {
    if (c.path.length < 2 || c.width < 1) return [];
    const pr = projection(Geo.centroid(c.path));
    const center = dedupe(c.path.map(pr.toLocal));
    if (center.length < 2) return [];
    const left = CorridorPlanner.offset(center, -c.width / 2);
    const right = CorridorPlanner.offset(center, c.width / 2);
    return [...left, ...right.reverse()].map(pr.toGeo);
  },
};

// ---- Fachada ----

const bearingOfV = (v) => Geo.normalize(deg(Math.atan2(v.x, v.y)));
const unitV = (bearing) => ({ x: Math.sin(rad(bearing)), y: Math.cos(rad(bearing)) });
const pathLengthV = (points) => points.slice(1).reduce((sum, p, i) => sum + lengthV(sub(p, points[i])), 0);

/** Si el tramo p–q cruza el tramo a–b (tocarlo en un extremo no cuenta). */
function segmentsCross(p, q, a, b) {
  const d1 = cross(sub(q, p), sub(a, p));
  const d2 = cross(sub(q, p), sub(b, p));
  const d3 = cross(sub(b, a), sub(p, a));
  const d4 = cross(sub(b, a), sub(q, a));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Columnas a lo largo de `path` (cada tramo dividido en partes iguales de `spacing` o menos), con
 * el rumbo de cada tramo y, en las esquinas, el del medio. Cerrado: el último punto es el primero.
 */
function spreadColumns(path, headings, spacing, closed) {
  const columns = [];
  const segments = path.length - 1;
  for (let k = 0; k < segments; k++) {
    const a = path[k];
    const v = sub(path[k + 1], a);
    const parts = Math.max(1, Math.ceil(lengthV(v) / spacing - 1e-9));
    // Cada tramo pone su esquina de inicio y las de adentro; la del final es el inicio del siguiente.
    for (let j = 0; j < parts; j++) {
      const corner = j === 0 && (k > 0 || closed);
      const before = headings[(k - 1 + segments) % segments];
      const heading = corner ? Geo.normalize(before + angleDifference(before, headings[k]) / 2) : headings[k];
      columns.push({ position: add(a, scale(v, j / parts)), heading });
    }
  }
  if (!closed) columns.push({ position: path.at(-1), heading: headings.at(-1) });
  return columns;
}

/** El contorno (antihorario) corrido `d` metros hacia afuera; las puntas muy agudas se cortan. */
function facadeOutline(points, d) {
  const n = points.length;
  const dirs = points.map((p, i) => {
    const v = sub(points[(i + 1) % n], p);
    return scale(v, 1 / lengthV(v));
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const before = dirs[(i - 1 + n) % n];
    const after = dirs[i];
    const n1 = { x: before.y, y: -before.x };
    const n2 = { x: after.y, y: -after.x };
    const turn = cross(before, after);
    const cos = dotV(before, after);
    const p = points[i];
    if (Math.abs(turn) < 1e-9) {
      out.push(add(p, scale(n2, d)));
    } else if (turn > 0 && 1 / Math.sqrt((1 + cos) / 2) > MITER_LIMIT) {
      // Esquina por fuera muy aguda: dos puntos en vez de una punta larga.
      out.push(add(p, scale(n1, d)), add(p, scale(n2, d)));
    } else {
      // Donde se cruzan las dos orillas corridas.
      const a = add(p, scale(n1, d));
      const b = add(p, scale(n2, d));
      out.push(add(a, scale(before, cross(sub(b, a), after) / turn)));
    }
  }
  return dedupe(out);
}

/** Un lado: la línea corrida hacia el lado del dron; si viene del otro lado, entra pasando el extremo. */
function facadeLine(c, pr, spacing, standoff, from) {
  const points = dedupe(c.boundary.map(pr.toLocal));
  if (points.length < 2) return null;
  const right = c.side === "right";
  const path = CorridorPlanner.offset(points, right ? standoff : -standoff);
  if (path.length < 2) return null;
  // La cara queda a la derecha del dron si vuela por la izquierda de la línea, y al revés.
  const headings = path.slice(1).map((b, i) => Geo.normalize(bearingOfV(sub(b, path[i])) + (right ? -90 : 90)));
  let columns = spreadColumns(path, headings, spacing, false);
  const reversed = from !== null && lengthV(sub(columns.at(-1).position, from)) < lengthV(sub(columns[0].position, from));
  if (reversed) columns = columns.reverse();
  const crosses = from !== null && points.slice(1).some((b, i) => segmentsCross(from, columns[0].position, points[i], b));
  let entry = null;
  if (crosses) {
    // En la prolongación de la pared, a la misma distancia del extremo que el dron de la cara.
    const end = reversed ? points.at(-1) : points[0];
    const next = reversed ? points.at(-2) : points[1];
    const out = sub(end, next);
    entry = add(end, scale(scale(out, 1 / lengthV(out)), standoff));
  }
  return { columns, meters: pathLengthV(points), entry };
}

/** Redonda: columnas repartidas alrededor del círculo, mirando al centro. */
function facadeCircle(c, pr, spacing, standoff, from) {
  const radius = lengthV(pr.toLocal(c.boundary[1]));
  if (radius < SAME_POINT) return null;
  const flown = radius + standoff;
  const count = Math.max(4, Math.ceil((2 * Math.PI * radius) / spacing - 1e-9));
  const start = from && lengthV(from) > 1 ? bearingOfV(from) : 180;
  const columns = Array.from({ length: count }, (_, k) => {
    const bearing = Geo.normalize(start + (360 * k) / count);
    return { position: scale(unitV(bearing), flown), heading: Geo.normalize(bearing + 180) };
  });
  return { columns, meters: 2 * Math.PI * radius, entry: null };
}

/** Con esquinas: el contorno corrido hacia afuera, con columnas en cada esquina, empezando por la más cercana. */
function facadePolygon(c, pr, spacing, standoff, from) {
  let points = dedupe(c.boundary.map(pr.toLocal));
  if (points.length > 2 && lengthV(sub(points[0], points.at(-1))) < SAME_POINT) points = points.slice(0, -1);
  if (points.length < 3) return null;
  // Siempre en sentido antihorario (visto desde arriba): así "afuera" es a la derecha.
  const area = points.reduce((sum, p, i) => sum + cross(p, points[(i + 1) % points.length]), 0) / 2;
  if (Math.abs(area) < 1) return null;
  if (area < 0) points = [...points].reverse();
  const loop = facadeOutline(points, standoff);
  // Mirando hacia adentro: a la izquierda del sentido en que va.
  const headings = loop.map((a, i) => Geo.normalize(bearingOfV(sub(loop[(i + 1) % loop.length], a)) - 90));
  let columns = spreadColumns([...loop, loop[0]], headings, spacing, true);
  if (from) {
    let nearest = 0;
    columns.forEach((column, i) => {
      if (lengthV(sub(column.position, from)) < lengthV(sub(columns[nearest].position, from))) nearest = i;
    });
    columns = [...columns.slice(nearest), ...columns.slice(0, nearest)];
  }
  return { columns, meters: pathLengthV([...points, points[0]]), entry: null };
}

/** Las paradas de una fachada, igual que FacadePlanner en Kotlin. */
export const FacadePlanner = {
  /** Subida y bajada entre filas (m/s). */
  CLIMB_SPEED: 2,
  /** Segundos para frenar y quedarse quieto en cada parada. */
  SETTLE_SECONDS: 2,
  /** Segundos para disparar y guardar la foto en cada parada. */
  PHOTO_SECONDS: 3,
  /** Más paradas que esto no caben en un vuelo (una cara marcada con el mapa muy alejado). */
  MAX_STATIONS: 3000,

  /** Ya tiene la cara marcada: dos puntos de una línea o de un círculo, o tres esquinas. */
  hasShape: (c) => c.boundary.length >= (c.face === "polygon" ? 3 : 2),

  /** Metros entre columnas y entre filas en la cara. */
  spacing(c) {
    if (c.spacing === "distance") return [Math.max(0.5, c.horizontalDistance), Math.max(0.5, c.verticalDistance)];
    const [width, height] = MapPlanner.footprint(cameraFor(c), c.distance);
    return [Math.max(0.5, width * (1 - c.horizontalOverlap / 100)), Math.max(0.5, height * (1 - c.verticalOverlap / 100))];
  },

  /** Distancia en el suelo: con la cámara inclinada, la distancia hasta la cara se mide por donde mira. */
  standoff: (c) => Math.max(1, c.distance * Math.cos(rad(c.gimbalPitch))),

  /** Las alturas de las filas, de la primera a la última. */
  levels(c, vertical) {
    const span = c.finalAltitude - c.altitude;
    if (Math.abs(span) < 0.01) return [c.altitude];
    const count = Math.max(1, Math.ceil(Math.abs(span) / vertical - 1e-9));
    return Array.from({ length: count + 1 }, (_, i) => c.altitude + (span * i) / count);
  },

  /** `from`: de dónde viene el dron, para empezar en el extremo (o el punto del contorno) más cercano. */
  plan(c, from = null) {
    if (c.boundary.length < 2) return null;
    const pr = projection(c.face === "circle" ? c.boundary[0] : Geo.centroid(c.boundary));
    const [horizontal, vertical] = FacadePlanner.spacing(c);
    const standoff = FacadePlanner.standoff(c);
    const here = from ? pr.toLocal(from) : null;
    const shape = c.face === "circle" ? facadeCircle : c.face === "polygon" ? facadePolygon : facadeLine;
    const face = shape(c, pr, horizontal, standoff, here);
    if (!face) return null;
    const { columns } = face;
    const closed = c.face !== "line";
    const levels = FacadePlanner.levels(c, vertical);
    if (columns.length * levels.length > FacadePlanner.MAX_STATIONS) return null;

    const order = [];
    if (c.pattern === "horizontal") {
      levels.forEach((_, j) => {
        // Alrededor de una estructura cada fila da la vuelta en el mismo sentido; en un lado, va y viene.
        const cols = columns.map((_, i) => i);
        if (!closed && j % 2 === 1) cols.reverse();
        cols.forEach((i) => order.push([i, j]));
      });
    } else {
      columns.forEach((_, i) => {
        const rows = levels.map((_, j) => j);
        if (i % 2 === 1) rows.reverse();
        rows.forEach((j) => order.push([i, j]));
      });
    }
    const stations = order.map(([i, j]) => ({ position: pr.toGeo(columns[i].position), altitude: levels[j], heading: columns[i].heading, column: i, row: j }));

    let length = 0;
    let seconds = 0;
    if (face.entry) {
      const h = lengthV(sub(columns[order[0][0]].position, face.entry));
      length += h;
      seconds += h / Math.max(0.5, c.speed);
    }
    for (let k = 1; k < order.length; k++) {
      const [a, b] = [order[k - 1], order[k]];
      const h = lengthV(sub(columns[b[0]].position, columns[a[0]].position));
      const v = Math.abs(levels[b[1]] - levels[a[1]]);
      length += h + v;
      seconds += h / Math.max(0.5, c.speed) + v / FacadePlanner.CLIMB_SPEED + FacadePlanner.SETTLE_SECONDS;
    }
    const photos = c.captureMode === "photo";
    if (photos) seconds += stations.length * FacadePlanner.PHOTO_SECONDS;
    const entry = face.entry ? pr.toGeo(face.entry) : null;
    const path = [];
    for (const p of [...(entry ? [entry] : []), ...stations.map((s) => s.position)]) {
      if (!path.length || Geo.distance(path.at(-1), p) > 0.01) path.push(p);
    }
    return {
      stations,
      entry,
      path,
      columns: columns.length,
      rows: levels.length,
      horizontalSpacing: horizontal,
      verticalSpacing: vertical,
      standoff,
      faceMeters: face.meters,
      photoCount: photos ? stations.length * shotsOf(c.photoType) : 0,
      lengthMeters: length,
      durationSeconds: seconds,
      gsdCmPerPx: MapPlanner.gsd(cameraFor(c), c.distance),
    };
  },

  /** El círculo de una estructura redonda, para dibujarla. */
  circleOutline(c, steps = 48) {
    if (c.face !== "circle" || c.boundary.length < 2) return [];
    const pr = projection(c.boundary[0]);
    const radius = lengthV(pr.toLocal(c.boundary[1]));
    return Array.from({ length: steps }, (_, i) => pr.toGeo(scale(unitV((360 * i) / steps), radius)));
  },

  /** Lo más alto que vuela. */
  highest: (c) => Math.max(c.altitude, c.finalAltitude),

  /** Lo que se dibujó: la línea, el contorno o el círculo. */
  points: (c) => (c.face === "circle" ? (FacadePlanner.circleOutline(c).length ? FacadePlanner.circleOutline(c) : c.boundary) : c.boundary),
};

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
    const photoCount = mission.captureMode === "photo" ? Math.floor(duration / captureInterval(mission)) + 1 : 0;
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

// ---- Componentes de puntos: waypoints, foto y panorámica (Panorama.kt y PointsPlanner) ----

/** Segundos para girar, apuntar la cámara, disparar y guardar una foto en un punto. */
const PHOTO_SECONDS = 4;
/** Segundos para girar hacia el rumbo de un punto. */
const TURN_SECONDS = 2;
/** Segundos por foto de una panorámica (igual que PanoramaMotion). */
const PANO_SECONDS_PER_PHOTO = 4.5;
/** Segundos por foto en un punto: nunca menos de lo que la cámara necesita entre una foto y otra. */
export const photoSeconds = (photoSize) => Math.max(PHOTO_SECONDS, minPhotoInterval(photoSize));
/** Segundos por foto de una panorámica, igual que PanoramaMotion. */
const panoSeconds = (photoSize) => Math.max(PANO_SECONDS_PER_PHOTO, minPhotoInterval(photoSize));

const shotsOf = (photoType) => (photoType === "aeb5" ? 5 : photoType === "aeb3" ? 3 : 1);

export const PanoPlan = {
  LOWEST: -90,

  /**
   * Las fotos de cada panorámica: {heading, pitch}. `heading` y `pitch` son hacia dónde miran el
   * dron y la cámara en el centro de la toma. Fila por fila, cada una en sentido contrario.
   */
  shots(type, heading, pitch) {
    const ring = (count) => Array.from({ length: count }, (_, i) => (360 * i) / count);
    const fan = (count, step) => Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
    const rows = (list) =>
      list.flatMap(([rowPitch, offsets], i) =>
        (i % 2 === 0 ? offsets : [...offsets].reverse()).map((offset) => ({ heading: Geo.normalize(heading + offset), pitch: rowPitch })),
      );
    switch (type) {
      case "180":
        return rows([0, -30, -60].map((p) => [p, fan(5, 45)]));
      case "wide": {
        const top = Math.min(0, pitch + 25);
        return rows([top, top - 25, top - 50].map((p) => [Math.max(PanoPlan.LOWEST, p), fan(3, 40)]));
      }
      case "vertical": {
        const top = Math.min(0, pitch + 35);
        return [top, top - 35, top - 70].map((p) => ({ heading, pitch: Math.max(PanoPlan.LOWEST, p) }));
      }
      default:
        return [
          ...rows([
            [0, ring(8)],
            [-30, ring(8)],
            [-60, ring(6)],
          ]),
          { heading, pitch: PanoPlan.LOWEST },
        ];
    }
  },

  /** Cuánto del horizonte cubre cada una, para dibujarla. */
  coverage: (type) => ({ sphere: 360, 180: 180, wide: 120, vertical: 70 })[type] ?? 360,
};

/** Ancho de lo que ve la cámara del Mini 4 Pro en 4:3, en grados. */
export const LENS_DEGREES = 70;

/**
 * Hacia dónde mira el dron en el waypoint `i`: su rumbo propio o, si no tiene, hacia donde llega
 * volando. En el primero, `arrival` (de donde viene el dron) o hacia el segundo.
 */
export function waypointHeading(component, i, arrival = null) {
  const points = component.points;
  if (points[i].heading !== null && points[i].heading !== undefined) return points[i].heading;
  const leg = (from) => {
    const a = points[from];
    const b = points[from + 1];
    if (!a || !b || Geo.distance(a.position, b.position) <= 1) return null;
    return Geo.bearing(a.position, b.position);
  };
  return leg(i - 1) ?? (i === 0 ? arrival : null) ?? leg(i) ?? 0;
}

export const PointsPlanner = {
  waypoints(c) {
    if (!c.points.length) return null;
    let horizontal = 0;
    let flying = 0;
    // Como lo vuela el piloto automático: sube antes y baja después de cada tramo, gira quieto si el
    // tramo va hacia otro lado, arranca y frena.
    let moving = 0;
    let heading = null;
    let stops = 0;
    let photos = 0;
    c.points.forEach((point, i) => {
      if (i > 0) {
        const previous = c.points[i - 1];
        const meters = Geo.distance(previous.position, point.position);
        const climb = point.altitude - previous.altitude;
        horizontal += meters;
        flying += meters / Math.max(0.5, c.speed) + Math.abs(climb) / VERTICAL_SPEED;
        moving += MotionTimes.climb(Math.max(0, climb)) + MotionTimes.climb(Math.max(0, -climb));
        if (meters > MotionTimes.ARRIVAL) {
          const bearing = Geo.bearing(previous.position, point.position);
          moving += (heading === null ? 0 : MotionTimes.turn(angleDifference(heading, bearing))) + MotionTimes.straight(meters, Math.max(0.5, c.speed));
          heading = bearing;
        }
      }
      const pointHeading = point.heading !== null && point.heading !== undefined;
      if (pointHeading || (point.action === "photo" && c.captureMode !== "video")) heading = waypointHeading(c, i);
      if (pointHeading) stops += TURN_SECONDS;
      if (point.action === "photo") {
        stops += photoSeconds(c.photoSize);
        if (c.captureMode !== "video") photos++;
      } else if (point.action === "hover") {
        stops += point.hoverSeconds;
      }
    });
    if (c.captureMode === "photo" && flying > 0) photos += Math.floor(flying / captureInterval(c)) + 1;
    return {
      path: c.points.map((p) => p.position),
      altitudes: c.points.map((p) => p.altitude),
      lengthMeters: horizontal,
      durationSeconds: moving + stops,
      photoCount: photos,
    };
  },

  photo(c) {
    if (!c.position) return null;
    return { path: [c.position], altitudes: [c.altitude], lengthMeters: 0, durationSeconds: photoSeconds(c.photoSize) + TURN_SECONDS, photoCount: shotsOf(c.photoType) };
  },

  pano(c) {
    if (!c.position) return null;
    const shots = PanoPlan.shots(c.panoType, c.heading, c.gimbalPitch).length;
    return { path: [c.position], altitudes: [c.altitude], lengthMeters: 0, durationSeconds: shots * panoSeconds(c.photoSize), photoCount: shots };
  },

  /** Comandos: en su punto o, sin punto, donde terminó lo anterior (`from`). */
  commands(c, from = null) {
    const position = c.position ?? from;
    if (!position) return null;
    let seconds = 0;
    let photos = 0;
    let altitude = c.altitude;
    for (const command of c.commands) {
      if (command.type === "wait") seconds += Math.max(0, command.value);
      else if (command.type === "photo") {
        seconds += photoSeconds(c.photoSize);
        photos++;
      } else if (command.type === "heading") seconds += TURN_SECONDS;
      else if (command.type === "altitude") {
        seconds += Math.abs(command.value - altitude) / VERTICAL_SPEED;
        altitude = command.value;
      }
    }
    return { path: [position], altitudes: [c.altitude], lengthMeters: 0, durationSeconds: seconds, photoCount: photos };
  },
};

/** El modo en que empieza la cámara en unos comandos: el de la primera foto o grabación de la lista. */
export function commandsCaptureMode(c) {
  const first = c.commands.find((command) => command.type === "photo" || command.type === "videoStart");
  return first?.type === "photo" ? "photo" : first?.type === "videoStart" ? "video" : "none";
}

/** Las alturas por las que pasan unos comandos: la de llegada y la de cada «Cambiar de altura». */
export const commandAltitudes = (c) => [c.altitude, ...c.commands.filter((command) => command.type === "altitude").map((command) => command.value)];

// ---- Planes (formato JSON v2, igual que MissionJson.kt) ----
// Una misión es un plan con varios componentes en fila (mapas, órbitas, waypoints, fotos y
// panorámicas), como en Dronelink:
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
    // La altura es sobre el suelo de cada punto (siguiendo el terreno), no sobre el despegue.
    terrainFollow: false,
    boundary,
    frontOverlap: 75,
    sideOverlap: 70,
    direction: 0,
    pattern: "normal",
    // En el patrón oblicuo: la inclinación de la cámara en las cuatro pasadas de lado (-80 a -20).
    obliquePitch: -45,
    // En el patrón cruzado: las fotos en los cruces de las líneas y repartidas entre cruce y cruce
    // (al menos a la mitad), en lugar de cada tantos metros desde el borde. Cada cruce se fotografía
    // una sola vez.
    gridPhotos: false,
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
    photoInterval: 5,
    photoSize: "48mp",
    ...emptyCameraSettings(),
  };
}

/** Un recorrido por puntos, como "Waypoints" en Dronelink y DJI Fly. */
export function newWaypointsComponent(points = []) {
  return {
    id: componentId(),
    type: "waypoints",
    name: null,
    enabled: true,
    // Altura de los puntos nuevos.
    altitude: 30,
    // Las alturas de los puntos son sobre el suelo de cada uno, no sobre el despegue.
    terrainFollow: false,
    points,
    speed: 5,
    // Ángulo de la cámara en los puntos que no tienen uno propio.
    gimbalPitch: -30,
    captureMode: "none",
    photoInterval: 5,
    photoSize: "48mp",
    ...emptyCameraSettings(),
  };
}

/** Un punto de un recorrido. heading y gimbalPitch null: hacia donde vuela y el del componente. */
export function newWaypoint(position, altitude) {
  return { position, altitude, heading: null, gimbalPitch: null, action: "none", hoverSeconds: 3 };
}

/** Una foto desde un punto: el dron va ahí, se gira, apunta la cámara y dispara. */
export function newPhotoComponent(position = null) {
  return {
    id: componentId(),
    type: "photo",
    name: null,
    enabled: true,
    altitude: 30,
    terrainFollow: false,
    position,
    heading: 0,
    gimbalPitch: -30,
    captureMode: "photo",
    photoSize: "48mp",
    photoType: "single",
    ...emptyCameraSettings(),
  };
}

/**
 * Corredor: franjas paralelas a lo largo de una línea (un río, un camino, una costa). Con ancho 0
 * vuela solo la línea, útil para video.
 */
export function newCorridorComponent(path = []) {
  return {
    id: componentId(),
    type: "corridor",
    name: null,
    enabled: true,
    altitude: 30,
    terrainFollow: false,
    // La línea del centro, en el orden en que se dibujó.
    path,
    // Ancho que se quiere cubrir (m), la mitad a cada lado de la línea.
    width: 40,
    frontOverlap: 75,
    sideOverlap: 70,
    gimbalPitch: -90,
    maxSpeed: 8,
    minPhotoInterval: 5,
    captureMode: "photo",
    photoSize: "48mp",
    photoType: "single",
    captureSpeed: null,
    ...emptyCameraSettings(),
  };
}

/** Panorámica desde un punto, como el componente "Panorama" de Dronelink y las de DJI Fly. */
export function newPanoComponent(position = null) {
  return {
    id: componentId(),
    type: "pano",
    name: null,
    enabled: true,
    altitude: 40,
    terrainFollow: false,
    position,
    panoType: "sphere",
    heading: 0,
    gimbalPitch: 0,
    captureMode: "photo",
    photoSize: "48mp",
    ...emptyCameraSettings(),
  };
}

/**
 * Fachada, como el componente "Facade" de Dronelink: fotos frente a una cara vertical (un lado de
 * un edificio) o alrededor de una estructura, a `distance` metros, en columnas o filas desde
 * `altitude` hasta `finalAltitude`. El dron se detiene en cada foto mirando a la cara.
 */
export function newFacadeComponent(face = "line", boundary = []) {
  return {
    id: componentId(),
    type: "facade",
    name: null,
    enabled: true,
    face,
    // Un lado: el borde de la cara. Redonda: [centro, un punto del borde]. Con esquinas: el contorno.
    boundary,
    side: "left",
    distance: 10,
    // Altura de la primera fila y de la última.
    altitude: 10,
    finalAltitude: 30,
    pattern: "vertical",
    horizontalOverlap: 50,
    verticalOverlap: 50,
    spacing: "overlap",
    horizontalDistance: 5,
    verticalDistance: 5,
    // 0 = mirando de frente a la cara.
    gimbalPitch: 0,
    speed: 3,
    captureMode: "photo",
    photoSize: "48mp",
    photoType: "single",
    ...emptyCameraSettings(),
  };
}

/** Un comando de la lista, con el número que le toca a su tipo. */
export function newCommand(type, value = null) {
  return { type, value: value ?? COMMAND_TYPES.find(([key]) => key === type)?.[3] ?? 0 };
}

/**
 * Comandos, como el componente "Commands" de Dronelink: el dron va a un punto (o se queda donde
 * terminó lo anterior) y hace una lista en orden: esperar, fotos, grabar, gimbal, girar o altura.
 */
export function newCommandsComponent(position = null, commands = [newCommand("wait"), newCommand("photo")]) {
  return {
    id: componentId(),
    type: "commands",
    name: null,
    enabled: true,
    // null = donde terminó el componente anterior.
    position,
    // Altura al llegar, y el ángulo de la cámara hasta que un comando lo cambie.
    altitude: 30,
    gimbalPitch: -30,
    commands,
    photoSize: "48mp",
    ...emptyCameraSettings(),
  };
}

/**
 * Zona restringida, como "Restriction Zone" en Dronelink: un área donde el dron no debe entrar, a
 * todas las alturas o entre minAltitude y maxAltitude (null = sin límite). No se vuela: los
 * tránsitos la rodean y la misión no se deja volar si una ruta entra.
 */
export function newZoneComponent(shape = "polygon", boundary = []) {
  return {
    id: componentId(),
    type: "zone",
    name: null,
    enabled: true,
    shape,
    // Con esquinas: el contorno. Redonda: [centro, un punto del borde].
    boundary,
    minAltitude: null,
    maxAltitude: null,
  };
}

const NEW_COMPONENTS = {
  map: newMapComponent,
  corridor: newCorridorComponent,
  orbit: newOrbitComponent,
  waypoints: newWaypointsComponent,
  photo: newPhotoComponent,
  pano: newPanoComponent,
  facade: newFacadeComponent,
  commands: newCommandsComponent,
  zone: newZoneComponent,
};

/** Si esta versión sabe editar y volar el componente (uno de una versión más nueva se guarda tal cual). */
export const isKnown = (component) => Object.hasOwn(NEW_COMPONENTS, component.type);

const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const optionalNumber = (value) => (Number.isFinite(value) ? value : null);

function normalizeWaypoint(json, altitude) {
  if (!json || !isPoint(json.position)) return null;
  const point = { ...newWaypoint(json.position, finite(json.altitude, altitude)) };
  point.heading = optionalNumber(json.heading);
  point.gimbalPitch = optionalNumber(json.gimbalPitch);
  if (WAYPOINT_ACTIONS.some(([value]) => value === json.action)) point.action = json.action;
  if (Number.isFinite(json.hoverSeconds) && json.hoverSeconds >= 0) point.hoverSeconds = json.hoverSeconds;
  return point;
}

/** Completa un componente leído de un archivo con los valores por defecto, como en Kotlin. */
export function normalizeComponent(json) {
  const type = json.type === undefined || json.type === "" ? "map" : json.type;
  if (!Object.hasOwn(NEW_COMPONENTS, type)) {
    // De una versión más nueva: se guarda tal cual, con el nombre y el encendido que tenga aquí.
    const unknown = { ...json };
    if (typeof unknown.id !== "string" || !unknown.id) unknown.id = componentId();
    if (typeof unknown.name !== "string" || !unknown.name.trim()) delete unknown.name;
    unknown.enabled = unknown.enabled !== false;
    return unknown;
  }
  const base = NEW_COMPONENTS[type]();
  const component = { ...base, ...json, type };
  if (typeof component.id !== "string" || !component.id) component.id = base.id;
  if (typeof component.name !== "string" || !component.name.trim()) component.name = null;
  component.enabled = component.enabled !== false;
  if ("terrainFollow" in base) component.terrainFollow = component.terrainFollow === true;
  if (type === "map") {
    component.obliquePitch = finite(component.obliquePitch, base.obliquePitch);
    component.gridPhotos = component.gridPhotos === true;
  }
  if (type === "waypoints") {
    component.altitude = finite(component.altitude, base.altitude);
    component.points = (Array.isArray(json.points) ? json.points : []).map((p) => normalizeWaypoint(p, component.altitude)).filter(Boolean);
    if (!(component.speed > 0)) component.speed = base.speed;
    if (!(component.photoInterval > 0)) component.photoInterval = base.photoInterval;
  }
  if (type === "corridor") {
    component.path = (Array.isArray(json.path) ? json.path : []).filter(isPoint);
    if (!(component.width >= 0)) component.width = base.width;
    if (!(component.maxSpeed > 0)) component.maxSpeed = base.maxSpeed;
    if (!(component.minPhotoInterval > 0)) component.minPhotoInterval = base.minPhotoInterval;
    if (!Number.isFinite(component.captureSpeed)) component.captureSpeed = null;
  }
  if (type === "facade") {
    component.boundary = (Array.isArray(json.boundary) ? json.boundary : []).filter(isPoint);
    component.altitude = finite(component.altitude, base.altitude);
    component.finalAltitude = finite(json.finalAltitude, component.altitude);
    for (const key of ["distance", "speed", "horizontalDistance", "verticalDistance"]) if (!(component[key] > 0)) component[key] = base[key];
    component.gimbalPitch = finite(component.gimbalPitch, base.gimbalPitch);
  }
  if (type === "commands") {
    if (!isPoint(component.position)) component.position = null;
    component.altitude = finite(component.altitude, base.altitude);
    component.gimbalPitch = finite(component.gimbalPitch, base.gimbalPitch);
    // Un comando de un tipo que esta versión no conoce se salta.
    component.commands = (Array.isArray(json.commands) ? json.commands : [])
      .filter((command) => command && COMMAND_TYPES.some(([key]) => key === command.type))
      .map((command) => newCommand(command.type, optionalNumber(command.value)));
    // Lo dice la lista; el teléfono lo escribe pero no lo lee.
    delete component.captureMode;
  }
  if (type === "zone") {
    component.boundary = (Array.isArray(json.boundary) ? json.boundary : []).filter(isPoint);
    component.minAltitude = optionalNumber(component.minAltitude);
    component.maxAltitude = optionalNumber(component.maxAltitude);
    delete component.altitude;
    delete component.captureMode;
  }
  if (type === "photo" || type === "pano") {
    if (!isPoint(component.position)) component.position = null;
    component.heading = finite(component.heading, base.heading);
    component.gimbalPitch = finite(component.gimbalPitch, base.gimbalPitch);
    // Siempre toman fotos.
    component.captureMode = "photo";
  }
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
    headingReference: HEADING_REFERENCES,
    panoType: PANO_TYPES,
  };
  if (type === "facade") Object.assign(choices, { face: FACADE_FACES, side: FACADE_SIDES, pattern: FACADE_PATTERNS });
  if (type === "zone") choices.shape = ZONE_SHAPES;
  // En la foto y la panorámica el rumbo es un número.
  if (type === "map") choices.heading = MAP_HEADINGS;
  if (type === "orbit") choices.heading = ORBIT_HEADINGS;
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
  const component = (c) => (c.type === "waypoints" && Array.isArray(c.points) ? { ...compact(c), points: c.points.map(compact) } : compact(c));
  return JSON.stringify({ ...compact(plan), components: plan.components.map(component) }, null, 2) + "\n";
}

/**
 * Copia de un componente con otro identificador, para duplicarlo. Va justo al este del original,
 * a `gap` metros, para que no quede encima.
 */
export function copyComponent(component, gap = 10) {
  const copy = { ...structuredClone(component), id: componentId() };
  const anchor = anchorOf(component);
  if (!anchor) return copy;
  const pr = projection(anchor);
  if (copy.type === "map") {
    const xs = copy.boundary.map((p) => pr.toLocal(p).x);
    const to = pr.toGeo({ x: Math.max(...xs) - Math.min(...xs) + gap, y: 0 });
    copy.boundary = Geo.translate(copy.boundary, anchor, to);
    if (copy.start) copy.start = Geo.translate([copy.start], anchor, to)[0];
  } else if (copy.type === "corridor") {
    const xs = copy.path.map((p) => pr.toLocal(p).x);
    copy.path = Geo.translate(copy.path, anchor, pr.toGeo({ x: Math.max(...xs) - Math.min(...xs) + copy.width + gap, y: 0 }));
  } else if (copy.type === "orbit") {
    const radius = Math.max(copy.radius, copy.finalRadius ?? 0);
    copy.center = pr.toGeo({ x: 2 * radius + gap, y: 0 });
  } else if (copy.type === "waypoints") {
    const xs = copy.points.map((p) => pr.toLocal(p.position).x);
    const to = pr.toGeo({ x: Math.max(...xs) - Math.min(...xs) + gap, y: 0 });
    const moved = Geo.translate(copy.points.map((p) => p.position), anchor, to);
    copy.points = copy.points.map((p, i) => ({ ...p, position: moved[i] }));
  } else if (copy.type === "photo" || copy.type === "pano" || copy.type === "commands") {
    copy.position = pr.toGeo({ x: gap, y: 0 });
  } else if (copy.type === "zone") {
    const xs = ZonePlanner.outline(copy).map((p) => pr.toLocal(p).x);
    copy.boundary = Geo.translate(copy.boundary, anchor, pr.toGeo({ x: Math.max(...xs) - Math.min(...xs) + gap, y: 0 }));
  } else if (copy.type === "facade") {
    const xs = FacadePlanner.points(copy).map((p) => pr.toLocal(p).x);
    copy.boundary = Geo.translate(copy.boundary, anchor, pr.toGeo({ x: Math.max(...xs) - Math.min(...xs) + 2 * FacadePlanner.standoff(copy) + gap, y: 0 }));
  }
  return copy;
}

const TYPE_NAMES = {
  map: "Mapa",
  corridor: "Corredor",
  orbit: "Órbita",
  waypoints: "Waypoints",
  photo: "Foto",
  pano: "Panorama",
  facade: "Fachada",
  commands: "Comandos",
  zone: "Zona restringida",
};

/** "Mapa", "Órbita"…: el nombre del tipo de componente. Alrededor de una estructura, la fachada es una inspección. */
export const typeName = (component) =>
  component.type === "facade" && component.face !== "line" ? "Inspección" : TYPE_NAMES[component.type] ?? `Componente nuevo (${component.type})`;

export const componentName = (component) => component.name || typeName(component);

/** Punto de referencia del componente: el centro del área, del corredor o de la órbita, el primer waypoint o el punto. */
export function anchorOf(component) {
  switch (component.type) {
    case "map":
      return component.boundary.length ? Geo.centroid(component.boundary) : null;
    case "corridor":
      return component.path.length ? Geo.centroid(component.path) : null;
    case "orbit":
      return component.center;
    case "waypoints":
      return component.points[0]?.position ?? null;
    case "photo":
    case "pano":
    case "commands":
      return component.position;
    case "facade":
      if (!component.boundary.length) return null;
      return component.face === "circle" ? component.boundary[0] : Geo.centroid(component.boundary);
    case "zone":
      if (!component.boundary.length) return null;
      return component.shape === "circle" ? component.boundary[0] : Geo.centroid(component.boundary);
    default:
      return null;
  }
}

/** Sin marcarlo, el despegue va a esta distancia al sur del primer componente, para no tapar sus puntos. */
const AUTO_TAKEOFF_METERS = 20;
/** Con waypoints, una foto o una panorámica, el despegue automático va más lejos de su punto. */
const POINT_TAKEOFF_METERS = 40;

/** Despegue automático junto a un componente: al sur del área o de la órbita. */
export function autoTakeoff(component) {
  const anchor = anchorOf(component);
  // Una zona no se vuela: no se despega junto a ella.
  if (!anchor || component.type === "zone") return null;
  const pr = projection(anchor);
  if (component.type === "map" || component.type === "corridor") {
    const points = component.type === "map" ? component.boundary : componentPoints(component);
    const south = Math.min(...points.map((p) => pr.toLocal(p).y));
    return pr.toGeo({ x: 0, y: south - AUTO_TAKEOFF_METERS });
  }
  if (component.type === "orbit") {
    const radius = Math.max(component.radius, component.finalRadius ?? 0);
    return pr.toGeo({ x: 0, y: -(radius + AUTO_TAKEOFF_METERS) });
  }
  if (component.type === "facade") {
    // Al sur de la estructura y de por donde vuela alrededor.
    const south = Math.min(...FacadePlanner.points(component).map((p) => pr.toLocal(p).y)) - FacadePlanner.standoff(component);
    return pr.toGeo({ x: 0, y: south - AUTO_TAKEOFF_METERS });
  }
  // Al sur del primer punto, lo bastante lejos para que la H no lo tape.
  return pr.toGeo({ x: 0, y: -POINT_TAKEOFF_METERS });
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
  switch (component.type) {
    case "map":
      return MapPlanner.plan(component, from);
    case "corridor":
      return CorridorPlanner.plan(component, from);
    case "orbit":
      return OrbitPlanner.plan(component, from);
    case "waypoints":
      return PointsPlanner.waypoints(component);
    case "photo":
      return PointsPlanner.photo(component);
    case "pano":
      return PointsPlanner.pano(component);
    case "facade":
      return FacadePlanner.plan(component, from);
    case "commands":
      return PointsPlanner.commands(component, from);
    default:
      return null;
  }
}

/** Altura al empezar el componente (los waypoints empiezan a la del primer punto). */
export const startAltitude = (component) =>
  component.type === "waypoints" ? (component.points[0]?.altitude ?? component.altitude) : component.altitude;

/** Altura al terminar el componente (una espiral puede acabar más alta o más baja). */
export function endAltitude(component) {
  if (component.type === "orbit") return component.finalAltitude ?? component.altitude;
  if (component.type === "waypoints") return component.points.at(-1)?.altitude ?? component.altitude;
  // En columnas, termina arriba o abajo según cuántas columnas haya.
  if (component.type === "facade") return FacadePlanner.plan(component)?.stations.at(-1)?.altitude ?? component.altitude;
  if (component.type === "commands") return commandAltitudes(component).at(-1);
  if (component.type === "zone") return 0;
  return component.altitude;
}

/** Lo más alto del componente (de los waypoints, el punto más alto). */
export function highestAltitude(component) {
  if (component.type === "waypoints") return component.points.length ? Math.max(...component.points.map((p) => p.altitude)) : component.altitude;
  if (component.type === "facade") return FacadePlanner.highest(component);
  if (component.type === "commands") return Math.max(...commandAltitudes(component));
  if (component.type === "zone") return 0;
  return Math.max(component.altitude, endAltitude(component));
}

/** Lo más bajo del componente (de los waypoints, el punto más bajo). */
export function lowestAltitude(component) {
  if (component.type === "waypoints") return component.points.length ? Math.min(...component.points.map((p) => p.altitude)) : component.altitude;
  if (component.type === "facade") return Math.min(component.altitude, component.finalAltitude);
  if (component.type === "commands") return Math.min(...commandAltitudes(component));
  if (component.type === "zone") return 0;
  return Math.min(component.altitude, endAltitude(component));
}

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
    const zones = ZonePlanner.active(plan);
    const transit = (from, to, fromAltitude, toAltitude, kind) => {
      // Rodea las zonas que alcanzan su altura de crucero; de regreso a casa, también las de más
      // arriba (DJI puede subir a su altura de regreso).
      const cruise = Math.max(fromAltitude, toAltitude);
      const top = kind === "home" ? Infinity : cruise;
      // via: los puntos por donde pasa para rodear zonas (vacío = derecho).
      const via = ZonePlanner.detour(zones, from, to, cruise, top) ?? [];
      const horizontal = Geo.pathLength([from, ...via, to]);
      const seconds =
        kind === "home"
          ? // El regreso lo vuela DJI, no el piloto automático.
            horizontal / plan.transitSpeed + Math.abs(toAltitude - fromAltitude) / VERTICAL_SPEED
          : transitSeconds([from, ...via, to], cruise - fromAltitude, cruise - toAltitude, plan.transitSpeed);
      const t = { from, to, fromAltitude, toAltitude, kind, lengthMeters: horizontal, durationSeconds: seconds, via };
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
      if (position) item.approach = transit(position, start, altitude, startAltitude(component), flown === 0 ? "takeoff" : "between");
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

/**
 * Un tránsito como lo vuela el piloto automático (FlightCompiler.transit): sube `climb` m donde
 * está, va tramo por tramo por `path` (girando quieto en cada esquina) y baja `descent` m al llegar.
 */
export const transitSeconds = (path, climb, descent, speed) =>
  MotionTimes.climb(climb) + transitLegs(path, speed).reduce((sum, leg) => sum + leg.seconds, 0) + MotionTimes.climb(descent);

/** Los tramos de un tránsito por `path` (sin los de menos de un metro, que no vuela): {from, to, seconds}, con el giro en la esquina de antes. */
export function transitLegs(path, speed) {
  const legs = path
    .slice(1)
    .map((to, i) => [path[i], to])
    .filter(([a, b]) => Geo.distance(a, b) > MotionTimes.ARRIVAL);
  return legs.map(([a, b], i) => {
    const turn = i === 0 ? 0 : MotionTimes.turn(angleDifference(Geo.bearing(legs[i - 1][0], legs[i - 1][1]), Geo.bearing(a, b)));
    return { from: a, to: b, seconds: turn + MotionTimes.straight(Geo.distance(a, b), speed) };
  });
}

/** Los puntos de un componente: las esquinas del área, el borde del corredor, el círculo de la órbita o los waypoints. */
export function componentPoints(component) {
  switch (component.type) {
    case "map":
      return component.boundary;
    case "corridor": {
      const outline = CorridorPlanner.outline(component);
      return outline.length ? outline : component.path;
    }
    case "orbit":
      return OrbitPlanner.plan(component)?.path ?? [];
    case "waypoints":
      return component.points.map((p) => p.position);
    case "photo":
    case "pano":
    case "commands":
      return component.position ? [component.position] : [];
    case "facade":
      return FacadePlanner.points(component);
    case "zone":
      return ZonePlanner.outline(component);
    default:
      return [];
  }
}

/** Todo el camino de un tránsito: de `from` a `to` pasando por los puntos que rodean zonas. */
export const transitPath = (t) => [t.from, ...(t.via ?? []), t.to];

// ---- Zonas restringidas (Zones.kt) ----

const norm = (v) => Math.sqrt(v.x * v.x + v.y * v.y);

/** Cálculos de geometría plana para las zonas, iguales a ZoneGeometry en Kotlin. */
const ZoneGeometry = {
  /** Si `p` está dentro del polígono (sus puntos en orden, sin repetir el primero). */
  inside(polygon, p) {
    let inside = false;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (a.y > p.y !== b.y > p.y && p.x < a.x + ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y)) inside = !inside;
    }
    return inside;
  },

  /** Distancia de `p` al tramo de `a` a `b`. */
  segmentDistance(p, a, b) {
    const d = sub(b, a);
    const l = dotV(d, d);
    const t = l === 0 ? 0 : Math.min(1, Math.max(0, dotV(sub(p, a), d) / l));
    return norm(sub(add(a, scale(d, t)), p));
  },

  /** Si los tramos se cruzan de verdad (no solo se tocan). */
  segmentsCross(p, q, a, b) {
    const d1 = cross(sub(b, a), sub(p, a));
    const d2 = cross(sub(b, a), sub(q, a));
    const d3 = cross(sub(q, p), sub(a, p));
    const d4 = cross(sub(q, p), sub(b, p));
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  },

  segmentsDistance(p, q, a, b) {
    if (ZoneGeometry.segmentsCross(p, q, a, b)) return 0;
    const sd = ZoneGeometry.segmentDistance;
    return Math.min(Math.min(sd(p, a, b), sd(q, a, b)), Math.min(sd(a, p, q), sd(b, p, q)));
  },
};

/** Una zona restringida en metros, alrededor del origen de una proyección (ZoneArea en Kotlin). */
class ZoneArea {
  constructor(zone, pr) {
    this.zone = zone;
    this.circle = zone.shape === "circle";
    this.low = zone.minAltitude ?? -Infinity;
    this.high = zone.maxAltitude ?? Infinity;
    if (this.circle) {
      this.center = pr.toLocal(zone.boundary[0]);
      this.radius = norm(sub(pr.toLocal(zone.boundary[1]), this.center));
      this.polygon = [];
    } else {
      this.center = { x: 0, y: 0 };
      this.radius = 0;
      this.polygon = zone.boundary.map(pr.toLocal);
    }
  }

  /** Si la zona alcanza algo que vuela entre `bottom` y `top` m sobre el despegue. */
  reaches(bottom, top) {
    return bottom <= this.high && top >= this.low;
  }

  contains(p) {
    return this.circle ? norm(sub(p, this.center)) < this.radius : ZoneGeometry.inside(this.polygon, p);
  }

  /** Si el tramo de `a` a `b` entra en la zona. */
  crosses(a, b) {
    if (this.circle) return ZoneGeometry.segmentDistance(this.center, a, b) < this.radius;
    if (this.contains(a) || this.contains(b) || this.contains(scale(add(a, b), 0.5))) return true;
    const n = this.polygon.length;
    return this.polygon.some((_, i) => ZoneGeometry.segmentsCross(a, b, this.polygon[i], this.polygon[(i + 1) % n]));
  }

  /** Lo más cerca que pasa el tramo de `a` a `b` del borde de la zona (0 si entra). */
  distance(a, b) {
    if (this.crosses(a, b)) return 0;
    if (this.circle) return ZoneGeometry.segmentDistance(this.center, a, b) - this.radius;
    const n = this.polygon.length;
    return Math.min(...this.polygon.map((_, i) => ZoneGeometry.segmentsDistance(a, b, this.polygon[i], this.polygon[(i + 1) % n])));
  }

  /** Puntos para rodear la zona a `margin` m del borde: en las esquinas que salen y alrededor del círculo. */
  corners(margin) {
    if (this.circle) {
      const sides = ZonePlanner.CIRCLE_SIDES;
      const reach = (this.radius + margin) / Math.cos(Math.PI / sides);
      return Array.from({ length: sides }, (_, k) => {
        const angle = (2 * Math.PI * k) / sides;
        return add(this.center, scale({ x: Math.sin(angle), y: Math.cos(angle) }, reach));
      });
    }
    const polygon = this.polygon;
    const n = polygon.length;
    let area = 0;
    for (let i = 0; i < n; i++) area += cross(polygon[i], polygon[(i + 1) % n]);
    const turnSign = area > 0 ? 1 : -1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = polygon[i];
      const d1 = sub(v, polygon[(i + n - 1) % n]);
      const d2 = sub(polygon[(i + 1) % n], v);
      if (norm(d1) < 1e-9 || norm(d2) < 1e-9) continue;
      const e1 = scale(d1, 1 / norm(d1));
      const e2 = scale(d2, 1 / norm(d2));
      if (cross(e1, e2) * turnSign <= 1e-9) continue;
      // Hacia afuera: a la derecha del borde si el contorno va contra reloj, a la izquierda si no.
      const n1 = scale({ x: e1.y, y: -e1.x }, turnSign);
      const n2 = scale({ x: e2.y, y: -e2.x }, turnSign);
      const bisector = add(n1, n2);
      const size = norm(bisector);
      if (size * size >= 2) {
        out.push(add(v, scale(bisector, (2 * margin) / (size * size))));
      } else {
        // Esquina muy aguda: dos puntos, uno pasado cada lado, para no alejarse de más.
        out.push(add(add(v, scale(n1, margin)), scale(e1, margin)));
        out.push(sub(add(v, scale(n2, margin)), scale(e2, margin)));
      }
    }
    return out;
  }
}

/** Zonas restringidas: el camino que las rodea y lo que de la misión entra en ellas (ZonePlanner en Kotlin). */
export const ZonePlanner = {
  /** Metros del borde de la zona por donde pasan los tránsitos que la rodean. */
  MARGIN: 10,
  /** Lados del polígono con que se rodea una zona redonda. */
  CIRCLE_SIDES: 16,

  hasShape: (zone) =>
    zone.shape === "circle" ? zone.boundary.length >= 2 && Geo.distance(zone.boundary[0], zone.boundary[1]) >= 0.5 : zone.boundary.length >= 3,

  /** Las zonas que cuentan: encendidas y ya marcadas. */
  active: (plan) => plan.components.filter((c) => c.type === "zone" && c.enabled && ZonePlanner.hasShape(c)),

  areas: (zones, pr) => zones.map((zone) => new ZoneArea(zone, pr)),

  /** El borde para dibujarla: el contorno, o el círculo cada 5°. */
  outline(zone) {
    if (zone.shape !== "circle") return zone.boundary;
    if (zone.boundary.length < 2) return zone.boundary.slice(0, 1);
    const pr = projection(zone.boundary[0]);
    const radius = norm(pr.toLocal(zone.boundary[1]));
    return Array.from({ length: 72 }, (_, i) => {
      const angle = (2 * Math.PI * i) / 72;
      return pr.toGeo(scale({ x: Math.sin(angle), y: Math.cos(angle) }, radius));
    });
  },

  /**
   * Por dónde ir de `from` a `to` (en metros) sin entrar en las zonas que alcanzan alturas entre
   * `bottom` y `top`: los puntos intermedios (vacío si se puede ir derecho), o null si no hay forma.
   * Es el camino más corto por fuera, a MARGIN m de las esquinas.
   */
  route(areas, from, to, bottom, top) {
    const blocking = areas.filter((area) => area.reaches(bottom, top));
    if (!blocking.some((area) => area.crosses(from, to))) return [];
    if (blocking.some((area) => area.contains(from) || area.contains(to))) return null;
    const corners = blocking.flatMap((area) => area.corners(ZonePlanner.MARGIN)).filter((p) => !blocking.some((area) => area.contains(p)));
    const nodes = [from, to, ...corners];
    // Cada tramo pasa al menos a la mitad del margen de las zonas (o tan cerca como ya estén sus puntas).
    const clearance = nodes.map((p) => Math.min(ZonePlanner.MARGIN / 2, Math.min(...blocking.map((area) => area.distance(p, p)))));
    const open = (i, j) => {
      const need = Math.min(clearance[i], clearance[j]) - 1e-6;
      return blocking.every((area) => !area.crosses(nodes[i], nodes[j]) && area.distance(nodes[i], nodes[j]) >= need);
    };
    const count = nodes.length;
    const best = new Array(count).fill(Infinity);
    const previous = new Array(count).fill(-1);
    const done = new Array(count).fill(false);
    best[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < count; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
      if (u < 0) return null;
      if (u === 1) break;
      done[u] = true;
      for (let v = 0; v < count; v++) {
        if (done[v]) continue;
        const length = best[u] + norm(sub(nodes[v], nodes[u]));
        if (length < best[v] && open(u, v)) {
          best[v] = length;
          previous[v] = u;
        }
      }
    }
    const via = [];
    for (let at = previous[1]; at > 0; at = previous[at]) via.unshift(nodes[at]);
    return via;
  },

  /** `route` con puntos geográficos. */
  detour(zones, from, to, bottom, top) {
    if (!zones.length) return [];
    const pr = projection(from);
    return ZonePlanner.route(ZonePlanner.areas(zones, pr), { x: 0, y: 0 }, pr.toLocal(to), bottom, top)?.map(pr.toGeo) ?? null;
  },

  /** Entre qué alturas vuela un componente; siguiendo el terreno puede ir a cualquiera. */
  band: (component) => (TerrainFollow.follows(component) ? [-Infinity, Infinity] : [lowestAltitude(component), highestAltitude(component)]),

  /**
   * Lo que entra en alguna zona: el despegue, la ruta de un componente, un tránsito (que no pudo
   * rodearla), el regreso a casa o el aterrizaje. {zone, message, at}, en el orden del vuelo.
   */
  violations(plan, result) {
    const zones = ZonePlanner.active(plan);
    const origin = result.takeoff;
    if (!zones.length || !origin || result.flown === 0) return [];
    const pr = projection(origin);
    const out = [];
    const home = { x: 0, y: 0 };
    const flown = result.items.filter((item) => item.component.enabled && item.result);
    for (const zone of zones) {
      const area = new ZoneArea(zone, pr);
      const zoneName = `«${componentName(zone)} ${plan.components.indexOf(zone) + 1}»`;
      const push = (message, at) => out.push({ zone, message, at: pr.toGeo(at) });
      const cruises = [flown[0].approach, result.home].filter(Boolean).map((t) => Math.max(t.fromAltitude, t.toAltitude));
      if (area.contains(home) && area.reaches(0, cruises.length ? Math.max(...cruises) : 0)) push(`El despegue está dentro de ${zoneName}`, home);

      for (const item of flown) {
        const name = `${componentName(item.component)} ${item.number}`;
        if (item.approach) {
          const at = transitHit(area, item.approach, pr);
          if (at) push(`El camino hacia ${name} entra en ${zoneName}`, at);
        }
        const [bottom, top] = ZonePlanner.band(item.component);
        if (area.reaches(bottom, top)) {
          const at = firstInside(area, item.result.path.map(pr.toLocal));
          if (at) push(`La ruta de ${name} entra en ${zoneName}`, at);
        }
      }
      if (result.home) {
        const at = transitHit(area, result.home, pr);
        if (at) push(`El regreso a casa entra en ${zoneName}`, at);
      }
      if (plan.finishAction === "LAND") {
        const last = flown.at(-1);
        const end = pr.toLocal(last.result.path.at(-1));
        if (area.contains(end) && area.reaches(0, endAltitude(last.component))) push(`El aterrizaje está dentro de ${zoneName}`, end);
      }
    }
    return out;
  },
};

/**
 * Dónde entra un tránsito en la zona: en su tramo recto a la altura de crucero (el regreso a casa
 * puede ir más alto) o al subir o bajar en sus puntas. null si no entra.
 */
function transitHit(area, transit, pr) {
  const cruise = Math.max(transit.fromAltitude, transit.toAltitude);
  const top = transit.kind === "home" ? Infinity : cruise;
  const points = transitPath(transit).map(pr.toLocal);
  const from = points[0];
  const to = points.at(-1);
  if (area.contains(from) && area.reaches(transit.fromAltitude, top)) return from;
  if (area.reaches(cruise, top)) {
    for (let i = 1; i < points.length; i++) if (area.crosses(points[i - 1], points[i])) return points[i - 1];
  }
  if (transit.kind !== "home" && area.contains(to) && area.reaches(transit.toAltitude, cruise)) return to;
  return null;
}

/** El primer punto de la ruta dentro de la zona, o el inicio del primer tramo que la cruza. */
function firstInside(area, path) {
  if (path.length === 1) return area.contains(path[0]) ? path[0] : null;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (area.crosses(a, b)) return area.contains(b) && !area.contains(a) ? b : a;
  }
  return null;
}

/** Todos los puntos del plan, con el despegue aunque sea automático, para encuadrarlo en el mapa. */
export function planPoints(plan) {
  const points = plan.components.flatMap(componentPoints);
  const takeoff = takeoffOf(plan);
  if (takeoff) points.push(takeoff);
  return points;
}

export const hasGeometry = (plan) => plan.components.some((c) => anchorOf(c));

// ---- Seguir el terreno ----

/**
 * Mosaicos de elevación "Terrarium" (AWS Terrain Tiles, libres y sin clave): cada píxel guarda la
 * altura como R·256 + G + B/256 − 32768 metros. A zoom 14 cada píxel mide unos 9 m, como los datos
 * del USGS en Puerto Rico (10 m). Lo mismo que TerrariumTiles en Kotlin.
 */
export const TerrariumTiles = {
  ZOOM: 14,
  SIZE: 256,

  url: (x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/14/${x}/${y}.png`,

  /** La altura de un píxel. El mar cuenta como 0: los datos traen la profundidad del fondo. */
  height: (r, g, b) => Math.max(0, r * 256 + g + b / 256 - 32768),

  /** Posición del punto en píxeles del mundo a zoom 14 (x hacia el este, y hacia el sur). */
  worldPixel([lat, lon]) {
    const n = TerrariumTiles.SIZE * 2 ** TerrariumTiles.ZOOM;
    const phi = rad(Math.min(85, Math.max(-85, lat)));
    return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n];
  },

  /** Los mosaicos [x, y] que cubren los puntos con `marginMeters` alrededor. */
  tilesFor(points, marginMeters) {
    if (!points.length) return [];
    const lats = points.map((p) => p[0]);
    const lons = points.map((p) => p[1]);
    const south = Math.min(...lats) - marginMeters / METERS_PER_DEG;
    const north = Math.max(...lats) + marginMeters / METERS_PER_DEG;
    const lonMargin = marginMeters / (METERS_PER_DEG * Math.cos(rad(points[0][0])));
    const [x0, y0] = TerrariumTiles.worldPixel([north, Math.min(...lons) - lonMargin]);
    const [x1, y1] = TerrariumTiles.worldPixel([south, Math.max(...lons) + lonMargin]);
    const size = TerrariumTiles.SIZE;
    const tiles = [];
    for (let x = Math.floor(x0 / size); x <= Math.floor(x1 / size); x++) {
      for (let y = Math.floor(y0 / size); y <= Math.floor(y1 / size); y++) tiles.push([x, y]);
    }
    return tiles;
  },
};

/**
 * El terreno de los mosaicos que haya: `tile(x, y)` da las alturas del mosaico (256 × 256, fila
 * por fila) o null. Interpola entre los cuatro píxeles más cercanos; null si falta alguno.
 */
export function tileTerrain(tile) {
  const size = TerrariumTiles.SIZE;
  const mod = (a, n) => ((a % n) + n) % n;
  const h = (x, y) => {
    const heights = tile(Math.floor(x / size), Math.floor(y / size));
    return heights ? heights[mod(y, size) * size + mod(x, size)] : null;
  };
  return {
    elevation(point) {
      const [px, py] = TerrariumTiles.worldPixel(point);
      // El valor de cada píxel es el de su centro.
      const fx = px - 0.5;
      const fy = py - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = h(x0, y0);
      const b = h(x0 + 1, y0);
      const c = h(x0, y0 + 1);
      const d = h(x0 + 1, y0 + 1);
      if (a === null || b === null || c === null || d === null) return null;
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    },
  };
}

/** Faltan los datos del terreno donde hacen falta para seguirlo. */
export class TerrainMissingError extends Error {}

/** Seguir el terreno: la altura de un componente se mide sobre el suelo de cada punto, como en Dronelink. */
export const TerrainFollow = {
  /** Cada cuántos metros se mira el suelo. */
  STEP: 5,
  /** En los tránsitos de una misión que sigue el terreno, lo mínimo sobre el suelo más alto del camino. */
  TRANSIT_CLEARANCE: 30,
  MISSING: "Faltan los datos del terreno de esta zona",
  TYPES: ["map", "corridor", "waypoints", "photo", "pano"],

  follows: (component) => TerrainFollow.TYPES.includes(component.type) && component.terrainFollow === true,

  /** Si algún componente que se vuela sigue el terreno. */
  needed: (plan) => plan.components.some((c) => c.enabled && TerrainFollow.follows(c)),

  /**
   * El suelo con el despegue como altura 0: `ground(p)` es la altura del suelo sobre el despegue y
   * `altitude(p, agl)` la del dron para ir `agl` m sobre el suelo. Lanzan TerrainMissingError sin datos.
   */
  reference(terrain, takeoffGround) {
    const ground = (point) => {
      const elevation = terrain.elevation(point);
      if (elevation === null || elevation === undefined) throw new TerrainMissingError(TerrainFollow.MISSING);
      return elevation - takeoffGround;
    };
    return { terrain, takeoffGround, ground, altitude: (point, agl) => agl + ground(point) };
  },

  /**
   * El suelo y la altura del dron a lo largo de `path` cada STEP m: [{distance, ground, altitude, position}],
   * todo sobre el despegue. `agl`: la altura sobre el suelo en cada punto de `path`.
   */
  alongRoute(ref, path, agl) {
    if (!path.length) return [];
    const first = ref.ground(path[0]);
    const points = [{ distance: 0, ground: first, altitude: agl[0] + first, position: path[0] }];
    let walked = 0;
    for (let i = 1; i < path.length; i++) {
      const length = Geo.distance(path[i - 1], path[i]);
      const n = Math.max(1, Math.ceil(length / TerrainFollow.STEP - 1e-9));
      const proj = projection(path[i - 1]);
      const to = proj.toLocal(path[i]);
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        const position = proj.toGeo({ x: to.x * f, y: to.y * f });
        const ground = ref.ground(position);
        points.push({ distance: walked + length * f, ground, altitude: agl[i - 1] + (agl[i] - agl[i - 1]) * f + ground, position });
      }
      walked += length;
    }
    return points;
  },

  /** La altura sobre el suelo en cada punto de la ruta `path` del componente. */
  aglAlong: (component, path) =>
    component.type === "waypoints" && component.points.length === path.length
      ? component.points.map((p) => p.altitude)
      : path.map(() => component.altitude),

  /** El suelo más alto (sobre el despegue) en línea recta de `from` a `to`. */
  highestGround(ref, from, to) {
    const proj = projection(from);
    const end = proj.toLocal(to);
    const n = Math.max(1, Math.ceil(Math.hypot(end.x, end.y) / TerrainFollow.STEP - 1e-9));
    let highest = -Infinity;
    for (let i = 0; i <= n; i++) highest = Math.max(highest, ref.ground(proj.toGeo({ x: (end.x * i) / n, y: (end.y * i) / n })));
    return highest;
  },

  /** Los puntos alrededor de los que hacen falta datos del suelo: la ruta de cada componente y el despegue. */
  points(plan) {
    return planPoints(plan);
  },
};

// ---- Textos ----

export function formatDuration(seconds) {
  const s = Math.trunc(seconds);
  return `${Math.trunc(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}

const num = (value, decimals = 0) =>
  value.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** "N", "NE"… para un rumbo, como en una brújula. */
export function compass(heading) {
  return ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(Geo.normalize(heading) / 45) % 8];
}

/** Resumen de un componente, como "10 m | 0.1 ha | Grid | 75% | 70%" en Dronelink. */
export function componentSummary(component) {
  const text = componentDetails(component);
  if (!TerrainFollow.follows(component)) return text;
  // Siempre empieza por la altura: siguiendo el terreno, es sobre el suelo.
  const altitude = text.split(" · ")[0];
  return `${altitude} sobre el suelo${text.slice(altitude.length)}`;
}

function componentDetails(component) {
  if (!isKnown(component)) return "No se vuela con esta versión";
  if (component.type === "waypoints") {
    if (!component.points.length) return `${num(component.altitude)} m · sin puntos`;
    const altitudes = component.points.map((p) => p.altitude);
    const low = Math.min(...altitudes);
    const high = Math.max(...altitudes);
    const n = component.points.length;
    const photos = component.points.filter((p) => p.action === "photo").length;
    return [
      low === high ? `${num(low)} m` : `${num(low)}–${num(high)} m`,
      `${n} ${n === 1 ? "punto" : "puntos"}`,
      photos ? `${photos} con foto` : null,
      component.captureMode === "photo" ? `fotos cada ${num(component.photoInterval, component.photoInterval % 1 ? 1 : 0)} s` : null,
      component.captureMode === "video" ? "video" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (component.type === "photo") {
    if (!component.position) return `${num(component.altitude)} m · sin punto`;
    const type = component.photoType === "single" ? "" : ` · ${PHOTO_TYPES.find(([k]) => k === component.photoType)?.[1] ?? ""}`;
    return `${num(component.altitude)} m · mira al ${compass(component.heading)} · cámara ${num(component.gimbalPitch)}°${type}`;
  }
  if (component.type === "pano") {
    if (!component.position) return `${num(component.altitude)} m · sin punto`;
    const label = PANO_TYPES.find(([k]) => k === component.panoType)?.[1] ?? "";
    return `${num(component.altitude)} m · ${label} · ${PanoPlan.shots(component.panoType, component.heading, component.gimbalPitch).length} fotos`;
  }
  if (component.type === "corridor") {
    if (component.path.length < 2) return `${num(component.altitude)} m · sin línea`;
    const length = Geo.pathLength(component.path);
    const passes = CorridorPlanner.passCount(component.width, CorridorPlanner.spacing(component).line);
    return [
      `${num(component.altitude)} m`,
      length >= 1000 ? `${num(length / 1000, 2)} km` : `${num(length)} m`,
      `${num(component.width)} m de ancho`,
      `${passes} ${passes === 1 ? "pasada" : "pasadas"}`,
    ].join(" · ");
  }
  if (component.type === "facade") {
    if (!FacadePlanner.hasShape(component)) return `${num(component.altitude)} m · ${component.face === "line" ? "sin cara" : "sin estructura"}`;
    const altitude =
      component.finalAltitude !== component.altitude ? `${num(component.altitude)} → ${num(component.finalAltitude)} m` : `${num(component.altitude)} m`;
    const spacing =
      component.spacing === "distance"
        ? `${num(component.horizontalDistance, 1)} × ${num(component.verticalDistance, 1)} m`
        : `${num(component.horizontalOverlap)} % · ${num(component.verticalOverlap)} %`;
    const pattern = FACADE_PATTERNS.find(([k]) => k === component.pattern)?.[1] ?? "";
    return `${altitude} · a ${num(component.distance)} m · ${pattern} · ${spacing}`;
  }
  if (component.type === "commands") {
    const n = component.commands.length;
    const photos = component.commands.filter((command) => command.type === "photo").length;
    return [
      `${num(component.altitude)} m`,
      component.position ? null : "donde terminó lo anterior",
      n ? `${n} ${n === 1 ? "comando" : "comandos"}` : "sin comandos",
      photos ? `${photos} ${photos === 1 ? "foto" : "fotos"}` : null,
      component.commands.some((command) => command.type === "videoStart") ? "video" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (component.type === "zone") {
    let size = "sin área";
    if (ZonePlanner.hasShape(component)) {
      size =
        component.shape === "circle"
          ? `radio ${num(Geo.distance(component.boundary[0], component.boundary[1]))} m`
          : `${num(Geo.area(component.boundary) / 10000, 2)} ha`;
    }
    return [zoneHeights(component), size, component.enabled ? null : "no cuenta"].filter(Boolean).join(" · ");
  }
  if (component.type === "map") {
    if (component.boundary.length < 3) return `${num(component.altitude)} m · sin área`;
    const area = Geo.area(component.boundary) / 10000;
    const pattern = MAP_PATTERNS.find(([key]) => key === component.pattern)?.[1] ?? "Normal";
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

/** "todas las alturas", "hasta 40 m", "desde 60 m" o "de 60 a 120 m". */
export function zoneHeights(zone) {
  const low = zone.minAltitude;
  const high = zone.maxAltitude;
  const trim = (value) => num(value, value % 1 ? 1 : 0);
  if (low === null && high === null) return "todas las alturas";
  if (low === null) return `hasta ${trim(high)} m`;
  if (high === null) return `desde ${trim(low)} m`;
  return `de ${trim(low)} a ${trim(high)} m`;
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

// ---- Dónde se toma cada foto ----

/** El punto a `f` (de 0 a 1) del camino de `a` a `b`. */
const interpolate = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

/** El punto a `distance` metros del inicio de `path` (el último si se pasa). */
function pointAlong(path, distance) {
  let left = distance;
  for (let i = 1; i < path.length; i++) {
    const l = Geo.distance(path[i - 1], path[i]);
    if (left <= l) return interpolate(path[i - 1], path[i], l > 0 ? left / l : 0);
    left -= l;
  }
  return path.at(-1);
}

/**
 * Dónde toma las fotos cada componente, para verlas en el mapa y en la vista previa, igual que
 * PhotoPoints.kt: {position, along, shots}, con `along` los metros desde el inicio de la ruta del
 * componente (route.path) y `shots` las fotos en ese punto (varias con AEB, en una panorámica o en
 * varios comandos Foto). Por distancia son los puntos donde dispara el piloto automático; por tiempo
 * (órbita, fotos cada tantos segundos en waypoints, mapa por tiempo), donde caen volando a la
 * velocidad del plan.
 */
export const PhotoPoints = {
  of(component, route) {
    if (!route || !component.enabled) return [];
    const point = (position, along, shots = 1) => ({ position, along, shots });
    switch (component.type) {
      case "map":
        return PhotoPoints.map(component, route);
      case "corridor":
        return PhotoPoints.corridor(component, route);
      case "orbit":
        return PhotoPoints.orbit(component, route);
      case "waypoints":
        return PhotoPoints.waypoints(component);
      case "photo":
        return route.path.slice(0, 1).map((p) => point(p, 0, shotsOf(component.photoType)));
      case "pano":
        return route.path.slice(0, 1).map((p) => point(p, 0, route.photoCount));
      case "facade":
        return component.captureMode === "photo" ? route.stations.map((st) => point(st.position, 0, shotsOf(component.photoType))) : [];
      case "commands":
        return route.photoCount > 0 ? route.path.slice(0, 1).map((p) => point(p, 0, route.photoCount)) : [];
      default:
        return [];
    }
  },

  /** Las de todos los componentes que se vuelan, en orden. */
  ofPlan: (result) => result.items.flatMap((item) => PhotoPoints.of(item.component, item.result)),

  /**
   * Una foto cada `photoSpacing` m en cada tramo, desde `runUp` m después de su inicio (por tiempo,
   * pasado el arranque), o donde diga el tramo (fotos en los cruces).
   */
  map(c, plan) {
    if (!plan.positions) return [];
    const shots = plan.byTime ? 1 : shotsOf(c.photoType);
    const points = [];
    let walked = 0;
    plan.legs.forEach((leg, i) => {
      if (i > 0) walked += Geo.distance(plan.legs[i - 1].end, leg.start);
      const length = Geo.distance(leg.start, leg.end);
      for (const d of MapPlanner.photoDistances(plan, leg)) {
        points.push({ position: interpolate(leg.start, leg.end, length > 0 ? d / length : 0), along: walked + d, shots });
      }
      walked += length;
    });
    return points;
  },

  /** Una foto cada `photoSpacing` m desde el inicio de cada pasada. */
  corridor(c, plan) {
    if (!plan.positions) return [];
    const points = [];
    let walked = 0;
    plan.passes.forEach((pass, p) => {
      if (p > 0) walked += Geo.distance(plan.passes[p - 1].at(-1), pass[0]);
      const count = Math.floor(Geo.pathLength(pass) / plan.photoSpacing + 1e-9) + 1;
      for (let k = 0; k < count; k++) {
        const d = k * plan.photoSpacing;
        points.push({ position: pointAlong(pass, d), along: walked + d, shots: shotsOf(c.photoType) });
      }
      walked += Geo.pathLength(pass);
    });
    return points;
  },

  /** Una foto cada tantos segundos, repartidas a lo largo de la vuelta como las cuenta el plan. */
  orbit(c, plan) {
    if (!plan.photoCount || !(plan.durationSeconds > 0)) return [];
    const length = Geo.pathLength(plan.path);
    return Array.from({ length: plan.photoCount }, (_, k) => {
      const d = length * Math.min(1, (k * captureInterval(c)) / plan.durationSeconds);
      return { position: pointAlong(plan.path, d), along: d, shots: 1 };
    });
  },

  /**
   * Las fotos de los puntos con la acción Foto y, con fotos durante el vuelo, una cada tantos
   * segundos contando el tiempo de vuelo como el plan (de lado y subiendo o bajando).
   */
  waypoints(c) {
    if (!c.points.length) return [];
    const path = c.points.map((p) => p.position);
    const lengths = path.slice(1).map((p, i) => Geo.distance(path[i], p));
    const starts = [0];
    for (const l of lengths) starts.push(starts.at(-1) + l);
    const points = [];
    if (c.captureMode !== "video") {
      c.points.forEach((point, i) => {
        if (point.action === "photo") points.push({ position: point.position, along: starts[i], shots: 1 });
      });
    }
    if (c.captureMode === "photo" && lengths.length) {
      const speed = Math.max(0.5, c.speed);
      const times = lengths.map((l, i) => l / speed + Math.abs(c.points[i + 1].altitude - c.points[i].altitude) / VERTICAL_SPEED);
      const flying = times.reduce((a, b) => a + b, 0);
      if (flying > 0) {
        const interval = captureInterval(c);
        let leg = 0;
        let legStart = 0;
        for (let k = 0; k <= Math.floor(flying / interval); k++) {
          const t = k * interval;
          while (leg < times.length - 1 && t > legStart + times[leg]) {
            legStart += times[leg];
            leg++;
          }
          const f = times[leg] > 0 ? Math.min(1, Math.max(0, (t - legStart) / times[leg])) : 0;
          points.push({ position: interpolate(path[leg], path[leg + 1], f), along: starts[leg] + f * lengths[leg], shots: 1 });
        }
      }
    }
    // Ordenadas a lo largo de la ruta (sort es estable: a la misma distancia, las de los puntos primero).
    return points.sort((a, b) => a.along - b.along);
  },
};

// ---- Vista previa ----

/**
 * El vuelo de la misión en el tiempo, para la vista previa animada: tramos con su principio y su
 * fin (posición y altura sobre el despegue), que suman el mismo tiempo que el estimado.
 */
export const FlightPreview = {
  timeline(plan) {
    const result = PlanPlanner.plan(plan);
    const segments = [];
    // Cada foto, en orden: {time, position}.
    const shots = [];
    let time = 0;
    const push = (from, to, seconds, info) => {
      if (!(seconds > 0)) return;
      segments.push({ t0: time, t1: time + seconds, from, to, ...info });
      time += seconds;
    };
    /** `count` fotos en `at`, repartidas en el tramo que acaba de terminar (desde `start`); la última al final. */
    const shoot = (count, at, start) => {
      for (let k = 1; k <= count; k++) shots.push({ time: start + ((time - start) * k) / count, position: at });
    };
    // Como los tránsitos del piloto automático: sube donde está, va en línea recta (rodeando las
    // zonas restringidas por `via`) y baja al llegar.
    const transit = (from, to, label, via = []) => {
      const cruise = Math.max(from.altitude, to.altitude);
      const info = { label, kind: "transit" };
      push(from, { ...from, altitude: cruise }, MotionTimes.climb(cruise - from.altitude), info);
      for (const leg of transitLegs([from.position, ...via, to.position], plan.transitSpeed)) {
        push({ position: leg.from, altitude: cruise }, { position: leg.to, altitude: cruise }, leg.seconds, info);
      }
      push({ ...to, altitude: cruise }, to, MotionTimes.climb(cruise - to.altitude), info);
    };

    let here = result.takeoff ? { position: result.takeoff, altitude: 0 } : null;
    for (const item of result.items) {
      const { component, result: route } = item;
      if (!component.enabled || !route) continue;
      const label = `${item.number}. ${componentName(component)}`;
      const points = routePoints(component, route);
      if (here) transit(here, points[0], `Hacia ${label}`, item.approach?.via ?? []);
      const info = { label, kind: "route", component };
      if (component.type === "facade") {
        // De parada en parada, mirando a la cara, con la foto quieto en cada una.
        const speed = Math.max(0.5, component.speed);
        const shotsEach = component.captureMode === "photo" ? shotsOf(component.photoType) : 0;
        const moves = [];
        let previous = null;
        if (route.entry) {
          moves.push([points[0], points[1], Geo.distance(points[0].position, points[1].position) / speed, { ...info, facing: route.stations[0].heading }, 0]);
        }
        route.stations.forEach((station) => {
          const at = { position: station.position, altitude: station.altitude };
          if (previous) {
            const seconds =
              Geo.distance(previous.position, at.position) / speed +
              Math.abs(at.altitude - previous.altitude) / FacadePlanner.CLIMB_SPEED +
              FacadePlanner.SETTLE_SECONDS;
            moves.push([previous, at, seconds, { ...info, facing: station.heading }, 0]);
          }
          if (shotsEach) moves.push([at, at, FacadePlanner.PHOTO_SECONDS, { ...info, kind: "shot", facing: station.heading }, shotsEach]);
          previous = at;
        });
        // Las distancias en el mapa difieren en milímetros de las del plano: que sume lo estimado.
        const total = moves.reduce((sum, move) => sum + move[2], 0);
        for (const [from, to, seconds, details, count] of moves) {
          const start = time;
          push(from, to, (seconds * route.durationSeconds) / (total || 1), details);
          shoot(count, to.position, start);
        }
      } else if (component.type === "commands") {
        // Uno tras otro, quieto en el punto: espera, fotos, giros y cambios de altura.
        let at = points[0];
        for (const command of component.commands) {
          if (command.type === "wait") push(at, at, Math.max(0, command.value), info);
          else if (command.type === "photo") {
            const start = time;
            push(at, at, photoSeconds(component.photoSize), { ...info, kind: "shot" });
            shoot(1, at.position, start);
          } else if (command.type === "heading") push(at, at, TURN_SECONDS, { ...info, facing: command.value });
          else if (command.type === "altitude") {
            const to = { ...at, altitude: command.value };
            push(at, to, Math.abs(command.value - at.altitude) / VERTICAL_SPEED, info);
            at = to;
          }
        }
        points[points.length - 1] = at;
      } else if (points.length === 1) {
        // Una foto o una panorámica: quieto en el punto (la panorámica da la vuelta).
        const start = time;
        push(points[0], points[0], route.durationSeconds, { ...info, kind: "shot" });
        shoot(route.photoCount, points[0].position, start);
      } else if (component.type === "map" && route.segmentSeconds?.length === points.length - 1) {
        // Tramo por tramo con lo que tarda el piloto automático (arranca, frena, gira en cada
        // cambio de línea), pasando por cada foto en el segundo en que la toma.
        const start = time;
        const altitude = component.altitude;
        const photos = PhotoPoints.of(component, route);
        let k = 0;
        route.legs.forEach((leg, i) => {
          if (i > 0) push({ position: route.legs[i - 1].end, altitude }, { position: leg.start, altitude }, route.segmentSeconds[2 * i - 1], info);
          const end = time + route.segmentSeconds[2 * i];
          let at = { position: leg.start, altitude };
          const count = MapPlanner.photoDistances(route, leg).length;
          for (let n = 0; n < count; n++, k++) {
            const photo = photos[k];
            const t = start + route.photoSeconds[k];
            const to = { position: photo.position, altitude };
            push(at, to, t - time, info);
            for (let s = 0; s < photo.shots; s++) shots.push({ time: t, position: photo.position });
            at = to;
          }
          push(at, { position: leg.end, altitude }, end - time, info);
        });
      } else {
        const lengths = points.slice(1).map((p, i) => Geo.distance(points[i].position, p.position));
        const total = lengths.reduce((a, b) => a + b, 0);
        const start = time;
        lengths.forEach((length, i) => {
          const share = total > 0 ? length / total : 1 / lengths.length;
          push(points[i], points[i + 1], route.durationSeconds * share, info);
        });
        // Cada foto cuando el dron pasa por su punto (la ruta se recorre a ritmo parejo).
        for (const p of PhotoPoints.of(component, route)) {
          const t = start + route.durationSeconds * (total > 0 ? p.along / total : 0);
          for (let k = 0; k < p.shots; k++) shots.push({ time: t, position: p.position });
        }
      }
      here = points.at(-1);
    }
    if (here && result.home) {
      const home = { position: result.takeoff, altitude: here.altitude };
      const info = { label: "Regreso al despegue", kind: "transit" };
      const path = transitPath(result.home);
      for (let i = 1; i < path.length; i++) {
        push({ position: path[i - 1], altitude: here.altitude }, { position: path[i], altitude: here.altitude }, Geo.distance(path[i - 1], path[i]) / plan.transitSpeed, info);
      }
      push(home, { ...home, altitude: 0 }, home.altitude / VERTICAL_SPEED, { ...info, label: "Aterrizando" });
    } else if (here && result.landingSeconds > 0) {
      push(here, { ...here, altitude: 0 }, result.landingSeconds, { label: "Aterrizando", kind: "transit" });
    }

    // Hacia dónde mira en cada tramo: hacia donde va o, quieto, como venía.
    let heading = 0;
    for (const segment of segments) {
      const c = segment.component;
      if (segment.facing !== undefined) heading = segment.facing;
      else if (segment.kind === "shot") heading = c.type === "photo" || c.type === "pano" ? c.heading : heading;
      else if (Geo.distance(segment.from.position, segment.to.position) > 0.5) heading = Geo.bearing(segment.from.position, segment.to.position);
      segment.heading = heading;
      // La panorámica (sin ser angular o vertical) gira entera.
      segment.turn = segment.kind === "shot" && c.type === "pano" && c.panoType !== "vertical" ? 360 : 0;
    }
    return { duration: time, segments, photoCount: result.photoCount, takeoff: result.takeoff, shots };
  },

  /** Dónde está el dron a los `time` segundos: posición, altura, rumbo, qué hace y cuántas fotos lleva. */
  at(timeline, time) {
    const { segments } = timeline;
    if (!segments.length) return null;
    const t = Math.min(Math.max(0, time), timeline.duration);
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].t1 <= t) lo = mid + 1;
      else hi = mid;
    }
    const segment = segments[lo];
    const f = Math.min(1, Math.max(0, (t - segment.t0) / (segment.t1 - segment.t0)));
    const lerp = (a, b) => a + (b - a) * f;
    let heading = segment.heading + segment.turn * f;
    // En una órbita que mira al centro, hacia el centro.
    const c = segment.component;
    const position = [lerp(segment.from.position[0], segment.to.position[0]), lerp(segment.from.position[1], segment.to.position[1])];
    if (c?.type === "orbit" && c.heading === "center" && c.center) heading = Geo.bearing(position, c.center);
    return {
      index: lo,
      position,
      altitude: lerp(segment.from.altitude, segment.to.altitude),
      heading: ((heading % 360) + 360) % 360,
      label: segment.label,
      kind: segment.kind,
      component: c ?? null,
      photos: FlightPreview.photosBy(timeline, t),
    };
  },

  /** Cuántas fotos lleva a los `time` segundos. */
  photosBy(timeline, time) {
    const { shots } = timeline;
    let lo = 0;
    let hi = shots.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (shots[mid].time <= time + 1e-9) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  },
};

// ---- KML y KMZ ----

const KML_DEFAULT_ALTITUDE = 30;
/** Hasta cuántos componentes se sacan de un archivo (uno de Google Earth puede traer cientos de cosas). */
const KML_MAX_COMPONENTS = 30;

const kmlTag = (name) => `(?:\\w+:)?${name}`;
const kmlBlocks = (text, name) => [...text.matchAll(new RegExp(`<${kmlTag(name)}\\b[^>]*>([\\s\\S]*?)</${kmlTag(name)}>`, "g"))].map((m) => m[1]);
const kmlFirst = (text, name) => kmlBlocks(text, name)[0] ?? null;

/** El texto de un elemento: lo de adentro de CDATA tal cual, o con las entidades de XML convertidas. */
function kmlText(raw) {
  if (raw === null) return null;
  const cdata = [...raw.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)];
  if (cdata.length) return cdata.map((m) => m[1]).join("");
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .trim();
}

const kmlNumber = (text, name) => {
  const value = Number(kmlText(kmlFirst(text, name)));
  return kmlFirst(text, name) !== null && Number.isFinite(value) ? value : null;
};

/** Los puntos de <coordinates>: [lat, lon] y la altura (o null). */
function kmlCoordinates(text) {
  const raw = kmlFirst(text, "coordinates");
  if (raw === null) return [];
  return raw
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(",").map(Number))
    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([lon, lat, alt]) => ({ position: [round7(lat), round7(lon)], altitude: Number.isFinite(alt) ? alt : null }));
}

const round7 = (x) => Math.round(x * 1e7) / 1e7;

/**
 * Lee un KML (de Google Earth, de Dronelink, de DJI o de esta app). Devuelve {name, plan,
 * components}: `plan` si el archivo es de esta app (trae la misión entera); si no, los
 * componentes que salen de él:
 * - cada polígono, un mapa;
 * - cada línea, un corredor;
 * - los puntos, un recorrido de waypoints (o, si es uno solo, el centro de una órbita).
 * Los waypoints de DJI (WPML) traen su altura y su velocidad.
 */
export function importKml(text) {
  const withoutPlacemarks = text.replace(new RegExp(`<${kmlTag("Placemark")}\\b[\\s\\S]*?</${kmlTag("Placemark")}>`, "g"), "");
  const name = kmlText(kmlFirst(withoutPlacemarks, "name")) || kmlText(kmlFirst(text, "name")) || null;

  // Una misión de esta app: va entera en los datos del documento.
  const embedded = text.match(/<(?:\w+:)?Data\s+name="mini4pro"\s*>\s*<(?:\w+:)?value>([\s\S]*?)<\/(?:\w+:)?value>/);
  if (embedded) {
    try {
      return { name, plan: normalizePlan(JSON.parse(kmlText(embedded[1]))), components: [] };
    } catch {
      // Si no se puede leer, se toma como un KML cualquiera.
    }
  }

  const wpml = /<wpml:/.test(text);
  const heightMode = kmlText(kmlFirst(text, "heightMode")) ?? kmlText(kmlFirst(text, "executeHeightMode"));
  const globalHeight = kmlNumber(withoutPlacemarks, "globalHeight");
  const speed = kmlNumber(withoutPlacemarks, "autoFlightSpeed") ?? kmlNumber(withoutPlacemarks, "globalTransitionalSpeed");

  const components = [];
  const points = [];
  for (const placemark of kmlBlocks(text, "Placemark")) {
    const label = kmlText(kmlFirst(placemark, "name")) || null;
    for (const polygon of kmlBlocks(placemark, "Polygon")) {
      let ring = kmlCoordinates(kmlFirst(polygon, "outerBoundaryIs") ?? polygon).map((c) => c.position);
      // El KML repite el primer punto al final para cerrar el polígono.
      if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring = ring.slice(0, -1);
      if (ring.length < 3) continue;
      const map = { ...newMapComponent(ring), name: label };
      map.direction = MapPlanner.longestEdgeDirection(ring) ?? 0;
      components.push(map);
    }
    for (const line of kmlBlocks(placemark, "LineString")) {
      const path = kmlCoordinates(line).map((c) => c.position);
      if (path.length >= 2) components.push({ ...newCorridorComponent(path), name: label });
    }
    for (const point of kmlBlocks(placemark, "Point")) {
      const [coordinate] = kmlCoordinates(point);
      if (!coordinate) continue;
      const mode = kmlText(kmlFirst(point, "altitudeMode"));
      let altitude = null;
      if (wpml) {
        const own = kmlNumber(placemark, "useGlobalHeight") === 1 ? null : kmlNumber(placemark, "height") ?? kmlNumber(placemark, "executeHeight");
        altitude = own ?? globalHeight;
      } else if (mode === "relativeToGround") {
        altitude = coordinate.altitude;
      }
      points.push({ position: coordinate.position, altitude: altitude > 0 ? altitude : null, aboveGround: !wpml && mode === "relativeToGround", index: kmlNumber(placemark, "index"), name: label });
    }
  }

  if (points.length === 1 && !wpml) {
    components.push({ ...newOrbitComponent(points[0].position), name: points[0].name });
  } else if (points.length) {
    // Los de DJI traen su orden; los demás van en el orden del archivo.
    if (points.every((p) => p.index !== null)) points.sort((a, b) => a.index - b.index);
    const waypoints = newWaypointsComponent(points.map((p) => newWaypoint(p.position, p.altitude ?? KML_DEFAULT_ALTITUDE)));
    waypoints.terrainFollow = wpml ? heightMode === "aboveGroundLevel" || heightMode === "realTimeFollowSurface" : points.every((p) => p.aboveGround && p.altitude !== null);
    if (speed > 0) waypoints.speed = Math.min(15, Math.max(1, speed));
    components.push(waypoints);
  }
  return { name, plan: null, components: components.slice(0, KML_MAX_COMPONENTS) };
}

const xmlEscape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** CDATA que aguanta cualquier texto (un "]]>" adentro se parte en dos). */
const cdata = (text) => `<![CDATA[${String(text).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
const kmlCoords = (points) => points.map(({ position: [lat, lon], altitude }) => `${round7(lon)},${round7(lat)},${Math.round(altitude * 10) / 10}`).join(" ");

/**
 * Los puntos de la ruta de un componente con su altura sobre el despegue (sin seguir el terreno).
 * La fachada sube y baja en cada columna: van todas sus paradas.
 */
function routePoints(component, route) {
  if (component.type === "facade") {
    const stops = route.stations.map((s) => ({ position: s.position, altitude: s.altitude }));
    return route.entry ? [{ position: route.entry, altitude: stops[0].altitude }, ...stops] : stops;
  }
  const altitudes = routeAltitudes(component, route.path);
  return route.path.map((position, i) => ({ position, altitude: altitudes[i] }));
}

/** La altura sobre el despegue de cada punto de la ruta de un componente (sin seguir el terreno). */
function routeAltitudes(component, path) {
  if (component.type === "waypoints" && component.points.length === path.length) return component.points.map((p) => p.altitude);
  if (component.type === "orbit") {
    const to = component.finalAltitude ?? component.altitude;
    return path.map((_, i) => component.altitude + ((to - component.altitude) * i) / Math.max(1, path.length - 1));
  }
  return path.map(() => component.altitude);
}

/**
 * La misión como KML para Google Earth: la ruta en 3D (tránsitos aparte), las áreas, los puntos y
 * el despegue, y la misión entera adentro para volver a importarla tal cual.
 *
 * `ground`: el suelo (TerrainFollow.reference) para poner las alturas sobre el nivel del mar; sin
 * él van sobre el suelo, que es exacto para lo que sigue el terreno y aproximado para lo demás.
 */
export function exportKml(plan, ground = null) {
  const result = PlanPlanner.plan(plan);
  const base = ground ? ground.takeoffGround : 0;
  const mode = ground ? "absolute" : "relativeToGround";
  const needed = TerrainFollow.needed(plan);
  const placemarks = { route: [], areas: [], points: [] };
  const placemark = (folder, name, style, geometry) =>
    placemarks[folder].push(`<Placemark><name>${xmlEscape(name)}</name><styleUrl>#${style}</styleUrl>${geometry}</Placemark>`);
  const line = (points, extrude = true) =>
    `<LineString><extrude>${extrude ? 1 : 0}</extrude><tessellate>0</tessellate><altitudeMode>${mode}</altitudeMode><coordinates>${kmlCoords(points)}</coordinates></LineString>`;

  // La ruta de cada componente, con la altura de cada punto.
  let previous = null;
  for (const item of result.items) {
    const { component, result: route } = item;
    if (!component.enabled || !route) continue;
    let points;
    if (ground && TerrainFollow.follows(component)) {
      points = TerrainFollow.alongRoute(ground, route.path, TerrainFollow.aglAlong(component, route.path)).map((s) => ({ position: s.position, altitude: base + s.altitude }));
    } else {
      points = routePoints(component, route).map((p) => ({ ...p, altitude: base + p.altitude }));
    }
    const start = points[0];
    const from = previous ?? { position: result.takeoff ?? start.position, altitude: base };
    let cruise = Math.max(from.altitude, start.altitude);
    if (ground && needed) cruise = Math.max(cruise, base + TerrainFollow.highestGround(ground, from.position, start.position) + TerrainFollow.TRANSIT_CLEARANCE);
    const name = `${componentName(component)} ${item.number}`;
    const around = (item.approach?.via ?? []).map((position) => ({ position, altitude: cruise }));
    placemark("route", `Hacia ${name}`, "transit", line([from, { ...from, altitude: cruise }, ...around, { ...start, altitude: cruise }, start], false));
    placemark("route", name, "route", line(points));
    previous = points.at(-1);

    // Lo que se dibujó en el mapa.
    if (component.type === "map") {
      placemark("areas", `${name} · área`, "area", `<Polygon><outerBoundaryIs><LinearRing><coordinates>${kmlCoords([...component.boundary, component.boundary[0]].map((position) => ({ position, altitude: 0 })))}</coordinates></LinearRing></outerBoundaryIs></Polygon>`);
    } else if (component.type === "corridor") {
      const outline = CorridorPlanner.outline(component);
      const shape = outline.length ? [...outline, outline[0]] : component.path;
      placemark("areas", `${name} · franja`, "area", outline.length ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${kmlCoords(shape.map((position) => ({ position, altitude: 0 })))}</coordinates></LinearRing></outerBoundaryIs></Polygon>` : `<LineString><tessellate>1</tessellate><coordinates>${kmlCoords(shape.map((position) => ({ position, altitude: 0 })))}</coordinates></LineString>`);
    } else if (component.type === "facade") {
      const shape = FacadePlanner.points(component).map((position) => ({ position, altitude: 0 }));
      placemark("areas", `${name} · ${component.face === "line" ? "pared" : "estructura"}`, "area", component.face === "line" ? `<LineString><tessellate>1</tessellate><coordinates>${kmlCoords(shape)}</coordinates></LineString>` : `<Polygon><outerBoundaryIs><LinearRing><coordinates>${kmlCoords([...shape, shape[0]])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`);
    } else if (component.type === "orbit") {
      placemark("points", `${name} · centro`, "point", `<Point><coordinates>${kmlCoords([{ position: component.center, altitude: 0 }])}</coordinates></Point>`);
    } else if (component.type === "waypoints") {
      component.points.forEach((p, i) =>
        placemark("points", `Punto ${i + 1} · ${num(p.altitude)} m`, "point", `<Point><coordinates>${kmlCoords([{ position: p.position, altitude: 0 }])}</coordinates></Point>`),
      );
    } else if (component.position) {
      placemark("points", name, "point", `<Point><coordinates>${kmlCoords([{ position: component.position, altitude: 0 }])}</coordinates></Point>`);
    }
  }
  if (result.home && previous && result.takeoff) {
    const home = { position: result.takeoff, altitude: base };
    const around = result.home.via.map((position) => ({ position, altitude: previous.altitude }));
    placemark("route", "Regreso al despegue", "transit", line([previous, ...around, { ...home, altitude: previous.altitude }, home], false));
  }
  // Las zonas restringidas, en rojo (no se vuelan).
  plan.components.forEach((component, i) => {
    if (component.type !== "zone" || !ZonePlanner.hasShape(component)) return;
    const shape = ZonePlanner.outline(component).map((position) => ({ position, altitude: 0 }));
    const name = `${componentName(component)} ${i + 1} · ${zoneHeights(component)}${component.enabled ? "" : " (no cuenta)"}`;
    placemark("areas", name, "zone", `<Polygon><outerBoundaryIs><LinearRing><coordinates>${kmlCoords([...shape, shape[0]])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`);
  });
  if (result.takeoff) placemark("points", "Despegue", "takeoff", `<Point><coordinates>${kmlCoords([{ position: result.takeoff, altitude: 0 }])}</coordinates></Point>`);

  const folder = (title, items) => (items.length ? `<Folder><name>${title}</name>${items.join("")}</Folder>` : "");
  const style = (id, body) => `<Style id="${id}">${body}</Style>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${xmlEscape(plan.name)}</name>
<description>${xmlEscape(`Misión del Mini 4 Pro · ${summary(plan)}`)}</description>
<ExtendedData><Data name="mini4pro"><value>${cdata(serializePlan(plan))}</value></Data></ExtendedData>
${style("route", "<LineStyle><color>fff28f2b</color><width>3</width></LineStyle><PolyStyle><color>33f28f2b</color></PolyStyle>")}
${style("transit", "<LineStyle><color>ccffffff</color><width>2</width></LineStyle>")}
${style("area", "<LineStyle><color>ffffffff</color><width>2</width></LineStyle><PolyStyle><color>40f28f2b</color></PolyStyle>")}
${style("zone", "<LineStyle><color>ff3a45ff</color><width>2</width></LineStyle><PolyStyle><color>553a45ff</color></PolyStyle>")}
${style("point", "<IconStyle><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>")}
${style("takeoff", "<IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/shapes/heliport.png</href></Icon></IconStyle>")}
${folder("Ruta", placemarks.route)}
${folder("Áreas", placemarks.areas)}
${folder("Puntos", placemarks.points)}
</Document>
</kml>
`;
}

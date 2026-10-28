// PPK: la posición corregida de cada foto, juntando el registro de fotos de la app (Registros de
// vuelo > Compartir > Fotos para PPK) con el archivo .pos del receptor GNSS (RTKLIB o Emlid Studio).
// Todo se calcula en el navegador; nada se sube.
// Las horas son milisegundos UTC; las distancias en metros; los puntos [latitud, longitud].

/** Segundos que la hora GPS va adelantada a la UTC (sin cambios desde 2017). */
export const GPS_UTC_LEAP_SECONDS = 18;
const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Calidad de la solución en el .pos: 1 fija, 2 flotante, 5 sola… (el número más chico es mejor). */
export const QUALITY = {
  1: "Fija",
  2: "Flotante",
  3: "SBAS",
  4: "DGPS",
  5: "Sola",
  6: "PPP",
};

/** Precisión que se supone (m, horizontal y vertical) cuando el .pos no la trae. */
const DEFAULT_SIGMA = { 1: [0.02, 0.04], 2: [0.3, 0.5], 6: [0.2, 0.4] };

/** Lo más que puede faltar entre dos posiciones del .pos para interpolar entre ellas (ms). */
const MAX_GAP_MS = 2000;

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Distancia horizontal entre dos puntos cercanos (m). */
export function distance(a, b) {
  const x = rad(b[1] - a[1]) * Math.cos(rad((a[0] + b[0]) / 2));
  const y = rad(b[0] - a[0]);
  return Math.hypot(x, y) * 6371000;
}

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** "2026:10:28 12:01:02" (como en el EXIF) a segundos, tomando el reloj de la cámara como si fuera UTC. */
export function cameraSeconds(text) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(text || "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  if (y < 2000) return null;
  return Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
}

// ---------- Registro de fotos de la app ----------

const PHOTO_MAGIC = "# mini4pro-fotos";

/** Lee el registro de fotos de la app. Las líneas cortadas se saltan. */
export function parsePhotoLog(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || !lines[0].startsWith(PHOTO_MAGIC)) {
    throw new Error("No es un registro de fotos de la app (Registros de vuelo > Compartir > Fotos para PPK).");
  }
  const fields = Object.fromEntries(
    lines[0]
      .slice(PHOTO_MAGIC.length)
      .trim()
      .split(/\s+/)
      .map((part) => part.split("="))
      .filter((kv) => kv.length === 2),
  );
  const columns = lines[1].split(",");
  const col = (name) => columns.indexOf(name);
  const at = {
    n: col("foto"),
    time: col("hora_ms"),
    saved: col("guardada_ms"),
    source: col("origen"),
    index: col("indice"),
    camera: col("hora_camara"),
    type: col("tipo"),
    lat: col("latitud"),
    lon: col("longitud"),
    alt: col("altura_m"),
    speed: col("velocidad_ms"),
    heading: col("rumbo"),
    pitch: col("gimbal_pitch"),
  };
  if (at.time < 0 || at.lat < 0) throw new Error("Al registro de fotos le faltan columnas.");
  const num = (v) => (v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const photos = [];
  for (const line of lines.slice(2)) {
    const v = line.split(",");
    if (v.length !== columns.length) continue;
    const time = num(v[at.time]);
    if (time == null) continue;
    const lat = num(v[at.lat]);
    const lon = num(v[at.lon]);
    photos.push({
      n: num(v[at.n]) ?? photos.length + 1,
      time,
      saved: num(v[at.saved]) ?? time,
      fromShutter: v[at.source] === "disparo",
      index: num(v[at.index]),
      cameraTime: v[at.camera] || null,
      cameraSec: cameraSeconds(v[at.camera]),
      type: v[at.type] || null,
      position: lat != null && lon != null ? [lat, lon] : null,
      altitude: num(v[at.alt]),
      speed: num(v[at.speed]),
      heading: num(v[at.heading]),
      gimbalPitch: num(v[at.pitch]),
    });
  }
  const home = fields.casa?.split(",").map(Number);
  return {
    start: num(fields.inicio),
    home: home?.length === 2 && home.every(Number.isFinite) ? home : null,
    photos,
  };
}

// ---------- Archivo .pos (RTKLIB, Emlid Studio) ----------

/** De ECEF (m) a [latitud, longitud, altura elipsoidal] en WGS84. */
export function ecefToGeodetic(x, y, z) {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - e2));
  let h = 0;
  for (let i = 0; i < 8; i++) {
    const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    h = p / Math.cos(lat) - n;
    lat = Math.atan2(z, p * (1 - (e2 * n) / (n + h)));
  }
  return [deg(lat), deg(lon), h];
}

const dms = (d, m, s) => {
  const sign = String(d).trim().startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(d)) + Number(m) / 60 + Number(s) / 3600);
};

/**
 * Lee un .pos de RTKLIB o Emlid Studio (también los _events.pos). Entiende la hora en GPST, UTC o
 * JST, como fecha u hora de semana GPS, y la posición en grados, grados-minutos-segundos o ECEF.
 * Devuelve las épocas ordenadas por hora UTC.
 */
export function parsePos(text) {
  const lines = String(text).split(/\r?\n/);
  const header = lines.filter((l) => l.startsWith("%"));
  const columns = [...header].reverse().find((l) => /latitude|x-ecef/i.test(l));
  if (!columns) throw new Error("No parece un archivo .pos de RTKLIB o Emlid Studio (falta la línea de columnas).");
  const system = /\bUTC\b/.test(columns) ? "UTC" : /\bJST\b/.test(columns) ? "JST" : "GPST";
  const format = /x-ecef/i.test(columns) ? "ecef" : /latitude\(d'/i.test(columns) ? "dms" : "deg";
  const all = header.join("\n");
  const heightKind = /geodetic|egm|msl/i.test(all) && !/ellipsoidal/i.test(all) ? "geoide" : "elipsoidal";
  const toUtc = (ms) => (system === "GPST" ? ms - GPS_UTC_LEAP_SECONDS * 1000 : system === "JST" ? ms - 9 * 3600 * 1000 : ms);

  const epochs = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith("%")) continue;
    const t = line.trim().split(/\s+/);
    let ms;
    if (t[0].includes("/")) {
      const [y, mo, d] = t[0].split("/").map(Number);
      const [h, mi, s] = t[1].split(":").map(Number);
      ms = Date.UTC(y, mo - 1, d, h, mi, 0) + Math.round(s * 1000);
    } else {
      ms = GPS_EPOCH_MS + Number(t[0]) * WEEK_MS + Math.round(Number(t[1]) * 1000);
    }
    if (!Number.isFinite(ms)) continue;
    let lat, lon, h, rest;
    if (format === "ecef") {
      [lat, lon, h] = ecefToGeodetic(Number(t[2]), Number(t[3]), Number(t[4]));
      rest = t.slice(5);
    } else if (format === "dms") {
      lat = dms(t[2], t[3], t[4]);
      lon = dms(t[5], t[6], t[7]);
      h = Number(t[8]);
      rest = t.slice(9);
    } else {
      lat = Number(t[2]);
      lon = Number(t[3]);
      h = Number(t[4]);
      rest = t.slice(5);
    }
    if (![lat, lon, h].every(Number.isFinite)) continue;
    const [q, ns, s1, s2, s3] = rest.map(Number);
    // En ECEF las desviaciones son x, y, z: se toman como horizontal y vertical aproximadas.
    const sdh = Math.hypot(s1, s2);
    epochs.push({
      t: toUtc(ms),
      lat,
      lon,
      h,
      q: Number.isFinite(q) ? q : 5,
      ns: Number.isFinite(ns) ? ns : null,
      sdh: Number.isFinite(sdh) && sdh > 0 ? sdh : null,
      sdv: Number.isFinite(s3) && s3 > 0 ? s3 : null,
    });
  }
  epochs.sort((a, b) => a.t - b.t);
  if (!epochs.length) throw new Error("El .pos no trae posiciones.");
  return { system, format, heightKind, epochs };
}

/** Cuántas épocas hay de cada calidad. */
export function qualityCounts(epochs) {
  const counts = {};
  for (const e of epochs) counts[e.q] = (counts[e.q] || 0) + 1;
  return counts;
}

/** La primera época que no es anterior a [t]. */
function firstAtOrAfter(epochs, t) {
  let lo = 0;
  let hi = epochs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (epochs[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * La posición del .pos a la hora [t], interpolada entre las dos épocas que la rodean; null si [t]
 * queda fuera del archivo o en un hueco de más de 2 s.
 */
export function positionAt(epochs, t) {
  const i = firstAtOrAfter(epochs, t);
  if (i < epochs.length && epochs[i].t === t) return { ...epochs[i] };
  if (i === 0 || i === epochs.length) return null;
  const a = epochs[i - 1];
  const b = epochs[i];
  if (b.t - a.t > MAX_GAP_MS) return null;
  const f = (t - a.t) / (b.t - a.t);
  const mix = (x, y) => (x == null || y == null ? (x ?? y) : x + (y - x) * f);
  return {
    t,
    lat: mix(a.lat, b.lat),
    lon: mix(a.lon, b.lon),
    h: mix(a.h, b.h),
    q: Math.max(a.q, b.q),
    ns: a.ns != null && b.ns != null ? Math.min(a.ns, b.ns) : (a.ns ?? b.ns),
    sdh: a.sdh != null && b.sdh != null ? Math.max(a.sdh, b.sdh) : (a.sdh ?? b.sdh),
    sdv: a.sdv != null && b.sdv != null ? Math.max(a.sdv, b.sdv) : (a.sdv ?? b.sdv),
  };
}

/** Velocidad horizontal del receptor (m/s) alrededor de [t], medida en un segundo. */
export function speedAt(epochs, t) {
  const before = positionAt(epochs, t - 500);
  const after = positionAt(epochs, t + 500);
  if (!before || !after) return null;
  return distance([before.lat, before.lon], [after.lat, after.lon]);
}

/**
 * Corrección de hora (ms) que deja las fotos en las paradas del dron: busca entre -3 y +3 s la que
 * da menos velocidad al disparar y toma el centro de las que casi empatan. Sirve cuando el Mapa
 * frena a 0 en cada foto; null si no hay paradas claras (el dron no se detenía).
 */
export function suggestOffset(photos, epochs) {
  if (photos.length < 3) return null;
  const scores = [];
  for (let off = -3000; off <= 3000; off += 50) {
    const speeds = photos.map((p) => speedAt(epochs, p.time + off)).filter((s) => s != null);
    if (speeds.length < Math.max(3, photos.length / 2)) continue;
    scores.push({ off, speed: median(speeds) });
  }
  if (!scores.length) return null;
  const best = Math.min(...scores.map((s) => s.speed));
  if (best > 0.3) return null;
  const plateau = scores.filter((s) => s.speed <= best + 0.05).map((s) => s.off);
  const offsetMs = Math.round(plateau.reduce((a, b) => a + b, 0) / plateau.length / 50) * 50;
  return { offsetMs, speed: best };
}

/**
 * Las marcas del sensor de luz para cada foto. El sensor marca antes de que la app se entere, con
 * un retraso parecido en todas: se mide (la mediana) y cada foto toma la marca más cercana a su
 * hora más ese retraso, sin repetir. Una marca de más (por ejemplo al cambiar la batería) queda
 * sin foto, y una foto sin marca queda en null.
 */
export function matchEvents(photos, events, offsetMs = 0) {
  const nearest = (t) => {
    const i = firstAtOrAfter(events, t);
    const candidates = [events[i - 1], events[i]].filter(Boolean);
    return candidates.reduce((best, e) => (best == null || Math.abs(e.t - t) < Math.abs(best.t - t) ? e : best), null);
  };
  const deltas = photos
    .map((p) => {
      const e = nearest(p.time + offsetMs);
      return e && Math.abs(e.t - (p.time + offsetMs)) < 3000 ? e.t - (p.time + offsetMs) : null;
    })
    .filter((d) => d != null);
  const latency = median(deltas) ?? 0;
  const used = new Set();
  const result = photos.map((p) => {
    const expected = p.time + offsetMs + latency;
    let best = -1;
    let bestDt = Infinity;
    const i = firstAtOrAfter(events, expected);
    for (let j = Math.max(0, i - 3); j < Math.min(events.length, i + 3); j++) {
      const dt = Math.abs(events[j].t - expected);
      if (!used.has(j) && dt < bestDt) {
        best = j;
        bestDt = dt;
      }
    }
    if (best < 0 || bestDt > 700) return null;
    used.add(best);
    return best;
  });
  return { latencyMs: Math.round(latency), matches: result, unused: events.length - used.size };
}

// ---------- Fotos (los nombres) ----------

/**
 * La hora de una foto en su EXIF (DateTimeOriginal, si no DateTime), de un JPG o un DNG: el
 * comienzo del archivo basta. null si no la tiene.
 */
export function readExifTime(buffer) {
  const v = new DataView(buffer);
  if (v.byteLength < 12) return null;
  let tiff = -1;
  if (v.getUint16(0) === 0xffd8) {
    let p = 2;
    while (p + 4 <= v.byteLength) {
      if (v.getUint8(p) !== 0xff) return null;
      const marker = v.getUint8(p + 1);
      if (marker === 0xda || marker === 0xd9) return null;
      const length = v.getUint16(p + 2);
      if (marker === 0xe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966 && v.getUint16(p + 8) === 0) {
        tiff = p + 10;
        break;
      }
      p += 2 + length;
    }
  } else {
    tiff = 0;
  }
  if (tiff < 0 || tiff + 8 > v.byteLength) return null;
  const order = v.getUint16(tiff);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return null;
  const inside = (o, n) => tiff + o + n <= v.byteLength;
  const u16 = (o) => v.getUint16(tiff + o, little);
  const u32 = (o) => v.getUint32(tiff + o, little);
  if (u16(2) !== 42) return null;
  const readIfd = (offset) => {
    const tags = new Map();
    if (!inside(offset, 2)) return tags;
    const n = u16(offset);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (!inside(e, 12)) break;
      tags.set(u16(e), { count: u32(e + 4), at: e + 8 });
    }
    return tags;
  };
  const ascii = (entry) => {
    const start = entry.count > 4 ? u32(entry.at) : entry.at;
    let s = "";
    for (let i = 0; i < entry.count && inside(start + i, 1); i++) {
      const c = v.getUint8(tiff + start + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };
  const ifd0 = readIfd(u32(4));
  const pointer = ifd0.get(0x8769);
  const exif = pointer ? readIfd(u32(pointer.at)) : new Map();
  const entry = exif.get(0x9003) || ifd0.get(0x0132);
  return entry ? ascii(entry) || null : null;
}

/** El número del archivo de DJI: 7 en DJI_20261028120102_0007_D.JPG. */
export function fileNumber(name) {
  const m = /_(\d{4})(?:_[A-Za-z]+)?\.[A-Za-z0-9]+$/.exec(name);
  return m ? Number(m[1]) : null;
}

/**
 * La foto de la tarjeta que corresponde a cada línea del registro: primero las del mismo número
 * y hasta 2 s de diferencia en la hora de la cámara, después la más cercana en hora; las que
 * quedan, por orden si son tantas como fotos sin pareja. [files] son {name, cameraSec} ordenadas
 * por nombre.
 */
export function matchFiles(photos, files) {
  const used = new Set();
  const result = photos.map(() => null);
  const pass = (sameNumber) =>
    photos.forEach((p, i) => {
      if (result[i] != null || p.cameraSec == null) return;
      let best = -1;
      let bestDt = Infinity;
      files.forEach((f, j) => {
        if (used.has(j) || f.cameraSec == null) return;
        if (sameNumber && (p.index == null || fileNumber(f.name) !== p.index)) return;
        const dt = Math.abs(f.cameraSec - p.cameraSec);
        if (dt <= 2 && dt < bestDt) {
          best = j;
          bestDt = dt;
        }
      });
      if (best >= 0) {
        used.add(best);
        result[i] = best;
      }
    });
  pass(true);
  pass(false);
  const freeFiles = files.map((_, j) => j).filter((j) => !used.has(j));
  const freePhotos = result.map((r, i) => (r == null ? i : -1)).filter((i) => i >= 0);
  if (freePhotos.length && freeFiles.length === freePhotos.length) freePhotos.forEach((i, k) => (result[i] = freeFiles[k]));
  return result;
}

/** De las fotos elegidas, las JPG; si no hay ninguna, las DNG. Ordenadas por nombre. */
export function pickImages(names) {
  const jpg = names.filter((n) => /\.jpe?g$/i.test(n));
  const list = jpg.length ? jpg : names.filter((n) => /\.dng$/i.test(n));
  return [...list].sort((a, b) => a.localeCompare(b, "en"));
}

// ---------- Resultado ----------

/**
 * La posición PPK de cada foto. Sin marcas, a la hora del registro más [offsetMs]; con marcas
 * ([events] = true, el .pos es un _events.pos), la de la marca de esa foto. A la altura se le
 * resta lo que la antena queda por encima de la cámara.
 */
export function geotag(photos, pos, { offsetMs = 0, antennaCm = 0, events = false, names = [] } = {}) {
  const epochs = pos.epochs;
  const matched = events ? matchEvents(photos, epochs, offsetMs) : null;
  const rows = photos.map((p, i) => {
    const name = names[i] || `foto ${p.n}`;
    const base = { n: p.n, name, time: p.time + offsetMs, photo: p };
    let fix;
    if (events) {
      const j = matched.matches[i];
      if (j == null) return { ...base, problem: "Sin marca del sensor" };
      fix = epochs[j];
      base.time = fix.t;
      base.eventDelta = fix.t - (p.time + offsetMs);
    } else {
      fix = positionAt(epochs, p.time + offsetMs);
      if (!fix) return { ...base, problem: "Fuera del .pos o en un hueco" };
      base.speed = speedAt(epochs, p.time + offsetMs);
    }
    const [dh, dv] = DEFAULT_SIGMA[fix.q] || [2, 4];
    const lat = fix.lat;
    const lon = fix.lon;
    return {
      ...base,
      lat,
      lon,
      h: fix.h - antennaCm / 100,
      q: fix.q,
      sdh: fix.sdh ?? dh,
      sdv: fix.sdv ?? dv,
      droneDistance: p.position ? distance(p.position, [lat, lon]) : null,
      problem: fix.q > 2 ? `Solución ${QUALITY[fix.q] || fix.q}` : null,
    };
  });
  return { rows, latencyMs: matched?.latencyMs ?? null, unusedEvents: matched?.unused ?? null };
}

/** Los números del resultado, para el resumen. */
export function summarize(rows) {
  const placed = rows.filter((r) => r.lat != null);
  const fixed = placed.filter((r) => r.q === 1);
  const speeds = placed.map((r) => r.speed).filter((s) => s != null);
  const drone = placed.map((r) => r.droneDistance).filter((d) => d != null);
  return {
    total: rows.length,
    placed: placed.length,
    fixed: fixed.length,
    maxSpeed: speeds.length ? Math.max(...speeds) : null,
    medianSpeed: median(speeds),
    droneDistance: median(drone),
  };
}

const f = (x, digits) => (x == null ? "" : x.toFixed(digits));

/** CSV para Pix4D y Metashape: nombre, latitud, longitud, altura y precisiones (m). */
export function toCsv(rows) {
  const lines = ["imagename,latitude,longitude,altitude,accuracy_horizontal,accuracy_vertical"];
  for (const r of rows) {
    if (r.lat == null) continue;
    lines.push([r.name, f(r.lat, 9), f(r.lon, 9), f(r.h, 3), f(r.sdh, 3), f(r.sdv, 3)].join(","));
  }
  return lines.join("\n") + "\n";
}

/** geo.txt para WebODM / OpenDroneMap: primero la proyección, después nombre, longitud, latitud y altura. */
export function toOdm(rows) {
  const lines = ["EPSG:4326"];
  for (const r of rows) {
    if (r.lat == null) continue;
    lines.push([r.name, f(r.lon, 9), f(r.lat, 9), f(r.h, 3)].join(" "));
  }
  return lines.join("\n") + "\n";
}

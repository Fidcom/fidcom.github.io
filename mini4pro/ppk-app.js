// La pantalla de la página PPK: elegir los archivos, ver el resultado en el mapa y descargarlo.
// Los cálculos están en ppk.js.
import {
  QUALITY,
  cameraSeconds,
  geotag,
  matchFiles,
  parsePhotoLog,
  parsePos,
  pickImages,
  qualityCounts,
  readExifTime,
  suggestOffset,
  summarize,
  toCsv,
  toOdm,
} from "./ppk.js";

const LOCALE = "es-PR";
const $ = (id) => document.getElementById(id);
/** Cuánto del comienzo de cada foto se lee para la hora del EXIF. */
const EXIF_BYTES = 512 * 1024;

const state = {
  log: null,
  logName: "",
  pos: null,
  posName: "",
  /** Los nombres de las fotos de la tarjeta, uno por línea del registro (o vacío). */
  names: [],
  suggestion: null,
  result: null,
};

const number = (x, digits = 0) => x.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const plural = (n, one, many) => `${number(n)} ${n === 1 ? one : many}`;
const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clock = (ms) =>
  new Date(ms).toLocaleString(LOCALE, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

// ---------- Mapa ----------

const map = L.map("map", { zoomControl: false, maxZoom: 22, worldCopyJump: true });
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 22,
  maxNativeZoom: 19,
  attribution: "Imágenes © Esri, Maxar, Earthstar Geographics",
}).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);
map.attributionControl.setPrefix(false);
map.setView([18.2, -66.5], 9);
const trackLayer = L.layerGroup().addTo(map);
const droneLayer = L.layerGroup().addTo(map);
const photoLayer = L.layerGroup().addTo(map);
const markers = [];

function fitPadding() {
  return window.innerWidth <= 760
    ? { paddingTopLeft: [24, 24], paddingBottomRight: [24, window.innerHeight * 0.52 + 32] }
    : { paddingTopLeft: [$("panel").offsetWidth + 60, 60], paddingBottomRight: [60, 60] };
}

const QUALITY_COLORS = { 1: "#3ddc84", 2: "#ffc107" };
const qualityColor = (q) => QUALITY_COLORS[q] || "#ff453a";

function drawTrack() {
  trackLayer.clearLayers();
  const pos = state.pos;
  if (!pos || $("events").checked) return;
  // Una línea por tramo sin huecos, con una de cada pocas épocas para no cargar el mapa.
  const step = Math.max(1, Math.floor(pos.epochs.length / 4000));
  let segment = [];
  let last = null;
  for (let i = 0; i < pos.epochs.length; i += step) {
    const e = pos.epochs[i];
    if (last && e.t - last.t > 5000 * step && segment.length) {
      L.polyline(segment, { color: "#2f9bff", weight: 2, opacity: 0.75, interactive: false }).addTo(trackLayer);
      segment = [];
    }
    segment.push([e.lat, e.lon]);
    last = e;
  }
  if (segment.length > 1) L.polyline(segment, { color: "#2f9bff", weight: 2, opacity: 0.75, interactive: false }).addTo(trackLayer);
}

function drawPhotos() {
  droneLayer.clearLayers();
  photoLayer.clearLayers();
  markers.length = 0;
  const points = [];
  for (const p of state.log?.photos ?? []) {
    if (!p.position) continue;
    L.circleMarker(p.position, { radius: 3, color: "#ffffff", weight: 1, opacity: 0.5, fillOpacity: 0.25, interactive: false }).addTo(droneLayer);
    points.push(p.position);
  }
  for (const r of state.result?.rows ?? []) {
    if (r.lat == null) {
      markers.push(null);
      continue;
    }
    const marker = L.circleMarker([r.lat, r.lon], { radius: 6, color: "#0b0e11", weight: 1.5, fillColor: qualityColor(r.q), fillOpacity: 1 })
      .bindTooltip(`<div class="ppk-tooltip"><b>${escape(r.name)}</b><br>${escape(rowInfo(r))}</div>`, { direction: "top", offset: [0, -6] })
      .addTo(photoLayer);
    markers.push(marker);
    points.push([r.lat, r.lon]);
  }
  if (!points.length && state.pos) {
    const e = state.pos.epochs;
    points.push([e[0].lat, e[0].lon], [e[e.length - 1].lat, e[e.length - 1].lon]);
  }
  if (points.length) map.fitBounds(L.latLngBounds(points), { ...fitPadding(), maxZoom: 19 });
}

// ---------- Archivos ----------

function setStep(id, text, kind) {
  const step = $(id);
  step.classList.toggle("done", kind === "done");
  step.classList.toggle("error", kind === "error");
  step.querySelector(".ppk-step-status").textContent = text;
}

let toastTimer = null;
function toast(message, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), error ? 6000 : 2500);
}

$("log-button").addEventListener("click", () => $("log-file").click());
$("pos-button").addEventListener("click", () => $("pos-file").click());
$("photos-button").addEventListener("click", () => $("photos-file").click());

$("log-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    const log = parsePhotoLog(await file.text());
    if (!log.photos.length) throw new Error("El registro no tiene fotos.");
    state.log = log;
    state.logName = file.name;
    state.names = [];
    const first = log.photos[0].time;
    setStep("step-log", `${plural(log.photos.length, "foto", "fotos")} · ${clock(first)}`, "done");
    setStep("step-photos", "Elige las JPG para que el resultado lleve sus nombres. Solo se lee la hora de cada una.");
  } catch (error) {
    state.log = null;
    setStep("step-log", error.message, "error");
  }
  update(true);
});

$("pos-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    const pos = parsePos(await file.text());
    state.pos = pos;
    state.posName = file.name;
    const counts = qualityCounts(pos.epochs);
    const fixed = Math.round(((counts[1] || 0) / pos.epochs.length) * 100);
    const events = /event/i.test(file.name);
    $("events").checked = events;
    $("events-row").hidden = false;
    const what = events ? plural(pos.epochs.length, "marca", "marcas") : plural(pos.epochs.length, "posición", "posiciones");
    const height = pos.heightKind === "geoide" ? "altura sobre el geoide" : "altura elipsoidal";
    setStep("step-pos", `${what} · ${fixed} % fijas · hora ${pos.system} · ${height}`, "done");
  } catch (error) {
    state.pos = null;
    $("events-row").hidden = true;
    setStep("step-pos", error.message, "error");
  }
  update(true);
});

$("photos-file").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  if (!files.length) return;
  if (!state.log) {
    toast("Primero elige el registro de fotos de la app.", true);
    return;
  }
  const byName = new Map(files.map((f) => [f.name, f]));
  const names = pickImages(files.map((f) => f.name));
  setStep("step-photos", `Leyendo ${plural(names.length, "foto", "fotos")}…`);
  const images = [];
  for (const name of names) {
    const text = readExifTime(await byName.get(name).slice(0, EXIF_BYTES).arrayBuffer());
    images.push({ name, cameraSec: cameraSeconds(text) });
  }
  const matches = matchFiles(state.log.photos, images);
  state.names = matches.map((j) => (j == null ? null : images[j].name));
  const paired = matches.filter((j) => j != null).length;
  const extra = images.length - paired;
  const text =
    `${plural(paired, "foto con pareja", "fotos con pareja")} de ${number(state.log.photos.length)}` +
    (extra > 0 ? ` · ${plural(extra, "sobra", "sobran")} (tomadas fuera del vuelo)` : "");
  setStep("step-photos", text, paired ? "done" : "error");
  update(false);
});

$("events").addEventListener("change", () => update(true));
$("offset").addEventListener("input", () => update(false));
$("antenna").addEventListener("input", () => update(false));
$("offset-use").addEventListener("click", () => {
  if (!state.suggestion) return;
  $("offset").value = (state.suggestion.offsetMs / 1000).toFixed(2);
  update(false);
});

// ---------- Resultado ----------

function rowInfo(r) {
  if (r.lat == null) return r.problem;
  const parts = [QUALITY[r.q] || `Q${r.q}`, `±${number(r.sdh * 100, r.sdh < 0.1 ? 1 : 0)} cm`];
  if (r.speed != null) parts.push(`${number(r.speed, 2)} m/s`);
  if (r.eventDelta != null) parts.push(`marca ${r.eventDelta > 0 ? "+" : ""}${number(r.eventDelta / 1000, 2)} s`);
  return parts.join(" · ");
}

function stat(label, value, kind = "") {
  return `<div class="stat"><div class="k">${escape(label)}</div><div class="v ${kind}">${escape(value)}</div></div>`;
}

/** Vuelve a calcular todo; [fresh] cuando cambió un archivo (busca otra vez la corrección de hora). */
function update(fresh) {
  const { log, pos } = state;
  const events = $("events").checked;
  if (fresh) {
    state.suggestion = log && pos && !events ? suggestOffset(log.photos, pos.epochs) : null;
  }
  const suggestion = state.suggestion;
  const offsetMs = Math.round((Number($("offset").value) || 0) * 1000);
  const button = $("offset-use");
  button.hidden = !suggestion || Math.abs(suggestion.offsetMs - offsetMs) < 50;
  if (suggestion) button.textContent = `Usar ${suggestion.offsetMs > 0 ? "+" : ""}${number(suggestion.offsetMs / 1000, 2)} s (las fotos caen en las paradas)`;
  $("offset-note").textContent = events
    ? "Con las marcas del sensor la hora del teléfono solo sirve para saber qué marca es de cada foto."
    : "Si el Mapa frena en cada foto, la página busca la corrección que deja las fotos en las paradas.";

  if (!log || !pos) {
    state.result = null;
    $("results").hidden = true;
    $("download-csv").disabled = true;
    $("download-odm").disabled = true;
    drawTrack();
    drawPhotos();
    return;
  }
  const antennaCm = Number($("antenna").value) || 0;
  const result = geotag(log.photos, pos, { offsetMs, antennaCm, events, names: state.names });
  state.result = result;
  const stats = summarize(result.rows);

  const cells = [
    stat("Con posición", `${number(stats.placed)} de ${number(stats.total)}`, stats.placed === stats.total ? "ok" : "warn"),
    stat("Fijas", `${number(stats.fixed)}`, stats.fixed === stats.placed && stats.placed ? "ok" : "warn"),
  ];
  if (events) cells.push(stat("Retraso marca", result.latencyMs == null ? "—" : `${number(result.latencyMs / 1000, 2)} s`));
  else cells.push(stat("Velocidad", stats.maxSpeed == null ? "—" : `${number(stats.maxSpeed, 2)} m/s`, stats.maxSpeed > 0.3 ? "warn" : "ok"));
  $("stats").innerHTML = cells.join("");

  const warnings = [];
  if (!stats.placed) {
    const e = pos.epochs;
    warnings.push(
      `Las horas no coinciden: el .pos va de ${clock(e[0].t)} a ${clock(e[e.length - 1].t)} y las fotos de ` +
        `${clock(log.photos[0].time)} a ${clock(log.photos[log.photos.length - 1].time)}. ¿Es el .pos de este vuelo?`,
    );
  }
  if (!events && stats.maxSpeed > 0.3) {
    warnings.push(
      `Algunas fotos se tomaron con el dron en movimiento (hasta ${number(stats.maxSpeed, 1)} m/s). La hora del teléfono puede fallar ` +
        `unas décimas de segundo: a esa velocidad son ${number(stats.maxSpeed * 20)} cm o más. Para PPK sin sensor, haz que el Mapa frene a 0 en cada foto.`,
    );
  }
  if (events && result.unusedEvents > 0) {
    warnings.push(`${plural(result.unusedEvents, "marca quedó", "marcas quedaron")} sin foto (por ejemplo al encender o cambiar la batería).`);
  }
  if (stats.droneDistance != null && stats.droneDistance > 10) {
    warnings.push(`El GPS del dron queda a ${number(stats.droneDistance)} m del PPK: revisa que la base esté bien puesta.`);
  }
  if (state.names.length === 0) {
    warnings.push("Sin las fotos elegidas el resultado las nombra foto 1, foto 2… Elige las JPG (paso 3) para tener sus nombres.");
  }
  if (pos.heightKind === "geoide") {
    warnings.push("La altura del .pos es sobre el geoide, no la elipsoidal: dilo así al importar en Pix4D o Metashape.");
  }
  $("warnings").innerHTML = warnings.map((w) => `<div class="ppk-warning">${escape(w)}</div>`).join("");

  $("photo-list").innerHTML = result.rows
    .map(
      (r, i) =>
        `<button class="ppk-row" type="button" data-i="${i}"><span class="ppk-dot ${r.lat == null ? "" : `q${r.q}`}"></span>` +
        `<span class="name">${escape(r.name)}</span><span class="info">${escape(rowInfo(r))}</span></button>`,
    )
    .join("");
  $("results").hidden = false;
  $("download-csv").disabled = !stats.placed;
  $("download-odm").disabled = !stats.placed;
  drawTrack();
  drawPhotos();
}

$("photo-list").addEventListener("click", (event) => {
  const row = event.target.closest(".ppk-row");
  const marker = row && markers[Number(row.dataset.i)];
  if (!marker) return;
  map.setView(marker.getLatLng(), Math.max(map.getZoom(), 19));
  marker.openTooltip();
});

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const baseName = () => state.logName.replace(/\.csv$/i, "") || "fotos";

$("download-csv").addEventListener("click", () => {
  if (!state.result) return;
  download(toCsv(state.result.rows), `${baseName()} PPK.csv`, "text/csv");
});

$("download-odm").addEventListener("click", () => {
  if (!state.result) return;
  download(toOdm(state.result.rows), "geo.txt", "text/plain");
});

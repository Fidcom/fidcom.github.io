// La página PPK: leer el registro de fotos y el .pos, y dar la posición de cada foto.
// Correr con: node --test mini4pro/test/ppk.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GPS_UTC_LEAP_SECONDS,
  cameraSeconds,
  distance,
  ecefToGeodetic,
  fileNumber,
  geotag,
  matchEvents,
  matchFiles,
  parsePhotoLog,
  parsePos,
  pickImages,
  positionAt,
  readExifTime,
  speedAt,
  suggestOffset,
  summarize,
  toCsv,
  toOdm,
} from "../ppk.js";

const ORIGIN = [18.18, -65.82];
const M_LAT = 1 / 111195;
const M_LON = 1 / (111195 * Math.cos((ORIGIN[0] * Math.PI) / 180));
const at = (east, north) => [ORIGIN[0] + north * M_LAT, ORIGIN[1] + east * M_LON];
const START = Date.UTC(2026, 9, 28, 14, 0, 0); // UTC

/**
 * Un vuelo hacia el este a 5 m/s que frena 3 s en cada foto (cada 20 m): la trayectoria del
 * receptor a 5 Hz, y cuándo está quieto en cada parada.
 */
function stopAndShoot(photos = 5) {
  const epochs = [];
  const stops = [];
  let t = 0;
  let east = 0;
  const push = () => epochs.push({ t: START + Math.round(t * 1000), p: at(east, 0), h: 60 });
  for (let i = 0; i < photos; i++) {
    for (let k = 0; k < 20; k++) {
      push();
      t += 0.2;
      east += 1;
    }
    stops.push({ from: START + Math.round(t * 1000), east });
    for (let k = 0; k < 15; k++) {
      push();
      t += 0.2;
    }
  }
  push();
  return { epochs, stops };
}

const pad = (n, w = 2) => String(n).padStart(w, "0");

/** De latitud, longitud y altura elipsoidal a ECEF (WGS84), para probar el camino de vuelta. */
function toEcef(lat, lon, h) {
  const a = 6378137;
  const e2 = (1 / 298.257223563) * (2 - 1 / 298.257223563);
  const c = (d) => Math.cos((d * Math.PI) / 180);
  const s = (d) => Math.sin((d * Math.PI) / 180);
  const n = a / Math.sqrt(1 - e2 * s(lat) ** 2);
  return [(n + h) * c(lat) * c(lon), (n + h) * c(lat) * s(lon), (n * (1 - e2) + h) * s(lat)];
}

/** El .pos de RTKLIB con esas épocas, en hora GPS. */
function posText(epochs, { q = 1 } = {}) {
  const lines = [
    "% program   : RTKPOST ver.2.4.3 b34",
    "% (lat/lon/height=WGS84/ellipsoidal,Q=1:fix,2:float,3:sbas,4:dgps,5:single,6:ppp,ns=# of satellites)",
    "%  GPST                  latitude(deg) longitude(deg)  height(m)   Q  ns   sdn(m)   sde(m)   sdu(m)  sdne(m)  sdeu(m)  sdun(m) age(s)  ratio",
  ];
  for (const e of epochs) {
    const d = new Date(e.t + GPS_UTC_LEAP_SECONDS * 1000);
    const time = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
    lines.push(`${time}   ${e.p[0].toFixed(9)}  ${e.p[1].toFixed(9)}    ${e.h.toFixed(4)}   ${q}  14   0.0060   0.0050   0.0120   0.0010  -0.0020   0.0030   0.20  999.9`);
  }
  return lines.join("\n") + "\n";
}

/** El registro de fotos de la app, con la hora del teléfono corrida [clockError] ms. */
function photoLog(stops, clockError = 0) {
  const lines = [
    `# mini4pro-fotos inicio=${START} casa=${ORIGIN[0]},${ORIGIN[1]}`,
    "foto,hora_utc,hora_ms,guardada_ms,origen,indice,hora_camara,tipo,latitud,longitud,altura_m,velocidad_ms,vertical_ms,rumbo,gimbal_pitch,gimbal_roll,gimbal_yaw",
  ];
  stops.forEach((s, i) => {
    const time = s.from + 1200 + clockError;
    const camera = new Date(s.from + 1200 - 4 * 3600 * 1000); // la cámara en hora de Puerto Rico
    const cam = `${camera.getUTCFullYear()}:${pad(camera.getUTCMonth() + 1)}:${pad(camera.getUTCDate())} ${pad(camera.getUTCHours())}:${pad(camera.getUTCMinutes())}:${pad(camera.getUTCSeconds())}`;
    // El GPS del dron se equivoca un par de metros.
    const drone = at(s.east + 1.5, 1.0);
    lines.push(`${i + 1},x,${time},${time + 1500},disparo,${i + 1},${cam},JPEG,${drone[0].toFixed(8)},${drone[1].toFixed(8)},60.00,0.02,0.00,90.0,-90.0,0.0,90.0`);
  });
  lines.push("6,x,17616"); // cortada
  return lines.join("\n") + "\n";
}

test("el registro de fotos de la app se lee", () => {
  const { stops } = stopAndShoot(3);
  const log = parsePhotoLog(photoLog(stops));
  assert.equal(log.start, START);
  assert.deepEqual(log.home, ORIGIN);
  assert.equal(log.photos.length, 3);
  const p = log.photos[0];
  assert.equal(p.n, 1);
  assert.equal(p.time, stops[0].from + 1200);
  assert.equal(p.fromShutter, true);
  assert.equal(p.index, 1);
  assert.equal(p.cameraSec, cameraSeconds(p.cameraTime));
  assert.ok(p.position);
  assert.throws(() => parsePhotoLog("hola"), /registro de fotos/);
});

test("el .pos de RTKLIB se lee y pasa de hora GPS a UTC", () => {
  const { epochs } = stopAndShoot(2);
  const pos = parsePos(posText(epochs));
  assert.equal(pos.system, "GPST");
  assert.equal(pos.format, "deg");
  assert.equal(pos.heightKind, "elipsoidal");
  assert.equal(pos.epochs.length, epochs.length);
  assert.equal(pos.epochs[0].t, epochs[0].t);
  assert.equal(pos.epochs[0].q, 1);
  assert.equal(pos.epochs[0].ns, 14);
  assert.ok(Math.abs(pos.epochs[0].sdh - Math.hypot(0.006, 0.005)) < 1e-9);
  assert.equal(pos.epochs[0].sdv, 0.012);
  assert.throws(() => parsePos("hola\nmundo"), /\.pos/);
});

test("también la hora de semana GPS, UTC y ECEF", () => {
  // Semana 2390 (empieza el domingo 26 de octubre de 2025), 2 días y 1 h: 2025-10-28 01:00:00 GPST.
  const week = parsePos(
    "%  GPST          latitude(deg) longitude(deg)  height(m)   Q  ns   sdn(m)   sde(m)   sdu(m)\n" +
      "2390 176400.000   18.000000000  -65.000000000    10.0000   2  10   0.1000   0.1000   0.2000\n",
  );
  assert.equal(week.epochs[0].t, Date.UTC(2025, 9, 28, 1, 0, 0) - GPS_UTC_LEAP_SECONDS * 1000);
  assert.equal(week.epochs[0].q, 2);
  const utc = parsePos(
    "%  UTC                   latitude(deg) longitude(deg)  height(m)   Q  ns\n2026/10/28 14:00:00.500   18.0  -65.0  10.0  1  12\n",
  );
  assert.equal(utc.epochs[0].t, Date.UTC(2026, 9, 28, 14, 0, 0, 500));
  // Sin precisiones en el archivo.
  assert.equal(utc.epochs[0].sdh, null);
  const [x, y, z] = toEcef(18.18, -65.82, 60).map((v) => v.toFixed(4));
  const ecef = parsePos(
    `%  GPST                  x-ecef(m)      y-ecef(m)      z-ecef(m)   Q  ns   sdx(m)   sdy(m)   sdz(m)\n2026/10/28 14:00:18.000   ${x}  ${y}  ${z}   1  12   0.0100   0.0100   0.0200\n`,
  );
  const e = ecef.epochs[0];
  assert.ok(Math.abs(e.lat - 18.18) < 1e-8 && Math.abs(e.lon - -65.82) < 1e-8 && Math.abs(e.h - 60) < 1e-3, `${e.lat}, ${e.lon}, ${e.h}`);
  assert.equal(ecef.epochs[0].t, Date.UTC(2026, 9, 28, 14, 0, 0));
});

test("de ECEF a latitud y longitud", () => {
  // Un punto en el ecuador y el meridiano de Greenwich, a 100 m.
  const [lat, lon, h] = ecefToGeodetic(6378137 + 100, 0, 0);
  assert.ok(Math.abs(lat) < 1e-9 && Math.abs(lon) < 1e-9 && Math.abs(h - 100) < 1e-6);
  // Ida y vuelta en Puerto Rico, a 60 m sobre el elipsoide.
  const back = ecefToGeodetic(...toEcef(18.18, -65.82, 60));
  assert.ok(Math.abs(back[0] - 18.18) < 1e-10 && Math.abs(back[1] - -65.82) < 1e-10 && Math.abs(back[2] - 60) < 1e-4, back.join(", "));
});

test("la posición entre dos épocas se interpola, y no en un hueco", () => {
  const epochs = [
    { t: 0, lat: 18, lon: -65, h: 10, q: 1, ns: 12, sdh: 0.01, sdv: 0.02 },
    { t: 200, lat: 18.0001, lon: -65, h: 12, q: 2, ns: 10, sdh: 0.3, sdv: 0.5 },
    { t: 5000, lat: 18.0002, lon: -65, h: 12, q: 1, ns: 12, sdh: 0.01, sdv: 0.02 },
  ];
  const mid = positionAt(epochs, 50);
  assert.ok(Math.abs(mid.lat - 18.000025) < 1e-12);
  assert.equal(mid.h, 10.5);
  assert.equal(mid.q, 2); // la peor de las dos
  assert.equal(mid.sdh, 0.3);
  assert.equal(positionAt(epochs, 200).q, 2);
  assert.equal(positionAt(epochs, 1000), null); // hueco de 4,8 s
  assert.equal(positionAt(epochs, -1), null);
  assert.equal(positionAt(epochs, 6000), null);
});

test("la velocidad del receptor: quieto en las paradas, 5 m/s entre fotos", () => {
  const { epochs, stops } = stopAndShoot(2);
  const pos = parsePos(posText(epochs));
  assert.ok(speedAt(pos.epochs, stops[0].from + 1500) < 0.01);
  assert.ok(Math.abs(speedAt(pos.epochs, stops[0].from - 2000) - 5) < 0.05);
});

test("con paradas, la corrección de hora deja cada foto quieta y en su lugar", () => {
  const { epochs, stops } = stopAndShoot(6);
  const pos = parsePos(posText(epochs));
  // El reloj del teléfono va 2,3 s adelantado: las fotos caen cuando el dron ya arrancó.
  const log = parsePhotoLog(photoLog(stops, 2300));
  const wrong = geotag(log.photos, pos);
  assert.ok(summarize(wrong.rows).medianSpeed > 1);

  const suggestion = suggestOffset(log.photos, pos.epochs);
  assert.ok(suggestion, "sugiere una corrección");
  // El dron está quieto de -1,2 a +1,8 s alrededor de la foto: el centro es -2,3 + 0,3 = -2,0 s.
  assert.ok(Math.abs(suggestion.offsetMs - -2000) <= 150, `corrección ${suggestion.offsetMs}`);
  assert.ok(suggestion.speed < 0.05);

  const result = geotag(log.photos, pos, { offsetMs: suggestion.offsetMs, antennaCm: 6 });
  result.rows.forEach((r, i) => {
    assert.equal(r.problem, null);
    assert.ok(distance([r.lat, r.lon], at(stops[i].east, 0)) < 0.01, `foto ${r.n}`);
    assert.ok(Math.abs(r.h - 59.94) < 1e-6);
    assert.equal(r.q, 1);
  });
  const stats = summarize(result.rows);
  assert.equal(stats.placed, 6);
  assert.equal(stats.fixed, 6);
  // El GPS del dron estaba a 1,8 m.
  assert.ok(Math.abs(stats.droneDistance - Math.hypot(1.5, 1)) < 0.05);
});

test("sin paradas no hay corrección que sugerir", () => {
  const epochs = [];
  for (let i = 0; i <= 300; i++) epochs.push({ t: START + i * 200, lat: at(i, 0)[0], lon: at(i, 0)[1], h: 60, q: 1, ns: 12, sdh: 0.01, sdv: 0.02 });
  const photos = [10, 20, 30, 40].map((s) => ({ time: START + s * 1000 }));
  assert.equal(suggestOffset(photos, epochs), null);
});

test("las marcas del sensor de luz se juntan con las fotos, sin la de más", () => {
  // Cada marca llega 0,35 s antes que el aviso a la app; hay una de más al cambiar la batería.
  const photos = [10, 15, 20, 25, 30].map((s, i) => ({ n: i + 1, time: START + s * 1000 + (i % 2 ? 40 : -30), position: null }));
  const events = [
    START + 2000,
    ...[10, 15, 20, 25, 30].map((s) => START + s * 1000 - 350),
  ].map((t, i) => ({ t, lat: 18 + i * 1e-5, lon: -65, h: 50, q: 1, ns: 12, sdh: 0.01, sdv: 0.02 }));
  const m = matchEvents(photos, events);
  assert.ok(Math.abs(m.latencyMs - -350) <= 40);
  assert.deepEqual(m.matches, [1, 2, 3, 4, 5]);
  assert.equal(m.unused, 1);
  // Una foto sin marca (el sensor no la vio) queda sola.
  const missing = matchEvents(photos, events.filter((_, i) => i !== 3));
  assert.deepEqual(missing.matches, [1, 2, null, 3, 4]);

  const result = geotag(photos, { epochs: events }, { events: true });
  assert.equal(result.latencyMs, m.latencyMs);
  assert.equal(result.rows[0].lat, events[1].lat);
  assert.ok(Math.abs(result.rows[0].eventDelta - -320) < 1);
});

/** Un JPG mínimo con su EXIF: IFD0 con el puntero al Exif IFD, y ahí DateTimeOriginal. */
function tinyJpeg(dateTime, little = true) {
  const text = new TextEncoder().encode(dateTime + "\0");
  const tiff = new DataView(new ArrayBuffer(8 + 2 + 12 + 4 + 2 + 12 + 4 + text.length));
  const u16 = (o, v) => tiff.setUint16(o, v, little);
  const u32 = (o, v) => tiff.setUint32(o, v, little);
  u16(0, little ? 0x4949 : 0x4d4d);
  u16(2, 42);
  u32(4, 8);
  u16(8, 1); // IFD0: una etiqueta
  u16(10, 0x8769);
  u16(12, 4);
  u32(14, 1);
  u32(18, 26);
  u32(22, 0);
  u16(26, 1); // Exif IFD: DateTimeOriginal
  u16(28, 0x9003);
  u16(30, 2);
  u32(32, text.length);
  u32(36, 44);
  u32(40, 0);
  new Uint8Array(tiff.buffer).set(text, 44);
  const app1 = new Uint8Array(4 + 6 + tiff.byteLength);
  const head = new DataView(app1.buffer);
  head.setUint16(0, 0xffe1);
  head.setUint16(2, 2 + 6 + tiff.byteLength);
  app1.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4);
  app1.set(new Uint8Array(tiff.buffer), 10);
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const jpeg = new Uint8Array([0xff, 0xd8, ...app0, ...app1, 0xff, 0xda, 0, 2]);
  return jpeg.buffer;
}

test("la hora del EXIF de un JPG", () => {
  assert.equal(readExifTime(tinyJpeg("2026:10:28 10:00:05")), "2026:10:28 10:00:05");
  assert.equal(readExifTime(tinyJpeg("2026:10:28 10:00:05", false)), "2026:10:28 10:00:05");
  assert.equal(readExifTime(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0, 0, 0, 0, 0]).buffer), null);
  assert.equal(readExifTime(new ArrayBuffer(4)), null);
  assert.equal(cameraSeconds("2026:10:28 10:00:05"), Date.UTC(2026, 9, 28, 10, 0, 5) / 1000);
  assert.equal(cameraSeconds("0000:00:00 00:00:00"), null);
});

test("cada línea del registro con su foto de la tarjeta", () => {
  assert.equal(fileNumber("DJI_20261028100005_0007_D.JPG"), 7);
  assert.equal(fileNumber("IMG_1.jpg"), null);
  assert.deepEqual(pickImages(["b.DNG", "DJI_2.JPG", "DJI_1.JPG", "a.DNG"]), ["DJI_1.JPG", "DJI_2.JPG"]);
  assert.deepEqual(pickImages(["b.DNG", "a.dng"]), ["a.dng", "b.DNG"]);

  const sec = (s) => Date.UTC(2026, 9, 28, 10, 0, s) / 1000;
  const photos = [
    { index: 7, cameraSec: sec(5) },
    { index: 8, cameraSec: sec(6) }, // dos fotos en el mismo segundo: decide el número
    { index: 9, cameraSec: sec(6) },
    { index: null, cameraSec: null }, // sin hora: por orden con la que sobra
  ];
  const files = [
    { name: "DJI_20261028100005_0007_D.JPG", cameraSec: sec(5) },
    { name: "DJI_20261028100006_0008_D.JPG", cameraSec: sec(6) },
    { name: "DJI_20261028100006_0009_D.JPG", cameraSec: sec(6) },
    { name: "DJI_20261028100030_0010_D.JPG", cameraSec: sec(30) },
  ];
  assert.deepEqual(matchFiles(photos, files), [0, 1, 2, 3]);
  // Una foto que se borró de la tarjeta deja su línea sin nombre.
  assert.deepEqual(matchFiles(photos.slice(0, 3), [files[0], files[2]]), [0, null, 1]);
});

test("el CSV para Pix4D y Metashape, y el geo.txt de WebODM", () => {
  const rows = [
    { name: "DJI_0001.JPG", lat: 18.123456789, lon: -65.123456789, h: 59.9412, sdh: 0.0078, sdv: 0.012 },
    { name: "DJI_0002.JPG", problem: "Fuera del .pos o en un hueco" },
  ];
  assert.equal(
    toCsv(rows),
    "imagename,latitude,longitude,altitude,accuracy_horizontal,accuracy_vertical\nDJI_0001.JPG,18.123456789,-65.123456789,59.941,0.008,0.012\n",
  );
  assert.equal(toOdm(rows), "EPSG:4326\nDJI_0001.JPG -65.123456789 18.123456789 59.941\n");
});

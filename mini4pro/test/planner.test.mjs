// Las mismas pruebas que PlannerTest.kt de la app, para que web y teléfono calculen igual.
// Correr con: node --test mini4pro/test/planner.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { Geo, MapPlanner, MINI_4_PRO, MINI_4_PRO_12MP, OrbitPlanner, newMapMission, newOrbitMission, normalizeMission, parseKml, projection } from "../planner.js";

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ""} esperado ${expected} ± ${tolerance}, salió ${actual}`);

const origin = [18.18, -65.82];
const pr = projection(origin);
const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
].map(pr.toGeo);
const map = (fields) => ({ ...newMapMission(), boundary: square, ...fields });

test("GSD igual a Dronelink a 10 m", () => near(MapPlanner.gsd(MINI_4_PRO, 10), 0.18, 0.005));

test("el cuadrado mide una hectárea", () => near(Geo.area(square) / 10000, 1, 0.01));

test("cuadrícula norte-sur cubre el cuadrado", () => {
  const plan = MapPlanner.plan(map({ altitude: 30, direction: 0 }));
  near(plan.lineSpacing, 12.9, 0.1);
  assert.equal(plan.legs.length, 8);
  for (const leg of plan.legs) {
    const a = pr.toLocal(leg.start);
    const b = pr.toLocal(leg.end);
    near(a.x, b.x, 0.01, "líneas norte-sur");
    near(Math.abs(b.y - a.y), 100, 0.5);
  }
  const first = pr.toLocal(plan.legs[0].start);
  const second = pr.toLocal(plan.legs[1].start);
  assert.ok(first.y < 1 && second.y > 99);
});

test("la cuadrícula gira con la dirección", () => {
  const plan = MapPlanner.plan(map({ altitude: 30, direction: 90 }));
  for (const leg of plan.legs) near(pr.toLocal(leg.start).y, pr.toLocal(leg.end).y, 0.01, "líneas este-oeste");
});

test("la velocidad la limita el tiempo entre fotos", () => {
  const plan = MapPlanner.plan(map({ altitude: 10, frontOverlap: 75, minPhotoInterval: 5, maxSpeed: 8.94 }));
  near(plan.photoSpacing, 2.69, 0.02);
  near(plan.speed, 0.54, 0.01);
});

test("el patrón cruzado agrega una pasada perpendicular que empieza cerca", () => {
  const normal = MapPlanner.plan(map({ altitude: 30, direction: 0 }));
  const plan = MapPlanner.plan(map({ altitude: 30, direction: 0, pattern: "grid" }));
  assert.equal(plan.legs.length, 16);
  for (const leg of plan.legs.slice(normal.legs.length)) {
    near(pr.toLocal(leg.start).y, pr.toLocal(leg.end).y, 0.01, "segunda pasada este-oeste");
  }
  const jump = Geo.distance(normal.legs.at(-1).end, plan.legs[normal.legs.length].start);
  assert.ok(jump < 15, `salto entre pasadas ${jump}`);
});

test("en 12 MP el GSD es el doble", () => near(MapPlanner.gsd(MINI_4_PRO_12MP, 10), 0.36, 0.005));

test("con el dron de lado, el lado corto de la foto queda entre líneas", () => {
  const forward = MapPlanner.plan(map({ altitude: 30 }));
  const left = MapPlanner.plan(map({ altitude: 30, heading: "left" }));
  near(forward.lineSpacing, 12.92, 0.05);
  near(left.lineSpacing, 9.7, 0.05);
  near(left.photoSpacing, 10.77, 0.05, "y el lado largo a lo largo de la línea");
});

test("espaciado por distancia usa los metros indicados", () => {
  const plan = MapPlanner.plan(map({ spacing: "distance", sideDistance: 20, frontDistance: 15 }));
  near(plan.lineSpacing, 20, 0.001);
  near(plan.photoSpacing, 15, 0.001);
  assert.equal(plan.legs.length, 5);
});

test("el inicio elige la esquina más cercana", () => {
  const northEast = pr.toGeo({ x: 100, y: 100 });
  const plan = MapPlanner.plan(map({ altitude: 30, start: northEast }));
  assert.ok(Geo.distance(plan.path[0], northEast) < 15, `empieza a ${Geo.distance(plan.path[0], northEast)} m`);
});

test("en video no hay fotos y vuela a la velocidad máxima", () => {
  const plan = MapPlanner.plan(map({ altitude: 10, captureMode: "video", maxSpeed: 8 }));
  assert.equal(plan.photoCount, 0);
  near(plan.speed, 8, 0.001);
});

test("prioridad por tiempo alarga cada línea para tomar velocidad", () => {
  const distance = MapPlanner.plan(map({ altitude: 30 }));
  const time = MapPlanner.plan(map({ altitude: 30, capturePriority: "time" }));
  const runUp = Math.max(3, time.speed * 2);
  near(Geo.distance(time.legs[0].start, time.legs[0].end), Geo.distance(distance.legs[0].start, distance.legs[0].end) + 2 * runUp, 0.05);
});

test("AEB 3 guarda tres fotos por punto y frenar alarga el vuelo", () => {
  const single = MapPlanner.plan(map({ altitude: 30 }));
  const aeb = MapPlanner.plan(map({ altitude: 30, photoType: "aeb3" }));
  assert.equal(aeb.photoCount, single.photoCount * 3);
  const stopping = MapPlanner.plan(map({ altitude: 30, captureSpeed: 0 }));
  assert.ok(stopping.durationSeconds > single.durationSeconds + single.positions);
});

test("la órbita empieza en el rumbo indicado", () => {
  const plan = OrbitPlanner.plan({ ...newOrbitMission(), center: origin, radius: 30, startBearing: 90 });
  const start = pr.toLocal(plan.start);
  near(start.x, 30, 0.01);
  near(start.y, 0, 0.01);
});

test("con punto de interés el gimbal apunta a él", () => {
  near(OrbitPlanner.gimbalPitch({ ...newOrbitMission(), altitude: 30, radius: 30, poiAltitude: 0 }), -45, 0.01);
  near(OrbitPlanner.gimbalPitch({ ...newOrbitMission(), gimbalPitch: -10 }), -10, 0.01);
});

test("órbitas del formato anterior: photoInterval null es sin fotos", () => {
  const old = { version: 1, id: "a", type: "orbit", name: "x", center: origin, photoInterval: null };
  assert.equal(normalizeMission(old).captureMode, "none");
  const withPhotos = normalizeMission({ ...old, photoInterval: 2 });
  assert.equal(withPhotos.captureMode, "photo");
  assert.equal(withPhotos.photoInterval, 2);
  assert.equal(normalizeMission({ ...old, heading: "raro" }).heading, "center");
});

test("la órbita empieza al sur y cierra el círculo", () => {
  const plan = OrbitPlanner.plan({ ...newOrbitMission(), center: origin, radius: 30 });
  const start = pr.toLocal(plan.start);
  near(start.x, 0, 0.01);
  near(start.y, -30, 0.01);
  near(plan.lengthMeters, 2 * Math.PI * 30, 1);
  const end = pr.toLocal(plan.path.at(-1));
  near(end.x, start.x, 0.01);
  near(end.y, start.y, 0.01);
});

test("en sentido horario va primero al oeste", () => {
  const plan = OrbitPlanner.plan({ ...newOrbitMission(), center: origin, radius: 30, clockwise: true });
  assert.ok(pr.toLocal(plan.path[1]).x < 0);
});

test("rumbos", () => {
  near(Geo.bearing(origin, pr.toGeo({ x: 0, y: 100 })), 0, 0.01);
  near(Geo.bearing(origin, pr.toGeo({ x: 100, y: 0 })), 90, 0.01);
});

test("un punto afuera de un lado se inserta en ese lado", () => {
  const east = pr.toGeo({ x: 130, y: 50 });
  const result = Geo.insertIntoPolygon(square, east);
  assert.equal(result.length, 5);
  assert.deepEqual(result[2], east);
  assert.deepEqual(result[1], square[1]);
  assert.deepEqual(result[3], square[2]);
});

test("dirección del lado más largo", () => {
  const wide = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 50 }, { x: 0, y: 50 }].map(pr.toGeo);
  near(MapPlanner.longestEdgeDirection(wide), 90, 0.5);
  const tall = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 200 }, { x: 0, y: 200 }].map(pr.toGeo);
  near(MapPlanner.longestEdgeDirection(tall), 0, 0.5);
});

test("KML: lee el polígono y quita el punto repetido", () => {
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Finca</name>
<Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
  -65.8250,18.1810,0 -65.8240,18.1810,0 -65.8240,18.1820,0 -65.8250,18.1820,0 -65.8250,18.1810,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
  const result = parseKml(kml);
  assert.equal(result.name, "Finca");
  assert.equal(result.points.length, 4);
  assert.deepEqual(result.points[0], [18.181, -65.825]);
});

test("KML sin área no sirve", () => {
  assert.equal(parseKml("<kml><Placemark><Point><coordinates>-65.8,18.1</coordinates></Point></Placemark></kml>"), null);
});

// Las mismas pruebas que PlannerTest.kt de la app, para que web y teléfono calculen igual.
// Correr con: node --test mini4pro/test/planner.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CorridorPlanner,
  FacadePlanner,
  Geo,
  MapPlanner,
  MINI_4_PRO,
  MINI_4_PRO_12MP,
  OrbitPlanner,
  PanoPlan,
  PlanPlanner,
  PointsPlanner,
  componentName,
  componentPoints,
  copyComponent,
  endAltitude,
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
  ZonePlanner,
  commandsCaptureMode,
  componentSummary,
  importKml,
  FlightPreview,
  exportKml,
  planPoints,
  projection,
  serializePlan,
  startAltitude,
  takeoffOf,
  waypointHeading,
  TerrainFollow,
  TerrainMissingError,
  TerrariumTiles,
  tileTerrain,
} from "../planner.js";

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
const map = (fields) => ({ ...newMapComponent(), boundary: square, ...fields });

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

test("el patrón oblicuo agrega cuatro pasadas inclinadas, corridas hacia atrás", () => {
  const nadir = MapPlanner.plan(map({ altitude: 30 }));
  const plan = MapPlanner.plan(map({ altitude: 30, pattern: "oblique", obliquePitch: -45 }));
  // Primero la pasada vertical, igual que el patrón normal.
  assert.deepEqual(plan.legs.slice(0, nadir.legs.length), nadir.legs);
  const tilted = plan.legs.slice(nadir.legs.length);
  assert.deepEqual([...new Set(tilted.map((leg) => leg.heading))], [0, 90, 180, 270]);
  assert.ok(tilted.every((leg) => leg.gimbalPitch === -45));
  // Mirando al norte, el dron vuela 30 m al sur del área (a 30 m de altura y 45°).
  const north = tilted.filter((leg) => leg.heading === 0).flatMap((leg) => [pr.toLocal(leg.start), pr.toLocal(leg.end)]);
  near(Math.min(...north.map((p) => p.y)), -30, 0.5);
  near(Math.max(...north.map((p) => p.y)), 70, 0.5);
  // Mirando al este, 30 m al oeste.
  const east = tilted.filter((leg) => leg.heading === 90).flatMap((leg) => [pr.toLocal(leg.start), pr.toLocal(leg.end)]);
  assert.ok(Math.min(...east.map((p) => p.x)) < -20);
  assert.ok(Math.max(...east.map((p) => p.x)) < 80);
  // De lejos la huella es más ancha: menos líneas que la vertical, y las fotos igual de seguidas.
  assert.ok(tilted.filter((leg) => leg.heading === 0).length < nadir.legs.length);
  near(plan.photoSpacing, nadir.photoSpacing, 1e-9);
  assert.ok(plan.durationSeconds > nadir.durationSeconds * 3);
  // Lo mismo que calcula el teléfono.
  assert.equal(plan.legs.length, 36);
  assert.equal(plan.positions, 468);
  near(plan.lengthMeters, 4216.2, 0.5);
});

test("la inclinación oblicua queda entre -20° y -80°", () => {
  assert.equal(MapPlanner.obliquePitch(map({ obliquePitch: -5 })), -20);
  assert.equal(MapPlanner.obliquePitch(map({ obliquePitch: -90 })), -80);
  near(MapPlanner.obliqueShift(30, -45), 30, 1e-9);
  near(MapPlanner.obliqueShift(10, -60), 10 / Math.tan(Math.PI / 3), 1e-9);
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
  const plan = OrbitPlanner.plan({ ...newOrbitComponent(), center: origin, radius: 30, startBearing: 90 });
  const start = pr.toLocal(plan.start);
  near(start.x, 30, 0.01);
  near(start.y, 0, 0.01);
});

test("con punto de interés el gimbal apunta a él", () => {
  near(OrbitPlanner.gimbalPitch({ ...newOrbitComponent(), altitude: 30, radius: 30, poiAltitude: 0 }), -45, 0.01);
  near(OrbitPlanner.gimbalPitch({ ...newOrbitComponent(), gimbalPitch: -10 }), -10, 0.01);
});

test("órbitas del formato anterior: photoInterval null es sin fotos", () => {
  const old = { version: 1, id: "a", type: "orbit", name: "x", center: origin, photoInterval: null };
  const orbit = (json) => normalizePlan(json).components[0];
  assert.equal(orbit(old).captureMode, "none");
  const withPhotos = orbit({ ...old, photoInterval: 2 });
  assert.equal(withPhotos.captureMode, "photo");
  assert.equal(withPhotos.photoInterval, 2);
  assert.equal(orbit({ ...old, heading: "raro" }).heading, "center");
});

test("una misión v1 se vuelve un plan de un componente", () => {
  const old = { version: 1, id: "m1", type: "map", name: "Finca", updatedAt: 5, finishAction: "LAND", boundary: square, altitude: 40 };
  const plan = normalizePlan(old);
  assert.equal(plan.version, 2);
  assert.equal(plan.id, "m1");
  assert.equal(plan.name, "Finca");
  assert.equal(plan.updatedAt, 5);
  assert.equal(plan.finishAction, "LAND");
  assert.equal(plan.takeoff, null);
  assert.equal(plan.components.length, 1);
  const [map] = plan.components;
  assert.equal(map.id, "c1");
  assert.equal(map.type, "map");
  assert.equal(map.altitude, 40);
  assert.equal(map.enabled, true);
  assert.equal("finishAction" in map, false);
  // Una órbita v1 sin startBearing seguía empezando al sur.
  const orbit = normalizePlan({ version: 1, id: "o", type: "orbit", name: "o", center: origin }).components[0];
  assert.equal(orbit.startBearing, 180);
  assert.equal(normalizePlan({ version: 1, id: "o", type: "orbit", name: "o" }).finishAction, "HOVER");
});

test("un plan v2 se lee igual que se guarda y sin campos vacíos", () => {
  const plan = newPlan("Humacao", [{ ...newMapComponent(square), altitude: 10 }, newOrbitComponent(origin)]);
  const text = serializePlan(plan);
  assert.equal(text.includes("null"), false);
  assert.deepEqual(normalizePlan(JSON.parse(text)), plan);
});

test("los componentes se encadenan: la órbita empieza donde está más cerca del fin del mapa", () => {
  const center = pr.toGeo({ x: 50, y: 250 });
  const plan = newPlan("p", [{ ...newMapComponent(square), altitude: 30 }, { ...newOrbitComponent(center), radius: 40 }]);
  const result = PlanPlanner.plan(plan);
  const [map, orbit] = result.items;
  const mapEnd = map.result.path.at(-1);
  near(orbit.result.startBearing, Geo.bearing(center, mapEnd), 0.01);
  near(Geo.distance(orbit.result.start, mapEnd), Geo.distance(center, mapEnd) - 40, 0.5);
  // Despegue → mapa, mapa → órbita y regreso a casa.
  assert.deepEqual(result.transits.map((t) => t.kind), ["takeoff", "between", "home"]);
  assert.deepEqual(result.transits[1].from, mapEnd);
  assert.deepEqual(result.transits[1].to, orbit.result.start);
  const parts = map.result.durationSeconds + orbit.result.durationSeconds + result.transits.reduce((s, t) => s + t.durationSeconds, 0);
  near(result.durationSeconds, parts, 0.001);
});

test("el despegue automático va al sur del primer componente y el mapa empieza en la esquina más cercana", () => {
  const plan = newPlan("p", [{ ...newMapComponent(square), altitude: 30 }]);
  const auto = pr.toLocal(takeoffOf(plan));
  near(auto.x, 50, 0.01);
  near(auto.y, -20, 0.01);
  const start = pr.toLocal(PlanPlanner.plan(plan).items[0].result.path[0]);
  assert.ok(start.y < 1, `empieza en el lado sur (y = ${start.y})`);
  const orbitPlan = newPlan("o", [{ ...newOrbitComponent(origin), radius: 30 }]);
  near(pr.toLocal(takeoffOf(orbitPlan)).y, -50, 0.01);
  near(PlanPlanner.plan(orbitPlan).items[0].result.startBearing, 180, 0.01);
  plan.takeoff = pr.toGeo({ x: 120, y: 120 });
  const ne = PlanPlanner.plan(plan).items[0].result.path[0];
  assert.ok(Geo.distance(ne, pr.toGeo({ x: 100, y: 100 })) < 15, `empieza a ${Geo.distance(ne, pr.toGeo({ x: 100, y: 100 }))} m de la esquina`);
});

test("un componente apagado no se vuela", () => {
  const plan = newPlan("p", [{ ...newMapComponent(square), enabled: false }, newOrbitComponent(pr.toGeo({ x: 300, y: 0 }))]);
  const result = PlanPlanner.plan(plan);
  assert.equal(result.flown, 1);
  near(result.durationSeconds - result.transits.reduce((s, t) => s + t.durationSeconds, 0), result.items[1].result.durationSeconds, 0.001);
  assert.equal(result.photoCount, result.items[1].result.photoCount);
});

test("mover un área desde el centro no la deforma", () => {
  const moved = Geo.translate(square, Geo.centroid(square), pr.toGeo({ x: 500, y: 800 }));
  near(Geo.area(moved), Geo.area(square), 1);
  near(Geo.distance(Geo.centroid(moved), pr.toGeo({ x: 500, y: 800 })), 0, 0.5);
});

test("la órbita empieza al sur y cierra el círculo", () => {
  const plan = OrbitPlanner.plan({ ...newOrbitComponent(), center: origin, radius: 30 });
  const start = pr.toLocal(plan.start);
  near(start.x, 0, 0.01);
  near(start.y, -30, 0.01);
  near(plan.lengthMeters, 2 * Math.PI * 30, 1);
  const end = pr.toLocal(plan.path.at(-1));
  near(end.x, start.x, 0.01);
  near(end.y, start.y, 0.01);
});

test("en sentido horario va primero al oeste", () => {
  const plan = OrbitPlanner.plan({ ...newOrbitComponent(), center: origin, radius: 30, clockwise: true });
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
  const result = importKml(kml);
  assert.equal(result.name, "Finca");
  assert.equal(result.plan, null);
  assert.equal(result.components.length, 1);
  const [area] = result.components;
  assert.equal(area.type, "map");
  assert.equal(area.boundary.length, 4);
  assert.deepEqual(area.boundary[0], [18.181, -65.825]);
});

/** Lo mismo que KmlImportTest.kt: áreas, líneas y puntos de Google Earth. */
export const GOOGLE_EARTH_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Río &amp; finca</name>
<Folder><name>Cosas</name>
<Placemark><name>Finca</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-65.8250,18.1810,0 -65.8240,18.1810,0 -65.8240,18.1825,0 -65.8250,18.1825,0 -65.8250,18.1810,0</coordinates></LinearRing></outerBoundaryIs>
<innerBoundaryIs><LinearRing><coordinates>-65.8248,18.1812 -65.8246,18.1812 -65.8246,18.1814 -65.8248,18.1812</coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark>
<Placemark><name><![CDATA[Quebrada <norte>]]></name><LineString><tessellate>1</tessellate><coordinates>-65.8300,18.1900 -65.8290,18.1910 -65.8280,18.1915</coordinates></LineString></Placemark>
<Placemark><name>A</name><Point><altitudeMode>relativeToGround</altitudeMode><coordinates>-65.8200,18.1800,45</coordinates></Point></Placemark>
<Placemark><name>B</name><Point><altitudeMode>relativeToGround</altitudeMode><coordinates>-65.8190,18.1805,60</coordinates></Point></Placemark>
</Folder></Document></kml>`;

test("KML: cada polígono un mapa, cada línea un corredor y los puntos un recorrido", () => {
  const { name, components } = importKml(GOOGLE_EARTH_KML);
  assert.equal(name, "Río & finca");
  assert.deepEqual(components.map((c) => c.type), ["map", "corridor", "waypoints"]);
  const [area, river, route] = components;
  assert.equal(area.name, "Finca");
  // Solo el borde de afuera.
  assert.equal(area.boundary.length, 4);
  assert.equal(area.direction, 0);
  assert.equal(river.name, "Quebrada <norte>");
  assert.deepEqual(river.path, [[18.19, -65.83], [18.191, -65.829], [18.1915, -65.828]]);
  // Alturas sobre el suelo: siguen el terreno.
  assert.deepEqual(route.points.map((p) => p.altitude), [45, 60]);
  assert.equal(route.terrainFollow, true);
  // Un solo punto es el centro de una órbita.
  const single = importKml("<kml><Placemark><name>Faro</name><Point><coordinates>-65.8,18.1</coordinates></Point></Placemark></kml>");
  assert.equal(single.components[0].type, "orbit");
  assert.deepEqual(single.components[0].center, [18.1, -65.8]);
  assert.equal(single.components[0].name, "Faro");
  assert.deepEqual(importKml("<kml><Document><name>Nada</name></Document></kml>").components, []);
});

/** Un template.kml de una misión de waypoints de DJI (WPML), como lo guarda DJI Fly. */
export const DJI_WPML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2"><Document>
<wpml:missionConfig><wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode><wpml:globalTransitionalSpeed>6</wpml:globalTransitionalSpeed></wpml:missionConfig>
<Folder><wpml:templateType>waypoint</wpml:templateType>
<wpml:waylineCoordinateSysParam><wpml:coordinateMode>WGS84</wpml:coordinateMode><wpml:heightMode>relativeToStartPoint</wpml:heightMode></wpml:waylineCoordinateSysParam>
<wpml:autoFlightSpeed>4.5</wpml:autoFlightSpeed><wpml:globalHeight>50</wpml:globalHeight>
<Placemark><Point><coordinates>-65.8200,18.1800</coordinates></Point><wpml:index>1</wpml:index><wpml:useGlobalHeight>0</wpml:useGlobalHeight><wpml:height>70</wpml:height></Placemark>
<Placemark><Point><coordinates>-65.8210,18.1790</coordinates></Point><wpml:index>0</wpml:index><wpml:useGlobalHeight>1</wpml:useGlobalHeight><wpml:height>35</wpml:height></Placemark>
<Placemark><Point><coordinates>-65.8190,18.1810</coordinates></Point><wpml:index>2</wpml:index><wpml:useGlobalHeight>0</wpml:useGlobalHeight><wpml:ellipsoidHeight>80</wpml:ellipsoidHeight><wpml:height>40</wpml:height></Placemark>
</Folder></Document></kml>`;

test("KML: waypoints de DJI con su orden, su altura y su velocidad", () => {
  const { components } = importKml(DJI_WPML);
  assert.equal(components.length, 1);
  const [route] = components;
  assert.equal(route.type, "waypoints");
  assert.deepEqual(route.points.map((p) => p.position), [[18.179, -65.821], [18.18, -65.82], [18.181, -65.819]]);
  assert.deepEqual(route.points.map((p) => p.altitude), [50, 70, 40]);
  assert.equal(route.speed, 4.5);
  assert.equal(route.terrainFollow, false);
  assert.equal(importKml(DJI_WPML.replace("relativeToStartPoint", "aboveGroundLevel")).components[0].terrainFollow, true);
});

test("KML: lo que exporta esta app se vuelve a importar igual", () => {
  const plan = newPlan("Río & <finca> ]]>", [
    map({ name: "Finca" }),
    { ...newCorridorComponent([origin, geo(0, 200), geo(100, 260)]), terrainFollow: true },
    newOrbitComponent(geo(300, 300)),
    newWaypointsComponent([newWaypoint(geo(-50, 0), 30), newWaypoint(geo(-80, 40), 45)]),
    newPhotoComponent(geo(0, -80)),
  ]);
  const kml = exportKml(plan);
  const back = importKml(kml);
  assert.equal(back.name, plan.name);
  assert.deepEqual(back.plan, normalizePlan(JSON.parse(serializePlan(plan))));
  // Para Google Earth: la ruta de cada componente, sus tránsitos, las áreas y los puntos.
  assert.equal((kml.match(/<styleUrl>#route<\/styleUrl>/g) ?? []).length, 5);
  assert.equal((kml.match(/<styleUrl>#transit<\/styleUrl>/g) ?? []).length, 6);
  assert.equal((kml.match(/<Polygon>/g) ?? []).length, 2);
  assert.ok(kml.includes("<altitudeMode>relativeToGround</altitudeMode>"));
  assert.ok(kml.includes("<name>Despegue</name>"));
  // Con el suelo, las alturas van sobre el nivel del mar: el corredor sigue la loma.
  const withGround = exportKml(plan, TerrainFollow.reference(hill, hill.elevation(origin)));
  assert.ok(withGround.includes("<altitudeMode>absolute</altitudeMode>"));
  const river = withGround.match(/<name>Corredor 2<\/name>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/)[1].trim().split(" ");
  assert.ok(river.length > 40);
  const heights = river.map((c) => Number(c.split(",")[2]));
  // 30 m sobre un suelo que va de unos 101 m (lejos de la loma) a 140 m (en la cima).
  assert.ok(Math.min(...heights) > 130 && Math.min(...heights) < 134, `${Math.min(...heights)}`);
  assert.ok(Math.max(...heights) > 165 && Math.max(...heights) < 171, `${Math.max(...heights)}`);
});

test("un duplicado va al lado del original, no encima", () => {
  // El cuadrado mide 100 m de ancho: la copia queda 110 m al este, sin tocarlo.
  const map = { ...newMapComponent(square), start: square[2] };
  const copy = copyComponent(map);
  assert.notEqual(copy.id, map.id);
  assert.ok(Math.abs(Geo.area(copy.boundary) - Geo.area(square)) < 1);
  const shift = pr.toLocal(Geo.centroid(copy.boundary)).x - pr.toLocal(Geo.centroid(square)).x;
  assert.ok(Math.abs(shift - 110) < 0.5, `movido ${shift} m`);
  assert.ok(Math.abs(Geo.distance(square[2], copy.start) - 110) < 0.5);
  assert.deepEqual(map.boundary, square);

  const orbit = { ...newOrbitComponent(origin), radius: 30 };
  assert.ok(Math.abs(Geo.distance(origin, copyComponent(orbit).center) - 70) < 0.5);
  assert.equal(copyComponent(newOrbitComponent()).center, null);
});

test("encuadrar el plan incluye la H automática", () => {
  const plan = newPlan("Plan", [newMapComponent(square)]);
  const points = planPoints(plan);
  assert.equal(points.length, square.length + 1);
  assert.deepEqual(points.at(-1), takeoffOf(plan));
  assert.deepEqual(componentPoints(plan.components[0]), square);
});

// ---- Waypoints, foto y panorámica (PointComponentsTest.kt) ----

/** Una misión con los tres tipos nuevos y uno de una versión futura, la misma que se probó en Kotlin. */
const pointsFixture = {
  version: 2,
  id: "p1",
  name: "Paridad",
  finishAction: "GO_HOME",
  transitSpeed: 8,
  takeoff: [18.1795, -65.8205],
  components: [
    {
      id: "a",
      type: "waypoints",
      altitude: 30,
      speed: 4,
      gimbalPitch: -20,
      captureMode: "photo",
      photoInterval: 4,
      photoSize: "12mp",
      points: [
        { position: [18.18, -65.82], altitude: 15, action: "none", hoverSeconds: 3 },
        { position: [18.1804, -65.8196], altitude: 25, heading: 90, gimbalPitch: -45, action: "photo", hoverSeconds: 3 },
        { position: [18.1801, -65.8191], altitude: 10, action: "hover", hoverSeconds: 6 },
      ],
    },
    { id: "b", type: "photo", altitude: 20, position: [18.1808, -65.8188], heading: 180, gimbalPitch: -60, photoType: "aeb3" },
    { id: "c", type: "pano", altitude: 45, position: [18.1812, -65.8193], panoType: "wide", heading: 30, gimbalPitch: -20 },
    { id: "d", type: "tower", name: "Futuro", altitude: 35, width: 40 },
  ],
};

test("waypoints, foto y panorámica dan el mismo tiempo y las mismas fotos que en el teléfono", () => {
  const plan = normalizePlan(structuredClone(pointsFixture));
  const result = PlanPlanner.plan(plan);
  // Los números que da PlanPlanner.kt con esta misma misión.
  near(result.durationSeconds, 186.63, 0.01);
  near(result.lengthMeters, 581.2151, 0.01);
  assert.equal(result.photoCount, 23);
  assert.equal(result.flown, 3);
  const [waypoints, photo, pano, future] = result.items;
  near(waypoints.result.durationSeconds, 51.2896, 0.001);
  assert.equal(waypoints.result.photoCount, 11);
  near(waypoints.approach.durationSeconds, 14.5862, 0.001);
  assert.equal(photo.result.photoCount, 3);
  near(pano.result.durationSeconds, 40.5, 0.001);
  assert.equal(future.result, null);
});

test("waypoints: empieza a la altura del primer punto y termina a la del último", () => {
  const plan = normalizePlan(structuredClone(pointsFixture));
  const waypoints = plan.components[0];
  assert.equal(startAltitude(waypoints), 15);
  assert.equal(endAltitude(waypoints), 10);
  // Sin rumbo propio mira hacia donde llega volando; el primero, hacia el segundo.
  near(waypointHeading(waypoints, 0), 43.534, 0.01);
  assert.equal(waypointHeading(waypoints, 1), 90);
  near(waypointHeading(waypoints, 2), 122.273, 0.01);
  assert.equal(waypointHeading(waypoints, 0, 200), 200);
});

test("panorámicas: las mismas fotos que en Panorama.kt", () => {
  assert.equal(PanoPlan.shots("sphere", 30, -10).length, 23);
  assert.equal(PanoPlan.shots("180", 0, 0).length, 15);
  const wide = PanoPlan.shots("wide", 90, -30);
  assert.deepEqual([...new Set(wide.map((s) => s.pitch))], [-5, -30, -55]);
  assert.deepEqual([...new Set(wide.map((s) => s.heading))].sort((a, b) => a - b), [50, 90, 130]);
  assert.deepEqual(PanoPlan.shots("vertical", 90, 0).map((s) => s.pitch), [0, -35, -70]);
  // Las filas van y vienen: nunca da la vuelta entera entre dos fotos.
  for (const type of ["sphere", "180", "wide", "vertical"]) {
    const shots = PanoPlan.shots(type, 0, -20);
    for (let i = 1; i < shots.length; i++) {
      const turn = Math.abs(((shots[i].heading - shots[i - 1].heading + 540) % 360) - 180);
      assert.ok(turn <= 90, `${type} gira ${turn}°`);
    }
  }
});

test("los componentes nuevos se guardan y se leen igual, sin campos vacíos", () => {
  const waypoints = newWaypointsComponent([newWaypoint(origin, 20), { ...newWaypoint(pr.toGeo({ x: 30, y: 0 }), 25), heading: 90, action: "photo" }]);
  const plan = newPlan("Puntos", [waypoints, newPhotoComponent(pr.toGeo({ x: 5, y: 5 })), { ...newPanoComponent(origin), panoType: "vertical" }]);
  const text = serializePlan(plan);
  assert.ok(!text.includes("null"));
  assert.deepEqual(normalizePlan(JSON.parse(text)), plan);
});

test("un componente de una versión más nueva se guarda tal cual y no se vuela", () => {
  const plan = normalizePlan(structuredClone(pointsFixture));
  const future = plan.components[3];
  assert.equal(isKnown(future), false);
  assert.equal(componentName(future), "Futuro");
  assert.equal(componentName({ ...future, name: undefined }), "Componente nuevo (tower)");
  future.name = "Río";
  future.enabled = false;
  const saved = JSON.parse(serializePlan(plan)).components[3];
  assert.deepEqual(saved, { id: "d", type: "tower", name: "Río", altitude: 35, width: 40, enabled: false });
});

test("waypoints, foto y panorámica: duplicar, despegue automático y encuadre", () => {
  const waypoints = newWaypointsComponent([newWaypoint(origin, 20), newWaypoint(pr.toGeo({ x: 40, y: 0 }), 20)]);
  const copy = copyComponent(waypoints);
  // El recorrido mide 40 m de ancho: la copia queda 50 m al este.
  near(pr.toLocal(copy.points[0].position).x, 50, 0.5);
  near(pr.toLocal(copy.points[1].position).x, 90, 0.5);
  const photo = newPhotoComponent(origin);
  near(Geo.distance(origin, copyComponent(photo).position), 10, 0.5);
  // El despegue automático va 40 m al sur del primer punto.
  near(pr.toLocal(takeoffOf(newPlan("x", [waypoints]))).y, -40, 0.5);
  assert.deepEqual(componentPoints(photo), [origin]);
  assert.equal(componentPoints(newPanoComponent()).length, 0);
});

// ---- Corredor ----

const corridorFixture = {
  id: "corridor-test",
  name: "Río",
  finishAction: "GO_HOME",
  takeoff: [18.1835, -65.817],
  components: [
    {
      id: "r",
      type: "corridor",
      altitude: 35,
      path: [
        [18.18, -65.82],
        [18.1818, -65.82],
        [18.1818, -65.8186],
        [18.183, -65.8175],
      ],
      width: 60,
      minPhotoInterval: 2,
      captureSpeed: 1,
      photoType: "aeb3",
    },
  ],
};

test("corredor: las mismas pasadas, tiempo y fotos que en el teléfono", () => {
  const plan = normalizePlan(structuredClone(corridorFixture));
  const result = PlanPlanner.plan(plan);
  const corridor = result.items[0].result;
  // Los números que da PlanPlanner.kt con esta misma misión.
  assert.equal(corridor.passes.length, 4);
  assert.deepEqual(corridor.passes.map((p) => p.length), [4, 4, 4, 4]);
  near(corridor.lineSpacing, 15.078125, 1e-6);
  near(corridor.photoSpacing, 9.427083, 1e-6);
  near(corridor.speed, 4.713542, 1e-6);
  assert.equal(corridor.positions, 225);
  assert.equal(corridor.photoCount, 675);
  near(corridor.lengthMeters, 2145.1589, 0.01);
  near(corridor.durationSeconds, 920.879, 0.01);
  near(corridor.centerMeters, 524.9938, 0.01);
  // Empieza en el extremo más cerca del despegue.
  near(corridor.path[0][0], 18.1828666, 1e-6);
  near(corridor.path[0][1], -65.8173387, 1e-6);
  near(result.durationSeconds, 964.1977, 0.01);
  near(result.lengthMeters, 2305.042, 0.01);
  assert.equal(CorridorPlanner.outline(plan.components[0]).length, 8);
  // Con ancho 0 y video, una sola pasada por la línea.
  const line = CorridorPlanner.plan({ ...plan.components[0], width: 0, captureMode: "video" });
  assert.equal(line.passes.length, 1);
  near(line.durationSeconds, 77.6242, 0.01);
  assert.equal(line.photoCount, 0);
  assert.deepEqual(CorridorPlanner.outline({ ...plan.components[0], width: 0 }), []);
});

test("corredor: las esquinas guardan la distancia y por dentro no hacen rizos", () => {
  const close = (points, expected) =>
    expected.forEach((e, i) => assert.ok(Math.hypot(points[i].x - e.x, points[i].y - e.y) < 1e-6, JSON.stringify(points)));
  const line = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }];
  close(CorridorPlanner.offset(line, 10), [{ x: 10, y: 0 }, { x: 10, y: 90 }, { x: 100, y: 90 }]);
  close(CorridorPlanner.offset(line, -10), [{ x: -10, y: 0 }, { x: -10, y: 110 }, { x: 100, y: 110 }]);
  // Una vuelta de 150°: por fuera se corta la punta.
  assert.equal(CorridorPlanner.offset([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 50, y: 13.4 }], -10).length, 4);
  // Dos giros de 60° con un tramo de 4 m: por dentro ese tramo se quita.
  const p1 = { x: 0, y: 100 };
  const p2 = { x: 4 * Math.sin(Math.PI / 3), y: 100 + 4 * Math.cos(Math.PI / 3) };
  const p3 = { x: p2.x + 100 * Math.sin((2 * Math.PI) / 3), y: p2.y + 100 * Math.cos((2 * Math.PI) / 3) };
  assert.equal(CorridorPlanner.offset([{ x: 0, y: 0 }, p1, p2, p3], 20).length, 3);
});

test("corredor: se guarda y se lee igual, y lo que falta toma el valor por defecto", () => {
  const corridor = { ...newCorridorComponent([origin, pr.toGeo({ x: 0, y: 200 })]), width: 65, captureSpeed: 0, photoType: "aeb3" };
  const plan = newPlan("Río", [corridor]);
  const text = serializePlan(plan);
  assert.ok(!text.includes("null"));
  assert.deepEqual(normalizePlan(JSON.parse(text)), plan);
  const bare = normalizePlan({ id: "x", components: [{ id: "c", type: "corridor", path: [origin, [18.2, -65.8], "malo"] }] }).components[0];
  assert.equal(bare.width, 40);
  assert.equal(bare.captureMode, "photo");
  assert.equal(bare.path.length, 2);
  assert.equal(bare.captureSpeed, null);
});

test("corredor: duplicar, despegue automático y encuadre", () => {
  const corridor = newCorridorComponent([origin, pr.toGeo({ x: 0, y: 200 }), pr.toGeo({ x: 100, y: 200 })]);
  // Mide 100 m de este a oeste y 40 m de ancho: la copia queda 150 m al este.
  near(pr.toLocal(copyComponent(corridor).path[0]).x, 150, 0.5);
  // El despegue automático va 20 m al sur de la franja, que empieza en el origen.
  near(pr.toLocal(takeoffOf(newPlan("x", [corridor]))).y, -20, 0.5);
  assert.equal(componentPoints(corridor).length, 6);
  assert.deepEqual(componentPoints(newCorridorComponent([origin])), [origin]);
  assert.equal(componentName(corridor), "Corredor");
});

// ---- Fachada e inspección ----

/** La misma misión que FacadeTest.kt: un lado visto desde el otro, una redonda y una con esquinas. */
const facadeFixture = {
  "version": 2,
  "id": "facade-test",
  "name": "Edificio",
  "finishAction": "GO_HOME",
  "takeoff": [
    18.1798,
    -65.8195
  ],
  "components": [
    {
      "id": "a",
      "type": "facade",
      "face": "line",
      "boundary": [
        [
          18.18,
          -65.82
        ],
        [
          18.1803,
          -65.8197
        ],
        [
          18.1803,
          -65.8193
        ]
      ],
      "side": "left",
      "distance": 12,
      "altitude": 8,
      "finalAltitude": 26,
      "horizontalOverlap": 60,
      "verticalOverlap": 55,
      "gimbalPitch": -10,
      "speed": 2.5,
      "photoType": "aeb3"
    },
    {
      "id": "b",
      "type": "facade",
      "face": "circle",
      "boundary": [
        [
          18.181,
          -65.8185
        ],
        [
          18.181,
          -65.81835
        ]
      ],
      "distance": 6,
      "altitude": 15,
      "finalAltitude": 15,
      "pattern": "horizontal",
      "spacing": "distance",
      "horizontalDistance": 4,
      "verticalDistance": 3
    },
    {
      "id": "c",
      "type": "facade",
      "face": "polygon",
      "boundary": [
        [
          18.1815,
          -65.8195
        ],
        [
          18.1815,
          -65.8188
        ],
        [
          18.1822,
          -65.819
        ],
        [
          18.1818,
          -65.8192
        ],
        [
          18.1824,
          -65.8196
        ]
      ],
      "distance": 8,
      "altitude": 10,
      "finalAltitude": 30,
      "pattern": "horizontal",
      "captureMode": "video",
      "photoSize": "12mp"
    }
  ]
};

test("fachada: las mismas paradas, tiempo y fotos que en el teléfono", () => {
  const plan = normalizePlan(structuredClone(facadeFixture));
  const result = PlanPlanner.plan(plan);
  // Los números que da PlanPlanner.kt con esta misma misión.
  near(result.durationSeconds, 2582.588255, 1e-5);
  near(result.lengthMeters, 3484.38737, 1e-5);
  assert.equal(result.photoCount, 265);
  const [a, b, c] = result.items.map((item) => item.result);
  assert.deepEqual([a.columns, a.rows, a.stations.length, a.photoCount], [16, 5, 80, 240]);
  near(a.lengthMeters, 403.229577, 1e-5);
  near(a.durationSeconds, 588.091831, 1e-5);
  near(a.horizontalSpacing, 6.892857, 1e-6);
  near(a.verticalSpacing, 5.817857, 1e-6);
  near(a.standoff, 11.817693, 1e-6);
  // Despega del otro lado de la pared: entra por el extremo oeste.
  near(a.entry[0], 18.17992304, 1e-8);
  near(a.entry[1], -65.82007696, 1e-8);
  assert.deepEqual(a.path[0], a.entry);
  near(a.stations[0].heading, 133.533606, 1e-5);
  assert.deepEqual([b.columns, b.rows, b.photoCount], [25, 1, 25]);
  near(b.durationSeconds, 166.845299, 1e-5);
  near(b.path[0][0], 18.18087908, 1e-8);
  near(b.path[0][1], -65.8186629, 1e-8);
  assert.deepEqual([c.columns, c.rows, c.stations.length, c.photoCount], [76, 6, 456, 0]);
  near(c.lengthMeters, 2538.952266, 1e-5);
  near(c.durationSeconds, 1759.650755, 1e-5);
  near(c.faceMeters, 383.880983, 1e-5);
  near(c.stations[0].heading, 307.406542, 1e-5);
  near(result.items[2].approach.durationSeconds, 9.840576, 1e-5);
});

test("fachada: columnas a la distancia, mirando a la pared, y filas parejas", () => {
  const wall = {
    ...newFacadeComponent("line", [geo(-20, 0), geo(20, 0)]),
    spacing: "distance",
    horizontalDistance: 5,
    verticalDistance: 5,
  };
  const plan = FacadePlanner.plan(wall, geo(-30, 5));
  assert.deepEqual([plan.columns, plan.rows, plan.stations.length], [9, 5, 45]);
  assert.equal(plan.entry, null);
  for (const s of plan.stations) {
    near(pr.toLocal(s.position).y, 10, 0.05);
    near(s.heading, 180, 0.01);
  }
  assert.deepEqual(plan.stations.slice(0, 6).map((s) => s.altitude), [10, 15, 20, 25, 30, 30]);
  near(plan.lengthMeters, 220, 0.05);
  near(plan.durationSeconds, 40 / 3 + 180 / 2 + 44 * 2 + 45 * 3, 0.05);
  // Del otro lado: le da la vuelta por el extremo.
  const around = FacadePlanner.plan(wall, geo(-5, -40));
  near(pr.toLocal(around.entry).x, -30, 0.05);
  assert.deepEqual(FacadePlanner.levels({ ...wall, altitude: 30, finalAltitude: 10 }, 6), [30, 25, 20, 15, 10]);
  // Una pared de 20 km (marcada con el mapa muy alejado) no cabe en un vuelo.
  assert.equal(FacadePlanner.plan({ ...wall, boundary: [geo(0, 0), geo(20000, 0)] }), null);
  assert.equal(endAltitude(wall), 30);
});

test("fachada: se guarda y se lee igual, y lo que falta toma el valor por defecto", () => {
  const tower = { ...newFacadeComponent("circle", [origin, geo(8, 0)]), distance: 12.5, finalAltitude: 5, pattern: "horizontal", photoType: "aeb3" };
  const plan = newPlan("Torre", [tower]);
  const text = serializePlan(plan);
  assert.ok(!text.includes("null"));
  assert.deepEqual(normalizePlan(JSON.parse(text)), plan);
  const bare = normalizePlan({ id: "x", components: [{ id: "c", type: "facade", altitude: 18, boundary: [origin, [18.2, -65.8], "malo"], pattern: "grid" }] }).components[0];
  assert.equal(bare.face, "line");
  assert.equal(bare.finalAltitude, 18);
  assert.equal(bare.distance, 10);
  assert.equal(bare.pattern, "vertical");
  assert.equal(bare.boundary.length, 2);
  assert.equal(componentName(bare), "Fachada");
  assert.equal(componentName({ ...bare, face: "polygon" }), "Inspección");
});

test("fachada: duplicar, despegue automático y encuadre", () => {
  const wall = newFacadeComponent("line", [geo(0, 0), geo(40, 0)]);
  // Mide 40 m: la copia queda 40 + 2 × 10 + 10 m al este.
  near(pr.toLocal(copyComponent(wall).boundary[0]).x, 70, 0.5);
  // El despegue automático va 20 m al sur de por donde vuela.
  near(pr.toLocal(takeoffOf(newPlan("x", [wall]))).y, -30, 0.5);
  const tank = newFacadeComponent("circle", [origin, geo(10, 0)]);
  assert.equal(componentPoints(tank).length, 48);
  near(pr.toLocal(takeoffOf(newPlan("x", [tank]))).y, -40, 0.5);
});

test("fachada: la vista previa sube y baja en cada columna y dura lo estimado", () => {
  const plan = normalizePlan(structuredClone(facadeFixture));
  const result = PlanPlanner.plan(plan);
  const timeline = FlightPreview.timeline(plan);
  near(timeline.duration, result.durationSeconds, 1e-6);
  const wall = timeline.segments.filter((s) => s.label === "1. Fachada");
  const altitudes = wall.map((s) => s.to.altitude);
  assert.equal(Math.min(...altitudes), 8);
  assert.equal(Math.max(...altitudes), 26);
  // En cada foto mira a la cara.
  const shot = wall.find((s) => s.kind === "shot");
  near(FlightPreview.at(timeline, (shot.t0 + shot.t1) / 2).heading, result.items[0].result.stations[0].heading, 1e-6);
  const end = FlightPreview.at(timeline, timeline.duration);
  assert.equal(end.photos, result.photoCount);
  // Al exportar, la ruta lleva las alturas de las paradas y la pared va dibujada.
  const kml = exportKml(plan);
  assert.ok(kml.includes("1 · pared"));
  assert.ok(kml.includes("Inspección 3 · estructura"));
});

// ---- Comandos y zonas restringidas: los mismos números que ZonesTest.kt ----

/** La misión de ZonesTest.kt: cuatro zonas (con esquinas, redonda hasta 40 m, apagada y desde 70 m), una foto, comandos y waypoints. */
const zonesFixture = {
  "version": 2, "id": "zonas", "name": "Zonas", "finishAction": "GO_HOME", "transitSpeed": 8,
  "takeoff": [18.1798, -65.8195],
  "components": [
    {"id": "z1", "type": "zone", "shape": "polygon",
     "boundary": [[18.1803, -65.8199], [18.1803, -65.8189], [18.1806, -65.8189], [18.1806, -65.8193], [18.1810, -65.8193], [18.1810, -65.8199]]},
    {"id": "p1", "type": "photo", "position": [18.1815, -65.8195], "altitude": 30, "heading": 0, "gimbalPitch": -30},
    {"id": "z2", "type": "zone", "shape": "circle", "boundary": [[18.1815, -65.8183], [18.1815, -65.81815]], "maxAltitude": 40},
    {"id": "c1", "type": "commands", "position": [18.1816, -65.8172], "altitude": 35, "gimbalPitch": -20,
     "commands": [{"type": "wait", "value": 4}, {"type": "photo"}, {"type": "altitude", "value": 60}, {"type": "heading", "value": 200},
                  {"type": "photo"}, {"type": "videoStart"}, {"type": "wait", "value": 3.5}, {"type": "videoStop"}]},
    {"id": "z3", "type": "zone", "shape": "polygon", "enabled": false,
     "boundary": [[18.1799, -65.8180], [18.1799, -65.8170], [18.1801, -65.8170]]},
    {"id": "z4", "type": "zone", "shape": "polygon", "minAltitude": 70,
     "boundary": [[18.1803, -65.8186], [18.1803, -65.8180], [18.1808, -65.8180], [18.1808, -65.8186]]},
    {"id": "w1", "type": "waypoints", "altitude": 30, "speed": 5,
     "points": [{"position": [18.1822, -65.8184], "altitude": 30}, {"position": [18.1812, -65.8181], "altitude": 30}]}
  ]
};

const at = (x, y) => pr.toGeo({ x, y });
/** Un cuadro de 60 × 40 m entre el despegue (0, 0) y el norte. */
const block = (maxAltitude = null, minAltitude = null) => ({
  ...newZoneComponent("polygon", [at(-30, 30), at(30, 30), at(30, 70), at(-30, 70)]),
  maxAltitude,
  minAltitude,
});
const photoAt = (x, y, altitude = 30) => ({ ...newPhotoComponent(at(x, y)), altitude });

test("zonas: los mismos tránsitos, desvíos y avisos que en el teléfono", () => {
  const plan = normalizePlan(structuredClone(zonesFixture));
  const result = PlanPlanner.plan(plan);
  assert.equal(result.flown, 3);
  near(result.durationSeconds, 194.156033, 1e-5);
  near(result.lengthMeters, 975.874268, 1e-5);
  assert.equal(result.photoCount, 3);
  near(result.items[3].result.durationSeconds, 25.833333, 1e-5);
  assert.deepEqual(
    result.transits.map((t) => t.via.length),
    [2, 1, 0, 2],
  );
  [236.519744, 245.946193, 143.255724, 234.529276].forEach((length, i) => near(result.transits[i].lengthMeters, length, 1e-5));
  near(result.transits[0].durationSeconds, 39.564968, 1e-5);
  const expected = [
    [18.18021017, -65.81999455],
    [18.18108983, -65.81999455],
    [18.18171886, -65.81820458],
    [18.18088983, -65.81869455],
    [18.18021017, -65.81880545],
  ];
  result.transits.flatMap((t) => t.via).forEach((p, i) => {
    near(p[0], expected[i][0], 1e-8);
    near(p[1], expected[i][1], 1e-8);
  });
  const violations = ZonePlanner.violations(plan, result);
  assert.deepEqual(
    violations.map((v) => v.message),
    ["La ruta de Waypoints 7 entra en «Zona restringida 3»"],
  );
  near(violations[0].at[0], 18.1822, 1e-8);
  near(violations[0].at[1], -65.8184, 1e-8);
});

test("zonas: el tránsito y el regreso rodean el cuadro a 10 m", () => {
  const plan = { ...newPlan("Z", [block(), photoAt(0, 100)]), takeoff: at(0, 0) };
  const result = PlanPlanner.plan(plan);
  const via = result.items[1].approach.via.map(pr.toLocal);
  assert.equal(via.length, 2);
  near(Math.abs(via[0].x), 40, 1e-6);
  near(via[0].y, 20, 1e-6);
  near(Math.abs(via[1].x), 40, 1e-6);
  near(via[1].y, 80, 1e-6);
  assert.equal(result.home.via.length, 2);
  assert.deepEqual(ZonePlanner.violations(plan, result), []);
});

test("zonas: una baja se pasa por encima y una alta solo cuenta para el regreso", () => {
  const plan = (zone, finishAction = "HOVER") => ({ ...newPlan("Z", [zone, photoAt(0, 100)]), takeoff: at(0, 0), finishAction });
  assert.equal(PlanPlanner.plan(plan(block(20))).items[1].approach.via.length, 0);
  assert.equal(PlanPlanner.plan(plan(block(40))).items[1].approach.via.length, 2);
  const upper = PlanPlanner.plan(plan(block(null, 50), "GO_HOME"));
  assert.equal(upper.items[1].approach.via.length, 0);
  assert.equal(upper.home.via.length, 2);
  assert.equal(PlanPlanner.plan(plan({ ...block(), enabled: false })).items[1].approach.via.length, 0);
});

test("zonas: lo que entra, el despegue y el aterrizaje", () => {
  const map = { ...newMapComponent([at(-20, 50), at(20, 50), at(20, 120), at(-20, 120)]), altitude: 30 };
  const plan = { ...newPlan("Z", [map, block()]), takeoff: at(0, 200), finishAction: "HOVER" };
  assert.deepEqual(
    ZonePlanner.violations(plan, PlanPlanner.plan(plan)).map((v) => v.message),
    ["La ruta de Mapa 1 entra en «Zona restringida 2»"],
  );
  const over = { ...plan, components: [map, block(25)] };
  assert.deepEqual(ZonePlanner.violations(over, PlanPlanner.plan(over)), []);
  const inside = { ...newPlan("Z", [block(), photoAt(0, 100)]), takeoff: at(0, 50), finishAction: "HOVER" };
  assert.equal(ZonePlanner.violations(inside, PlanPlanner.plan(inside))[0].message, "El despegue está dentro de «Zona restringida 1»");
  const landing = { ...newPlan("Z", [block(), photoAt(0, 50, 40)]), takeoff: at(0, 0), finishAction: "LAND" };
  assert.ok(ZonePlanner.violations(landing, PlanPlanner.plan(landing)).some((v) => v.message === "El aterrizaje está dentro de «Zona restringida 1»"));
  // Una zona no se vuela ni pone el despegue.
  const auto = PlanPlanner.plan(newPlan("Z", [block(), photoAt(0, 100)]));
  assert.equal(auto.items[0].result, null);
  near(pr.toLocal(auto.takeoff).y, 60, 1e-6);
});

test("comandos: tiempo, fotos, alturas y sin punto donde terminó lo anterior", () => {
  const commands = {
    ...newCommandsComponent(at(50, 0), [
      newCommand("heading", 90),
      newCommand("photo"),
      newCommand("altitude", 35),
      newCommand("gimbal", -45),
      newCommand("photo"),
      newCommand("wait", 3),
    ]),
    altitude: 20,
  };
  const route = PointsPlanner.commands(commands);
  near(route.durationSeconds, 2 + 4 + 15 / 3 + 4 + 3, 1e-9);
  assert.equal(route.photoCount, 2);
  assert.equal(endAltitude(commands), 35);
  assert.equal(commandsCaptureMode(commands), "photo");
  assert.equal(commandsCaptureMode({ ...commands, commands: [newCommand("videoStart"), newCommand("photo")] }), "video");
  assert.equal(componentSummary(commands), "20 m · 6 comandos · 2 fotos");

  const photo = photoAt(0, 60);
  const loose = { ...newCommandsComponent(null, [newCommand("wait", 2)]), altitude: 40 };
  const result = PlanPlanner.plan({ ...newPlan("C", [photo, loose]), takeoff: at(0, 0) });
  assert.deepEqual(result.items[1].result.path, [photo.position]);
  assert.equal(result.items[1].approach.lengthMeters, 0);
  near(result.items[1].approach.durationSeconds, 10 / 3, 1e-9);
  assert.equal(PlanPlanner.plan(newPlan("C", [loose])).flown, 0);
});

test("comandos y zonas: se guardan y se leen igual, y lo desconocido se salta", () => {
  const plan = normalizePlan(structuredClone(zonesFixture));
  const back = normalizePlan(JSON.parse(serializePlan(plan)));
  assert.deepEqual(back.components, plan.components);
  const bare = normalizePlan({
    components: [
      { type: "commands", commands: [{ type: "wait" }, { type: "teleport", value: 3 }, { type: "altitude", value: 50 }], captureMode: "photo" },
      { type: "zone", boundary: [[18.18, -65.82]], maxAltitude: null, altitude: 0, shape: "hexagon" },
    ],
  });
  const [commands, zone] = bare.components;
  assert.deepEqual(commands.commands, [newCommand("wait", 5), newCommand("altitude", 50)]);
  assert.equal(commands.position, null);
  assert.equal(commands.gimbalPitch, -30);
  assert.equal("captureMode" in commands, false);
  assert.equal(zone.shape, "polygon");
  assert.equal(zone.maxAltitude, null);
  assert.equal("altitude" in zone, false);
  assert.equal(ZonePlanner.hasShape(zone), false);
  // Duplicar los pone al lado; la zona se dibuja con 72 puntos si es redonda.
  const round = newZoneComponent("circle", [at(0, 0), at(10, 0)]);
  near(pr.toLocal(copyComponent(round).boundary[0]).x, 30, 1e-6);
  assert.equal(componentPoints(round).length, 72);
  assert.equal(componentSummary(round), "todas las alturas · radio 10 m");
  assert.equal(componentSummary({ ...block(45, 5), enabled: false }), "de 5 a 45 m · 0.24 ha · no cuenta");
});

test("comandos y zonas: la vista previa rodea las zonas y dura lo estimado; el KML las dibuja", () => {
  const plan = normalizePlan(structuredClone(zonesFixture));
  const result = PlanPlanner.plan(plan);
  const timeline = FlightPreview.timeline(plan);
  near(timeline.duration, result.durationSeconds, 1e-6);
  // Pasa por los puntos del desvío.
  const corner = result.transits[0].via[0];
  assert.ok(timeline.segments.some((s) => s.to.position[0] === corner[0] && s.to.position[1] === corner[1]));
  // En los comandos sube a 60 m y gira a 200° antes de la segunda foto.
  const shots = timeline.segments.filter((s) => s.label === "4. Comandos" && s.kind === "shot");
  assert.equal(shots.length, 2);
  assert.equal(shots[1].from.altitude, 60);
  near(FlightPreview.at(timeline, (shots[1].t0 + shots[1].t1) / 2).heading, 200, 1e-9);
  assert.equal(FlightPreview.at(timeline, timeline.duration).photos, 3);
  const kml = exportKml(plan);
  assert.ok(kml.includes("Zona restringida 1 · todas las alturas"));
  assert.ok(kml.includes("Zona restringida 5 · desde 70 m (no cuenta)") === false);
  assert.ok(kml.includes("Zona restringida 5 · todas las alturas (no cuenta)"));
});

// ---- Seguir el terreno: los mismos números que Terrain.kt ----

const geo = (x, y) => pr.toGeo({ x, y });
/** La loma de TerrainTest.kt: el suelo a 100 m sobre el mar y 40 m más en (0, 120). */
const hill = {
  elevation(p) {
    const d = pr.toLocal(p);
    const dy = d.y - 120;
    return 100 + 40 * Math.exp(-(d.x * d.x + dy * dy) / (2 * 70 * 70));
  },
};

test("terreno: píxeles y mosaicos de Terrarium como en la app", () => {
  assert.equal(TerrariumTiles.height(128, 0, 0), 0);
  assert.equal(TerrariumTiles.height(128, 100, 128), 100.5);
  // El fondo del mar cuenta como 0.
  assert.equal(TerrariumTiles.height(127, 0, 0), 0);
  const [px, py] = TerrariumTiles.worldPixel(origin);
  near(px, 1330293.418667, 1e-5);
  near(py, 1881693.281194, 1e-5);
  const tiles = TerrariumTiles.tilesFor([geo(-1000, -1000), geo(1500, 1200)], 500);
  assert.deepEqual(tiles, [5195, 5196, 5197].flatMap((x) => [7349, 7350, 7351].map((y) => [x, y])));
  assert.ok(TerrariumTiles.url(5, 7).endsWith("/terrarium/14/5/7.png"));

  const size = TerrariumTiles.SIZE;
  const mod = (a, n) => ((a % n) + n) % n;
  const terrain = tileTerrain((tx, ty) =>
    Float32Array.from({ length: size * size }, (_, i) => mod(tx * size + (i % size), 97) + mod(ty * size + Math.floor(i / size), 89) * 0.5),
  );
  near(terrain.elevation(origin), 62.309263775, 1e-6);
  near(terrain.elevation(geo(300, -200)), 106.373170246, 1e-6);
  near(terrain.elevation(geo(-1234, 777)), 122.073956902, 1e-6);
  assert.equal(tileTerrain(() => null).elevation(origin), null);
});

test("terreno: el perfil de una ruta sobre la loma, igual que en la app", () => {
  const ref = TerrainFollow.reference(hill, hill.elevation(origin));
  const path = [geo(0, 0), geo(0, 120), geo(60, 120), geo(60, 300)];
  const profile = TerrainFollow.alongRoute(ref, path, [30, 30, 50, 20]);
  assert.equal(profile.length, 73);
  const expected = {
    0: [0, 0, 30],
    7: [34.960675822, 9.93455706, 39.93455706],
    24: [119.865174248, 30.79734804, 60.79734804],
    30: [149.831282658, 27.287511113, 67.287511113],
    72: [359.595152441, -8.187122546, 11.812877454],
  };
  for (const [i, [distance, ground, altitude]] of Object.entries(expected)) {
    near(profile[i].distance, distance, 1e-6, `distancia ${i}`);
    near(profile[i].ground, ground, 1e-6, `suelo ${i}`);
    near(profile[i].altitude, altitude, 1e-6, `altura ${i}`);
  }
  near(TerrainFollow.highestGround(ref, geo(-200, 0), geo(150, 260)), 28.704633271, 1e-6);
  // Sin datos en parte del camino, no se puede.
  const holey = TerrainFollow.reference({ elevation: (p) => (pr.toLocal(p).x > 50 ? null : 100) }, 100);
  assert.throws(() => TerrainFollow.alongRoute(holey, path, [30, 30, 30, 30]), TerrainMissingError);
});

test("terreno: qué componentes lo siguen y cómo se guarda", () => {
  const components = [
    map({ terrainFollow: true }),
    { ...newCorridorComponent([origin, geo(0, 200)]), terrainFollow: true },
    { ...newWaypointsComponent([newWaypoint(origin, 30)]), terrainFollow: true },
    { ...newPhotoComponent(origin), terrainFollow: true },
    { ...newPanoComponent(origin), terrainFollow: true },
  ];
  const plan = newPlan("Loma", components);
  assert.ok(components.every(TerrainFollow.follows));
  assert.ok(TerrainFollow.needed(plan));
  assert.deepEqual(normalizePlan(JSON.parse(serializePlan(plan))), plan);
  // La órbita no lo sigue; apagado o sin el campo, tampoco.
  assert.ok(!TerrainFollow.follows({ ...newOrbitComponent(origin), terrainFollow: true }));
  const bare = normalizePlan({ id: "x", components: [{ id: "c", type: "photo", position: origin, terrainFollow: "sí" }] });
  assert.equal(bare.components[0].terrainFollow, false);
  assert.ok(!TerrainFollow.needed(bare));
  assert.ok(!TerrainFollow.needed(newPlan("x", [{ ...components[0], enabled: false }])));
});

// ---- Vista previa ----

test("vista previa: el vuelo dura lo mismo que el estimado y pasa por cada componente", () => {
  const plan = newPlan("Todo", [
    map({ altitude: 40 }),
    { ...newOrbitComponent(geo(300, 300)), finalAltitude: 60 },
    newWaypointsComponent([newWaypoint(geo(-50, 0), 30), newWaypoint(geo(-80, 40), 45)]),
    { ...newPanoComponent(geo(0, -80)), panoType: "sphere" },
  ]);
  const result = PlanPlanner.plan(plan);
  const timeline = FlightPreview.timeline(plan);
  near(timeline.duration, result.durationSeconds, 1e-6);
  // Empieza en el despegue, en tierra, y termina ahí (regresa a casa).
  const start = FlightPreview.at(timeline, 0);
  assert.deepEqual(start.position, result.takeoff);
  assert.equal(start.altitude, 0);
  const end = FlightPreview.at(timeline, timeline.duration);
  near(Geo.distance(end.position, result.takeoff), 0, 0.01);
  near(end.altitude, 0, 1e-9);
  assert.equal(end.photos, result.photoCount);
  // Pasa por cada componente en orden, a su altura.
  const labels = [...new Set(timeline.segments.filter((s) => s.kind !== "transit").map((s) => s.label))];
  assert.deepEqual(labels, ["1. Mapa", "2. Órbita", "3. Waypoints", "4. Panorama"]);
  const inMap = timeline.segments.find((s) => s.label === "1. Mapa");
  assert.equal(FlightPreview.at(timeline, (inMap.t0 + inMap.t1) / 2).altitude, 40);
  const orbit = timeline.segments.filter((s) => s.label === "2. Órbita");
  near(orbit.at(-1).to.altitude, 60, 1e-9);
  // En la órbita mira al centro.
  const mid = FlightPreview.at(timeline, (orbit[5].t0 + orbit[5].t1) / 2);
  near(mid.heading, Geo.bearing(mid.position, geo(300, 300)), 1e-6);
  // La panorámica da la vuelta quieta.
  const pano = timeline.segments.find((s) => s.kind === "shot");
  near(Geo.distance(FlightPreview.at(timeline, pano.t0).position, FlightPreview.at(timeline, pano.t1 - 0.01).position), 0, 1e-6);
  assert.equal(pano.turn, 360);
  // Las fotos nunca bajan.
  let last = 0;
  for (let t = 0; t <= timeline.duration; t += timeline.duration / 500) {
    const state = FlightPreview.at(timeline, t);
    assert.ok(state.photos >= last);
    last = state.photos;
  }
});

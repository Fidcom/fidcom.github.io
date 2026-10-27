// Las mismas pruebas que PlannerTest.kt de la app, para que web y teléfono calculen igual.
// Correr con: node --test mini4pro/test/planner.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CorridorPlanner,
  Geo,
  MapPlanner,
  MINI_4_PRO,
  MINI_4_PRO_12MP,
  OrbitPlanner,
  PanoPlan,
  PlanPlanner,
  componentName,
  componentPoints,
  copyComponent,
  endAltitude,
  isKnown,
  newCorridorComponent,
  newMapComponent,
  newOrbitComponent,
  newPanoComponent,
  newPhotoComponent,
  newPlan,
  newWaypoint,
  newWaypointsComponent,
  normalizePlan,
  importKml,
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
    { id: "d", type: "facade", name: "Futuro", altitude: 35, width: 40 },
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
  assert.equal(componentName({ ...future, name: undefined }), "Componente nuevo (facade)");
  future.name = "Río";
  future.enabled = false;
  const saved = JSON.parse(serializePlan(plan)).components[3];
  assert.deepEqual(saved, { id: "d", type: "facade", name: "Río", altitude: 35, width: 40, enabled: false });
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

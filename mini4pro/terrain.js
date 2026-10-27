// La altura del suelo para seguir el terreno: los mosaicos Terrarium de AWS (libres, sin clave),
// leídos en el navegador. Los mismos datos que baja la app para volar.
import { TerrariumTiles, tileTerrain } from "./planner.js?v=20261028c";

/** Alrededor de la misión también hace falta el suelo, por los tránsitos y el despegue. */
const MARGIN_METERS = 500;
/** Un mosaico que no se pudo bajar se vuelve a intentar después de esto (ms). */
const RETRY_MS = 30_000;

/** "x/y" → alturas del mosaico (Float32Array), la promesa mientras baja, o la hora en que falló. */
const tiles = new Map();
let pending = 0;

/** El suelo con lo que ya está bajado: `elevation([lat, lon])` da metros sobre el mar, o null. */
export const terrain = tileTerrain((x, y) => {
  const tile = tiles.get(`${x}/${y}`);
  return tile instanceof Float32Array ? tile : null;
});

/** Hay mosaicos bajándose. */
export const terrainLoading = () => pending > 0;

async function load(x, y) {
  const response = await fetch(TerrariumTiles.url(x, y));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // Sin corrección de color: cada píxel tiene que llegar tal cual, es un número.
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const size = TerrariumTiles.SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = context.getImageData(0, 0, size, size).data;
  const heights = new Float32Array(size * size);
  for (let i = 0; i < heights.length; i++) heights[i] = TerrariumTiles.height(data[4 * i], data[4 * i + 1], data[4 * i + 2]);
  return heights;
}

/**
 * Baja el suelo alrededor de `points` (lo que ya está no se vuelve a pedir). Resuelve con cuántos
 * mosaicos no se pudieron bajar: 0 = todo listo.
 */
export async function ensureTerrain(points) {
  const needed = TerrariumTiles.tilesFor(points, MARGIN_METERS);
  const results = await Promise.all(
    needed.map(([x, y]) => {
      const key = `${x}/${y}`;
      const tile = tiles.get(key);
      if (tile instanceof Float32Array) return true;
      if (tile instanceof Promise) return tile.then((t) => t instanceof Float32Array);
      if (typeof tile === "number" && Date.now() - tile < RETRY_MS) return false;
      pending++;
      const loading = load(x, y)
        .then((heights) => {
          tiles.set(key, heights);
          return heights;
        })
        .catch(() => {
          tiles.set(key, Date.now());
          return null;
        })
        .finally(() => pending--);
      tiles.set(key, loading);
      return loading.then((t) => t instanceof Float32Array);
    }),
  );
  return results.filter((ok) => !ok).length;
}

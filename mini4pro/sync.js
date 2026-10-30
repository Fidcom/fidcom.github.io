// Sincronización con GitHub: un archivo JSON por misión en la rama "misiones" de Fidcom/mini4pro-app,
// la misma que lee la app del teléfono. El token se guarda solo en este navegador.
import { normalizePlan, serializePlan } from "./planner.js?v=20261030c";

const REPO = "Fidcom/mini4pro-app";
const BRANCH = "misiones";
const FOLDER = "missions";
const API = "https://api.github.com";

export const TOKEN_HELP_URL = "https://github.com/settings/personal-access-tokens/new";

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function errorMessage(status, body) {
  if (status === 401) return "El token no es válido o ya expiró.";
  if (status === 403) return "El token no tiene permiso para escribir en Fidcom/mini4pro-app (Contents: Read and write).";
  if (status === 404) return "No se encontró el repositorio o la rama de misiones. Revisa que el token incluya Fidcom/mini4pro-app.";
  return body?.message ? `GitHub respondió: ${body.message}` : `GitHub respondió con el error ${status}.`;
}

export class GitHubSync {
  constructor(token) {
    this.token = token;
  }

  async request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    } catch {
      const error = new Error("Sin conexión con GitHub.");
      error.offline = true;
      throw error;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const error = new Error(errorMessage(response.status, body));
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  /** Comprueba que el token puede leer la rama de misiones. */
  async check() {
    await this.request(`/repos/${REPO}/branches/${BRANCH}`);
  }

  /** Misiones guardadas en GitHub: [{ sha, mission }]. */
  async list() {
    let entries;
    try {
      entries = await this.request(`/repos/${REPO}/contents/${FOLDER}?ref=${BRANCH}`);
    } catch (error) {
      if (error.status === 404) return [];
      throw error;
    }
    const files = entries.filter((entry) => entry.type === "file" && entry.name.endsWith(".json"));
    const results = await Promise.all(
      files.map(async (file) => {
        const blob = await this.request(`/repos/${REPO}/git/blobs/${file.sha}`);
        try {
          return { sha: file.sha, mission: normalizePlan(JSON.parse(decodeBase64(blob.content))) };
        } catch {
          return null; // Un archivo dañado no detiene la sincronización.
        }
      }),
    );
    return results.filter(Boolean);
  }

  /** Guarda una misión y devuelve el sha nuevo del archivo. */
  async save(mission, sha) {
    const body = {
      message: `Misión: ${mission.name}`,
      content: encodeBase64(serializePlan(mission)),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    };
    const result = await this.request(`/repos/${REPO}/contents/${FOLDER}/${mission.id}.json`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return result.content.sha;
  }

  async remove(id, sha, name) {
    await this.request(`/repos/${REPO}/contents/${FOLDER}/${id}.json`, {
      method: "DELETE",
      body: JSON.stringify({ message: `Borra misión: ${name}`, sha, branch: BRANCH }),
    });
  }
}

/**
 * Junta las misiones de este navegador con las de GitHub.
 * - state.missions: { id: misión } en este navegador
 * - state.shas: { id: sha } de la última versión sincronizada de cada misión
 * - state.dirty: { id: true } misiones cambiadas aquí que faltan por subir
 * - state.deleted: { id: nombre } misiones borradas aquí que faltan por borrar en GitHub
 * Si la misma misión cambió en los dos lados, gana la que se editó más recientemente.
 */
export async function syncAll(sync, state) {
  const remote = await sync.list();
  const remoteIds = new Set();

  for (const { sha, mission } of remote) {
    const id = mission.id;
    remoteIds.add(id);
    const local = state.missions[id];
    if (id in state.deleted) {
      await sync.remove(id, sha, state.deleted[id]);
      delete state.deleted[id];
      delete state.shas[id];
    } else if (!local) {
      state.missions[id] = mission;
      state.shas[id] = sha;
    } else if (state.shas[id] === sha) {
      if (state.dirty[id]) await upload(sync, state, local, sha);
    } else if (state.dirty[id] && local.updatedAt > mission.updatedAt) {
      await upload(sync, state, local, sha);
    } else {
      state.missions[id] = mission;
      state.shas[id] = sha;
      delete state.dirty[id];
    }
  }

  for (const id of Object.keys(state.missions)) {
    if (remoteIds.has(id)) continue;
    if (state.shas[id] && !state.dirty[id]) {
      // Estaba sincronizada y ya no está en GitHub: se borró desde el teléfono.
      delete state.missions[id];
      delete state.shas[id];
    } else {
      await upload(sync, state, state.missions[id]);
    }
  }
  for (const id of Object.keys(state.deleted)) if (!remoteIds.has(id)) delete state.deleted[id];
}

/** Sube una misión. Si se editó otra vez mientras subía, queda pendiente para la próxima vuelta. */
async function upload(sync, state, mission, sha) {
  const newSha = await sync.save(mission, sha);
  state.shas[mission.id] = newSha;
  if (state.missions[mission.id]?.updatedAt === mission.updatedAt) delete state.dirty[mission.id];
}

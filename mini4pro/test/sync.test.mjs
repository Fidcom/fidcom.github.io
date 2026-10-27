// Pruebas de cómo se juntan las misiones del navegador con las de GitHub.
// Correr con: node --test mini4pro/test/sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { syncAll } from "../sync.js";

/** Un GitHub de mentira que guarda los archivos en memoria. */
function fakeGitHub(files = {}) {
  let counter = 0;
  return {
    files,
    async list() {
      return Object.values(files).map(({ sha, mission }) => ({ sha, mission: structuredClone(mission) }));
    },
    async save(mission, sha) {
      if (files[mission.id] && files[mission.id].sha !== sha) throw new Error("sha viejo");
      const newSha = `sha${++counter}`;
      files[mission.id] = { sha: newSha, mission: structuredClone(mission) };
      return newSha;
    },
    async remove(id, sha) {
      assert.equal(files[id].sha, sha);
      delete files[id];
    },
  };
}

const mission = (id, updatedAt, name = id) => ({ version: 1, id, type: "map", name, updatedAt, boundary: [] });
const emptyState = () => ({ missions: {}, shas: {}, dirty: {}, deleted: {} });

test("sube una misión nueva y baja una del teléfono", async () => {
  const github = fakeGitHub({ b: { sha: "s1", mission: mission("b", 10) } });
  const state = emptyState();
  state.missions.a = mission("a", 5);
  state.dirty.a = true;
  await syncAll(github, state);
  assert.ok(github.files.a);
  assert.equal(state.missions.b.id, "b");
  assert.equal(state.shas.b, "s1");
  assert.deepEqual(state.dirty, {});
});

test("un cambio del teléfono reemplaza la copia sin cambios locales", async () => {
  const github = fakeGitHub({ a: { sha: "s2", mission: mission("a", 20, "nuevo") } });
  const state = emptyState();
  state.missions.a = mission("a", 10, "viejo");
  state.shas.a = "s1";
  await syncAll(github, state);
  assert.equal(state.missions.a.name, "nuevo");
  assert.equal(state.shas.a, "s2");
});

test("si los dos cambiaron, gana la edición más reciente", async () => {
  const github = fakeGitHub({ a: { sha: "s2", mission: mission("a", 20, "teléfono") } });
  const state = emptyState();
  state.missions.a = mission("a", 30, "web");
  state.shas.a = "s1";
  state.dirty.a = true;
  await syncAll(github, state);
  assert.equal(github.files.a.mission.name, "web");
  assert.equal(state.missions.a.name, "web");
});

test("borrar aquí la borra en GitHub; borrada allá desaparece aquí", async () => {
  const github = fakeGitHub({
    a: { sha: "s1", mission: mission("a", 10) },
  });
  const state = emptyState();
  state.deleted.a = "a";
  state.shas.a = "s1";
  state.missions.c = mission("c", 10);
  state.shas.c = "s9"; // estaba sincronizada, pero ya no está en GitHub
  await syncAll(github, state);
  assert.equal(github.files.a, undefined);
  assert.equal(state.missions.c, undefined);
  assert.deepEqual(state.deleted, {});
});

test("una edición hecha mientras sube queda pendiente", async () => {
  const github = fakeGitHub();
  const state = emptyState();
  state.missions.a = mission("a", 10);
  state.dirty.a = true;
  const save = github.save;
  github.save = async (m, sha) => {
    const result = await save(m, sha);
    state.missions.a = mission("a", 11, "editada durante la subida");
    return result;
  };
  await syncAll(github, state);
  assert.equal(state.dirty.a, true);
});

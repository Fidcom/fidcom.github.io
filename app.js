const STORAGE_KEY = "rail-estimator-values";

const defaults = {
  panelCount: "8",
  panelWidth: "44.65",
  clampGap: "0.5",
  railExcess: "0.5",
  stockRailLength: "185.25",
  railsPerRow: "2",
  edgeLegOffset: "12",
  maxLegSpan: "60",
};

const fields = Object.keys(defaults);
const form = document.querySelector("#railForm");
const result = document.querySelector("#result");
const summary = document.querySelector("#summary");
const copyButton = document.querySelector("#copyButton");
const installButton = document.querySelector("#installButton");
const emptyTemplate = document.querySelector("#emptyTemplate");
let latestPlainText = "";
let installPrompt = null;

function round(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function format(value) {
  return `${round(value).toFixed(3)} in`;
}

function readNumber(id) {
  const element = document.querySelector(`#${id}`);
  const value = Number.parseFloat(element.value);
  if (!Number.isFinite(value)) {
    throw new Error(`Valor inválido: ${element.previousElementSibling.textContent}`);
  }
  return value;
}

function readInteger(id) {
  const value = Math.trunc(readNumber(id));
  if (value <= 0) {
    throw new Error("Los valores enteros deben ser mayores que 0.");
  }
  return value;
}

function calculateLegPositions(totalLength, edgeOffset, maxSpan) {
  if (maxSpan <= 0) throw new Error("El span entre patas debe ser mayor que 0.");
  if (edgeOffset < 0) throw new Error("La posición inicial de patas no puede ser negativa.");
  if (totalLength < edgeOffset * 2) {
    throw new Error("El largo total es menor que el doble de la posición inicial de patas.");
  }

  const start = edgeOffset;
  const end = totalLength - edgeOffset;
  const positions = [round(start)];
  let current = start;

  while (current + maxSpan < end) {
    current += maxSpan;
    positions.push(round(current));
  }

  if (positions.at(-1) !== round(end)) {
    positions.push(round(end));
  }

  const spans = positions.slice(0, -1).map((position, index) => round(positions[index + 1] - position));
  return { positions, spans };
}

function calculatePlan(values) {
  if (values.panelCount <= 0) throw new Error("La cantidad de paneles debe ser mayor que 0.");
  if (values.panelWidth <= 0) throw new Error("El ancho del panel debe ser mayor que 0.");
  if (values.clampGap < 0) throw new Error("El espacio entre paneles no puede ser negativo.");
  if (values.railExcess < 0) throw new Error("El exceso de riel en extremos no puede ser negativo.");
  if (values.stockRailLength <= 0) throw new Error("El largo inicial del riel debe ser mayor que 0.");
  if (values.railsPerRow <= 0) throw new Error("La cantidad de rieles por fila debe ser mayor que 0.");

  const panelSpan = values.panelCount * values.panelWidth + (values.panelCount - 1) * values.clampGap;
  const rowLength = panelSpan + 2 * values.railExcess;
  const stockRailsPerRail = Math.max(1, Math.ceil(rowLength / values.stockRailLength));
  const splicesPerRail = Math.max(0, stockRailsPerRail - 1);
  const cutLengths = [];
  let remaining = rowLength;

  for (let index = 0; index < stockRailsPerRail; index += 1) {
    const cut = Math.min(values.stockRailLength, remaining);
    cutLengths.push(round(cut));
    remaining -= cut;
  }

  const splicePositions = [];
  for (let index = 1; index < stockRailsPerRail; index += 1) {
    const position = values.stockRailLength * index;
    if (position < rowLength) splicePositions.push(round(position));
  }

  const legs = calculateLegPositions(rowLength, values.edgeLegOffset, values.maxLegSpan);

  return {
    ...values,
    panelSpan: round(panelSpan),
    rowLength: round(rowLength),
    totalRailLengthPerRow: round(rowLength * values.railsPerRow),
    stockRailsPerRail,
    splicesPerRail,
    cutLengths,
    splicePositions,
    legPositions: legs.positions,
    legSpans: legs.spans,
  };
}

function adjacentLegs(splicePosition, legs) {
  const left = legs.filter((position) => position < splicePosition).at(-1) ?? null;
  const right = legs.find((position) => position > splicePosition) ?? null;
  return { left, right };
}

function renderPlan(plan) {
  summary.textContent = `Largo de fila: ${format(plan.rowLength)} | Rieles por fila: ${plan.railsPerRow} | Splices por riel: ${plan.splicesPerRail}`;

  const legRows = plan.legPositions
    .map((position, index) => {
      const next = plan.legPositions[index + 1];
      const span = next === undefined ? "Última pata" : format(next - position);
      return `<tr><td>Pata ${index + 1}</td><td>${format(position)}</td><td>${span}</td></tr>`;
    })
    .join("");

  const spliceHtml = plan.splicePositions.length
    ? plan.splicePositions
        .map((splice, index) => {
          const { left, right } = adjacentLegs(splice, plan.legPositions);
          const leftText = left === null ? "Sin pata a la izquierda" : `${format(splice - left)} hasta pata en ${format(left)}`;
          const rightText = right === null ? "Sin pata a la derecha" : `${format(right - splice)} hasta pata en ${format(right)}`;
          return `<li class="splice-item"><strong>Splice ${index + 1}: centro en ${format(splice)}</strong><span>← ${leftText}</span><br><span>→ ${rightText}</span></li>`;
        })
        .join("")
    : `<li>No requiere splice; el largo cabe en un riel inicial.</li>`;

  result.innerHTML = `
    <div class="metric-grid">
      <div class="metric"><span>Paneles + clamps</span><strong>${format(plan.panelSpan)}</strong></div>
      <div class="metric"><span>Largo de fila</span><strong>${format(plan.rowLength)}</strong></div>
      <div class="metric"><span>Riel instalado total</span><strong>${format(plan.totalRailLengthPerRow)}</strong></div>
      <div class="metric"><span>Rieles iniciales / paralelo</span><strong>${plan.stockRailsPerRail}</strong></div>
      <div class="metric"><span>Splices / paralelo</span><strong>${plan.splicesPerRail}</strong></div>
      <div class="metric"><span>Primera/última pata</span><strong>${format(plan.edgeLegOffset)}</strong></div>
    </div>
    <div class="detail-panel">
      <h3>Plan de corte por cada riel paralelo</h3>
      <ul class="rail-list">${plan.cutLengths.map((cut, index) => `<li>Sección ${index + 1}: ${format(cut)}</li>`).join("")}</ul>
    </div>
    <div class="detail-panel">
      <h3>Patas y spans</h3>
      <table class="leg-table">
        <thead><tr><th>Pata</th><th>Posición desde borde izquierdo</th><th>Span a próxima pata</th></tr></thead>
        <tbody>${legRows}</tbody>
      </table>
    </div>
    <div class="detail-panel">
      <h3>Splices y distancias a patas cercanas</h3>
      <ul class="splice-list">${spliceHtml}</ul>
    </div>
    <div class="detail-panel">
      <h3>Notas</h3>
      <ul class="notes">
        <li>El exceso de riel para paneles es independiente de la posición de patas extremas.</li>
        <li>El centro del splice se asume en la unión entre secciones de riel inicial.</li>
        <li>El mismo patrón aplica a los rieles paralelos de la fila.</li>
      </ul>
    </div>
  `;

  latestPlainText = buildPlainText(plan);
}

function buildPlainText(plan) {
  const lines = [
    `Largo ocupado por paneles + clamps: ${format(plan.panelSpan)}`,
    `Largo requerido por fila: ${format(plan.rowLength)}`,
    `Largo total instalado (${plan.railsPerRow} rieles): ${format(plan.totalRailLengthPerRow)}`,
    `Rieles iniciales por paralelo: ${plan.stockRailsPerRail}`,
    `Splices por paralelo: ${plan.splicesPerRail}`,
    "",
    "Cortes:",
    ...plan.cutLengths.map((cut, index) => `- Sección ${index + 1}: ${format(cut)}`),
    "",
    "Patas:",
    ...plan.legPositions.map((position, index) => `- Pata ${index + 1}: ${format(position)}`),
    "",
    "Splices:",
  ];

  if (plan.splicePositions.length === 0) {
    lines.push("- No requiere splice.");
  } else {
    plan.splicePositions.forEach((splice, index) => {
      const { left, right } = adjacentLegs(splice, plan.legPositions);
      lines.push(`- Splice ${index + 1}: centro ${format(splice)}`);
      lines.push(left === null ? "  izquierda: sin pata" : `  izquierda: ${format(splice - left)} hasta ${format(left)}`);
      lines.push(right === null ? "  derecha: sin pata" : `  derecha: ${format(right - splice)} hasta ${format(right)}`);
    });
  }

  return lines.join("\n");
}

function getValues() {
  return {
    panelCount: readInteger("panelCount"),
    panelWidth: readNumber("panelWidth"),
    clampGap: readNumber("clampGap"),
    railExcess: readNumber("railExcess"),
    stockRailLength: readNumber("stockRailLength"),
    railsPerRow: readInteger("railsPerRow"),
    edgeLegOffset: readNumber("edgeLegOffset"),
    maxLegSpan: readNumber("maxLegSpan"),
  };
}

function saveValues() {
  const values = Object.fromEntries(fields.map((id) => [id, document.querySelector(`#${id}`).value]));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}

function loadValues() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  fields.forEach((id) => {
    document.querySelector(`#${id}`).value = saved[id] ?? defaults[id];
  });
}

function calculateAndRender() {
  const plan = calculatePlan(getValues());
  saveValues();
  renderPlan(plan);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    calculateAndRender();
  } catch (error) {
    summary.textContent = error.message;
    result.innerHTML = `<div class="empty-state"><strong>Error</strong><p>${error.message}</p></div>`;
  }
});

fields.forEach((id) => {
  document.querySelector(`#${id}`).addEventListener("change", saveValues);
});

copyButton.addEventListener("click", async () => {
  if (!latestPlainText) calculateAndRender();
  await navigator.clipboard.writeText(latestPlainText);
  copyButton.textContent = "Copiado";
  setTimeout(() => {
    copyButton.textContent = "Copiar";
  }, 1200);
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}

loadValues();
result.appendChild(emptyTemplate.content.cloneNode(true));
try {
  calculateAndRender();
} catch {
  // Keep the empty state if saved values are invalid.
}
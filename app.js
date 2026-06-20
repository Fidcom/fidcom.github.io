const STORAGE_KEY = "rail-estimator-values";

const defaults = {
  panelCount: "8",
  panelWidth: "44.65",
  clampGap: "0.5",
  railExcess: "0.5",
  stockRailLength: "185.25",
  railsPerRow: "2",
  edgeLegOffset: "12",
  minSpliceLegDistance: "12",
  maxLegSpan: "60",
  outputFormat: "decimal",
  fractionDenominator: "16",
  parallelRailSpacing: "54",
  rowGap: "20",
  panelLength: "89.685",
  tiltDeg: "10",
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

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

function parseMeasurement(rawValue) {
  const value = String(rawValue).trim().replace(/,/g, ".").replace(/-/g, " ");
  if (!value) return Number.NaN;

  const parts = value.split(/\s+/);
  let total = 0;

  for (const part of parts) {
    if (part.includes("/")) {
      const [numeratorText, denominatorText] = part.split("/");
      const numerator = Number.parseFloat(numeratorText);
      const denominator = Number.parseFloat(denominatorText);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return Number.NaN;
      }
      total += numerator / denominator;
    } else {
      const number = Number.parseFloat(part);
      if (!Number.isFinite(number)) return Number.NaN;
      total += number;
    }
  }

  return total;
}

function formatFraction(value, denominator) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  let whole = Math.floor(absolute);
  let numerator = Math.round((absolute - whole) * denominator);

  if (numerator === denominator) {
    whole += 1;
    numerator = 0;
  }

  if (numerator === 0) return `${sign}${whole}`;

  const divisor = gcd(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  return whole > 0
    ? `${sign}${whole} ${reducedNumerator}/${reducedDenominator}`
    : `${sign}${reducedNumerator}/${reducedDenominator}`;
}

function format(value) {
  const outputFormat = document.querySelector("#outputFormat")?.value ?? "decimal";
  const denominator = Number.parseInt(document.querySelector("#fractionDenominator")?.value ?? "16", 10);
  if (outputFormat === "fraction") {
    return `${formatFraction(value, denominator)} in`;
  }
  return `${round(value).toFixed(3)} in`;
}

function readNumber(id) {
  const element = document.querySelector(`#${id}`);
  const value = parseMeasurement(element.value);
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

function distributeBetweenAnchors(start, end, maxSpan) {
  const length = end - start;
  if (length <= 0) return [];

  const spanCount = Math.max(1, Math.ceil(length / maxSpan));
  const balancedSpan = length / spanCount;
  const points = [];
  for (let index = 1; index < spanCount; index += 1) {
    points.push(round(start + balancedSpan * index));
  }
  return points;
}

function calculateLegPositions(totalLength, edgeOffset, maxSpan, splicePositions, minSpliceLegDistance) {
  if (maxSpan <= 0) throw new Error("El span entre patas debe ser mayor que 0.");
  if (edgeOffset < 0) throw new Error("La posición inicial de patas no puede ser negativa.");
  if (minSpliceLegDistance < 0) throw new Error("La distancia mínima splice-pata no puede ser negativa.");
  if (totalLength < edgeOffset * 2) {
    throw new Error("El largo total es menor que el doble de la posición inicial de patas.");
  }

  const start = edgeOffset;
  const end = totalLength - edgeOffset;
  const warnings = [];
  const anchors = [start];

  splicePositions.forEach((splice, index) => {
    const left = splice - minSpliceLegDistance;
    const right = splice + minSpliceLegDistance;
    if (left <= start || right >= end || left >= right) {
      warnings.push(
        `Splice ${index + 1}: no hay espacio suficiente para colocar patas a ${format(minSpliceLegDistance)} del centro.`
      );
      return;
    }
    anchors.push(left, right);
  });

  anchors.push(end);
  const sortedAnchors = [...new Set(anchors.map(round))].sort((a, b) => a - b);
  const positions = [sortedAnchors[0]];

  for (let index = 0; index < sortedAnchors.length - 1; index += 1) {
    const sectionStart = sortedAnchors[index];
    const sectionEnd = sortedAnchors[index + 1];
    positions.push(...distributeBetweenAnchors(sectionStart, sectionEnd, maxSpan));
    positions.push(sectionEnd);
  }

  const uniquePositions = [...new Set(positions.map(round))].sort((a, b) => a - b);
  const spans = uniquePositions.slice(0, -1).map((position, index) => round(uniquePositions[index + 1] - position));

  return { positions: uniquePositions, spans, warnings };
}

function calculatePlan(values) {
  if (values.panelCount <= 0) throw new Error("La cantidad de paneles debe ser mayor que 0.");
  if (values.panelWidth <= 0) throw new Error("El ancho del panel debe ser mayor que 0.");
  if (values.clampGap < 0) throw new Error("El espacio entre paneles no puede ser negativo.");
  if (values.railExcess < 0) throw new Error("El exceso de riel en extremos no puede ser negativo.");
  if (values.stockRailLength <= 0) throw new Error("El largo inicial del riel debe ser mayor que 0.");
  if (values.railsPerRow <= 0) throw new Error("La cantidad de rieles por fila debe ser mayor que 0.");
  if (values.minSpliceLegDistance < 0) throw new Error("La distancia mínima splice-pata no puede ser negativa.");
  if (values.parallelRailSpacing <= 0) throw new Error("La distancia entre rieles paralelos debe ser mayor que 0.");
  if (values.rowGap < 0) throw new Error("El espacio entre filas no puede ser negativo.");
  if (values.panelLength <= 0) throw new Error("El largo del panel debe ser mayor que 0.");
  if (values.tiltDeg < 0 || values.tiltDeg >= 90) throw new Error("El tilt debe estar entre 0 y menos de 90 grados.");

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

  const panelStartPosition = values.railExcess;
  const panelEndPosition = values.railExcess + panelSpan;
  const panelEdges = [];
  for (let index = 0; index < values.panelCount; index += 1) {
    const start = panelStartPosition + index * (values.panelWidth + values.clampGap);
    panelEdges.push({ start: round(start), end: round(start + values.panelWidth) });
  }

  const endClamps = [
    { label: "End-clamp izq.", position: round(panelStartPosition) },
    { label: "End-clamp der.", position: round(panelEndPosition) },
  ];

  const midClamps = [];
  for (let index = 0; index < panelEdges.length - 1; index += 1) {
    const gapStart = panelEdges[index].end;
    const gapEnd = panelEdges[index + 1].start;
    midClamps.push({
      label: `Mid-clamp ${index + 1}`,
      position: round((gapStart + gapEnd) / 2),
    });
  }

  const endGaps = {
    left: round(panelStartPosition),
    right: round(rowLength - panelEndPosition),
  };

  const legs = calculateLegPositions(
    rowLength,
    values.edgeLegOffset,
    values.maxLegSpan,
    splicePositions,
    values.minSpliceLegDistance
  );

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
    warnings: legs.warnings,
    panelEdges,
    endClamps,
    midClamps,
    endGaps,
  };
}

function adjacentLegs(splicePosition, legs) {
  const left = legs.filter((position) => position < splicePosition).at(-1) ?? null;
  const right = legs.find((position) => position > splicePosition) ?? null;
  return { left, right };
}

function rangeStatus(value, min, max) {
  if (value < min) return { className: "bad", text: `Bajo: recomendado ${format(min)}–${format(max)}` };
  if (value > max) return { className: "warn", text: `Alto: recomendado ${format(min)}–${format(max)}` };
  return { className: "ok", text: `Dentro del rango recomendado ${format(min)}–${format(max)}` };
}

function calculateCrossRowLayout(plan) {
  const tiltRadians = (plan.tiltDeg * Math.PI) / 180;
  const cosTilt = Math.cos(tiltRadians);
  const sinTilt = Math.sin(tiltRadians);
  const panelProjection = plan.panelLength * cosTilt;
  const panelRise = plan.panelLength * sinTilt;
  const railEdgeSetback = Math.max(0, (plan.panelLength - plan.parallelRailSpacing) / 2);
  const railEdgeSetbackProjection = railEdgeSetback * cosTilt;
  const sameRowRailProjection = plan.parallelRailSpacing * cosTilt;
  const betweenRowsAdjacentRailFeet = plan.rowGap + 2 * railEdgeSetbackProjection;
  const rowPitchEdgeToEdge = panelProjection + plan.rowGap;

  return {
    panelProjection,
    panelRise,
    railEdgeSetback,
    railEdgeSetbackProjection,
    sameRowRailProjection,
    betweenRowsAdjacentRailFeet,
    rowPitchEdgeToEdge,
  };
}

function buildRailSvg(plan) {
  const width = 1000;
  const leftPad = 44;
  const railWidth = 912;
  const x = (position) => leftPad + (position / plan.rowLength) * railWidth;
  const railY = 104;
  const railHeight = 24;
  const panelStart = x(plan.railExcess);
  const panelEnd = x(plan.rowLength - plan.railExcess);
  const sectionRects = [];
  let sectionStart = 0;

  plan.cutLengths.forEach((cut, index) => {
    const sectionEnd = sectionStart + cut;
    sectionRects.push(
      `<rect x="${x(sectionStart)}" y="${railY}" width="${x(sectionEnd) - x(sectionStart)}" height="${railHeight}" rx="8" class="rail-section section-${index % 2}" />`
    );
    sectionStart = sectionEnd;
  });

  const legMarks = plan.legPositions
    .map((position, index) => {
      const px = x(position);
      const labelY = index % 2 === 0 ? 176 : 205;
      return `
        <g class="leg-mark">
          <line x1="${px}" y1="${railY + railHeight}" x2="${px}" y2="168" />
          <circle cx="${px}" cy="168" r="7" />
          <text x="${px}" y="${labelY}">P${index + 1}</text>
          <text x="${px}" y="${labelY + 14}" class="small-label">${round(position).toFixed(1)}</text>
        </g>`;
    })
    .join("");

  const spanLabels = plan.legPositions
    .slice(0, -1)
    .map((position, index) => {
      const next = plan.legPositions[index + 1];
      const mid = (x(position) + x(next)) / 2;
      const y = index % 2 === 0 ? 80 : 64;
      return `
        <g class="span-mark">
          <line x1="${x(position)}" y1="${y + 6}" x2="${x(next)}" y2="${y + 6}" />
          <text x="${mid}" y="${y}">${round(next - position).toFixed(1)} in</text>
        </g>`;
    })
    .join("");

  const spliceMarks = plan.splicePositions
    .map((position, index) => {
      const px = x(position);
      const { left, right } = adjacentLegs(position, plan.legPositions);
      const leftText = left === null ? "--" : round(position - left).toFixed(1);
      const rightText = right === null ? "--" : round(right - position).toFixed(1);
      return `
        <g class="splice-mark">
          <line x1="${px}" y1="44" x2="${px}" y2="150" />
          <path d="M ${px} ${railY - 12} l 10 10 l -10 10 l -10 -10 z" />
          <text x="${px}" y="34">S${index + 1}</text>
          <text x="${px}" y="50" class="small-label">${round(position).toFixed(1)}</text>
          <text x="${px}" y="232" class="small-label">← ${leftText} | ${rightText} →</text>
        </g>`;
    })
    .join("");

  const panelRects = plan.panelEdges
    .map((edge, index) => {
      const px = x(edge.start);
      const widthPx = x(edge.end) - x(edge.start);
      return `
        <g class="panel-mark">
          <rect x="${px}" y="90" width="${widthPx}" height="52" rx="6" class="panel-block" />
          <text x="${px + widthPx / 2}" y="120" class="panel-number">${index + 1}</text>
        </g>`;
    })
    .join("");

  const clampMarks = [...plan.endClamps, ...plan.midClamps]
    .map((clamp) => {
      const px = x(clamp.position);
      const isEnd = clamp.label.includes("End");
      return `
        <g class="clamp-mark ${isEnd ? "clamp-end" : "clamp-mid"}">
          <rect x="${px - 4}" y="84" width="8" height="64" rx="3" />
          <text x="${px}" y="60" class="small-label">${round(clamp.position).toFixed(1)}</text>
        </g>`;
    })
    .join("");

  const endGapLabels = `
    <g class="gap-mark">
      <line x1="${x(0)}" y1="146" x2="${x(plan.endGaps.left)}" y2="146" />
      <text x="${x(plan.endGaps.left / 2)}" y="160" class="small-label">gap ${round(plan.endGaps.left).toFixed(2)}</text>
      <line x1="${x(plan.rowLength - plan.endGaps.right)}" y1="146" x2="${x(plan.rowLength)}" y2="146" />
      <text x="${x(plan.rowLength - plan.endGaps.right / 2)}" y="160" class="small-label">gap ${round(plan.endGaps.right).toFixed(2)}</text>
    </g>`;

  return `
    <div class="rail-visual-wrap">
      <svg class="rail-visual" viewBox="0 0 ${width} 250" role="img" aria-label="Diagrama visual del riel con patas, spans y splices">
        <rect x="${leftPad}" y="18" width="${railWidth}" height="214" rx="18" class="visual-bg" />
        <line x1="${leftPad}" y1="22" x2="${leftPad}" y2="228" class="edge-line" />
        <line x1="${leftPad + railWidth}" y1="22" x2="${leftPad + railWidth}" y2="228" class="edge-line" />
        <rect x="${panelStart}" y="88" width="${panelEnd - panelStart}" height="56" rx="10" class="panel-zone" />
        <text x="${(panelStart + panelEnd) / 2}" y="82" class="zone-label">zona de paneles + clamps: ${format(plan.panelSpan)}</text>
        ${sectionRects.join("")}
        ${panelRects}
        ${endGapLabels}
        ${clampMarks}
        <text x="${leftPad}" y="154" class="small-label" text-anchor="start">0</text>
        <text x="${leftPad + railWidth}" y="154" class="small-label" text-anchor="end">${round(plan.rowLength).toFixed(1)} in</text>
        ${spanLabels}
        ${spliceMarks}
        ${legMarks}
      </svg>
      <div class="visual-legend">
        <span><i class="legend-rail"></i> Secciones de riel</span>
        <span><i class="legend-panel"></i> Paneles + clamps</span>
        <span><i class="legend-clamp-mid"></i> Mid-clamp</span>
        <span><i class="legend-clamp-end"></i> End-clamp</span>
        <span><i class="legend-leg"></i> Patas</span>
        <span><i class="legend-splice"></i> Splice</span>
      </div>
    </div>`;
}

function buildCrossRowSvg(plan) {
  const crossRow = calculateCrossRowLayout(plan);
  const width = 1000;
  const height = 460;
  const leftPad = 70;
  const railWidth = 860;
  const x = (position) => leftPad + (position / plan.panelLength) * railWidth;
  const panelLengthPx = railWidth;
  const panelHeightPx = 60;
  const panel1Y = 92;
  const panel2Y = 292;
  const rowGapPx = 76;
  const tiltOffsetPx = Math.tan((plan.tiltDeg * Math.PI) / 180) * panelHeightPx * 0.55;
  const sameRowRailOffset = ((plan.parallelRailSpacing / plan.panelLength) * railWidth) * 0.5;
  const firstRailY = panel1Y + 16;
  const secondRailY = panel1Y + 16 + sameRowRailOffset;
  const firstLowerRailY = panel2Y + 16;
  const secondLowerRailY = panel2Y + 16 + sameRowRailOffset;
  const topPanel = [
    `${x(0)},${panel1Y}`,
    `${x(plan.panelLength)},${panel1Y - tiltOffsetPx}`,
    `${x(plan.panelLength)},${panel1Y + panelHeightPx - tiltOffsetPx}`,
    `${x(0)},${panel1Y + panelHeightPx}`,
  ].join(" ");
  const bottomPanel = [
    `${x(0)},${panel2Y}`,
    `${x(plan.panelLength)},${panel2Y - tiltOffsetPx}`,
    `${x(plan.panelLength)},${panel2Y + panelHeightPx - tiltOffsetPx}`,
    `${x(0)},${panel2Y + panelHeightPx}`,
  ].join(" ");
  const railLabelX = x(plan.panelLength / 2);
  const rowGapLabelY = panel1Y + panelHeightPx + 34;
  const rowGapArrowTop = panel1Y + panelHeightPx;
  const rowGapArrowBottom = panel2Y;

  return `
    <div class="cross-row-wrap">
      <svg class="cross-row-visual" viewBox="0 0 ${width} ${height}" role="img" aria-label="Diagrama vertical de filas de paneles y distancia entre filas">
        <defs>
          <marker id="arrowUp" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
            <path d="M 0 10 L 5 0 L 10 10 z" fill="#0f766e" />
          </marker>
          <marker id="arrowDown" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
            <path d="M 0 0 L 5 10 L 10 0 z" fill="#0f766e" />
          </marker>
        </defs>
        <rect x="18" y="18" width="964" height="424" rx="20" class="cross-row-bg" />
        <polygon points="${topPanel}" class="cross-panel" />
        <polygon points="${bottomPanel}" class="cross-panel cross-panel-alt" />
        <line x1="${leftPad}" y1="${firstRailY}" x2="${leftPad + railWidth}" y2="${firstRailY}" class="cross-rail" />
        <line x1="${leftPad}" y1="${secondRailY}" x2="${leftPad + railWidth}" y2="${secondRailY}" class="cross-rail" />
        <line x1="${leftPad}" y1="${firstLowerRailY}" x2="${leftPad + railWidth}" y2="${firstLowerRailY}" class="cross-rail" />
        <line x1="${leftPad}" y1="${secondLowerRailY}" x2="${leftPad + railWidth}" y2="${secondLowerRailY}" class="cross-rail" />
        <text x="${railLabelX}" y="${panel1Y - 16}" class="cross-label">Fila 1: panel + tilt ${round(plan.tiltDeg).toFixed(2)}°</text>
        <text x="${railLabelX}" y="${panel2Y - 16}" class="cross-label">Fila 2: panel + tilt ${round(plan.tiltDeg).toFixed(2)}°</text>
        <line x1="930" y1="${rowGapArrowTop}" x2="930" y2="${rowGapArrowBottom}" class="cross-gap-arrow" marker-start="url(#arrowUp)" marker-end="url(#arrowDown)" />
        <text x="930" y="${(rowGapArrowTop + rowGapArrowBottom) / 2}" class="cross-gap-label">${format(plan.rowGap)}</text>
        <line x1="${leftPad + 40}" y1="${panel1Y + panelHeightPx - 14}" x2="${leftPad + 40}" y2="${panel2Y + 14}" class="cross-center-line" />
        <text x="${leftPad + 54}" y="${rowGapLabelY}" class="cross-small">gap entre filas</text>
        <text x="${leftPad + 54}" y="${rowGapLabelY + 18}" class="cross-small">distancia proyectada entre filas: ${format(crossRow.betweenRowsAdjacentRailFeet)}</text>
        <text x="${leftPad + 54}" y="${rowGapLabelY + 36}" class="cross-small">proyección horizontal del panel: ${format(crossRow.panelProjection)}</text>
      </svg>
      <div class="visual-legend cross-legend">
        <span><i class="legend-row"></i> Filas de paneles</span>
        <span><i class="legend-rail"></i> Rieles</span>
        <span><i class="legend-gap"></i> Gap entre filas</span>
      </div>
    </div>`;
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

  const warningHtml = plan.warnings.length
    ? `<div class="detail-panel warning-panel"><h3>Avisos</h3><ul class="notes">${plan.warnings
        .map((warning) => `<li>${warning}</li>`)
        .join("")}</ul></div>`
    : "";
  const railSpacingStatus = rangeStatus(plan.parallelRailSpacing, 48, 60);
  const rowGapStatus = rangeStatus(plan.rowGap, 18, 24);
  const crossRow = calculateCrossRowLayout(plan);

  result.innerHTML = `
    <div class="metric-grid">
      <div class="metric"><span>Paneles + clamps</span><strong>${format(plan.panelSpan)}</strong></div>
      <div class="metric"><span>Largo de fila</span><strong>${format(plan.rowLength)}</strong></div>
      <div class="metric"><span>Riel instalado total</span><strong>${format(plan.totalRailLengthPerRow)}</strong></div>
      <div class="metric"><span>Rieles iniciales / paralelo</span><strong>${plan.stockRailsPerRail}</strong></div>
      <div class="metric"><span>Splices / paralelo</span><strong>${plan.splicesPerRail}</strong></div>
      <div class="metric"><span>Primera/última pata</span><strong>${format(plan.edgeLegOffset)}</strong></div>
      <div class="metric"><span>Mín. splice-pata</span><strong>${format(plan.minSpliceLegDistance)}</strong></div>
    </div>
    ${warningHtml}
    <div class="detail-panel visual-panel">
      <h3>Vista visual del riel</h3>
      ${buildRailSvg(plan)}
    </div>
    <div class="detail-panel layout-panel">
      <h3>Layout entre rieles y filas</h3>
      ${buildCrossRowSvg(plan)}
      <div class="layout-grid">
        <div class="layout-item">
          <span>Distancia entre rieles paralelos de la misma fila</span>
          <strong>${format(plan.parallelRailSpacing)}</strong>
          <em class="status-${railSpacingStatus.className}">${railSpacingStatus.text}</em>
        </div>
        <div class="layout-item">
          <span>Gap entre bordes de paneles de filas consecutivas</span>
          <strong>${format(plan.rowGap)}</strong>
          <em class="status-${rowGapStatus.className}">${rowGapStatus.text}</em>
        </div>
        <div class="layout-item">
          <span>Panel proyectado horizontalmente por tilt ${round(plan.tiltDeg).toFixed(2)}°</span>
          <strong>${format(crossRow.panelProjection)}</strong>
          <em>Altura aproximada del borde alto: ${format(crossRow.panelRise)}</em>
        </div>
        <div class="layout-item">
          <span>Distancia proyectada entre rieles/patas de la misma fila</span>
          <strong>${format(crossRow.sameRowRailProjection)}</strong>
          <em>Basado en ${format(plan.parallelRailSpacing)} sobre el plano inclinado</em>
        </div>
        <div class="layout-item">
          <span>Distancia entre patas/rieles adyacentes de filas consecutivas</span>
          <strong>${format(crossRow.betweenRowsAdjacentRailFeet)}</strong>
          <em>Gap + setback proyectado de riel a borde de panel en ambas filas</em>
        </div>
        <div class="layout-item">
          <span>Pitch de fila borde-a-borde proyectado</span>
          <strong>${format(crossRow.rowPitchEdgeToEdge)}</strong>
          <em>Proyección del panel + gap entre filas</em>
        </div>
      </div>
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
      <h3>Clamps y gaps de extremos</h3>
      <ul class="rail-list">
        <li>End-clamp izquierdo en ${format(plan.endClamps[0].position)} (gap extremo: ${format(plan.endGaps.left)})</li>
        ${plan.midClamps.map((clamp) => `<li>${clamp.label} en ${format(clamp.position)}</li>`).join("")}
        <li>End-clamp derecho en ${format(plan.endClamps[1].position)} (gap extremo: ${format(plan.endGaps.right)})</li>
      </ul>
    </div>
    <div class="detail-panel">
      <h3>Notas</h3>
      <ul class="notes">
        <li>El exceso de riel para paneles es independiente de la posición de patas extremas.</li>
        <li>El centro del splice se asume en la unión entre secciones de riel inicial.</li>
        <li>Las patas se balancean por tramos desde los bordes hacia el splice o centro para evitar un span final demasiado corto.</li>
        <li>Cuando hay splice, se sugieren patas adyacentes a la distancia mínima configurada a ambos lados del centro del splice.</li>
        <li>El gap entre filas se mide entre bordes de paneles, no entre rieles.</li>
        <li>La distancia entre rieles paralelos corresponde al espaciamiento transversal dentro de la misma fila.</li>
        <li>La distancia entre patas de filas consecutivas se calcula con el panel en tilt y su proyección horizontal.</li>
        <li>El mismo patrón aplica a los rieles paralelos de la fila.</li>
      </ul>
    </div>
  `;

  latestPlainText = buildPlainText(plan);
}

function buildPlainText(plan) {
  const crossRow = calculateCrossRowLayout(plan);
  const lines = [
    `Largo ocupado por paneles + clamps: ${format(plan.panelSpan)}`,
    `Largo requerido por fila: ${format(plan.rowLength)}`,
    `Largo total instalado (${plan.railsPerRow} rieles): ${format(plan.totalRailLengthPerRow)}`,
    `Rieles iniciales por paralelo: ${plan.stockRailsPerRail}`,
    `Splices por paralelo: ${plan.splicesPerRail}`,
    `Distancia mínima splice-pata: ${format(plan.minSpliceLegDistance)}`,
    `Distancia entre rieles paralelos: ${format(plan.parallelRailSpacing)}`,
    `Gap entre filas de paneles: ${format(plan.rowGap)}`,
    `Panel proyectado por tilt ${round(plan.tiltDeg).toFixed(2)}°: ${format(crossRow.panelProjection)}`,
    `Distancia proyectada entre rieles de la misma fila: ${format(crossRow.sameRowRailProjection)}`,
    `Distancia entre filas consecutivas de patas/rieles: ${format(crossRow.betweenRowsAdjacentRailFeet)}`,
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

  lines.push("", "Clamps y gaps de extremos:");
  lines.push(`- End-clamp izquierdo: ${format(plan.endClamps[0].position)} (gap extremo ${format(plan.endGaps.left)})`);
  plan.midClamps.forEach((clamp) => {
    lines.push(`- ${clamp.label}: ${format(clamp.position)}`);
  });
  lines.push(`- End-clamp derecho: ${format(plan.endClamps[1].position)} (gap extremo ${format(plan.endGaps.right)})`);

  if (plan.warnings.length) {
    lines.push("", "Avisos:", ...plan.warnings.map((warning) => `- ${warning}`));
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
    minSpliceLegDistance: readNumber("minSpliceLegDistance"),
    maxLegSpan: readNumber("maxLegSpan"),
    parallelRailSpacing: readNumber("parallelRailSpacing"),
    rowGap: readNumber("rowGap"),
    panelLength: readNumber("panelLength"),
    tiltDeg: readNumber("tiltDeg"),
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
  document.querySelector(`#${id}`).addEventListener("change", () => {
    saveValues();
    if (id === "outputFormat" || id === "fractionDenominator") {
      try {
        calculateAndRender();
      } catch {
        // Ignore format refresh errors until the next explicit calculation.
      }
    }
  });
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
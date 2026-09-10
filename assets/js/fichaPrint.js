/**
 * Generación de la Ficha de Embalaje IMPRIMIBLE (formato AF-FR-PP-02),
 * usando el diálogo de impresión del navegador ("Guardar como PDF") en
 * vez de una librería de PDF — cero dependencias, cero costo, funciona
 * offline. Los diagramas son SVG isométricos generados a partir de los
 * números ya calculados (no son imágenes fijas).
 */

// ---------- Geometría isométrica compartida ----------
// Vectores unitarios (mismos que el logo de Arqueta Folding): eje A
// (derecha), eje B (izquierda), eje vertical.
const ISO_A = [16, 9];
const ISO_B = [-16, 9];
const ISO_V = [0, 20];

function add(p, v, n = 1) { return [p[0] + v[0] * n, p[1] + v[1] * n]; }
function pts(...points) { return points.map((p) => p.join(',')).join(' '); }

/** Dibuja una caja isométrica con rejilla (cols x filas x niveles), para
 * el corrugado/entarimado — muestra cada unidad individual con líneas. */
function svgCajaConRejilla({ cols, filas, niveles, cellA = ISO_A, cellB = ISO_B, cellV = ISO_V, origin = [90, 20], colorTop = '#eaf3fb', colorA = '#c3d6e8', colorB = '#8fb3d6', stroke = '#0b2a4a' }) {
  const O = origin;
  const R = add(O, cellA, cols); // esquina derecha del techo
  const F = add(R, cellB, filas); // esquina frontal (la más cercana, visible)
  const L = add(O, cellB, filas); // esquina izquierda del techo
  const Fdown = add(F, cellV, niveles);
  const Rdown = add(R, cellV, niveles);
  const Ldown = add(L, cellV, niveles);

  let svg = '';
  // Cara superior.
  svg += `<polygon points="${pts(O, R, F, L)}" fill="${colorTop}" stroke="${stroke}" stroke-width="1.3"/>`;
  // Cara derecha (entre R y F, hacia abajo).
  svg += `<polygon points="${pts(R, F, Fdown, Rdown)}" fill="${colorA}" stroke="${stroke}" stroke-width="1.3"/>`;
  // Cara izquierda (entre L y F, hacia abajo).
  svg += `<polygon points="${pts(L, F, Fdown, Ldown)}" fill="${colorB}" stroke="${stroke}" stroke-width="1.3"/>`;

  // Líneas de rejilla en el techo.
  for (let i = 1; i < cols; i++) {
    const p1 = add(O, cellA, i), p2 = add(p1, cellB, filas);
    svg += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="${stroke}" stroke-width="0.6"/>`;
  }
  for (let j = 1; j < filas; j++) {
    const p1 = add(O, cellB, j), p2 = add(p1, cellA, cols);
    svg += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="${stroke}" stroke-width="0.6"/>`;
  }
  // Líneas de nivel (camas) en las 2 caras visibles.
  for (let k = 1; k < niveles; k++) {
    const rA = add(R, cellV, k), fA = add(F, cellV, k), lA = add(L, cellV, k);
    svg += `<line x1="${rA[0]}" y1="${rA[1]}" x2="${fA[0]}" y2="${fA[1]}" stroke="${stroke}" stroke-width="0.6"/>`;
    svg += `<line x1="${lA[0]}" y1="${lA[1]}" x2="${fA[0]}" y2="${fA[1]}" stroke="${stroke}" stroke-width="0.6"/>`;
  }
  for (let j = 1; j < filas; j++) {
    const p1 = add(R, cellB, j), p2 = add(p1, cellV, niveles);
    svg += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="${stroke}" stroke-width="0.6"/>`;
  }
  for (let i = 1; i < cols; i++) {
    const p1 = add(L, cellA, i), p2 = add(p1, cellV, niveles);
    svg += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="${stroke}" stroke-width="0.6"/>`;
  }

  return { svg, bounds: { O, R, F, L, Fdown, Rdown, Ldown } };
}

/** Diagrama "Empaque": el corrugado abierto con sus 3 medidas. */
function svgEmpaque(corrugado) {
  const { svg } = svgCajaConRejilla({
    cols: 1, filas: 1, niveles: 1,
    cellA: [55, 22], cellB: [-55, 22], cellV: [0, 55],
    origin: [130, 30],
    colorTop: '#eaf3fb', colorA: '#c3d6e8', colorB: '#8fb3d6',
  });
  return `
    <svg viewBox="0 0 260 200" xmlns="http://www.w3.org/2000/svg" class="pf-svg">
      ${svg}
      <text x="130" y="14" text-anchor="middle" class="pf-dim">${corrugado.largo} mm</text>
      <text x="18" y="150" text-anchor="middle" class="pf-dim" transform="rotate(-28 18 150)">${corrugado.ancho} mm</text>
      <text x="238" y="105" text-anchor="middle" class="pf-dim" transform="rotate(28 238 105)">${corrugado.alto} mm</text>
    </svg>
  `;
}

/** Ícono de posteta: hojas apiladas en abanico, con su etiqueta. */
function svgPosteta(cama, index) {
  let sheets = '';
  const n = Math.min(10, Math.max(3, Math.round(cama.piezasPorPosteta / 20)));
  for (let i = 0; i < n; i++) {
    const off = i * 3;
    sheets += `<rect x="${10 + off}" y="${8 + off}" width="42" height="30" fill="#e9edf1" stroke="#0b2a4a" stroke-width="0.8"/>`;
  }
  return `
    <div class="pf-posteta">
      <svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg">${sheets}</svg>
      <div class="pf-posteta-label">
        ${index + 1}${index === 0 ? 'RA' : 'DA'} CAMA<br>
        ${cama.cols * cama.filas + (cama.extra || 0)} POSTETAS${cama.extra ? ` (${cama.postetasPorCama - cama.extra}+${cama.extra} rot.)` : ''} DE ${cama.piezasPorPosteta} PZ<br>
        ${cama.orientacionLabel.toUpperCase()}
      </div>
    </div>
  `;
}

/** Diagrama "Entarimado": la tarima con los corrugados apilados. */
function svgEntarimado({ cols, filas, camas }) {
  const nivelesDibujo = Math.min(camas, 6); // tope visual, la cifra real va en la etiqueta
  const colsDibujo = Math.min(cols, 6);
  const filasDibujo = Math.min(filas, 6);

  const { svg, bounds } = svgCajaConRejilla({
    cols: colsDibujo, filas: filasDibujo, niveles: nivelesDibujo,
    cellA: [17, 9], cellB: [-17, 9], cellV: [0, 16],
    origin: [130, 20],
    colorTop: '#e3c9a0', colorA: '#c49a5e', colorB: '#9c7440',
  });

  const palletY = bounds.Fdown[1] + 6;
  const pallet = `
    <polygon points="${pts([bounds.O[0] - 10, bounds.O[1] + palletY - bounds.O[1]], [1,1])}" opacity="0"/>
  `;

  return `
    <svg viewBox="0 0 260 230" xmlns="http://www.w3.org/2000/svg" class="pf-svg">
      ${svg}
      <line x1="245" y1="${bounds.O[1] - 15}" x2="245" y2="${bounds.Fdown[1]}" stroke="#666" stroke-width="1"/>
      <text x="252" y="${(bounds.O[1] - 15 + bounds.Fdown[1]) / 2}" class="pf-dim-small" transform="rotate(90 252 ${(bounds.O[1] - 15 + bounds.Fdown[1]) / 2})" text-anchor="middle">120 cm max.</text>
      <rect x="${bounds.L[0] - 14}" y="${bounds.Fdown[1] + 4}" width="${bounds.R[0] - bounds.L[0] + 28}" height="10" fill="#c8a35f" stroke="#8a672f" stroke-width="1"/>
    </svg>
  `;
}

/** Construye e inyecta la ficha imprimible con los datos ya calculados. */
function renderPrintFicha({ input, corrugado, estrategia, estiba, camasMostradas, totalMostrado, pesoTotalKg, fecha }) {
  const el = document.getElementById('print-ficha');
  if (!el) return;

  const empaqueSvg = svgEmpaque(corrugado);
  const posteSvgs = estrategia.camas.map(svgPosteta).join('');
  const entarimadoSvg = svgEntarimado({ cols: estiba.piso.cols + estiba.piso.extraCols, filas: estiba.piso.filas, camas: camasMostradas });

  el.innerHTML = `
    <table class="pf-header">
      <tr>
        <td class="pf-logo" rowspan="4">
          <svg viewBox="0 0 40 40" class="pf-logo-svg">
            <polygon points="20,2 36,11 20,20 4,11" fill="#70a0d0"/>
            <polygon points="4,11 20,20 20,38 4,29" fill="#0060b0"/>
            <polygon points="36,11 20,20 20,38 36,29" fill="#5090c0"/>
          </svg>
        </td>
        <td class="pf-title" colspan="2" rowspan="1">Ficha de Embalaje</td>
        <td class="pf-meta-label">Código<br>De Producto:</td>
        <td class="pf-meta-value">${input.codigo || '—'}</td>
      </tr>
      <tr>
        <td class="pf-field" colspan="2">Artículo: <b>${input.articulo || '—'}</b></td>
        <td class="pf-meta-label">Fecha:</td>
        <td class="pf-meta-value">${fecha}</td>
      </tr>
      <tr>
        <td class="pf-field" colspan="2">Cliente: <b>${input.cliente || '—'}</b></td>
        <td class="pf-meta-label">Realizado:</td>
        <td class="pf-meta-value">${input.realizado || '—'}</td>
      </tr>
      <tr>
        <td class="pf-field" colspan="2"></td>
        <td class="pf-meta-label">Aprobado:</td>
        <td class="pf-meta-value">Borrador</td>
      </tr>
    </table>

    <div class="pf-diagrams">
      <div class="pf-diagram">
        <h4>Empaque</h4>
        ${empaqueSvg}
        <div class="pf-postetas">${posteSvgs}</div>
      </div>
      <div class="pf-diagram">
        <h4>Entarimado</h4>
        ${entarimadoSvg}
      </div>
    </div>

    <table class="pf-data">
      <tr>
        <td class="pf-label">Tipo de Caja:</td><td>${corrugado.id}</td>
        <td class="pf-label">Cantidad por Cama:</td><td>${estiba.piso.total} cajas</td>
        <td class="pf-label">Postetas por caja:</td><td>${estrategia.camas.map((c) => `${c.cols * c.filas + (c.extra || 0)}/${c.piezasPorPosteta}`).join(' + ')}</td>
      </tr>
      <tr>
        <td class="pf-label">Dimensiones Internas:</td><td>${corrugado.largo} X ${corrugado.ancho} X ${corrugado.alto} mm</td>
        <td class="pf-label">Estiba:</td><td>${camasMostradas} cajas</td>
        <td class="pf-label">Total de Piezas:</td><td>${estrategia.total} pzas.</td>
      </tr>
      <tr>
        <td class="pf-label">Caja armada:</td><td>${input.largo} X ${input.ancho} X ${input.alto} mm</td>
        <td class="pf-label">Tarima:</td><td>${corrugadoTarimaLabel()}</td>
        <td class="pf-label">Peso Piezas*:</td><td>${pesoTotalKg != null ? `${fmtPf(pesoTotalKg)} kg.` : '—'}</td>
      </tr>
    </table>

    <div class="pf-footer">
      AF-FR-PP-02 FICHA DE EMBALAJE REV. 00 — Total por tarima: ${totalMostrado} corrugados / ${totalMostrado * estrategia.total} pzas.
      ${pesoTotalKg != null ? '<br>*Peso Piezas = solo el cartón + tinta/barniz de las piezas; falta sumar el peso del propio corrugado para el Peso Bruto real.' : ''}
    </div>
  `;
}

function corrugadoTarimaLabel() {
  return `${TARIMA.largo_cm} X ${TARIMA.ancho_cm} cm`;
}

function fmtPf(n) {
  return Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

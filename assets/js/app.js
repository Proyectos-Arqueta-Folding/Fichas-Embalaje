const $ = (sel) => document.querySelector(sel);

$('#dieline-img').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const box = $('#dieline-preview');
  if (!file) { box.innerHTML = ''; return; }
  const url = URL.createObjectURL(file);
  box.innerHTML = `<img src="${url}" style="max-width:100%;border-radius:8px;border:1px solid var(--af-border);margin-top:6px;">`;
});

const tipoCartonSelect = $('#tipoCarton');
const calibreSelect = $('#calibre');
const materialSelect = $('#material');
const campoMaterial = $('#campo-material');

function poblarCalibres() {
  const tipo = tipoCartonSelect.value;
  calibreSelect.innerHTML = '';
  if (tipo === 'solido') {
    Object.keys(ESPESOR_POR_CALIBRE).forEach((cal) => {
      const opt = document.createElement('option');
      opt.value = cal;
      opt.textContent = `${cal} pt`;
      calibreSelect.appendChild(opt);
    });
  } else {
    Object.entries(ESPESOR_MICROCORRUGADO).forEach(([key, info]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = info.label;
      calibreSelect.appendChild(opt);
    });
  }
  campoMaterial.style.display = tipo === 'solido' ? '' : 'none';
}

function poblarMateriales() {
  materialSelect.innerHTML = '';
  Object.keys(GRAMAJE_SOLIDO).forEach((mat) => {
    const opt = document.createElement('option');
    opt.value = mat;
    opt.textContent = mat;
    materialSelect.appendChild(opt);
  });
}

tipoCartonSelect.addEventListener('change', poblarCalibres);
poblarCalibres();
poblarMateriales();

function fmt(n, dec = 1) {
  return Number(n).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Resume una estrategia (1 o varias camas, posiblemente con ejes distintos)
// en una sola línea legible, ej: "Parada 2×1×260 + Acostada (a lo largo) 1×3×5".
function estrategiaLabel(estrategia) {
  return estrategia.camas.map((c) => `${c.orientacionLabel} ${c.cols}×${c.filas}×${c.piezasPorPosteta}`).join(' + ');
}

// Resume el piso de una cama de la tarima: "6 cajas" o, si mezcla
// orientaciones, "6 cajas (4 + 2 rotadas)".
function pisoLabel(piso) {
  return piso.extra > 0 ? `${piso.total} cajas (${piso.principal} + ${piso.extra} rotadas)` : `${piso.total} cajas`;
}

// Estado del último cálculo, para que los selectores manuales de
// corrugado/estrategia puedan re-renderizar sin recalcular el grosor.
let state = null;

function currentSelection() {
  const entry = state.resultado.porCorrugado.find((p) => p.corrugado.id === state.corrugadoId);
  const estrategia = entry.opciones[state.acomodoIndex];
  return {
    corrugado: entry.corrugado,
    estrategia,
    esMejor: entry.corrugado.id === state.resultado.porCorrugado[0].corrugado.id && state.acomodoIndex === 0,
  };
}

function renderListaCorrugados() {
  const { porCorrugado } = state.resultado;
  const mejorId = porCorrugado[0].corrugado.id;

  const filas = porCorrugado.map((p) => {
    const mejorEstrategia = p.opciones[0];
    const activo = p.corrugado.id === state.corrugadoId;
    return `
      <button type="button" class="corr-row ${activo ? 'corr-row-active' : ''}" data-corr="${p.corrugado.id}">
        <span class="corr-row-id">
          ${p.corrugado.id}${p.corrugado.id === mejorId ? ' <span class="badge">Recomendado</span>' : ''}
        </span>
        <span class="corr-row-dims">${p.corrugado.largo} × ${p.corrugado.ancho} × ${p.corrugado.alto} mm</span>
        <span class="corr-row-detail">${estrategiaLabel(mejorEstrategia)}</span>
        <span class="corr-row-total">${mejorEstrategia.total} pzs</span>
      </button>
    `;
  }).join('');

  return `
    <div class="af-card">
      <h2>Todas las opciones de corrugado</h2>
      <p class="af-card-hint">Piezas totales con la mejor estrategia de cada corrugado. Haz clic en una para verla en 3D.</p>
      <div class="corr-list">${filas}</div>
    </div>
  `;
}

function renderControls() {
  const { porCorrugado } = state.resultado;
  const entry = porCorrugado.find((p) => p.corrugado.id === state.corrugadoId);

  const estrategiaOptions = entry.opciones.map((e, i) => `
    <option value="${i}" ${i === state.acomodoIndex ? 'selected' : ''}>
      ${estrategiaLabel(e)} = ${e.total} pzs
    </option>
  `).join('');

  return `
    <div class="af-card">
      <h2>Estrategia para ${entry.corrugado.id}</h2>
      <p class="af-card-hint">Cada corrugado puede tener varias camas (paradas o acostadas); esto compara las combinaciones evaluadas.</p>
      <div class="af-field">
        <label>Estrategia</label>
        <select id="sel-estrategia">${estrategiaOptions}</select>
      </div>
    </div>
  `;
}

function render({ scrollToScene = false } = {}) {
  const container = $('#preview-container');

  if (state.resultado.error) {
    container.innerHTML = `
      <div class="af-card">
        <div class="af-empty-state">
          <div style="color:#c0392b; font-weight:600;">${state.resultado.error}</div>
        </div>
      </div>`;
    return;
  }

  const { input, resultado, pesoPiezaG } = state;
  const { grosorPiezaMm, largoDobladoMm, altoDobladoMm } = resultado;
  const { corrugado, estrategia, esMejor } = currentSelection();
  const estiba = calcularEstibaEnTarima(corrugado);
  const fecha = new Date().toLocaleDateString('es-MX');

  const usarExtendida = !!state.alturaExtendida;
  const camasMostradas = usarExtendida ? estiba.camasExtendidas : estiba.camas;
  const totalMostrado = usarExtendida ? estiba.totalExtendido : estiba.total;

  const camasFilas = estrategia.camas.map((c, i) => `
    <tr>
      <td class="label"><span class="dot" style="background:${i === 0 ? '#0060b0' : '#5090c0'}"></span>Cama ${i + 1} — ${c.orientacionLabel}</td>
      <td class="value">${c.cols} × ${c.filas} postetas × ${c.piezasPorPosteta} pzs/posteta</td>
      <td class="value" style="text-align:right;">${c.total} pzs</td>
    </tr>
  `).join('');

  const corrLegend = Array.from({ length: camasMostradas }).map((_, i) => `
    <span><span class="dot" style="background:${i === 0 ? '#c49a5e' : '#b3854a'}"></span>Cama ${i + 1}: ${pisoLabel(estiba.piso)}</span>
  `).join('');

  container.innerHTML = `
    ${renderListaCorrugados()}
    ${renderControls()}

    <div class="af-card" id="card-scene-product">
      <h2>Vista 3D — postetas dentro del corrugado</h2>
      <p class="af-card-hint">
        ${corrugado.id} — ${estrategiaLabel(estrategia)}
        ${esMejor ? '<span class="badge" style="margin-left:8px;">Recomendado</span>' : ''}
      </p>
      <div id="scene3d-product"></div>
      <table class="ficha-data-table" style="margin-top:14px;">
        ${camasFilas}
        <tr>
          <td class="label" colspan="2">Total de piezas por corrugado</td>
          <td class="value" style="text-align:right; font-size:16px; color:var(--af-blue);">${estrategia.total} pzs</td>
        </tr>
      </table>
    </div>

    <div class="af-card">
      <h2>Vista 3D — corrugados sobre la tarima</h2>
      <p class="af-card-hint">
        Tarima ${TARIMA.largo_cm}×${TARIMA.ancho_cm} cm (aprox., usa medidas internas del corrugado)
      </p>
      <div id="scene3d-pallet"></div>
      <div class="cama-legend">${corrLegend}</div>
      <div class="stat-strip">
        <div class="stat"><div class="num">${estiba.piso.total}</div><div class="lbl">Cantidad por cama</div></div>
        <div class="stat"><div class="num">${camasMostradas}</div><div class="lbl">Estiba (camas)</div></div>
        <div class="stat"><div class="num">${totalMostrado}</div><div class="lbl">Corrugados por tarima</div></div>
        <div class="stat"><div class="num">${totalMostrado * estrategia.total}</div><div class="lbl">Piezas por tarima</div></div>
      </div>
      ${estiba.piso.extra > 0 ? `<div class="af-note" style="margin-top:14px;">Este acomodo mezcla orientaciones: ${estiba.piso.principal} corrugados en la orientación principal + ${estiba.piso.extra} rotados 90° aprovechando la tira sobrante.</div>` : ''}
      ${estiba.excedeAlturaNormal ? `
        <div class="af-note" style="margin-top:14px; background:#fdeaea; border-color:#e8b4b4; color:#8a2a2a;">
          <b>⚠️ Aviso de altura:</b> con ${estiba.camas} cama${estiba.camas > 1 ? 's' : ''} el bulto mide dentro del alto útil normal (${TARIMA.alto_util_cm} cm).
          Esta tarima admite hasta ${estiba.camasExtendidas} camas si se permite llegar al alto total de la tarima (${TARIMA.alto_total_cm} cm) — eso da ${estiba.totalExtendido} corrugados en vez de ${estiba.total}, pero excede el límite normal de manejo.
          <label style="display:block; margin-top:8px; font-weight:600;">
            <input type="checkbox" id="chk-altura-extendida" ${usarExtendida ? 'checked' : ''}> Mostrar opción extendida (${estiba.camasExtendidas} camas)
          </label>
        </div>
      ` : ''}
    </div>

    <div class="ficha">
      <div class="ficha-header">
        <div class="ficha-title-block">
          <h1>Ficha de Embalaje</h1>
          <div class="meta-line">Artículo: <b>${input.articulo || '—'}</b></div>
          <div class="meta-line">Cliente: <b>${input.cliente || '—'}</b></div>
        </div>
        <div class="ficha-code-table">
          <table>
            <tr><td>Código de producto</td><td>${input.codigo || '—'}</td></tr>
            <tr><td>Fecha</td><td>${fecha}</td></tr>
            <tr><td>Realizado</td><td>${input.realizado || '—'}</td></tr>
            <tr><td>Aprobado</td><td><span class="badge">Borrador</span></td></tr>
          </table>
        </div>
      </div>

      <table class="ficha-data-table">
        <tr>
          <td class="label">Tipo de Caja</td><td class="value">${corrugado.id}</td>
          <td class="label">Cantidad por Cama</td><td class="value">${pisoLabel(estiba.piso)}</td>
        </tr>
        <tr>
          <td class="label">Dimensiones Internas</td><td class="value">${corrugado.largo} × ${corrugado.ancho} × ${corrugado.alto} mm</td>
          <td class="label">Estiba</td><td class="value">${camasMostradas} cajas${usarExtendida ? ' ⚠️ excede alto normal' : ''}</td>
        </tr>
        <tr>
          <td class="label">Tarima</td><td class="value">${TARIMA.largo_cm} × ${TARIMA.ancho_cm} cm</td>
          <td class="label">Postetas por corrugado</td><td class="value">${estrategiaLabel(estrategia)}</td>
        </tr>
        <tr>
          <td class="label">Total de Piezas</td><td class="value" style="font-size:16px; color:var(--af-blue);">${estrategia.total} pzs</td>
          <td class="label">Peso de las piezas</td>
          <td class="value">${pesoPiezaG != null ? `${fmt((pesoPiezaG * estrategia.total) / 1000, 2)} kg (sin el corrugado)` : '— (falta ancho/alto de la lámina)'}</td>
        </tr>
        <tr>
          <td class="label">Corrugados por tarima</td><td class="value">${totalMostrado}</td>
          <td class="label">Piezas por tarima</td><td class="value" style="font-size:16px; color:var(--af-blue);">${totalMostrado * estrategia.total} pzs</td>
        </tr>
      </table>

      <div class="ficha-footer">AF-FR-PP-02 FICHA DE EMBALAJE — Prototipo v1</div>
    </div>

    <div class="af-card">
      <div class="af-actions">
        <button class="af-btn af-btn-ghost" id="btn-pdf" disabled title="Próximo paso: exportar a PDF">Exportar PDF (próximamente)</button>
      </div>
    </div>
  `;

  renderProductScene($('#scene3d-product'), { corrugado, estrategia, grosorPiezaMm });
  renderPalletScene($('#scene3d-pallet'), { corrugado, estiba, useExtendida: usarExtendida });

  $$('.corr-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.corrugadoId = btn.dataset.corr;
      state.acomodoIndex = 0;
      render({ scrollToScene: true });
    });
  });
  $('#sel-estrategia').addEventListener('change', (e) => {
    state.acomodoIndex = Number(e.target.value);
    render({ scrollToScene: true });
  });
  const chkExtendida = $('#chk-altura-extendida');
  if (chkExtendida) {
    chkExtendida.addEventListener('change', (e) => {
      state.alturaExtendida = e.target.checked;
      render();
    });
  }

  if (scrollToScene) {
    $('#card-scene-product').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

$('#ficha-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const input = {
    cliente: $('#cliente').value.trim(),
    articulo: $('#articulo').value.trim(),
    codigo: $('#codigo').value.trim(),
    realizado: $('#realizado').value.trim(),
    largo: Number($('#largo').value),
    ancho: Number($('#ancho').value),
    alto: Number($('#alto').value),
    tipoCarton: tipoCartonSelect.value,
    calibre: tipoCartonSelect.value === 'solido' ? Number(calibreSelect.value) : calibreSelect.value,
    material: materialSelect.value,
    pegue: $('#pegue').value,
    laminaAncho: Number($('#laminaAncho').value) || null,
    laminaAlto: Number($('#laminaAlto').value) || null,
  };

  const resultado = calcularMejorEmpaque(input);
  const pesoPiezaG = calcularPesoPiezaG(input);

  if (resultado.error) {
    state = { input, resultado };
  } else {
    state = { input, resultado, pesoPiezaG, corrugadoId: resultado.corrugadoId, acomodoIndex: 0 };
  }
  render();
});

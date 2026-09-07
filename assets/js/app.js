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
}

tipoCartonSelect.addEventListener('change', poblarCalibres);
poblarCalibres();

function fmt(n, dec = 1) {
  return Number(n).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Estado del último cálculo, para que los selectores manuales de
// corrugado/orientación puedan re-renderizar sin recalcular el grosor.
let state = null;

function currentSelection() {
  const entry = state.resultado.porCorrugado.find((p) => p.corrugado.id === state.corrugadoId);
  const opcion = entry.opciones[state.acomodoIndex];
  return { corrugado: entry.corrugado, acomodo: opcion, esMejor: entry.corrugado.id === state.resultado.porCorrugado[0].corrugado.id && state.acomodoIndex === 0 };
}

function renderControls() {
  const { porCorrugado } = state.resultado;
  const mejorId = porCorrugado[0].corrugado.id;
  const entry = porCorrugado.find((p) => p.corrugado.id === state.corrugadoId);

  const corrugadoOptions = porCorrugado.map((p) => `
    <option value="${p.corrugado.id}" ${p.corrugado.id === state.corrugadoId ? 'selected' : ''}>
      ${p.corrugado.id}${p.corrugado.id === mejorId ? ' (mejor)' : ''} — ${p.opciones[0].total} pzs
    </option>
  `).join('');

  const orientacionOptions = entry.opciones.map((o, i) => `
    <option value="${i}" ${i === state.acomodoIndex ? 'selected' : ''}>
      ${o.cols} × ${o.filas} postetas × ${o.piezasPorPosteta} pzs/posteta = ${o.total} pzs
    </option>
  `).join('');

  return `
    <div class="af-card">
      <h2>Comparar corrugado y orientación</h2>
      <p class="af-card-hint">Cambia manualmente para comparar contra la recomendación automática.</p>
      <div class="af-row2">
        <div class="af-field">
          <label>Corrugado</label>
          <select id="sel-corrugado">${corrugadoOptions}</select>
        </div>
        <div class="af-field">
          <label>Orientación</label>
          <select id="sel-orientacion">${orientacionOptions}</select>
        </div>
      </div>
    </div>
  `;
}

function render() {
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

  const { input, resultado } = state;
  const { grosorPiezaMm, largoDobladoMm, altoDobladoMm } = resultado;
  const { corrugado, acomodo, esMejor } = currentSelection();
  const estiba = calcularEstibaEnTarima(corrugado);
  const fecha = new Date().toLocaleDateString('es-MX');

  const corrLegend = Array.from({ length: estiba.camas }).map((_, i) => `
    <span><span class="dot" style="background:${i === 0 ? '#c49a5e' : '#b3854a'}"></span>Cama de corrugados ${i + 1}: ${estiba.porCama} cajas</span>
  `).join('');

  container.innerHTML = `
    ${renderControls()}

    <div class="af-card">
      <h2>Vista 3D — postetas dentro del corrugado</h2>
      <p class="af-card-hint">
        ${corrugado.id} — ${acomodo.cols} × ${acomodo.filas} postetas de ${acomodo.piezasPorPosteta} pzs cada una
        ${esMejor ? '<span class="badge" style="margin-left:8px;">Recomendado</span>' : ''}
      </p>
      <div id="scene3d-product"></div>
      <div class="stat-strip">
        <div class="stat"><div class="num">${acomodo.cols} × ${acomodo.filas}</div><div class="lbl">Postetas por corrugado</div></div>
        <div class="stat"><div class="num">${acomodo.piezasPorPosteta}</div><div class="lbl">Piezas por posteta</div></div>
        <div class="stat"><div class="num">${acomodo.total}</div><div class="lbl">Total de piezas</div></div>
      </div>
    </div>

    <div class="af-card">
      <h2>Vista 3D — corrugados sobre la tarima</h2>
      <p class="af-card-hint">
        Tarima ${TARIMA.largo_cm}×${TARIMA.ancho_cm} cm, alto útil ${TARIMA.alto_util_cm} cm (aprox., usa medidas internas del corrugado)
      </p>
      <div id="scene3d-pallet"></div>
      <div class="cama-legend">${corrLegend}</div>
      <div class="stat-strip">
        <div class="stat"><div class="num">${estiba.cols} × ${estiba.filas}</div><div class="lbl">Corrugados por cama</div></div>
        <div class="stat"><div class="num">${estiba.camas}</div><div class="lbl">Camas en la tarima</div></div>
        <div class="stat"><div class="num">${estiba.total}</div><div class="lbl">Corrugados por tarima</div></div>
        <div class="stat"><div class="num">${estiba.total * acomodo.total}</div><div class="lbl">Piezas por tarima</div></div>
      </div>
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
          <td class="label">Tipo de corrugado</td><td class="value">${corrugado.id}</td>
          <td class="label">Postetas por corrugado</td><td class="value">${acomodo.cols} × ${acomodo.filas} = ${acomodo.postetasPorCama}</td>
        </tr>
        <tr>
          <td class="label">Dimensiones internas corrugado</td><td class="value">${corrugado.largo} × ${corrugado.ancho} × ${corrugado.alto} mm</td>
          <td class="label">Piezas por posteta</td><td class="value">${acomodo.piezasPorPosteta}</td>
        </tr>
        <tr>
          <td class="label">Caja doblada (largo × alto)</td><td class="value">${fmt(largoDobladoMm)} × ${fmt(altoDobladoMm)} mm</td>
          <td class="label">Grosor por pieza</td><td class="value">${fmt(grosorPiezaMm, 2)} mm</td>
        </tr>
        <tr>
          <td class="label">Corrugados por tarima</td><td class="value">${estiba.total}</td>
          <td class="label">Total de piezas por corrugado</td><td class="value" style="font-size:16px; color:var(--af-blue);">${acomodo.total} pzs</td>
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

  renderProductScene($('#scene3d-product'), { corrugado, acomodo, grosorPiezaMm });
  renderPalletScene($('#scene3d-pallet'), { corrugado, estiba });

  $('#sel-corrugado').addEventListener('change', (e) => {
    state.corrugadoId = e.target.value;
    state.acomodoIndex = 0;
    render();
  });
  $('#sel-orientacion').addEventListener('change', (e) => {
    state.acomodoIndex = Number(e.target.value);
    render();
  });
}

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
    pegue: $('#pegue').value,
  };

  const resultado = calcularMejorEmpaque(input);

  if (resultado.error) {
    state = { input, resultado };
  } else {
    state = { input, resultado, corrugadoId: resultado.corrugadoId, acomodoIndex: 0 };
  }
  render();
});

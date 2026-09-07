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

function renderFicha(input, resultado) {
  const container = $('#preview-container');

  if (resultado.error) {
    container.innerHTML = `
      <div class="af-card">
        <div class="af-empty-state">
          <div style="color:#c0392b; font-weight:600;">${resultado.error}</div>
        </div>
      </div>`;
    return;
  }

  const { corrugado, acomodo, grosorMm, cajaExteriorMm, alternativas } = resultado;
  const fecha = new Date().toLocaleDateString('es-MX');

  const altHtml = alternativas.map((a) => `
    <div class="alt-row">
      <span>${a.corrugado.id} <span style="color:var(--af-ink-soft)">(${a.corrugado.largo}×${a.corrugado.ancho}×${a.corrugado.alto} mm)</span></span>
      <span class="qty">${a.acomodo.total} pzs</span>
    </div>
  `).join('');

  const legend = Array.from({ length: acomodo.camas }).map((_, i) => `
    <span><span class="dot" style="background:${i === 0 ? '#0060b0' : '#5090c0'}"></span>Cama ${i + 1}: ${acomodo.porCama} pzs</span>
  `).join('');

  container.innerHTML = `
    <div class="af-card">
      <h2>Vista 3D interactiva</h2>
      <p class="af-card-hint">${corrugado.id} — ${acomodo.camas} cama${acomodo.camas > 1 ? 's' : ''} de ${acomodo.porCama} pzs cada una (${acomodo.cols} × ${acomodo.filas})</p>
      <div id="scene3d-mount"></div>
      <div class="cama-legend">${legend}</div>
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

      <div class="ficha-body">
        <div class="ficha-diagram">
          <h3>Empaque</h3>
          <svg width="220" height="160" viewBox="0 0 220 160">
            <polygon points="40,60 120,40 200,60 120,80" fill="#eaf3fb" stroke="#0b2a4a" stroke-width="1.5"/>
            <polygon points="40,60 40,130 120,150 120,80" fill="#d7e3ee" stroke="#0b2a4a" stroke-width="1.5"/>
            <polygon points="120,80 120,150 200,130 200,60" fill="#c3d6e8" stroke="#0b2a4a" stroke-width="1.5"/>
          </svg>
          <div style="font-size:12px; color:var(--af-ink-soft);">
            ${corrugado.largo} × ${corrugado.ancho} × ${corrugado.alto} mm (${corrugado.id})
          </div>
        </div>
        <div class="ficha-diagram">
          <h3>Entarimado</h3>
          <svg width="180" height="160" viewBox="0 0 180 160">
            <polygon points="30,140 90,160 150,140 90,120" fill="#c3d6e8" stroke="#0b2a4a" stroke-width="1.5"/>
            ${Array.from({ length: Math.min(acomodo.camas, 4) }).map((_, i) => `
              <rect x="45" y="${100 - i * 22}" width="90" height="18" fill="${i % 2 === 0 ? '#5090c0' : '#0060b0'}" stroke="#0b2a4a" stroke-width="1"/>
            `).join('')}
          </svg>
          <div style="font-size:12px; color:var(--af-ink-soft);">Tarima ${TARIMA.largo_cm}×${TARIMA.ancho_cm} cm · alto útil ${TARIMA.alto_util_cm} cm</div>
        </div>
      </div>

      <table class="ficha-data-table">
        <tr>
          <td class="label">Tipo de corrugado</td><td class="value">${corrugado.id}</td>
          <td class="label">Acomodo por cama</td><td class="value">${acomodo.cols} × ${acomodo.filas} = ${acomodo.porCama} pzs</td>
        </tr>
        <tr>
          <td class="label">Dimensiones internas corrugado</td><td class="value">${corrugado.largo} × ${corrugado.ancho} × ${corrugado.alto} mm</td>
          <td class="label">Camas dentro del corrugado</td><td class="value">${acomodo.camas}</td>
        </tr>
        <tr>
          <td class="label">Caja + grosor de cartón</td><td class="value">${fmt(cajaExteriorMm[0])} × ${fmt(cajaExteriorMm[1])} × ${fmt(cajaExteriorMm[2])} mm</td>
          <td class="label">Grosor aplicado</td><td class="value">${fmt(grosorMm, 2)} mm</td>
        </tr>
        <tr>
          <td class="label">Total de piezas por corrugado</td><td class="value" colspan="3" style="font-size:16px; color:var(--af-blue);">${acomodo.total} pzs</td>
        </tr>
      </table>

      <div class="ficha-footer">AF-FR-PP-02 FICHA DE EMBALAJE — Prototipo v1</div>
    </div>

    <div class="af-card alt-list">
      <h2>Otros corrugados evaluados</h2>
      <p class="af-card-hint">Se eligió ${corrugado.id} por dar el mayor total de piezas. Comparación con las siguientes 3 opciones:</p>
      ${altHtml || '<div style="font-size:13px;color:var(--af-ink-soft)">No hay otras opciones donde la caja quepa.</div>'}
    </div>

    <div class="af-card">
      <div class="af-actions">
        <button class="af-btn af-btn-ghost" id="btn-pdf" disabled title="Próximo paso: exportar a PDF">Exportar PDF (próximamente)</button>
      </div>
    </div>
  `;

  renderBox3D($('#scene3d-mount'), { corrugado, acomodo });
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
  renderFicha(input, resultado);
});

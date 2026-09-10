const $ = (sel) => document.querySelector(sel);

function estadoOcr(html, clase = '') {
  $('#ocr-estado').innerHTML = html ? `<div class="ocr-estado ${clase}">${html}</div>` : '';
}

$('#dieline-img').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const box = $('#dieline-preview');
  if (!file) {
    box.innerHTML = '';
    estadoOcr('');
    return;
  }

  const url = URL.createObjectURL(file);
  box.innerHTML = `<img src="${url}" style="max-width:100%;border-radius:8px;border:1px solid var(--af-border);margin-top:6px;">`;

  try {
    estadoOcr('<span class="ocr-spinner"></span> Preparando la imagen…', 'ocr-trabajando');
    const { numeros, sugerencia } = await leerMedidasDeTroquel(file, (txt) => {
      estadoOcr(`<span class="ocr-spinner"></span> ${txt}`, 'ocr-trabajando');
    });

    // Todos los números detectados quedan disponibles en cada campo,
    // para corregir de un clic si alguno cayó en el lugar equivocado.
    $('#medidas-detectadas').innerHTML = numeros
      .map((n) => `<option value="${n.valor}"></option>`).join('');

    if (!sugerencia) {
      estadoOcr(
        `No pude leer medidas claras en la imagen (detecté ${numeros.length}). Captúralas a mano abajo.`,
        'ocr-aviso',
      );
      return;
    }

    if (sugerencia.laminaAncho) $('#laminaAncho').value = sugerencia.laminaAncho;
    if (sugerencia.laminaAlto) $('#laminaAlto').value = sugerencia.laminaAlto;
    if (sugerencia.largo) $('#largo').value = sugerencia.largo;
    if (sugerencia.ancho) $('#ancho').value = sugerencia.ancho;

    const faltantes = ['largo', 'ancho', 'laminaAncho', 'laminaAlto'].filter((k) => !$(`#${k}`).value);
    const chips = sugerencia.todos.map((v) => `<span class="ocr-chip">${v}</span>`).join('');

    estadoOcr(`
      <b>Medidas detectadas:</b> ${chips}
      <div class="ocr-nota">
        ${faltantes.length
          ? `Faltó llenar ${faltantes.length} campo(s); complétalos a mano.`
          : 'Ya llené los 4 campos.'}
        <b>Verifica que cada número esté en el campo correcto</b> — si alguno quedó mal,
        cada campo te ofrece la lista completa de números detectados.
      </div>
    `, 'ocr-listo');
  } catch (err) {
    estadoOcr(
      `No se pudo leer la imagen automáticamente (${err.message}) Captura las medidas a mano abajo.`,
      'ocr-aviso',
    );
  }
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
  $('#label-material').textContent = tipo === 'solido' ? 'Material (para el peso)' : 'Liner (para el peso, 12 pt)';
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

// Resume 1 cama: cuántas postetas lleva y cómo están acomodadas.
// Ej. "Parada 2×1 piso × 26 a lo alto = 52 postetas".
function camaLabel(c) {
  const piso = c.extra > 0
    ? `${c.cols}×${c.filas} + ${c.extraCols}×${c.extraFilas} rotadas`
    : `${c.cols}×${c.filas}`;
  const enEje = c.postetasEnEje > 1 ? ` × ${c.postetasEnEje} a lo alto` : '';
  return `${c.orientacionLabel} ${piso} piso${enEje} = ${c.postetasPorCama} postetas`;
}

// Resume una estrategia (1 o varias camas, posiblemente con ejes distintos)
// en una sola línea legible, ej: "Parada 2×1×260 + Acostada (a lo largo) 1×3×5".
function estrategiaLabel(estrategia) {
  return estrategia.camas.map(camaLabel).join(' + ');
}

// Resume el piso de una cama de la tarima: "6 cajas" o, si mezcla
// orientaciones, "6 cajas (4 + 2 rotadas)".
function pisoLabel(piso) {
  return piso.extra > 0 ? `${piso.total} cajas (${piso.principal} + ${piso.extra} rotadas)` : `${piso.total} cajas`;
}

// Estado del último cálculo, para que los selectores manuales de
// corrugado/estrategia puedan re-renderizar sin recalcular el grosor.
let state = null;

/** Altura en cm a partir de mm, con un decimal solo si hace falta. */
function alturaCm(mm) {
  const v = Math.round(mm / 10 * 10) / 10;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} cm`;
}

/**
 * Desglose de la altura del bulto, con la cifra EXACTA de cada opción y
 * por cuánto se pasa del límite. La suma se escribe completa
 * (tarima + camas x alto) para que se pueda auditar a mano.
 */
function alturaLineaHTML(opcion, corrugado, estiba, etiqueta) {
  const suma = `${alturaCm(estiba.altoTarimaMm)} de tarima + ${opcion.camas} × ${corrugado.alto} mm`;
  const veredicto = opcion.excesoMm > 0
    ? `<b style="color:#8a2a2a;">se pasa ${alturaCm(opcion.excesoMm)}</b>`
    : `<b style="color:#14603a;">dentro del límite</b> (sobran ${alturaCm(estiba.altoMaxTotalMm - opcion.totalMm)})`;
  return `<div style="margin-top:4px;">${etiqueta}: ${suma} = <b>${alturaCm(opcion.totalMm)}</b> de bulto — ${veredicto}</div>`;
}

function alturaAvisoHTML(estiba, corrugado, usarExtendida) {
  const { segura, extendida } = estiba;
  // Si hasta la opción segura se pasa, el corrugado es más alto que el
  // espacio útil y no hay acomodo dentro del límite.
  const rojo = segura.excesoMm > 0 || usarExtendida;
  return `
    <div class="af-note" style="margin-top:14px; ${rojo
      ? 'background:#fdeaea; border-color:#e8b4b4; color:#8a2a2a;'
      : 'background:#eef6fb; border-color:#a9cbe4; color:#1a3f5c;'}">
      <b>Altura del bulto</b> — límite de ${alturaCm(estiba.altoMaxTotalMm)} (${alturaCm(estiba.altoUtilMm)} de carga sobre ${alturaCm(estiba.altoTarimaMm)} de tarima):
      ${alturaLineaHTML(segura, corrugado, estiba, `Normal, ${segura.camas} cama${segura.camas > 1 ? 's' : ''} (${estiba.total} corrugados)`)}
      ${alturaLineaHTML(extendida, corrugado, estiba, `Extendida, ${extendida.camas} camas (${estiba.totalExtendido} corrugados)`)}
      <label style="display:block; margin-top:8px; font-weight:600;">
        <input type="checkbox" id="chk-altura-extendida" ${usarExtendida ? 'checked' : ''}>
        Usar la opción extendida — ${extendida.camas} camas, ${alturaCm(extendida.totalMm)} de bulto (${alturaCm(extendida.excesoMm)} por encima del límite)
      </label>
    </div>
  `;
}

function currentSelection() {
  const entry = state.resultado.porCorrugado.find((p) => p.corrugado.id === state.corrugadoId);

  // El tamaño de posteta se puede forzar desde la UI; si no, va el que
  // maximiza (ya elegido por el motor).
  const forzado = state.piezasPorPosteta
    ? entry.tamanos.find((t) => t.piezas === state.piezasPorPosteta)
    : null;
  const estrategias = forzado ? forzado.estrategias : entry.opciones;
  const idx = Math.min(state.acomodoIndex, estrategias.length - 1);

  return {
    entry,
    estrategias,
    corrugado: entry.corrugado,
    estrategia: estrategias[idx],
    esMejor: entry.corrugado.id === state.resultado.porCorrugado[0].corrugado.id
      && idx === 0 && !forzado,
  };
}

/**
 * Tamaños de posteta que vale la pena ofrecer: los que quedan cerca del
 * máximo (a lo más 10% abajo), para poder cambiar a un bulto más
 * manejable viendo exactamente cuántas piezas cuesta.
 */
function tamanosOfrecidos(entry) {
  const max = Math.max(...entry.tamanos.map((t) => t.total));
  return entry.tamanos
    .filter((t) => t.total >= max * 0.9)
    .sort((a, b) => a.piezas - b.piezas)
    .slice(0, 12)
    .map((t) => ({ ...t, esMax: t.total === max }));
}

function renderListaCorrugados() {
  const { porCorrugado } = state.resultado;

  // Los dos criterios no siempre coinciden: un corrugado puede llevar
  // más cajas él solo y aun así rendir menos por tarima (o al revés).
  // Se marcan los dos para poder comparar.
  const idMenosTarimas = [...porCorrugado].sort((a, b) => b.piezasPorTarima - a.piezasPorTarima)[0].corrugado.id;
  const idMasPorCorrugado = [...porCorrugado].sort((a, b) => b.opciones[0].total - a.opciones[0].total)[0].corrugado.id;
  const coinciden = idMenosTarimas === idMasPorCorrugado;

  const ordenarPor = state.ordenarPor || 'tarima';
  const ordenados = [...porCorrugado].sort((a, b) => (
    ordenarPor === 'corrugado'
      ? b.opciones[0].total - a.opciones[0].total
      : b.piezasPorTarima - a.piezasPorTarima
  ));

  const filas = ordenados.map((p) => {
    const mejorEstrategia = p.opciones[0];
    const activo = p.corrugado.id === state.corrugadoId;
    const ganaTarima = p.corrugado.id === idMenosTarimas;
    const ganaCorrugado = p.corrugado.id === idMasPorCorrugado;

    const badges = [
      ganaTarima ? '<span class="badge badge-tarima">Menos tarimas</span>' : '',
      ganaCorrugado ? '<span class="badge badge-corrugado">Más por corrugado</span>' : '',
    ].join(' ');

    return `
      <button type="button" class="corr-row ${activo ? 'corr-row-active' : ''}" data-corr="${p.corrugado.id}">
        <span class="corr-row-id">${p.corrugado.id} ${badges}</span>
        <span class="corr-row-dims">${p.corrugado.largo} × ${p.corrugado.ancho} × ${p.corrugado.alto} mm</span>
        <span class="corr-row-detail">
          <span class="corr-posteta">Posteta de ${p.piezasPorPosteta} pzs</span>
          ${estrategiaLabel(mejorEstrategia)}
        </span>
        <span class="corr-metric ${ganaCorrugado ? 'corr-metric-gana' : ''}">
          <span class="corr-metric-num">${mejorEstrategia.total}</span>
          <span class="corr-metric-lbl">pzs / corrugado</span>
        </span>
        <span class="corr-metric ${ganaTarima ? 'corr-metric-gana' : ''}">
          <span class="corr-metric-num">${p.piezasPorTarima}</span>
          <span class="corr-metric-lbl">pzs / tarima</span>
        </span>
      </button>
    `;
  }).join('');

  return `
    <div class="af-card">
      <div class="corr-list-head">
        <div>
          <h2>Todas las opciones de corrugado</h2>
          <p class="af-card-hint">
            ${coinciden
              ? 'En este caso el mismo corrugado gana en los dos criterios.'
              : `Los dos criterios <b>no coinciden</b>: ${idMasPorCorrugado} lleva más cajas por corrugado, pero ${idMenosTarimas} rinde más por tarima.`}
            Haz clic en una opción para verla en 3D.
          </p>
        </div>
        <div class="corr-sort">
          <span class="corr-sort-lbl">Ordenar por</span>
          <button type="button" class="corr-sort-btn ${ordenarPor === 'tarima' ? 'corr-sort-activo' : ''}" data-orden="tarima">Por tarima</button>
          <button type="button" class="corr-sort-btn ${ordenarPor === 'corrugado' ? 'corr-sort-activo' : ''}" data-orden="corrugado">Por corrugado</button>
        </div>
      </div>
      <div class="corr-list">${filas}</div>
    </div>
  `;
}

function renderControls() {
  const { entry, estrategias, estrategia } = currentSelection();
  const esSolido = state.input.tipoCarton === 'solido';
  const rango = esSolido ? '20 a 25' : '5 a 10';

  const estrategiaOptions = estrategias.map((e, i) => `
    <option value="${i}" ${i === Math.min(state.acomodoIndex, estrategias.length - 1) ? 'selected' : ''}>
      ${estrategiaLabel(e)} = ${e.total} pzs
    </option>
  `).join('');

  const chips = tamanosOfrecidos(entry).map((t) => `
    <button type="button" class="posteta-chip ${t.piezas === estrategia.piezasPorPosteta ? 'posteta-chip-activo' : ''}"
            data-posteta="${t.piezas}" title="${t.total} piezas por corrugado">
      <span class="posteta-chip-num">${t.piezas}</span>
      <span class="posteta-chip-total">${t.total} pzs${t.esMax ? ' · máx' : ''}</span>
    </button>
  `).join('');

  return `
    <div class="af-card">
      <h2>Posteta y acomodo para ${entry.corrugado.id}</h2>
      <p class="af-card-hint">
        Tamaño de posteta (piezas por grupo). Solo cuentan las postetas completas, así que
        ninguna cama queda con postetas volando. Para ${esSolido ? 'cartón sólido' : 'microcorrugado'}
        conviene quedar entre <b>${rango}</b> piezas; el motor prioriza el total y entre empates
        elige el más cercano a ese rango.
      </p>
      <div class="posteta-chips">${chips}</div>
      <div class="af-field" style="margin-top:14px;">
        <label>Acomodo de camas</label>
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
  const alturaElegida = usarExtendida ? estiba.extendida : estiba.segura;

  const totalPostetas = estrategia.camas.reduce((s, c) => s + c.postetasPorCama, 0);

  const camasFilas = estrategia.camas.map((c, i) => `
    <tr>
      <td class="label"><span class="dot" style="background:${CAMA_COLOR_HEX[i % CAMA_COLOR_HEX.length]}"></span>Cama ${i + 1} — ${c.orientacionLabel}</td>
      <td class="value">
        <b>${c.postetasPorCama} postetas</b> de ${c.piezasPorPosteta} pzs
        <br><span style="color:var(--af-ink-soft); font-size:12px;">
          ${c.cols} × ${c.filas} en el piso${c.postetasEnEje > 1 ? ` × ${c.postetasEnEje} apiladas` : ''}
          ${c.extra > 0 ? `· + ${c.extraCols} × ${c.extraFilas} rotadas 90° en la tira sobrante` : ''}
        </span>
      </td>
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
      <div class="posteta-destacada">
        <div>
          <span class="posteta-num">${estrategia.piezasPorPosteta}</span>
          <span class="posteta-lbl">piezas por posteta</span>
        </div>
        <div class="posteta-detalle">
          ${corrugado.id}: <b>${totalPostetas} postetas</b> de ${estrategia.piezasPorPosteta} pzs = ${estrategia.total} piezas
          ${esMejor ? '<span class="badge" style="margin-left:6px;">Recomendado</span>' : ''}
        </div>
      </div>
      <p class="af-card-hint">${estrategiaLabel(estrategia)}</p>
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
      ${alturaAvisoHTML(estiba, corrugado, usarExtendida)}
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
          <td class="label">Estiba</td>
          <td class="value">${camasMostradas} cajas — bulto de ${alturaCm(alturaElegida.totalMm)}${
            alturaElegida.excesoMm > 0
              ? ` <span style="color:#8a2a2a;">⚠️ se pasa ${alturaCm(alturaElegida.excesoMm)}</span>`
              : ''}</td>
        </tr>
        <tr>
          <td class="label">Caja armada</td><td class="value">${input.largo} × ${input.ancho} × ${input.alto} mm</td>
          <td class="label">Caja doblada</td><td class="value">${fmt(largoDobladoMm)} × ${fmt(altoDobladoMm)} mm</td>
        </tr>
        <tr>
          <td class="label">Tarima</td><td class="value">${TARIMA.largo_cm} × ${TARIMA.ancho_cm} cm</td>
          <td class="label">Postetas por corrugado</td><td class="value">${estrategiaLabel(estrategia)}</td>
        </tr>
        <tr>
          <td class="label">Total de Piezas</td><td class="value" style="font-size:16px; color:var(--af-blue);">${estrategia.total} pzs</td>
          <td class="label">Peso bruto por corrugado</td>
          <td class="value">${pesoPiezaG != null
            ? `${fmt((pesoPiezaG * estrategia.total) / 1000 + (calcularPesoCorrugadoG(corrugado) || 0) / 1000, 2)} kg`
              + ` <span style="font-weight:400; color:var(--af-ink-soft);">(${fmt((pesoPiezaG * estrategia.total) / 1000, 2)} piezas + ${fmt((calcularPesoCorrugadoG(corrugado) || 0) / 1000, 2)} corrugado)</span>`
            : '— (falta ancho/alto de la lámina)'}</td>
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
        <button class="af-btn af-btn-primary" id="btn-pdf">Exportar PDF (ficha de embalaje)</button>
      </div>
    </div>
  `;

  renderProductScene($('#scene3d-product'), { corrugado, estrategia, grosorPiezaMm });
  renderPalletScene($('#scene3d-pallet'), { corrugado, estiba, useExtendida: usarExtendida });

  $('#btn-pdf').addEventListener('click', () => {
    const pesoTotalKg = pesoPiezaG != null ? (pesoPiezaG * estrategia.total) / 1000 : null;
    renderPrintFicha({
      input, corrugado, estrategia, estiba, camasMostradas, totalMostrado, pesoTotalKg, fecha,
      grosorPiezaMm, largoDobladoMm, altoDobladoMm, alturaElegida,
    });
    window.print();
  });

  $$('.corr-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.corrugadoId = btn.dataset.corr;
      state.acomodoIndex = 0;
      // Cada corrugado tiene su propio tamaño óptimo de posteta.
      state.piezasPorPosteta = null;
      render({ scrollToScene: true });
    });
  });
  $$('.corr-sort-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ordenarPor = btn.dataset.orden;
      render();
    });
  });
  $$('.posteta-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.piezasPorPosteta = Number(btn.dataset.posteta);
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
    // Alto de la caja ARMADA. No entra en el cálculo de empaque (ese usa
    // el alto de la lámina), pero sí se documenta en la ficha.
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

const PREVIEW_VACIO = `
  <div class="af-card">
    <div class="af-empty-state">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#5090c0" stroke-width="1.4">
        <path d="M3 7l9-4 9 4-9 4-9-4z"/>
        <path d="M3 7v10l9 4 9-4V7"/>
        <path d="M12 11v10"/>
      </svg>
      <div>Completa el formulario y presiona <b>Calcular</b> para ver la ficha de embalaje.</div>
    </div>
  </div>
`;

// "Nueva ficha": deja todo en blanco para capturar otra caja desde cero.
$('#btn-nueva').addEventListener('click', () => {
  state = null;
  $('#ficha-form').reset();
  poblarCalibres();      // el reset regresa el tipo de cartón a sólido
  $('#dieline-preview').innerHTML = '';
  $('#medidas-detectadas').innerHTML = '';
  estadoOcr('');
  $('#print-ficha').innerHTML = '';
  $('#preview-container').innerHTML = PREVIEW_VACIO;
  $('#af-header-tag').textContent = 'Ficha nueva';
  $('#cliente').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Ejemplo precargado (medidas del troquel de ejemplo del proyecto), para
// que la herramienta abra mostrando un resultado real y no un formulario
// vacío. Se sobrescribe en cuanto el usuario captura sus propios datos.
(function precargarEjemplo() {
  $('#cliente').value = 'SALUTARE';
  $('#articulo').value = 'CAJA DE EJEMPLO';
  $('#codigo').value = 'FT-AF0001';
  $('#realizado').value = 'PREPRENSA';
  $('#largo').value = '271';
  $('#ancho').value = '115';
  $('#alto').value = '106';
  calibreSelect.value = '14';
  materialSelect.value = 'CAPLE CHILENO REV CAFE';
  $('#pegue').value = 'fondo_automatico';
  $('#laminaAncho').value = '786.45';
  $('#laminaAlto').value = '317.05';
  $('#ficha-form').requestSubmit();
})();

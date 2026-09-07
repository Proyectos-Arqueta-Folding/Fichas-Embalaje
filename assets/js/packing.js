/**
 * Motor de cálculo de empaque — v3 (multi-eje, multi-cama, confirmado con
 * el usuario 2026-09-07 y 2026-09-08).
 *
 * La caja de producto se maneja DOBLADA (plana), no armada en 3D. Una
 * "posteta" es una pila de piezas dobladas. La posteta puede apilarse a
 * lo largo de CUALQUIERA de los 3 ejes del corrugado (parada = apila en
 * el alto, acostada = apila en el largo o en el ancho) — el objetivo es
 * probar las 3 y quedarse con la que da más piezas.
 *
 * Además, dentro de un mismo corrugado puede haber VARIAS camas, y no
 * todas tienen que usar el mismo eje: si la primera cama (la mejor
 * opción pura) deja un sobrante de espacio en su eje de apilado, ese
 * sobrante se vuelve a evaluar como un mini-corrugado (probando otra vez
 * los 3 ejes) para minimizar el espacio muerto — así una cama puede
 * quedar parada y la siguiente acostada, aprovechando el hueco.
 */

/**
 * Medida DOBLADA (plana) de la caja, a partir de sus dimensiones armadas
 * (largo/ancho/alto). Verificada contra el ejemplo de troquel del usuario
 * (largo=271, ancho=115, alto=317.05, fondo automático -> doblada
 * 386 x 237.75 mm, que es justo lo que da esta fórmula):
 *
 *  - Largo doblado = largo + ancho (una cara del largo + una del ancho,
 *    porque el pegue sale de una ceja y el resto se pliega sobre sí
 *    mismo). Es geometría del plegado de los paneles laterales, no
 *    depende del tipo de pegue.
 *  - Alto doblado = alto x factor, donde factor quita la parte del fondo
 *    que no aporta a la altura doblada:
 *      - lineal: 1.0 (altura completa, el pegue es una costura de lado)
 *      - fondo automático: 0.75 (se quita la parte del fondo crash-lock)
 *      - charola: 1.0 (la charola va extendida, no hay reducción por
 *        plegado de fondo)
 *      - 4 esquinas: 1.0 como placeholder — PENDIENTE de confirmar con
 *        el usuario, se usa el mismo valor que lineal mientras tanto.
 */
const FACTOR_ALTO_DOBLADO = {
  lineal: 1.0,
  fondo_automatico: 0.75,
  charola: 1.0,
  cuatro_esquinas: 1.0, // pendiente de confirmar
};

function medidaDoblada({ largo, ancho, alto, pegue }) {
  const factor = FACTOR_ALTO_DOBLADO[pegue];
  if (factor == null) return null;
  return {
    largoDoblado: largo + ancho,
    altoDoblado: alto * factor,
  };
}

/** Grosor de una pieza doblada (en el punto más grueso, zona de pegue). */
function grosorPiezaMm({ tipo, calibre, pegue }) {
  const capas = CAPAS_POR_PEGUE[pegue]?.capas ?? 1;
  let espesorCapa;
  if (tipo === 'solido') {
    espesorCapa = ESPESOR_POR_CALIBRE[calibre];
  } else {
    espesorCapa = ESPESOR_MICROCORRUGADO[calibre]?.espesor;
  }
  if (!espesorCapa) return null;
  return espesorCapa * capas;
}

/**
 * Acomoda un rectángulo (f1 x f2, probando sus 2 orientaciones) en un
 * piso de dimA x dimB, y si sobra una tira después de la cuadrícula
 * principal, la rellena con MÁS rectángulos rotados 90° (mismo truco que
 * la tarima) — para no dejar espacio muerto ni dentro de una sola cama.
 * Regresa cols/filas de la cuadrícula principal, y extraCols/extraFilas
 * de los rotados en la tira sobrante (0 si no caben).
 */
function piso2D(dimA, dimB, f1, f2) {
  function intento(wA, wB) {
    const cols = Math.floor(dimA / wA);
    const filas = Math.floor(dimB / wB);
    const principal = cols * filas;
    const sobranteA = dimA - cols * wA;

    let extraCols = 0, extraFilas = 0, extra = 0;
    if (sobranteA >= wB) {
      extraCols = Math.floor(sobranteA / wB);
      extraFilas = Math.floor(dimB / wA);
      extra = extraCols * extraFilas;
    }

    return { cols, filas, principal, extraCols, extraFilas, extra, total: principal + extra, wA, wB };
  }

  const op1 = intento(f1, f2);
  const op2 = intento(f2, f1);
  return op1.total >= op2.total ? { ...op1, rotado: false } : { ...op2, rotado: true };
}

/**
 * Evalúa un espacio (largo/ancho/alto disponibles) contra una pieza
 * doblada, probando los 3 posibles ejes de apilado (parada = eje alto,
 * acostada = eje largo o ancho). Regresa TODAS las opciones válidas,
 * ordenadas de mayor a menor total de piezas.
 */
function evaluarEspacio({ largo, ancho, alto }, { largoDoblado, altoDoblado }, grosorPieza) {
  const candidatos = [];

  function agregar(ejeApilado, orientacionLabel, apiladas, dimA, dimB, ejeA, ejeB) {
    if (apiladas <= 0) return;
    const p = piso2D(dimA, dimB, largoDoblado, altoDoblado);
    if (p.total <= 0) return;
    candidatos.push({
      ejeApilado, orientacionLabel, apiladas,
      cols: p.cols, filas: p.filas, postetasPorCama: p.total,
      piezasPorPosteta: apiladas, total: p.total * apiladas,
      ejeA, ejeB, dimA: p.wA, dimB: p.wB,
      extraCols: p.extraCols, extraFilas: p.extraFilas, extra: p.extra,
    });
  }

  // Parada: se apila en el alto; el footprint doblado ocupa el piso (largo x ancho).
  agregar('alto', 'Parada', Math.floor(alto / grosorPieza), largo, ancho, 'largo', 'ancho');
  // Acostada (eje largo): se apila a lo largo del corrugado; el footprint
  // doblado ocupa la cara (ancho x alto).
  agregar('largo', 'Acostada (a lo largo)', Math.floor(largo / grosorPieza), ancho, alto, 'ancho', 'alto');
  // Acostada (eje ancho): se apila a lo ancho del corrugado; el footprint
  // doblado ocupa la cara (largo x alto).
  agregar('ancho', 'Acostada (a lo ancho)', Math.floor(ancho / grosorPieza), largo, alto, 'largo', 'alto');

  candidatos.sort((a, b) => b.total - a.total);
  return candidatos;
}

const MAX_CAMAS = 4;

/**
 * Busca, de forma EXHAUSTIVA (no golosa), la mejor combinación posible de
 * camas siguientes para un espacio sobrante dado — prueba TODAS las
 * opciones en cada paso (no solo la mejor de ese paso), recursivamente,
 * hasta agotar el espacio o llegar a MAX_CAMAS. Esto es necesario porque
 * la mejor cama 2 por sí sola no siempre lleva a la mejor combinación
 * total (ej. puede convenir usar 2 camas acostadas más chicas en vez de
 * 1 acostada que llene todo el sobrante, si eso deja mejor aprovechado
 * un eje distinto).
 */
function mejorContinuacion(slot, doblada, grosorPieza, camasRestantes) {
  if (camasRestantes <= 0) return { camas: [], total: 0 };

  const opciones = evaluarEspacio(slot, doblada, grosorPieza);
  let mejor = { camas: [], total: 0 }; // opción de no agregar más camas

  for (const opcion of opciones) {
    const siguienteSlot = { ...slot };
    siguienteSlot[opcion.ejeApilado] -= opcion.apiladas * grosorPieza;
    const sub = mejorContinuacion(siguienteSlot, doblada, grosorPieza, camasRestantes - 1);
    const total = opcion.total + sub.total;
    if (total > mejor.total) {
      mejor = { camas: [opcion, ...sub.camas], total };
    }
  }

  return mejor;
}

/**
 * Arma la MEJOR estrategia completa para un corrugado empezando con una
 * opción de primera cama dada, evaluando exhaustivamente todas las
 * combinaciones posibles de camas siguientes (parada/acostada, mezcladas
 * como haga falta) hasta agotar el espacio o llegar a MAX_CAMAS.
 */
function armarEstrategia(corrugadoDims, primeraCama, doblada, grosorPieza) {
  let slot = { ...corrugadoDims };
  slot[primeraCama.ejeApilado] -= primeraCama.apiladas * grosorPieza;

  const continuacion = mejorContinuacion(slot, doblada, grosorPieza, MAX_CAMAS - 1);

  return {
    camas: [primeraCama, ...continuacion.camas],
    total: primeraCama.total + continuacion.total,
  };
}

/**
 * Evalúa un corrugado completo: para cada opción posible de PRIMERA cama
 * (parada / acostada-largo / acostada-ancho), encuentra la mejor
 * combinación completa de camas siguientes (búsqueda exhaustiva, no
 * golosa) — así se evalúan todas las posibilidades de camas que quepan
 * en el corrugado, no solo la primera que aparece. Regresa todas las
 * estrategias ordenadas de mayor a menor total, para comparar y
 * seleccionar manualmente.
 */
function evaluarCorrugado(corrugado, doblada, grosorPieza) {
  const primeras = evaluarEspacio(corrugado, doblada, grosorPieza);
  const estrategias = primeras.map((primera) => armarEstrategia(corrugado, primera, doblada, grosorPieza));
  estrategias.sort((a, b) => b.total - a.total);
  return estrategias;
}

/**
 * Punto de entrada principal: recibe las dimensiones ARMADAS de la caja de
 * producto + calibre + pegue, y regresa el corrugado que maximiza el total
 * de piezas, junto con TODAS las estrategias evaluadas por corrugado (para
 * que la UI permita cambiar de corrugado/estrategia manualmente).
 */
function calcularMejorEmpaque({ largo, ancho, alto, tipoCarton, calibre, pegue }) {
  const doblada = medidaDoblada({ largo, ancho, alto, pegue });
  if (!doblada) return { error: 'Tipo de pegue inválido.' };

  const grosorPieza = grosorPiezaMm({ tipo: tipoCarton, calibre, pegue });
  if (!grosorPieza) return { error: 'Calibre o tipo de pegue inválido.' };

  const porCorrugado = CORRUGADOS.map((corrugado) => ({
    corrugado,
    opciones: evaluarCorrugado(corrugado, doblada, grosorPieza),
  })).filter((r) => r.opciones.length > 0);

  if (porCorrugado.length === 0) {
    return { error: 'La caja doblada no cabe en ningún corrugado del catálogo con este calibre/pegue.' };
  }

  porCorrugado.sort((a, b) => b.opciones[0].total - a.opciones[0].total);
  const mejor = porCorrugado[0];

  return {
    grosorPiezaMm: grosorPieza,
    largoDobladoMm: doblada.largoDoblado,
    altoDobladoMm: doblada.altoDoblado,
    porCorrugado,
    corrugadoId: mejor.corrugado.id,
    acomodoIndex: 0,
  };
}

/**
 * Acomoda el corrugado en el piso de la tarima (dimA x dimB), probando las
 * 2 orientaciones como base y, para cada una, si sobra una tira de piso
 * después de la cuadrícula principal, intenta rellenarla con corrugados
 * ROTADOS 90° — "no todos los corrugados deben tener la misma
 * orientación", igual que se ve en las fichas reales (ej. AFFP0046: 1ra
 * cama parada + 2da cama acostada). Los corrugados NUNCA se acuestan de
 * lado (solo se rota el piso) — a diferencia de las postetas, un
 * corrugado siempre se estiba parado.
 */
function evaluarPisoTarima(dimA, dimB, corrLargo, corrAncho) {
  const p = piso2D(dimA, dimB, corrLargo, corrAncho);
  return {
    cols: p.cols, filas: p.filas, principal: p.principal,
    extraCols: p.extraCols, extraFilas: p.extraFilas, extra: p.extra,
    total: p.total, wPrincipal: p.wA, wRotado: p.wB, rotadoBase: p.rotado,
  };
}

/**
 * Estima el peso de UNA pieza doblada (cartón + 5g de barniz/tinta), a
 * partir del área TOTAL de la lámina extendida (ancho x alto del
 * troquel, con pestañas — NO el footprint doblado, que es más chico).
 * Regresa null si falta el dato de la lámina o el gramaje del material.
 * Confirmado con el usuario: el área sale de las medidas del troquel
 * que suba, no de una fórmula genérica a partir de largo/ancho/alto.
 */
function calcularPesoPiezaG({ tipoCarton, material, calibre, laminaAncho, laminaAlto }) {
  if (!laminaAncho || !laminaAlto) return null;

  let gramaje;
  if (tipoCarton === 'solido') {
    gramaje = GRAMAJE_SOLIDO[material]?.[calibre];
  } else {
    // Microcorrugado = liner (12 pt, gramaje real del material elegido) + flauta (estimado).
    const linerGramaje = GRAMAJE_SOLIDO[material]?.[12];
    gramaje = linerGramaje != null ? linerGramaje + GRAMAJE_FLAUTA_ESTIMADO : GRAMAJE_MICROCORRUGADO_ESTIMADO;
  }
  if (!gramaje) return null;

  const areaM2 = (laminaAncho * laminaAlto) / 1e6;
  return areaM2 * gramaje + 5; // +5g de barniz y tinta por pieza
}

/**
 * Calcula cuántos corrugados caben en la tarima: acomodo 2D en el piso
 * (mezclando orientaciones si eso da más piezas) y cuántas camas de
 * corrugados caben en la altura. Da 2 opciones de altura: "segura"
 * (dentro del alto útil normal) y "extendida" (usando el alto total de
 * la tarima, con aviso porque excede el límite normal). APROXIMACIÓN: se
 * usan las dimensiones internas del corrugado (únicas que tenemos en el
 * catálogo) como si fueran las externas — el grosor propio del corrugado
 * (unos pocos mm de cartón) no está modelado todavía, así que el conteo
 * real puede ser 1-2 corrugados menos por lado en la práctica.
 */
function calcularEstibaEnTarima(corrugado) {
  const largoTarima = TARIMA.largo_cm * 10; // mm
  const anchoTarima = TARIMA.ancho_cm * 10;
  const altoUtil = TARIMA.alto_util_cm * 10;
  const altoTotal = TARIMA.alto_total_cm * 10;

  const piso = evaluarPisoTarima(largoTarima, anchoTarima, corrugado.largo, corrugado.ancho);

  const camasSeguras = Math.max(1, Math.floor(altoUtil / corrugado.alto));
  const camasExtendidas = Math.max(camasSeguras, Math.floor(altoTotal / corrugado.alto));

  return {
    piso,
    porCama: piso.total,
    camas: camasSeguras,
    total: piso.total * camasSeguras,
    camasExtendidas,
    totalExtendido: piso.total * camasExtendidas,
    excedeAlturaNormal: camasExtendidas > camasSeguras,
    aproximado: true,
  };
}

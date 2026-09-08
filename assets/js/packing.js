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
 * todas tienen que usar el mismo eje: si la primera cama deja altura
 * libre, esa altura se vuelve a evaluar (probando otra vez los 3 ejes)
 * para minimizar el espacio muerto — así una cama puede quedar acostada
 * y la siguiente parada encima.
 *
 * REGLA IMPORTANTE: las camas SOLO se apilan una encima de otra, nunca
 * una al lado de otra. Una cama de lado deja el producto sin apoyo (se
 * puede dañar) y rompe la simetría que necesita el equipo de embalaje.
 * Por eso el sobrante a lo largo y a lo ancho dentro de una cama se
 * queda como espacio muerto a propósito.
 */

/**
 * Medida DOBLADA (plana) de la caja, a partir de las medidas del TROQUEL
 * (la lámina extendida). Verificada contra el ejemplo del usuario
 * (panel largo=271, panel ancho=115, lámina 786.45 x 317.05, fondo
 * automático -> doblada 386 x 237.75 mm):
 *
 *  - Largo doblado = panel largo + panel ancho (una cara del largo + una
 *    del ancho, porque el pegue sale de una ceja y el resto se pliega
 *    sobre sí mismo). Es geometría del plegado de los paneles laterales,
 *    no depende del tipo de pegue.
 *  - Alto doblado = ALTO TOTAL DE LA LÁMINA x factor. Ojo: se usa el
 *    alto de la lámina, NO el alto interno de la caja armada, porque en
 *    la caja doblada las solapas siguen sueltas en el plano y ocupan
 *    espacio. El factor solo descuenta el fondo cuando aplica:
 *      - lineal: 1.0 (lámina completa; el pegue es una costura de lado
 *        y las solapas de arriba y abajo quedan extendidas)
 *      - fondo automático: 0.75 (se quita la parte del fondo crash-lock,
 *        que va pegada y se pliega dentro del cuerpo)
 *      - charola: 1.0 (va extendida, no hay reducción por plegado)
 *      - 4 esquinas: 1.0 como placeholder — PENDIENTE de confirmar con
 *        el usuario, se usa el mismo valor que lineal mientras tanto.
 */
const FACTOR_ALTO_DOBLADO = {
  lineal: 1.0,
  fondo_automatico: 0.75,
  charola: 1.0,
  cuatro_esquinas: 1.0, // pendiente de confirmar
};

function medidaDoblada({ largo, ancho, laminaAlto, pegue }) {
  const factor = FACTOR_ALTO_DOBLADO[pegue];
  if (factor == null || !laminaAlto) return null;
  return {
    largoDoblado: largo + ancho,
    altoDoblado: laminaAlto * factor,
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
 * principal, la rellena con MÁS rectángulos rotados 90°.
 *
 * SIMETRÍA (confirmado con el usuario), controlada por `exigirSimetria`:
 *
 *  - DENTRO del corrugado (postetas): sí se exige. El grupo rotado solo
 *    se acepta si forma un BLOQUE COMPLETO a ras con la cuadrícula
 *    principal (misma profundidad). Si no alcanza, quedarían unas pocas
 *    cajas sueltas en la orilla y esas se dañan, así que se prefiere
 *    dejar el hueco vacío.
 *  - En la TARIMA (corrugados): no se exige. Ahí los corrugados van
 *    apoyados sobre la tarima, así que mientras quepan se aprovechan.
 */
function piso2D(dimA, dimB, f1, f2, exigirSimetria = true) {
  function intento(wA, wB) {
    const cols = Math.floor(dimA / wA);
    const filas = Math.floor(dimB / wB);
    const principal = cols * filas;
    const sobranteA = dimA - cols * wA;
    const fondoPrincipal = filas * wB;

    let extraCols = 0, extraFilas = 0, extra = 0;
    if (principal > 0 && sobranteA >= wB) {
      const posiblesCols = Math.floor(sobranteA / wB);
      const posiblesFilas = Math.floor(dimB / wA);
      const fondoRotado = posiblesFilas * wA;
      const aRas = fondoRotado >= fondoPrincipal - MIN_UTIL_MM;
      if (posiblesCols > 0 && posiblesFilas > 0 && (aRas || !exigirSimetria)) {
        extraCols = posiblesCols;
        extraFilas = posiblesFilas;
        extra = extraCols * extraFilas;
      }
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
const MIN_UTIL_MM = 0.5; // sobrantes más chicos que esto se ignoran

/**
 * Caja (bounding box, en mm por eje) que realmente ocupa una cama dentro
 * del corrugado, contando su cuadrícula principal Y el grupo rotado de
 * la tira sobrante.
 */
function dimensionesUsadas(cama, grosorPieza) {
  const usado = { largo: 0, ancho: 0, alto: 0 };
  usado[cama.ejeApilado] = cama.apiladas * grosorPieza;
  usado[cama.ejeA] = cama.cols * cama.dimA + (cama.extraCols || 0) * cama.dimB;
  usado[cama.ejeB] = Math.max(cama.filas * cama.dimB, (cama.extraFilas || 0) * cama.dimA);
  return usado;
}

/**
 * Rellena la altura que queda encima de una cama, con más camas.
 *
 * REGLA (confirmada con el usuario): las camas SOLO se apilan una sobre
 * otra. Cada cama ocupa una franja horizontal del corrugado y la
 * siguiente va ENCIMA — nunca a un lado. Una cama de lado deja el
 * producto sin apoyo y se puede dañar, además de que el acomodo tiene
 * que quedar simétrico para el equipo de embalaje.
 *
 * Eso implica que el sobrante a lo largo y a lo ancho DENTRO de una cama
 * se queda como espacio muerto a propósito: solo se reaprovecha el
 * sobrante de ALTURA.
 */
function empacarCamasEncima(corrugadoDims, doblada, grosorPieza, altoRestante, altoOcupado, camasRestantes) {
  if (camasRestantes <= 0 || altoRestante <= MIN_UTIL_MM) return { camas: [], total: 0 };

  const slot = { largo: corrugadoDims.largo, ancho: corrugadoDims.ancho, alto: altoRestante };
  const opciones = evaluarEspacio(slot, doblada, grosorPieza);
  let mejor = { camas: [], total: 0 }; // siempre se puede dejar el hueco vacío

  for (const opcion of opciones) {
    const usado = dimensionesUsadas(opcion, grosorPieza);
    const cama = { ...opcion, origen: { largo: 0, ancho: 0, alto: altoOcupado } };
    const sub = empacarCamasEncima(
      corrugadoDims, doblada, grosorPieza,
      altoRestante - usado.alto, altoOcupado + usado.alto,
      camasRestantes - 1,
    );
    const total = opcion.total + sub.total;
    if (total > mejor.total) mejor = { camas: [cama, ...sub.camas], total };
  }

  return mejor;
}

/**
 * Arma la MEJOR estrategia completa para un corrugado, forzando cuál es
 * la PRIMERA cama (para poder comparar las 3 orientaciones de arranque
 * en la UI) y apilando encima las camas que quepan en la altura restante.
 */
function armarEstrategia(corrugadoDims, primeraCama, doblada, grosorPieza) {
  const usado = dimensionesUsadas(primeraCama, grosorPieza);
  const cama = { ...primeraCama, origen: { largo: 0, ancho: 0, alto: 0 } };

  const encima = empacarCamasEncima(
    corrugadoDims, doblada, grosorPieza,
    corrugadoDims.alto - usado.alto, usado.alto,
    MAX_CAMAS - 1,
  );

  return {
    camas: [cama, ...encima.camas],
    total: primeraCama.total + encima.total,
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
function calcularMejorEmpaque({ largo, ancho, laminaAlto, tipoCarton, calibre, pegue }) {
  const doblada = medidaDoblada({ largo, ancho, laminaAlto, pegue });
  if (!doblada) return { error: 'Falta el alto total de la lámina o el tipo de pegue es inválido.' };

  const grosorPieza = grosorPiezaMm({ tipo: tipoCarton, calibre, pegue });
  if (!grosorPieza) return { error: 'Calibre o tipo de pegue inválido.' };

  const porCorrugado = CORRUGADOS.map((corrugado) => ({
    corrugado,
    opciones: evaluarCorrugado(corrugado, doblada, grosorPieza),
  })).filter((r) => r.opciones.length > 0);

  if (porCorrugado.length === 0) {
    return { error: 'La caja doblada no cabe en ningún corrugado del catálogo con este calibre/pegue.' };
  }

  // El objetivo real es mandar las MENOS tarimas posibles, no solo llenar
  // mejor un corrugado individual — un corrugado con menos piezas puede
  // igual acomodarse mucho mejor en la tarima y dar más piezas totales
  // por tarima. Por eso se ordena por piezas-por-tarima (estrategia x
  // estiba), no por piezas-por-corrugado solo.
  porCorrugado.forEach((r) => {
    const estiba = calcularEstibaEnTarima(r.corrugado);
    r.piezasPorTarima = r.opciones[0].total * estiba.total;
  });
  porCorrugado.sort((a, b) => b.piezasPorTarima - a.piezasPorTarima);
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
  // Sin exigir simetría: en la tarima, mientras quepan, se aprovechan.
  const p = piso2D(dimA, dimB, corrLargo, corrAncho, false);
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

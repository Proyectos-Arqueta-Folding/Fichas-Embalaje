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

/** De 2 medidas de footprint (f1, f2) y 2 dimensiones disponibles (dimA, dimB),
 * regresa el cruce que da más piezas (probando las 2 formas de acomodarlas). */
function mejorFootprint(dimA, dimB, f1, f2) {
  const op1 = { colsA: Math.floor(dimA / f1), colsB: Math.floor(dimB / f2) };
  const op2 = { colsA: Math.floor(dimA / f2), colsB: Math.floor(dimB / f1) };
  const c1 = op1.colsA * op1.colsB;
  const c2 = op2.colsA * op2.colsB;
  return c1 >= c2
    ? { colsA: op1.colsA, colsB: op1.colsB, count: c1, dimsAB: [f1, f2] }
    : { colsA: op2.colsA, colsB: op2.colsB, count: c2, dimsAB: [f2, f1] };
}

/**
 * Evalúa un espacio (largo/ancho/alto disponibles) contra una pieza
 * doblada, probando los 3 posibles ejes de apilado (parada = eje alto,
 * acostada = eje largo o ancho). Regresa TODAS las opciones válidas,
 * ordenadas de mayor a menor total de piezas.
 */
function evaluarEspacio({ largo, ancho, alto }, { largoDoblado, altoDoblado }, grosorPieza) {
  const candidatos = [];

  // Parada: se apila en el alto; el footprint doblado ocupa el piso (largo x ancho).
  {
    const apiladas = Math.floor(alto / grosorPieza);
    if (apiladas > 0) {
      const fp = mejorFootprint(largo, ancho, largoDoblado, altoDoblado);
      if (fp.count > 0) {
        candidatos.push({
          ejeApilado: 'alto', orientacionLabel: 'Parada',
          apiladas, cols: fp.colsA, filas: fp.colsB, postetasPorCama: fp.count,
          piezasPorPosteta: apiladas, total: fp.count * apiladas,
          ejeA: 'largo', ejeB: 'ancho', dimA: fp.dimsAB[0], dimB: fp.dimsAB[1],
        });
      }
    }
  }

  // Acostada (eje largo): se apila a lo largo del corrugado; el footprint
  // doblado ocupa la cara (ancho x alto).
  {
    const apiladas = Math.floor(largo / grosorPieza);
    if (apiladas > 0) {
      const fp = mejorFootprint(ancho, alto, largoDoblado, altoDoblado);
      if (fp.count > 0) {
        candidatos.push({
          ejeApilado: 'largo', orientacionLabel: 'Acostada (a lo largo)',
          apiladas, cols: fp.colsA, filas: fp.colsB, postetasPorCama: fp.count,
          piezasPorPosteta: apiladas, total: fp.count * apiladas,
          ejeA: 'ancho', ejeB: 'alto', dimA: fp.dimsAB[0], dimB: fp.dimsAB[1],
        });
      }
    }
  }

  // Acostada (eje ancho): se apila a lo ancho del corrugado; el footprint
  // doblado ocupa la cara (largo x alto).
  {
    const apiladas = Math.floor(ancho / grosorPieza);
    if (apiladas > 0) {
      const fp = mejorFootprint(largo, alto, largoDoblado, altoDoblado);
      if (fp.count > 0) {
        candidatos.push({
          ejeApilado: 'ancho', orientacionLabel: 'Acostada (a lo ancho)',
          apiladas, cols: fp.colsA, filas: fp.colsB, postetasPorCama: fp.count,
          piezasPorPosteta: apiladas, total: fp.count * apiladas,
          ejeA: 'largo', ejeB: 'alto', dimA: fp.dimsAB[0], dimB: fp.dimsAB[1],
        });
      }
    }
  }

  candidatos.sort((a, b) => b.total - a.total);
  return candidatos;
}

const MAX_CAMAS = 4;

/**
 * Arma una ESTRATEGIA completa para un corrugado: empieza con una opción
 * de primera cama y va llenando el espacio sobrante (en el eje que usó
 * esa cama) de forma golosa, permitiendo que cada cama siguiente use un
 * eje distinto (parada/acostada) si eso aprovecha mejor el hueco.
 */
function armarEstrategia(corrugadoDims, primeraCama, doblada, grosorPieza) {
  const camas = [primeraCama];
  let total = primeraCama.total;
  let slot = { ...corrugadoDims };
  slot[primeraCama.ejeApilado] -= primeraCama.apiladas * grosorPieza;

  for (let i = 1; i < MAX_CAMAS; i++) {
    if (Object.values(slot).some((v) => v < 0)) break;
    const opciones = evaluarEspacio(slot, doblada, grosorPieza);
    if (opciones.length === 0 || opciones[0].total <= 0) break;
    const siguiente = opciones[0];
    camas.push(siguiente);
    total += siguiente.total;
    slot = { ...slot };
    slot[siguiente.ejeApilado] -= siguiente.apiladas * grosorPieza;
  }

  return { camas, total };
}

/**
 * Evalúa un corrugado completo: genera una estrategia por cada opción
 * posible de primera cama (parada / acostada-largo / acostada-ancho), y
 * regresa todas ordenadas de mayor a menor total, para poder comparar y
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
  function base(wPrincipal, wRotado) {
    const cols = Math.floor(dimA / wPrincipal);
    const filas = Math.floor(dimB / wRotado);
    const principal = cols * filas;
    const sobranteA = dimA - cols * wPrincipal;

    let extraCols = 0, extraFilas = 0, extra = 0;
    if (sobranteA >= wRotado) {
      extraCols = Math.floor(sobranteA / wRotado);
      extraFilas = Math.floor(dimB / wPrincipal);
      extra = extraCols * extraFilas;
    }

    return {
      cols, filas, principal,
      extraCols, extraFilas, extra,
      total: principal + extra,
      wPrincipal, wRotado, sobranteA,
    };
  }

  const opcionA = base(corrLargo, corrAncho); // corrugado "normal" como base
  const opcionB = base(corrAncho, corrLargo); // corrugado rotado 90° como base
  const mejor = opcionA.total >= opcionB.total ? { ...opcionA, rotadoBase: false } : { ...opcionB, rotadoBase: true };
  return mejor;
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

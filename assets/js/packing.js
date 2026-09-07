/**
 * Motor de cálculo de empaque — v2 (modelo de posteta, confirmado con el
 * usuario 2026-09-07).
 *
 * La caja de producto se maneja DOBLADA (plana), no armada en 3D: se
 * apilan varias piezas dobladas para formar una "posteta", y las postetas
 * (paradas) se acomodan en el piso del corrugado.
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
 * Evalúa un corrugado contra una pieza doblada: la posteta se apila
 * (piezas paradas) hasta llenar el alto del corrugado, y las postetas se
 * acomodan en el piso (largo x ancho) probando las 2 orientaciones
 * posibles del rectángulo doblado. Regresa TODAS las opciones válidas,
 * ordenadas de mayor a menor total, para permitir selección manual.
 */
function evaluarCorrugado(corrugado, { largoDoblado, altoDoblado }, grosorPieza) {
  const piezasPorPosteta = Math.floor(corrugado.alto / grosorPieza);
  if (piezasPorPosteta <= 0) return [];

  const orientacionesPosteta = [
    { x: largoDoblado, y: altoDoblado },
    { x: altoDoblado, y: largoDoblado },
  ];

  const opciones = [];
  for (const { x, y } of orientacionesPosteta) {
    if (x <= 0 || y <= 0) continue;
    const cols = Math.floor(corrugado.largo / x);
    const filas = Math.floor(corrugado.ancho / y);
    const postetasPorCama = cols * filas;
    if (postetasPorCama <= 0) continue;
    const total = postetasPorCama * piezasPorPosteta;
    opciones.push({ orientacion: { x, y }, cols, filas, postetasPorCama, piezasPorPosteta, total });
  }
  opciones.sort((a, b) => b.total - a.total);
  return opciones;
}

/**
 * Punto de entrada principal: recibe las dimensiones ARMADAS de la caja de
 * producto + calibre + pegue, y regresa el corrugado que maximiza el total
 * de piezas, junto con TODAS las opciones evaluadas por corrugado (para que
 * la UI permita cambiar de corrugado/orientación manualmente).
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
 * Calcula cuántos corrugados caben en la tarima: acomodo 2D en el piso
 * (120x120 cm) y cuántas camas de corrugados caben en la altura útil
 * (100 cm). APROXIMACIÓN: se usan las dimensiones internas del corrugado
 * (únicas que tenemos en el catálogo) como si fueran las externas —
 * el grosor propio del corrugado (unos pocos mm de cartón) no está
 * modelado todavía, así que el conteo real puede ser 1-2 corrugados
 * menos por lado en la práctica.
 */
function calcularEstibaEnTarima(corrugado) {
  const largoTarima = TARIMA.largo_cm * 10; // mm
  const anchoTarima = TARIMA.ancho_cm * 10;
  const altoUtil = TARIMA.alto_util_cm * 10;

  const opciones = [
    { cols: Math.floor(largoTarima / corrugado.largo), filas: Math.floor(anchoTarima / corrugado.ancho) },
    { cols: Math.floor(largoTarima / corrugado.ancho), filas: Math.floor(anchoTarima / corrugado.largo) },
  ].map((o) => ({ ...o, porCama: o.cols * o.filas }));

  opciones.sort((a, b) => b.porCama - a.porCama);
  const mejor = opciones[0];

  const camas = Math.max(1, Math.floor(altoUtil / corrugado.alto));
  const total = mejor.porCama * camas;

  return { ...mejor, camas, total, aproximado: true };
}

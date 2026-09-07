/**
 * Motor de cálculo de empaque — v1.
 *
 * SUPUESTO A VALIDAR CON EL USUARIO: se trata la caja de producto como un
 * cuerpo rígido de 3 dimensiones (no como un plegado plano en "postetas",
 * que es como se ve en algunas fichas de ejemplo — las cajas van dobladas,
 * no extendidas, así que ocupan menos espacio del que este modelo asume).
 * El grosor de cartón calculado se suma a las 3 dimensiones de la caja
 * para obtener su tamaño "exterior" real dentro del corrugado. Pendiente
 * de la fórmula exacta caja extendida -> caja armada por tipo de pegue
 * (confirmada solo parcialmente: largo y alto para fondo automático y
 * lineal). Cuando se confirme, este es el único archivo que hay que tocar.
 */

/**
 * Medida DOBLADA (plana) de la caja, a partir de sus dimensiones armadas
 * (largo/ancho/alto). Regla dada por el usuario, verificada contra su
 * ejemplo de troquel (largo=271, ancho=115, alto=317.05, fondo automático
 * -> doblada 386 x 237.75 mm, que es justo lo que da esta fórmula):
 *
 *  - Largo doblado = largo + ancho (una cara del largo + una del ancho,
 *    porque el pegue sale de una ceja y el resto se pliega sobre sí
 *    mismo). No se confirmó si esto cambia por tipo de pegue; se asume
 *    que es geometría del plegado y no depende del pegue.
 *  - Alto doblado = alto x factor, donde factor quita la parte del fondo
 *    que no aporta a la altura doblada. Solo confirmados: lineal = 1.0
 *    (altura completa), fondo automático = 0.75. FALTAN charola y
 *    4 esquinas — no usar esta función para esos pegues todavía.
 *
 * OJO: esta función NO está conectada al cálculo principal todavía
 * (ver calcularMejorEmpaque, que sigue usando el modelo de caja rígida
 * v1). Falta confirmar con el usuario cómo se arma la "posteta" a partir
 * de esta medida doblada antes de reemplazar el motor de cálculo.
 */
const FACTOR_ALTO_DOBLADO = {
  lineal: 1.0,
  fondo_automatico: 0.75,
  // charola: ?,          // pendiente de confirmar con el usuario
  // cuatro_esquinas: ?,  // pendiente de confirmar con el usuario
};

function medidaDoblada({ largo, ancho, alto, pegue }) {
  const factor = FACTOR_ALTO_DOBLADO[pegue];
  if (factor == null) return null;
  return {
    largoDoblado: largo + ancho,
    altoDoblado: alto * factor,
  };
}

function grosorParedMm({ tipo, calibre, pegue }) {
  const capas = CAPAS_POR_PEGUE[pegue]?.capas ?? 1;
  let espesorCapa;
  if (tipo === 'solido') {
    espesorCapa = ESPESOR_POR_CALIBRE[calibre];
  } else {
    espesorCapa = ESPESOR_MICROCORRUGADO[calibre]?.espesor;
  }
  if (!espesorCapa) return null;
  // Grosor en el punto más grueso (zona de pegue), aplicado de forma
  // uniforme a las 3 dimensiones por simplicidad en esta v1.
  return espesorCapa * capas;
}

// Genera las 6 permutaciones de ejes (rotaciones ortogonales) de una caja.
function orientaciones([l, a, h]) {
  return [
    [l, a, h], [l, h, a],
    [a, l, h], [a, h, l],
    [h, l, a], [h, a, l],
  ];
}

/**
 * Evalúa un corrugado contra una caja (ya con grosor sumado) en las 6
 * orientaciones posibles. Regresa TODAS las opciones válidas (no solo la
 * mejor), ordenadas de mayor a menor total, para permitir selección manual.
 */
function evaluarCorrugado(corrugado, cajaExterior) {
  const opciones = [];
  for (const [x, y, z] of orientaciones(cajaExterior)) {
    if (x <= 0 || y <= 0 || z <= 0) continue;
    const cols = Math.floor(corrugado.largo / x);
    const filas = Math.floor(corrugado.ancho / y);
    const porCama = cols * filas;
    if (porCama <= 0) continue;
    const camasPosibles = Math.floor(corrugado.alto / z);
    const camas = Math.min(camasPosibles, 2); // tope de 2 camas por alcance del proyecto
    if (camas <= 0) continue;
    const total = porCama * camas;
    opciones.push({ orientacion: { x, y, z }, cols, filas, porCama, camas, total });
  }
  opciones.sort((a, b) => b.total - a.total);
  return opciones;
}

/**
 * Punto de entrada principal: recibe las dimensiones internas de la caja de
 * producto + calibre + pegue, y regresa el corrugado que maximiza el total
 * de piezas, junto con TODAS las opciones evaluadas por corrugado (para que
 * la UI permita cambiar de corrugado/orientación manualmente).
 */
function calcularMejorEmpaque({ largo, ancho, alto, tipoCarton, calibre, pegue }) {
  const grosor = grosorParedMm({ tipo: tipoCarton, calibre, pegue });
  if (!grosor) return { error: 'Calibre o tipo de pegue inválido.' };

  const cajaExterior = [largo + 2 * grosor, ancho + 2 * grosor, alto + 2 * grosor];

  const porCorrugado = CORRUGADOS.map((corrugado) => ({
    corrugado,
    opciones: evaluarCorrugado(corrugado, cajaExterior),
  })).filter((r) => r.opciones.length > 0);

  if (porCorrugado.length === 0) {
    return { error: 'La caja no cabe en ningún corrugado del catálogo con este calibre/pegue.' };
  }

  porCorrugado.sort((a, b) => b.opciones[0].total - a.opciones[0].total);
  const mejor = porCorrugado[0];

  return {
    grosorMm: grosor,
    cajaExteriorMm: cajaExterior,
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

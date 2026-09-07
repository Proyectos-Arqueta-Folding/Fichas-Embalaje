/**
 * Motor de cálculo de empaque — v1.
 *
 * SUPUESTO A VALIDAR CON EL USUARIO: se trata la caja de producto como un
 * cuerpo rígido de 3 dimensiones (no como un plegado plano en "postetas",
 * que es como se ve en algunas fichas de ejemplo). El grosor de cartón
 * calculado se suma a las 3 dimensiones de la caja para obtener su tamaño
 * "exterior" real dentro del corrugado. Cuando el usuario confirme cómo se
 * relaciona esto con las postetas, este archivo es el único que hay que tocar.
 */

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
 * Calcula, para un corrugado y una caja (ya con grosor sumado), cuántas
 * cajas entran por cama (una capa horizontal) probando las orientaciones,
 * y cuántas camas caben en la altura del corrugado (máx. 2, por alcance
 * del proyecto).
 */
function mejorAcomodoEnCorrugado(corrugado, cajaExterior) {
  let mejor = null;
  for (const [x, y, z] of orientaciones(cajaExterior)) {
    if (x <= 0 || y <= 0 || z <= 0) continue;
    const cols = Math.floor(corrugado.largo / x);
    const filas = Math.floor(corrugado.ancho / y);
    const porCama = cols * filas;
    if (porCama <= 0) continue;
    const camasPosibles = Math.floor(corrugado.alto / z);
    const camas = Math.min(camasPosibles, 2); // tope de 2 camas por alcance del proyecto
    const total = porCama * camas;
    if (!mejor || total > mejor.total) {
      mejor = {
        orientacion: { x, y, z },
        cols, filas, porCama,
        camas, total,
      };
    }
  }
  return mejor;
}

/**
 * Punto de entrada principal: recibe las dimensiones internas de la caja de
 * producto + calibre + pegue, y regresa el corrugado que maximiza el total
 * de piezas, junto con el detalle de acomodo.
 */
function calcularMejorEmpaque({ largo, ancho, alto, tipoCarton, calibre, pegue }) {
  const grosor = grosorParedMm({ tipo: tipoCarton, calibre, pegue });
  if (!grosor) return { error: 'Calibre o tipo de pegue inválido.' };

  const cajaExterior = [largo + 2 * grosor, ancho + 2 * grosor, alto + 2 * grosor];

  const resultados = CORRUGADOS.map((corrugado) => {
    const acomodo = mejorAcomodoEnCorrugado(corrugado, cajaExterior);
    return { corrugado, acomodo };
  }).filter((r) => r.acomodo && r.acomodo.total > 0);

  if (resultados.length === 0) {
    return { error: 'La caja no cabe en ningún corrugado del catálogo con este calibre/pegue.' };
  }

  resultados.sort((a, b) => b.acomodo.total - a.acomodo.total);
  const mejor = resultados[0];

  return {
    grosorMm: grosor,
    cajaExteriorMm: cajaExterior,
    corrugado: mejor.corrugado,
    acomodo: mejor.acomodo,
    alternativas: resultados.slice(1, 4), // hasta 3 alternativas para comparar
  };
}

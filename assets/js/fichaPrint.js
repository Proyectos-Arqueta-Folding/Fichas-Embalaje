/**
 * Generación de la Ficha de Embalaje IMPRIMIBLE (formato AF-FR-PP-02),
 * usando el diálogo de impresión del navegador ("Guardar como PDF") en
 * vez de una librería de PDF — cero dependencias, cero costo, funciona
 * offline.
 *
 * Los tres diagramas son SVG isométricos generados A ESCALA a partir de
 * los números ya calculados (no son imágenes fijas ni dibujos
 * genéricos):
 *
 *   1. El corrugado con TODAS sus postetas dentro, cada una en su
 *      posición real, para ver cómo entran y que ninguna queda volando.
 *   2. Cada posteta POR SEPARADO y en grande, con sus medidas y la
 *      orientación que le toca dentro del corrugado.
 *   3. El entarimado: la tarima con los corrugados estibados, con las
 *      medidas rotuladas (120 x 120 cm de base y el alto real en cm).
 *
 * A diferencia del 3D de la app, estos NO giran: es hoja impresa, así
 * que la vista isométrica va fija y las medidas van escritas encima
 * para que se puedan identificar sin moverla.
 */

// ---------- Proyección isométrica ----------
// Mundo: eje 0 = largo (X), eje 1 = ancho (Y, profundidad), eje 2 = alto (Z).
// La cámara mira desde (+X, +Y, +Z), así que las 3 caras visibles de
// cualquier cuboide son la de arriba (+Z), la derecha (+X) y la
// izquierda (+Y).
const ISO_ANG = Math.PI / 9; // 20°: mas achatado que el isometrico clasico de 30°,
const ISO_COS = Math.cos(ISO_ANG);  // para que el dibujo llene el ancho de la columna
const ISO_SIN = Math.sin(ISO_ANG);  // impresa en vez de crecer a lo alto (que es lo escaso).

const EJE_IDX = { largo: 0, ancho: 1, alto: 2 };

/** Proyecta un punto [x, y, z] en mm a coordenadas de pantalla. */
function isoPt(p, s) {
  return [
    (p[0] - p[1]) * ISO_COS * s,
    (p[0] + p[1]) * ISO_SIN * s - p[2] * s,
  ];
}

/**
 * Escena isométrica: acumula piezas con su profundidad, lleva el
 * bounding box de lo dibujado y al final arma el <svg> con un viewBox
 * ajustado al contenido (así el dibujo siempre llena la hoja sin que yo
 * tenga que cuadrar márgenes a mano).
 *
 * El orden de pintado es el algoritmo del pintor: con la cámara en
 * (1,1,1), la profundidad es x+y+z y lo más lejano (suma menor) se
 * dibuja primero.
 */
function crearEscena(escala) {
  return {
    s: escala,
    piezas: [],
    minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,

    /** Registra un punto de pantalla en el bounding box. */
    tocar(q) {
      if (q[0] < this.minX) this.minX = q[0];
      if (q[0] > this.maxX) this.maxX = q[0];
      if (q[1] < this.minY) this.minY = q[1];
      if (q[1] > this.maxY) this.maxY = q[1];
      return q;
    },

    /** Proyecta un punto del mundo y lo registra. */
    p(pt) {
      return this.tocar(isoPt(pt, this.s));
    },

    add(profundidad, svg) {
      this.piezas.push({ profundidad, svg });
      return this;
    },

    /** Serializa: ordena por profundidad y calcula el viewBox. */
    render(clase, pad = 14) {
      const orden = this.piezas
        .map((p, i) => ({ ...p, i }))
        .sort((a, b) => a.profundidad - b.profundidad || a.i - b.i)
        .map((p) => p.svg)
        .join('');
      const x = this.minX - pad;
      const y = this.minY - pad;
      const w = this.maxX - this.minX + pad * 2;
      const h = this.maxY - this.minY + pad * 2;
      return `<svg viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}"`
        + ` xmlns="http://www.w3.org/2000/svg" class="${clase}">${orden}</svg>`;
    },
  };
}

function polyStr(qs) {
  return qs.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
}

// Las 3 caras visibles, como función de la caja b = [[x0,x1],[y0,y1],[z0,z1]].
// `n` es el eje normal de la cara.
const CARAS_VISIBLES = [
  { n: 2, corners: (b) => [[b[0][0], b[1][0], b[2][1]], [b[0][1], b[1][0], b[2][1]], [b[0][1], b[1][1], b[2][1]], [b[0][0], b[1][1], b[2][1]]] },
  { n: 0, corners: (b) => [[b[0][1], b[1][0], b[2][1]], [b[0][1], b[1][1], b[2][1]], [b[0][1], b[1][1], b[2][0]], [b[0][1], b[1][0], b[2][0]]] },
  { n: 1, corners: (b) => [[b[0][0], b[1][1], b[2][1]], [b[0][1], b[1][1], b[2][1]], [b[0][1], b[1][1], b[2][0]], [b[0][0], b[1][1], b[2][0]]] },
];

/**
 * Rayas que representan los CANTOS de las hojas apiladas. Solo aplican a
 * las caras donde de verdad se ven los cantos: si el eje de apilado es
 * la normal de la cara, esa cara es la TAPA (la hoja de arriba) y va
 * lisa. Es el mismo criterio que usa el 3D de la app para que el azul
 * se vea de un lado y el blanco del otro.
 */
function rayasHoja(esc, b, n, ejeApilado, nLineas, stroke) {
  const otro = [0, 1, 2].find((a) => a !== n && a !== ejeApilado);
  let out = '';
  for (let k = 1; k <= nLineas; k++) {
    const t = b[ejeApilado][0] + (k / (nLineas + 1)) * (b[ejeApilado][1] - b[ejeApilado][0]);
    const p1 = [], p2 = [];
    p1[n] = b[n][1]; p2[n] = b[n][1];
    p1[ejeApilado] = t; p2[ejeApilado] = t;
    p1[otro] = b[otro][0]; p2[otro] = b[otro][1];
    const q1 = esc.p(p1), q2 = esc.p(p2);
    out += `<line x1="${q1[0].toFixed(1)}" y1="${q1[1].toFixed(1)}" x2="${q2[0].toFixed(1)}" y2="${q2[1].toFixed(1)}"`
      + ` stroke="${stroke}" stroke-width="0.4" opacity="0.7"/>`;
  }
  return out;
}

/**
 * Dibuja un cuboide en la escena. `ejeApilado` (índice 0/1/2) activa las
 * rayas de hojas; si va null, el cuboide es sólido (un corrugado, una
 * tabla de la tarima).
 */
function cuboIso(esc, { pos, size, colores, ejeApilado = null, hojas = 0, stroke = '#0b2a4a', sw = 0.7, opacity = 1, capa = 0 }) {
  const b = [
    [pos[0], pos[0] + size[0]],
    [pos[1], pos[1] + size[1]],
    [pos[2], pos[2] + size[2]],
  ];
  // El orden geométrico (x+y+z) solo es confiable entre cuboides de
  // tamaño parecido. Cuando la escena mezcla tamaños muy distintos —la
  // tarima, que es una plancha enorme y baja, contra los corrugados— hay
  // que separarlos en CAPAS explícitas o el algoritmo del pintor acaba
  // dibujando un tacón de la tarima encima de una caja.
  const profundidad = capa * 1e7 + pos[0] + pos[1] + pos[2];
  const fills = [colores.tapa, colores.derecha, colores.izquierda];

  let svg = '';
  CARAS_VISIBLES.forEach((cara, idx) => {
    const qs = cara.corners(b).map((c) => esc.p(c));
    const esTapa = ejeApilado === cara.n;
    svg += `<polygon points="${polyStr(qs)}" fill="${esTapa ? colores.tapa : fills[idx]}"`
      + ` stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"/>`;
    if (ejeApilado !== null && !esTapa && hojas > 0) {
      svg += rayasHoja(esc, b, cara.n, ejeApilado, hojas, stroke);
    }
  });

  esc.add(profundidad, svg);
}

// Capas de dibujo por encima de la geometria. Se dejan bien separadas de
// las capas de cuboides (capa * 1e7, con capa <= 10) para que nunca se
// entrevere una arista o una cota con las cajas.
const CAPA_ALAMBRE = 5e8;

/** Aristas del contenedor, punteadas, para que se vea la caja completa. */
function alambreIso(esc, pos, size, { stroke = '#7a5a2a', sw = 0.9, dash = '3 2.5' } = {}) {
  const [x0, y0, z0] = pos;
  const x1 = x0 + size[0], y1 = y0 + size[1], z1 = z0 + size[2];
  const V = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  let svg = '';
  E.forEach(([a, c]) => {
    const q1 = esc.p(V[a]), q2 = esc.p(V[c]);
    svg += `<line x1="${q1[0].toFixed(1)}" y1="${q1[1].toFixed(1)}" x2="${q2[0].toFixed(1)}" y2="${q2[1].toFixed(1)}"`
      + ` stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${dash}" fill="none"/>`;
  });
  esc.add(CAPA_ALAMBRE, svg);
}

const CAPA_ANOTACION = 1e9;

/**
 * Línea de medida (acotación) entre dos puntos del mundo, corrida
 * `off` píxeles en pantalla para que no se encime con el dibujo. El
 * texto va girado siguiendo la arista, como en un plano.
 */
function acotarIso(esc, pA, pB, etiqueta, off = [0, 0], { clase = 'pf-dim', girar = true } = {}) {
  const a = isoPt(pA, esc.s), b = isoPt(pB, esc.s);
  const A = esc.tocar([a[0] + off[0], a[1] + off[1]]);
  const B = esc.tocar([b[0] + off[0], b[1] + off[1]]);
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  let ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
  if (ang > 90 || ang < -90) ang += 180; // que el texto nunca quede de cabeza

  // Ticks perpendiculares en las puntas.
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
  const nx = -(B[1] - A[1]) / len * 3.2;
  const ny = (B[0] - A[0]) / len * 3.2;

  const svg = `
    <line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="#8a5a2a" stroke-width="0.7"/>
    <line x1="${(A[0]-nx).toFixed(1)}" y1="${(A[1]-ny).toFixed(1)}" x2="${(A[0]+nx).toFixed(1)}" y2="${(A[1]+ny).toFixed(1)}" stroke="#8a5a2a" stroke-width="0.7"/>
    <line x1="${(B[0]-nx).toFixed(1)}" y1="${(B[1]-ny).toFixed(1)}" x2="${(B[0]+nx).toFixed(1)}" y2="${(B[1]+ny).toFixed(1)}" stroke="#8a5a2a" stroke-width="0.7"/>
    <text x="${mid[0].toFixed(1)}" y="${(mid[1] - 2.5).toFixed(1)}" text-anchor="middle" class="${clase}"
      ${girar ? `transform="rotate(${ang.toFixed(1)} ${mid[0].toFixed(1)} ${mid[1].toFixed(1)})"` : ''}>${etiqueta}</text>
  `;
  esc.add(CAPA_ANOTACION, svg);
}

// ---------- Paletas ----------
// Mismos colores que el 3D de la app (CAMA_COLORS de box3d.js), para que
// la hoja impresa y la pantalla se lean igual.
const PF_CAMA_COLORES = [
  { tapa: '#eaf3fb', derecha: '#0060b0', izquierda: '#0b2a4a' },
  { tapa: '#dcecf9', derecha: '#5090c0', izquierda: '#2a5a86' },
  { tapa: '#e6f2ec', derecha: '#1f9d55', izquierda: '#14603a' },
  { tapa: '#fdf0e2', derecha: '#c88a1a', izquierda: '#8a5f10' },
];

const PF_CORR_COLORES = [
  { tapa: '#e8d3ae', derecha: '#c49a5e', izquierda: '#9c7440' },
  { tapa: '#f0dfc2', derecha: '#d0a86e', izquierda: '#a88250' },
];

const PF_MADERA = { tapa: '#d9b57e', derecha: '#b08a4e', izquierda: '#8a6a38' };

/** Cuántas rayas de hoja dibujar sin que se vuelva una manchota. */
function nHojas(piezas, denso) {
  if (denso) return 0;
  return Math.min(9, Math.max(2, piezas - 1));
}

/**
 * Recorre las postetas de una cama en coordenadas del mundo, igual que
 * renderProductScene del 3D: por cada posteta a lo largo del eje de
 * apilado, la cuadrícula principal y luego el grupo rotado de la tira
 * sobrante. Llama a `fn({pos, size})` con cada una.
 */
function recorrerPostetas(cama, grosorPiezaMm, fn) {
  const ejeAp = EJE_IDX[cama.ejeApilado];
  const ejeA = EJE_IDX[cama.ejeA];
  const ejeB = EJE_IDX[cama.ejeB];
  const alturaPosteta = cama.piezasPorPosteta * grosorPiezaMm;
  const nPostetas = cama.postetasEnEje || 1;

  const emitir = (inicio, offA, sizeA, sizeB, i, j) => {
    const pos = [], size = [];
    pos[ejeAp] = inicio; size[ejeAp] = alturaPosteta;
    pos[ejeA] = offA + i * sizeA; size[ejeA] = sizeA;
    pos[ejeB] = cama.origen[cama.ejeB] + j * sizeB; size[ejeB] = sizeB;
    fn({ pos, size, ejeAp });
  };

  for (let k = 0; k < nPostetas; k++) {
    const inicio = cama.origen[cama.ejeApilado] + k * alturaPosteta;

    for (let i = 0; i < cama.cols; i++) {
      for (let j = 0; j < cama.filas; j++) {
        emitir(inicio, cama.origen[cama.ejeA], cama.dimA, cama.dimB, i, j);
      }
    }

    if (cama.extra > 0) {
      const offExtra = cama.origen[cama.ejeA] + cama.cols * cama.dimA;
      for (let i = 0; i < cama.extraCols; i++) {
        for (let j = 0; j < cama.extraFilas; j++) {
          emitir(inicio, offExtra, cama.dimB, cama.dimA, i, j);
        }
      }
    }
  }
}

/** Cuenta las postetas dibujadas, para decidir si caben las rayas. */
function contarPostetas(estrategia) {
  let n = 0;
  estrategia.camas.forEach((c) => { n += (c.postetasEnEje || 1) * (c.cols * c.filas + (c.extra || 0)); });
  return n;
}

/**
 * DIAGRAMA 1 — "Empaque": el corrugado con todas sus postetas dentro,
 * en su posición real. El corrugado va como caja abierta (piso y dos
 * paredes traseras sólidas + aristas punteadas) para poder ver dentro.
 */
function svgCorrugadoConPostetas({ corrugado, estrategia, grosorPiezaMm }) {
  const { largo, ancho, alto } = corrugado;
  const anchoObjetivo = 430;
  const s = anchoObjetivo / ((largo + ancho) * ISO_COS);
  const esc = crearEscena(s);

  // Interior de la caja: piso y las dos paredes del fondo.
  const paredes = [
    [[0, 0, 0], [largo, 0, 0], [largo, ancho, 0], [0, ancho, 0]],            // piso
    [[0, 0, 0], [0, ancho, 0], [0, ancho, alto], [0, 0, alto]],              // pared x=0
    [[0, 0, 0], [largo, 0, 0], [largo, 0, alto], [0, 0, alto]],              // pared y=0
  ];
  const fondos = ['#efe2cc', '#e2d0b2', '#e8d8bd'];
  paredes.forEach((cara, i) => {
    const qs = cara.map((c) => esc.p(c));
    esc.add(-1e8 + i, `<polygon points="${polyStr(qs)}" fill="${fondos[i]}" stroke="#b89a68" stroke-width="0.8"/>`);
  });

  const denso = contarPostetas(estrategia) > 150;

  estrategia.camas.forEach((cama, idx) => {
    const colores = PF_CAMA_COLORES[idx % PF_CAMA_COLORES.length];
    const hojas = nHojas(cama.piezasPorPosteta, denso);
    recorrerPostetas(cama, grosorPiezaMm, ({ pos, size, ejeAp }) => {
      // Se encoge un pelo cada posteta para que se lean como grupos
      // separados y no como un bloque macizo.
      const g = 0.06;
      const pos2 = pos.map((v, i) => v + size[i] * g / 2);
      const size2 = size.map((v) => v * (1 - g));
      cuboIso(esc, { pos: pos2, size: size2, colores, ejeApilado: ejeAp, hojas, sw: denso ? 0.35 : 0.55 });
    });
  });

  alambreIso(esc, [0, 0, 0], [largo, ancho, alto]);

  // Medidas del corrugado. El alto se acota en la arista de la silueta
  // derecha (largo, 0) y no en la esquina frontal, que cae en medio del
  // dibujo (ver la nota en svgEntarimado).
  acotarIso(esc, [0, ancho, 0], [largo, ancho, 0], `${largo} mm`, [-16, 20]);
  acotarIso(esc, [largo, 0, 0], [largo, ancho, 0], `${ancho} mm`, [16, 20]);
  acotarIso(esc, [largo, 0, 0], [largo, 0, alto], `${alto} mm`, [26, 0]);

  return esc.render('pf-svg');
}

/**
 * DIAGRAMA 2 — una posteta SOLA, en grande, con la orientación que le
 * toca en el corrugado y sus tres medidas: la hoja doblada (dimA x dimB)
 * y el alto de la pila (piezas x grosor).
 */
function svgPostetaSola(cama, grosorPiezaMm) {
  const ejeAp = EJE_IDX[cama.ejeApilado];
  const ejeA = EJE_IDX[cama.ejeA];
  const ejeB = EJE_IDX[cama.ejeB];
  const alturaPosteta = cama.piezasPorPosteta * grosorPiezaMm;

  // Una posteta de 10 hojas de 12 pt mide 3 mm contra una hoja de 386 mm:
  // dibujada a escala se ve como una placa plana y no se entiende que es
  // una pila. Cuando queda así de delgada se dibuja con el espesor
  // EXAGERADO para que se lea como pila; la cota sigue diciendo la medida
  // real y el dibujo se marca como fuera de escala para que nadie mida
  // sobre él.
  const ladoMenor = Math.min(cama.dimA, cama.dimB);
  const espesorMinimo = ladoMenor * 0.13;
  const exagerado = alturaPosteta < espesorMinimo;
  const espesorDibujo = exagerado ? espesorMinimo : alturaPosteta;

  const size = [];
  size[ejeAp] = espesorDibujo;
  size[ejeA] = cama.dimA;
  size[ejeB] = cama.dimB;

  // Las medidas REALES por eje, para las cotas.
  const real = [];
  real[ejeAp] = alturaPosteta;
  real[ejeA] = cama.dimA;
  real[ejeB] = cama.dimB;

  const s = 150 / ((size[0] + size[1]) * ISO_COS);
  const esc = crearEscena(s);

  cuboIso(esc, {
    pos: [0, 0, 0], size,
    colores: PF_CAMA_COLORES[0],
    ejeApilado: ejeAp,
    hojas: nHojas(cama.piezasPorPosteta, false),
    sw: 0.7,
  });

  // Acotar las 3 aristas: largo (X), ancho (Y) y alto (Z) de la pila.
  acotarIso(esc, [0, size[1], 0], [size[0], size[1], 0], fmtMm(real[0]), [-10, 14], { clase: 'pf-dim-small' });
  acotarIso(esc, [size[0], 0, 0], [size[0], size[1], 0], fmtMm(real[1]), [10, 14], { clase: 'pf-dim-small' });
  acotarIso(esc, [size[0], 0, 0], [size[0], 0, size[2]], fmtMm(real[2]), [16, 0], { clase: 'pf-dim-small' });

  return { svg: esc.render('pf-svg-posteta'), exagerado };
}

const ORDINAL_CAMA = ['1ra', '2da', '3ra', '4ta', '5ta'];

/** Tarjeta de una posteta: el dibujo + sus datos, compacta. */
function tarjetaPosteta(cama, index, grosorPiezaMm) {
  const alturaPosteta = cama.piezasPorPosteta * grosorPiezaMm;
  const color = PF_CAMA_COLORES[index % PF_CAMA_COLORES.length].derecha;
  const { svg, exagerado } = svgPostetaSola(cama, grosorPiezaMm);
  return `
    <div class="pf-posteta">
      <div class="pf-posteta-tit" style="border-left:4px solid ${color};">
        ${ORDINAL_CAMA[index] || `${index + 1}a`} CAMA · ${cama.orientacionLabel}
      </div>
      <div class="pf-posteta-cuerpo">
        <div class="pf-posteta-dib">
          ${svg}
          ${exagerado ? '<div class="pf-nota-escala">espesor exagerado<br>(cotas reales)</div>' : ''}
        </div>
        <table class="pf-posteta-datos">
          <tr><td>Piezas por posteta</td><td><b>${cama.piezasPorPosteta}</b></td></tr>
          <tr><td>Postetas en la cama</td><td><b>${cama.postetasPorCama}</b></td></tr>
          <tr><td>Acomodo</td><td>${cama.cols}×${cama.filas} × ${cama.postetasEnEje}${cama.extra > 0 ? ` +${cama.extra}g` : ''}</td></tr>
          <tr><td>Pila</td><td>${fmtMm(alturaPosteta)}</td></tr>
          <tr><td>Piezas de la cama</td><td><b>${cama.total}</b></td></tr>
        </table>
      </div>
    </div>
  `;
}

/**
 * DIAGRAMA 3 — "Entarimado": la tarima de madera con los corrugados
 * estibados encima, a escala, con las medidas rotuladas (120 x 120 cm
 * de base, alto de cada cama y alto total en cm).
 */
function svgEntarimado({ corrugado, estiba, camas }) {
  const largoT = TARIMA.largo_cm * 10;
  const anchoT = TARIMA.ancho_cm * 10;
  const altoT = TARIMA.alto_tarima_cm * 10;
  const { piso } = estiba;

  const altoTotal = altoT + camas * corrugado.alto;
  const s = 400 / ((largoT + anchoT) * ISO_COS);
  const esc = crearEscena(s);

  // ---- Tarima de madera: plataforma inferior, tacones y cubierta ----
  // Capas explícitas de abajo hacia arriba (0 = plataforma, 1-3 = tacones
  // de atrás hacia adelante, 4 = cubierta), para que se pinten en el
  // orden físico correcto.
  const grosorTabla = Math.round(altoT * 0.17);
  const altoTacon = altoT - grosorTabla * 2;

  cuboIso(esc, { pos: [0, 0, 0], size: [largoT, anchoT, grosorTabla], colores: PF_MADERA, sw: 0.8, capa: 0 });
  const bandas = [0, (anchoT - anchoT * 0.16) / 2, anchoT - anchoT * 0.16];
  bandas.forEach((y0, i) => {
    cuboIso(esc, {
      pos: [0, y0, grosorTabla],
      size: [largoT, anchoT * 0.16, altoTacon],
      colores: { tapa: '#c9a469', derecha: '#a07c46', izquierda: '#7d5f31' },
      sw: 0.8, capa: 1 + i,
    });
  });
  cuboIso(esc, { pos: [0, 0, altoT - grosorTabla], size: [largoT, anchoT, grosorTabla], colores: PF_MADERA, sw: 0.8, capa: 4 });

  // ---- Corrugados estibados ----
  for (let k = 0; k < camas; k++) {
    const colores = PF_CORR_COLORES[k % PF_CORR_COLORES.length];
    const z = altoT + k * corrugado.alto;

    for (let i = 0; i < piso.cols; i++) {
      for (let j = 0; j < piso.filas; j++) {
        cuboIso(esc, {
          pos: [i * piso.wPrincipal, j * piso.wRotado, z],
          size: [piso.wPrincipal * 0.985, piso.wRotado * 0.985, corrugado.alto * 0.985],
          colores, sw: 0.6, capa: 10,
        });
      }
    }

    // Tira sobrante rellena con corrugados girados 90°.
    const offX = piso.cols * piso.wPrincipal;
    for (let i = 0; i < piso.extraCols; i++) {
      for (let j = 0; j < piso.extraFilas; j++) {
        cuboIso(esc, {
          pos: [offX + i * piso.wRotado, j * piso.wPrincipal, z],
          size: [piso.wRotado * 0.985, piso.wPrincipal * 0.985, corrugado.alto * 0.985],
          colores: { ...colores, tapa: '#fff3dd' }, sw: 0.6, capa: 10,
        });
      }
    }
  }

  // ---- Medidas ----
  // Las acotaciones verticales van en las aristas de la SILUETA (las
  // orillas del dibujo), no en la esquina frontal: con esta proyección
  // la esquina frontal cae justo en medio y las etiquetas quedarían
  // encima de las cajas. El borde derecho es (largo, 0) y el izquierdo
  // es (0, ancho).
  acotarIso(esc, [0, anchoT, 0], [largoT, anchoT, 0], `${TARIMA.largo_cm} cm`, [-20, 26]);
  acotarIso(esc, [largoT, 0, 0], [largoT, anchoT, 0], `${TARIMA.ancho_cm} cm`, [20, 26]);
  acotarIso(esc, [largoT, 0, 0], [largoT, 0, altoT], `tarima ${TARIMA.alto_tarima_cm} cm`, [30, 0], { clase: 'pf-dim-small' });
  acotarIso(esc, [largoT, 0, altoT], [largoT, 0, altoTotal], `${camas} × ${corrugado.alto} mm`, [30, 0], { clase: 'pf-dim-small' });
  acotarIso(esc, [0, anchoT, 0], [0, anchoT, altoTotal], `TOTAL ${fmtCm(altoTotal)}`, [-34, 0]);

  return esc.render('pf-svg');
}

/** Construye e inyecta la ficha imprimible con los datos ya calculados. */
function renderPrintFicha({ input, corrugado, estrategia, estiba, camasMostradas, totalMostrado, pesoTotalKg, fecha, grosorPiezaMm, largoDobladoMm, altoDobladoMm }) {
  const el = document.getElementById('print-ficha');
  if (!el) return;

  const empaqueSvg = svgCorrugadoConPostetas({ corrugado, estrategia, grosorPiezaMm });
  const entarimadoSvg = svgEntarimado({ corrugado, estiba, camas: camasMostradas });
  const tarjetas = estrategia.camas.map((c, i) => tarjetaPosteta(c, i, grosorPiezaMm)).join('');

  const leyenda = estrategia.camas.map((c, i) => `
    <span class="pf-leg">
      <i style="background:${PF_CAMA_COLORES[i % PF_CAMA_COLORES.length].derecha}"></i>
      ${ORDINAL_CAMA[i] || `${i + 1}a`} cama · ${c.orientacionLabel.toLowerCase()} · ${c.postetasPorCama} postetas
    </span>
  `).join('');

  el.innerHTML = `
    <table class="pf-header">
      <tr>
        <td class="pf-logo" rowspan="4">
          <svg viewBox="0 0 40 40" class="pf-logo-svg">
            <polygon points="20,2 36,11 20,20 4,11" fill="#70a0d0"/>
            <polygon points="4,11 20,20 20,38 4,29" fill="#0060b0"/>
            <polygon points="36,11 20,20 20,38 36,29" fill="#5090c0"/>
          </svg>
        </td>
        <td class="pf-title" colspan="2" rowspan="1">Ficha de Embalaje</td>
        <td class="pf-meta-label">Código<br>De Producto:</td>
        <td class="pf-meta-value">${input.codigo || '—'}</td>
      </tr>
      <tr>
        <td class="pf-field" colspan="2">Artículo: <b>${input.articulo || '—'}</b></td>
        <td class="pf-meta-label">Fecha:</td>
        <td class="pf-meta-value">${fecha}</td>
      </tr>
      <tr>
        <td class="pf-field" colspan="2">Cliente: <b>${input.cliente || '—'}</b></td>
        <td class="pf-meta-label">Realizado:</td>
        <td class="pf-meta-value">${input.realizado || '—'}</td>
      </tr>
      <tr>
        <td class="pf-field" colspan="2">Caja doblada: <b>${fmtMm(largoDobladoMm)} × ${fmtMm(altoDobladoMm)}</b> · calibre ${input.calibre} · ${CAPAS_POR_PEGUE[input.pegue]?.label || input.pegue}</td>
        <td class="pf-meta-label">Aprobado:</td>
        <td class="pf-meta-value">Borrador</td>
      </tr>
    </table>

    <div class="pf-diagrams">
      <div class="pf-diagram">
        <h4>Empaque — postetas dentro del corrugado ${corrugado.id}</h4>
        ${empaqueSvg}
        <div class="pf-legends">${leyenda}</div>
      </div>
      <div class="pf-diagram">
        <h4>Entarimado — ${totalMostrado} corrugados por tarima</h4>
        <div class="pf-sub">${estiba.piso.cols}×${estiba.piso.filas}${estiba.piso.extra > 0 ? ` + ${estiba.piso.extra} girado${estiba.piso.extra === 1 ? '' : 's'}` : ''} = ${estiba.piso.total} por cama × ${camasMostradas} camas</div>
        ${entarimadoSvg}
      </div>
    </div>

    <div class="pf-postetas-bloque">
      <h4>Postetas por separado — de ${estrategia.piezasPorPosteta} piezas cada una</h4>
      <div class="pf-postetas">${tarjetas}</div>
    </div>

    <table class="pf-data">
      <tr>
        <td class="pf-label">Tipo de Caja:</td><td>${corrugado.id}</td>
        <td class="pf-label">Cantidad por Cama:</td><td>${estiba.piso.total} cajas</td>
        <td class="pf-label">Postetas por caja:</td><td>${estrategia.camas.map((c) => `${c.postetasPorCama}/${c.piezasPorPosteta}`).join(' + ')}</td>
      </tr>
      <tr>
        <td class="pf-label">Dimensiones Internas:</td><td>${corrugado.largo} X ${corrugado.ancho} X ${corrugado.alto} mm</td>
        <td class="pf-label">Estiba:</td><td>${camasMostradas} cajas</td>
        <td class="pf-label">Total de Piezas:</td><td>${estrategia.total} pzas.</td>
      </tr>
      <tr>
        <td class="pf-label">Caja armada:</td><td>${input.largo} X ${input.ancho} X ${input.alto} mm</td>
        <td class="pf-label">Tarima:</td><td>${corrugadoTarimaLabel()}</td>
        <td class="pf-label">Peso Piezas*:</td><td>${pesoTotalKg != null ? `${fmtPf(pesoTotalKg)} kg.` : '—'}</td>
      </tr>
    </table>

    <div class="pf-footer">
      AF-FR-PP-02 FICHA DE EMBALAJE REV. 00 — Total por tarima: ${totalMostrado} corrugados / ${totalMostrado * estrategia.total} pzas.
      ${pesoTotalKg != null ? '<br>*Peso Piezas = solo el cartón + tinta/barniz de las piezas; falta sumar el peso del propio corrugado para el Peso Bruto real.' : ''}
    </div>
  `;
}

function corrugadoTarimaLabel() {
  return `${TARIMA.largo_cm} X ${TARIMA.ancho_cm} cm`;
}

function fmtPf(n) {
  return Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Medida en mm, sin decimales de más. */
function fmtMm(n) {
  const v = Math.round(Number(n) * 10) / 10;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} mm`;
}

/** Medida en cm a partir de mm. */
function fmtCm(mm) {
  const v = Math.round(Number(mm) / 10 * 10) / 10;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} cm`;
}

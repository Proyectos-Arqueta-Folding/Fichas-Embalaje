/**
 * Generación de la Ficha de Embalaje IMPRIMIBLE (formato AF-FR-PP-02),
 * usando el diálogo de impresión del navegador ("Guardar como PDF") en
 * vez de una librería de PDF — cero dependencias, cero costo, funciona
 * offline.
 *
 * Los tres diagramas son SVG isométricos generados a partir de los
 * números ya calculados (no son imágenes fijas ni dibujos genéricos):
 *
 *   1. El corrugado con TODAS sus postetas dentro, para ver cómo entran
 *      y que ninguna queda volando.
 *   2. El detalle de UNA posteta con cada caja dibujada por separado,
 *      para poder contar cuántas cajas la forman. Un solo dibujo sirve
 *      para toda la ficha porque el tamaño de posteta es constante en
 *      la estrategia.
 *   3. Una tarjeta por CAMA con la cama completa: si son 11 postetas se
 *      dibujan las 11, si son 2 se dibujan las 2.
 *   4. El entarimado: la tarima con los corrugados estibados, con las
 *      medidas rotuladas (120 x 120 cm de base y el alto real en cm).
 *
 * Dos decisiones de dibujo, pedidas expresamente por el usuario:
 *
 *  - Las camas y las postetas son ESQUEMÁTICAS, no a escala: van
 *    separadas y engrosadas para que se puedan CONTAR. A escala real
 *    una cama se ve como un bloque macizo y una posteta delgada como
 *    una placa plana.
 *  - Las ÚNICAS medidas dibujadas son las de la tarima, igual que en la
 *    ficha de embalaje de ejemplo; las del corrugado hacían ruido y ya
 *    van en la tabla de datos.
 *
 * A diferencia del 3D de la app, estos NO giran: es hoja impresa.
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
 * Estilos de las cotas, DENTRO del propio <svg>.
 *
 * Son los mismos que están en styles.css, repetidos a propósito: al
 * descargar el PDF el dibujo se serializa como un SVG independiente y
 * ahí ya no llega la hoja de estilos de la página. Sin esto, las medidas
 * salían en negro y con el tamaño por omisión.
 */
const SVG_ESTILOS = '<style>'
  + '.pf-dim { font-size: 8.5px; font-weight: 700; fill: #8a5a2a; font-family: Arial, sans-serif; }'
  + '.pf-dim-small { font-size: 7px; fill: #8a5a2a; font-family: Arial, sans-serif; }'
  + '.pf-dim-exceso { font-size: 8px; font-weight: 700; fill: #c0392b; font-family: Arial, sans-serif; }'
  + '</style>';

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
        + ` xmlns="http://www.w3.org/2000/svg" class="${clase}">${SVG_ESTILOS}${orden}</svg>`;
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

// Corrugados en kraft (el color natural del cartón).
const PF_CORR_COLORES = [
  { tapa: '#e8d3ae', derecha: '#c49a5e', izquierda: '#9c7440' },
  { tapa: '#f0dfc2', derecha: '#d0a86e', izquierda: '#a88250' },
];

// La tarima va en gris azulado, NO en color madera: en kraft se
// confundía con los corrugados y no se distinguía dónde acaba la tarima
// y dónde empieza la carga.
const PF_TARIMA = { tapa: '#9db0bd', derecha: '#5f7686', izquierda: '#41576a' };
const PF_TARIMA_TACON = { tapa: '#8299a8', derecha: '#4e6575', izquierda: '#354a5c' };

/**
 * Cuántas rayas de separación dibujar dentro de una posteta. Lo ideal es
 * una por junta (piezas - 1) para que se puedan contar las cajas, pero
 * con muchas postetas en el mismo dibujo eso se vuelve una manchota, así
 * que se reparte un presupuesto de líneas entre las postetas del dibujo.
 * El conteo EXACTO de cajas vive en el panel de detalle de la posteta.
 */
const PRESUPUESTO_RAYAS = 260;

function nHojas(piezas, nPostetas) {
  const juntas = piezas - 1;
  if (juntas <= 0) return 0;
  const presupuesto = Math.floor(PRESUPUESTO_RAYAS / Math.max(1, nPostetas));
  return Math.max(0, Math.min(juntas, presupuesto));
}

// Separación entre postetas, como fracción del espacio que le toca a
// cada una. A escala real las postetas quedan pegadas y una cama se ve
// como un bloque macizo donde no se pueden contar; el objetivo de la
// ficha es que se puedan CONTAR (si son 11, que se vean 11), así que se
// separan a propósito. Los dibujos de camas y postetas son esquemáticos.
const SEP_APILADO = 0.26; // a lo largo del eje de apilado
const SEP_REJILLA = 0.10; // entre celdas de la cuadrícula del piso

/**
 * Aplica la separación a un cuboide de posteta: lo encoge dentro de su
 * espacio, más en el eje de apilado (donde importa contarlas) que en
 * los otros dos.
 */
function separarPosteta(pos, size, ejeAp) {
  const p = pos.slice(), s = size.slice();
  for (let a = 0; a < 3; a++) {
    const sep = a === ejeAp ? SEP_APILADO : SEP_REJILLA;
    p[a] = pos[a] + size[a] * sep / 2;
    s[a] = size[a] * (1 - sep);
  }
  return { pos: p, size: s };
}

/**
 * Espesor de posteta que se DIBUJA (no el real). A escala una posteta de
 * 10 hojas de 12 pt mide 3 mm contra una hoja de 386 mm: se ve como una
 * placa plana y no hay forma de contar cuántas son. Aquí se engorda
 * hasta que se vea, con dos topes que mantienen el dibujo creíble:
 *
 *  - Nunca queda MÁS DELGADA que la real.
 *  - Nunca hace que la cama se salga del corrugado: el máximo es lo que
 *    le toca a cada posteta del espacio que la cama tiene disponible en
 *    su eje de apilado. Como n x real siempre cabe, este tope siempre
 *    es >= el espesor real.
 */
function espesorPostetaDibujo(cama, grosorPiezaMm, corrugado) {
  const real = cama.piezasPorPosteta * grosorPiezaMm;
  const n = Math.max(1, cama.postetasEnEje || 1);
  const disponible = corrugado[cama.ejeApilado] - cama.origen[cama.ejeApilado];
  const deseado = Math.max(real, Math.min(cama.dimA, cama.dimB) * 0.13);
  return Math.min(deseado, disponible / n);
}

/**
 * Recorre las postetas de una cama en coordenadas del mundo, igual que
 * renderProductScene del 3D: por cada posteta a lo largo del eje de
 * apilado, la cuadrícula principal y luego el grupo rotado de la tira
 * sobrante. Llama a `fn({pos, size})` con cada una.
 */
function recorrerPostetas(cama, alturaPosteta, fn) {
  const ejeAp = EJE_IDX[cama.ejeApilado];
  const ejeA = EJE_IDX[cama.ejeA];
  const ejeB = EJE_IDX[cama.ejeB];
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

  const totalPostetas = contarPostetas(estrategia);
  const denso = totalPostetas > 150;

  estrategia.camas.forEach((cama, idx) => {
    const colores = PF_CAMA_COLORES[idx % PF_CAMA_COLORES.length];
    const hojas = denso ? 0 : nHojas(cama.piezasPorPosteta, totalPostetas);
    const espesor = espesorPostetaDibujo(cama, grosorPiezaMm, corrugado);
    recorrerPostetas(cama, espesor, ({ pos, size, ejeAp }) => {
      const sep = separarPosteta(pos, size, ejeAp);
      cuboIso(esc, { pos: sep.pos, size: sep.size, colores, ejeApilado: ejeAp, hojas, sw: denso ? 0.35 : 0.55 });
    });
  });

  alambreIso(esc, [0, 0, 0], [largo, ancho, alto]);

  // ---- Medidas del corrugado ----
  // Solo las TRES de la caja: largo, ancho y alto. Las medidas internas
  // de las camas se quedan fuera a propósito (hacían mucho ruido), igual
  // que en la ficha de embalaje de ejemplo.
  //
  // Van en las aristas de la SILUETA, no en la esquina frontal: con esta
  // proyección esa esquina cae justo en medio del dibujo. El borde
  // derecho es (largo, 0) y el izquierdo es (0, ancho).
  acotarIso(esc, [0, ancho, 0], [largo, ancho, 0], `${largo} mm`, [-20, 26]);
  acotarIso(esc, [largo, 0, 0], [largo, ancho, 0], `${ancho} mm`, [20, 26]);
  acotarIso(esc, [largo, 0, 0], [largo, 0, alto], `${alto} mm`, [30, 0]);

  return esc.render('pf-svg');
}

/**
 * DIAGRAMA 2 — una posteta SOLA, en grande, con la orientación que le
 * toca en el corrugado y sus tres medidas: la hoja doblada (dimA x dimB)
 * y el alto de la pila (piezas x grosor).
 */
function svgCamaCompleta(cama, grosorPiezaMm, corrugado, idxCama) {
  const espesor = espesorPostetaDibujo(cama, grosorPiezaMm, corrugado);
  const colores = PF_CAMA_COLORES[idxCama % PF_CAMA_COLORES.length];
  const nPost = contarPostetas({ camas: [cama] });
  const hojas = nPost > 150 ? 0 : nHojas(cama.piezasPorPosteta, nPost);

  // Primero se recolectan las postetas para poder medir la cama y elegir
  // la escala que la deja del tamaño de la tarjeta.
  const bloques = [];
  recorrerPostetas(cama, espesor, ({ pos, size, ejeAp }) => bloques.push({ ...separarPosteta(pos, size, ejeAp), ejeAp }));

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  bloques.forEach(({ pos, size }) => {
    for (let a = 0; a < 3; a++) {
      if (pos[a] < min[a]) min[a] = pos[a];
      if (pos[a] + size[a] > max[a]) max[a] = pos[a] + size[a];
    }
  });
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

  const s = 170 / Math.max(1, (ext[0] + ext[1]) * ISO_COS);
  const esc = crearEscena(s);

  // Se recorre al origen para que la tarjeta no herede el offset que
  // traía la cama dentro del corrugado.
  bloques.forEach(({ pos, size, ejeAp }) => {
    cuboIso(esc, {
      pos: [pos[0] - min[0], pos[1] - min[1], pos[2] - min[2]],
      size, colores, ejeApilado: ejeAp, hojas, sw: 0.5,
    });
  });

  return esc.render('pf-svg-posteta');
}

/**
 * DETALLE DE LA POSTETA: una posteta sola con CADA CAJA dibujada por
 * separado, para poder contar cuántas cajas la forman.
 *
 * Es 100% esquemático a propósito: a escala una caja doblada es una hoja
 * de menos de un milímetro y 30 de ellas se ven como un bloque liso. Aquí
 * cada caja es una lámina con su propio espesor y su separación, y el
 * apilado corre a lo ANCHO del dibujo (el eje X, que en esta proyección
 * es la dirección con más espacio) para que quepan todas separadas.
 *
 * Como el tamaño de posteta es constante en toda la estrategia, un solo
 * dibujo sirve para todas las camas.
 */
function svgPostetaDetalle(piezas, dimA, dimB) {
  const cara = Math.max(dimA, dimB);
  // El apilado ocupa ~1.9 veces la cara: da un dibujo alargado, que es la
  // forma que mejor aprovecha el ancho de la tarjeta.
  const slot = (cara * 1.9) / Math.max(1, piezas);
  const grosor = slot * 0.58; // el 42% restante es la separación

  const s = 320 / ((slot * piezas + dimA) * ISO_COS);
  const esc = crearEscena(s);

  for (let i = 0; i < piezas; i++) {
    cuboIso(esc, {
      pos: [i * slot, 0, 0],
      size: [grosor, dimA, dimB],
      colores: PF_CAMA_COLORES[0],
      ejeApilado: 0, // la cara perpendicular al apilado es la tapa
      hojas: 0,      // cada cuboide YA es una caja: no lleva rayas dentro
      sw: 0.45,
    });
  }

  return esc.render('pf-svg-detalle');
}

/** Tarjeta del detalle de la posteta. */
function tarjetaPostetaDetalle(piezas, dimA, dimB) {
  return `
    <div class="pf-posteta pf-posteta-det">
      <div class="pf-posteta-tit" style="border-left:4px solid ${PF_CAMA_COLORES[0].derecha};">
        1 POSTETA = ${piezas} CAJAS
      </div>
      ${svgPostetaDetalle(piezas, dimA, dimB)}
      <div class="pf-posteta-pie">Cada lámina es una caja doblada. Separación exagerada para poder contarlas.</div>
    </div>
  `;
}

const ORDINAL_CAMA = ['1ra', '2da', '3ra', '4ta', '5ta'];

/** Tarjeta de una cama: el dibujo de la cama completa + sus datos. */
function tarjetaCama(cama, index, grosorPiezaMm, corrugado) {
  const color = PF_CAMA_COLORES[index % PF_CAMA_COLORES.length].derecha;
  return `
    <div class="pf-posteta">
      <div class="pf-posteta-tit" style="border-left:4px solid ${color};">
        ${ORDINAL_CAMA[index] || `${index + 1}a`} CAMA · ${cama.orientacionLabel}
      </div>
      <div class="pf-posteta-cuerpo">
        <div class="pf-posteta-dib">${svgCamaCompleta(cama, grosorPiezaMm, corrugado, index)}</div>
        <table class="pf-posteta-datos">
          <tr><td>Postetas</td><td><b>${cama.postetasPorCama}</b></td></tr>
          <tr><td>Piezas por posteta</td><td><b>${cama.piezasPorPosteta}</b></td></tr>
          <tr><td>Acomodo</td><td>${cama.cols}×${cama.filas} × ${cama.postetasEnEje}${cama.extra > 0 ? ` +${cama.extra}g` : ''}</td></tr>
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
function svgEntarimado({ corrugado, estiba, camas, alturaElegida }) {
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

  cuboIso(esc, { pos: [0, 0, 0], size: [largoT, anchoT, grosorTabla], colores: PF_TARIMA, sw: 0.8, capa: 0 });
  const bandas = [0, (anchoT - anchoT * 0.16) / 2, anchoT - anchoT * 0.16];
  bandas.forEach((y0, i) => {
    cuboIso(esc, {
      pos: [0, y0, grosorTabla],
      size: [largoT, anchoT * 0.16, altoTacon],
      colores: PF_TARIMA_TACON,
      sw: 0.8, capa: 1 + i,
    });
  });
  cuboIso(esc, { pos: [0, 0, altoT - grosorTabla], size: [largoT, anchoT, grosorTabla], colores: PF_TARIMA, sw: 0.8, capa: 4 });

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

  // El total va con el exceso pegado cuando se pasa del límite, para que
  // en la hoja impresa se vea de cuánto es el sobrepaso sin tener que
  // sacar la cuenta.
  const exceso = alturaElegida && alturaElegida.excesoMm > 0 ? alturaElegida.excesoMm : 0;
  acotarIso(esc, [0, anchoT, 0], [0, anchoT, altoTotal], `TOTAL ${fmtCm(altoTotal)}`, [-34, 0]);
  if (exceso > 0) {
    // Línea del límite permitido, para ver contra qué se compara.
    const qA = esc.p([largoT, anchoT, estiba.altoMaxTotalMm]);
    const qB = esc.p([0, anchoT, estiba.altoMaxTotalMm]);
    const qC = esc.p([0, 0, estiba.altoMaxTotalMm]);
    const etiqueta = `límite ${fmtCm(estiba.altoMaxTotalMm)} — se pasa ${fmtCm(exceso)}`;
    // El bounding box solo conoce puntos, no el ancho del texto, así que
    // hay que reservarle el espacio a mano o el viewBox lo recorta.
    esc.tocar([qB[0] - 6 - etiqueta.length * 4.2, qB[1] - 12]);
    esc.add(CAPA_ANOTACION, `
      <polyline points="${polyStr([qA, qB, qC])}" fill="none" stroke="#c0392b" stroke-width="1.1" stroke-dasharray="5 3"/>
      <text x="${(qB[0] - 6).toFixed(1)}" y="${(qB[1] - 4).toFixed(1)}" text-anchor="end" class="pf-dim-exceso">${etiqueta}</text>
    `);
  }

  return esc.render('pf-svg');
}

/** Construye e inyecta la ficha imprimible con los datos ya calculados. */
function renderPrintFicha({ input, corrugado, estrategia, estiba, camasMostradas, totalMostrado, pesoTotalKg, fecha, grosorPiezaMm, largoDobladoMm, altoDobladoMm, alturaElegida }) {
  const el = document.getElementById('print-ficha');
  if (!el) return;

  const empaqueSvg = svgCorrugadoConPostetas({ corrugado, estrategia, grosorPiezaMm });
  const entarimadoSvg = svgEntarimado({ corrugado, estiba, camas: camasMostradas, alturaElegida });
  const tarjetas = estrategia.camas.map((c, i) => tarjetaCama(c, i, grosorPiezaMm, corrugado)).join('');

  // Desglose de pesos: pieza -> corrugado -> tarima cargada.
  const pesos = calcularPesos({
    pesoPiezaG: pesoTotalKg != null ? (pesoTotalKg * 1000) / estrategia.total : null,
    piezasPorCorrugado: estrategia.total,
    corrugado,
    corrugadosPorTarima: totalMostrado,
  });

  const leyenda = estrategia.camas.map((c, i) => `
    <span class="pf-leg">
      <i style="background:${PF_CAMA_COLORES[i % PF_CAMA_COLORES.length].derecha}"></i>
      ${ORDINAL_CAMA[i] || `${i + 1}a`} cama · ${c.orientacionLabel.toLowerCase()} · ${c.postetasPorCama} postetas
    </span>
  `).join('');

  el.innerHTML = `
    <table class="pf-header">
      <tr>
        <td class="pf-logo" rowspan="4">${logoFichaHTML(70)}</td>
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
      <h4>Posteta y camas — postetas de ${estrategia.piezasPorPosteta} cajas</h4>
      <div class="pf-postetas">
        ${tarjetaPostetaDetalle(estrategia.piezasPorPosteta, largoDobladoMm, altoDobladoMm)}
        ${tarjetas}
      </div>
    </div>

    <table class="pf-data">
      <tr>
        <td class="pf-label">Tipo de Caja:</td><td>${corrugado.id}</td>
        <td class="pf-label">Cantidad por Cama:</td><td>${estiba.piso.total} cajas</td>
        <td class="pf-label">Postetas por caja:</td><td>${estrategia.camas.map((c) => `${c.postetasPorCama}/${c.piezasPorPosteta}`).join(' + ')}</td>
      </tr>
      <tr>
        <td class="pf-label">Dimensiones Internas:</td><td>${corrugado.largo} X ${corrugado.ancho} X ${corrugado.alto} mm</td>
        <td class="pf-label">Estiba:</td>
        <td>${camasMostradas} cajas${alturaElegida ? ` — bulto ${fmtCm(alturaElegida.totalMm)}${
          alturaElegida.excesoMm > 0
            ? ` <b style="color:#c0392b;">(se pasa ${fmtCm(alturaElegida.excesoMm)} del límite de ${fmtCm(estiba.altoMaxTotalMm)})</b>`
            : ''}` : ''}</td>
        <td class="pf-label">Total de Piezas:</td><td>${estrategia.total} pzas.</td>
      </tr>
      <tr>
        <td class="pf-label">Caja armada:</td><td>${input.largo} X ${input.ancho} X ${input.alto} mm</td>
        <td class="pf-label">Tarima:</td><td>${corrugadoTarimaLabel()}</td>
        <td class="pf-label">Peso Bruto*:</td>
        <td>${pesos ? `${fmtPf(pesos.brutoCorrugadoKg)} kg${
          pesos.excedeLimite ? ` <b style="color:#c0392b;">⚠ +${fmtPf(pesos.excesoKg)} kg</b>` : ''}` : '—'}</td>
      </tr>
      ${pesos ? `
      <tr>
        <td class="pf-label">Peso Tarima:</td>
        <td><b>${fmtPf(pesos.tarimaTotalKg)} kg</b></td>
        <td class="pf-label">Máx. por caja:</td>
        <td>${pesos.limiteCorrugadoKg} kg${pesos.excedeLimite ? ' <b style="color:#c0392b;">EXCEDIDO</b>' : ' ✓'}</td>
        <td class="pf-label">Piezas por tarima:</td>
        <td>${(totalMostrado * estrategia.total).toLocaleString('es-MX')} pzas.</td>
      </tr>` : ''}
    </table>

    <div class="pf-footer">
      AF-FR-PP-02 FICHA DE EMBALAJE REV. 01 — Total por tarima: ${totalMostrado} corrugados / ${totalMostrado * estrategia.total} pzas.
      ${pesos ? `<br>*Peso Bruto por corrugado = ${fmtPf(pesos.piezasKg)} kg de piezas + ${fmtPf(pesos.corrugadoVacioKg)} kg del corrugado (36 ECT estimado en ${GRAMAJE_CORRUGADO_36ECT} g/m², pendiente de confirmar con el proveedor). Tarima estándar tomada como ${fmtPf(pesos.tarimaVaciaKg)} kg.${pesos.excedeLimite ? ` AVISO: el corrugado pesa ${fmtPf(pesos.excesoKg)} kg más que el máximo de ${pesos.limiteCorrugadoKg} kg.` : ''}` : ''}
      <br>Los dibujos de camas y corrugado son esquemáticos: las postetas van separadas y engrosadas a propósito para poder contarlas. Las medidas válidas son las de la tabla y las de la tarima.
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

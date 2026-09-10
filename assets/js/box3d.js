/**
 * Motor de escenas 3D (CSS 3D transforms, sin librerías externas), reusado
 * por dos vistas: caja-de-producto-dentro-del-corrugado y
 * corrugados-sobre-la-tarima.
 *
 * Eje mapeado a pantalla: X = largo, Y = alto (vertical en pantalla,
 * invertido porque CSS crece hacia abajo), Z = ancho/profundidad.
 *
 * Técnica de centrado: cada "cuboid" es un anchor de tamaño cero
 * posicionado con translate3d desde el origen compartido de la escena;
 * cada cara es un div absoluto centrado sobre ese anchor con
 * left/top = -mitad de su propio ancho/alto (en vez de porcentajes, para
 * que las caras laterales —con dimensiones distintas al frente— queden
 * centradas igual).
 */

function face(cls, w, h, transform, bg, extra = '') {
  const left = -w / 2;
  const top = -h / 2;
  return `<div class="f3d ${cls}" style="width:${w}px;height:${h}px;left:${left}px;top:${top}px;transform:${transform};background:${bg};${extra}"></div>`;
}

function cuboidHTML({ w, h, d, colorTop, colorFront, colorSide, border = '' }) {
  const halfW = w / 2, halfH = h / 2, halfD = d / 2;
  return `
    ${face('f-front', w, h, `translateZ(${halfD}px)`, colorFront, border)}
    ${face('f-back', w, h, `translateZ(${-halfD}px) rotateY(180deg)`, colorFront, border)}
    ${face('f-right', d, h, `translateX(${halfW}px) rotateY(90deg)`, colorSide, border)}
    ${face('f-left', d, h, `translateX(${-halfW}px) rotateY(-90deg)`, colorSide, border)}
    ${face('f-top', w, d, `translateY(${-halfH}px) rotateX(90deg)`, colorTop, border)}
    ${face('f-bottom', w, d, `translateY(${halfH}px) rotateX(-90deg)`, colorTop, border)}
  `;
}

function anchored(cx, cy, cz, innerHTML) {
  return `<div class="cuboid-anchor" style="transform: translate3d(${cx}px, ${-cy}px, ${cz}px);">${innerHTML}</div>`;
}

/**
 * Monta la escena (perspectiva + arrastre + auto-rotación) y le inyecta el
 * HTML que regrese buildInnerHTML(). Reusable por cualquier vista 3D.
 */
function mountScene(mountEl, innerHTML, { startRy = 35, startRx = -22 } = {}) {
  mountEl.innerHTML = `
    <div class="scene3d-wrap">
      <div class="scene3d-perspective">
        <div class="scene3d" id="scene3d-inner-${Math.random().toString(36).slice(2)}">
          ${innerHTML}
        </div>
      </div>
      <div class="scene3d-hint">Arrastra para girar</div>
    </div>
  `;

  const scene = mountEl.querySelector('.scene3d');
  let rx = startRx, ry = startRy;
  let dragging = false, lastX = 0, lastY = 0;
  let autoRotate = true;

  function apply() { scene.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; }
  apply();

  function down(x, y) { dragging = true; autoRotate = false; lastX = x; lastY = y; }
  function move(x, y) {
    if (!dragging) return;
    ry += (x - lastX) * 0.4;
    rx -= (y - lastY) * 0.4;
    rx = Math.max(-85, Math.min(85, rx));
    lastX = x; lastY = y;
    apply();
  }
  function up() { dragging = false; }

  const wrap = mountEl.querySelector('.scene3d-perspective');
  wrap.addEventListener('mousedown', (e) => down(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
  window.addEventListener('mouseup', up);
  wrap.addEventListener('touchstart', (e) => down(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  wrap.addEventListener('touchmove', (e) => move(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  wrap.addEventListener('touchend', up);

  (function loop() {
    if (autoRotate) { ry += 0.25; apply(); }
    if (mountEl.isConnected) requestAnimationFrame(loop);
  })();
}

const SCENE_PX = 260;

const CAMA_COLORS = [
  { top: '#eaf3fb', front: '#0060b0', side: '#0b2a4a' },
  { top: '#dcecf9', front: '#5090c0', side: '#2a5a86' },
  { top: '#e6f2ec', front: '#1f9d55', side: '#14603a' },
  { top: '#fdf0e2', front: '#c88a1a', side: '#8a5f10' },
];

// Mismos colores (cara frontal) para las etiquetas de la UI.
const CAMA_COLOR_HEX = CAMA_COLORS.map((c) => c.front);

// Líneas finas repetidas en una cara "de canto" (lateral al eje de
// apilado), para sugerir que la posteta es un bloque de piezas apiladas
// (como el ícono "postetas" de las fichas reales), no una caja sólida.
// dir = 'to bottom' o 'to right', según qué dimensión propia de esa cara
// coincide con el eje real de apilado (ver postetaCuboidHTML).
function postetaStripes(colorBase, lineas, dir = 'to bottom') {
  const n = Math.max(4, Math.min(14, lineas));
  const step = 100 / n;
  return `repeating-linear-gradient(${dir}, ${colorBase} 0px, ${colorBase} ${step * 0.72}%, rgba(0,0,0,0.16) ${step * 0.72}%, rgba(0,0,0,0.16) ${step}%)`;
}

/**
 * Cuboide de una posteta consciente de su eje de apilado REAL en el
 * mundo (stackAxisWorld: 'x'=largo, 'y'=alto, 'z'=ancho) — las 2 caras
 * perpendiculares a ese eje (las "tapas" del bloque de hojas) se pintan
 * planas (colorTapa); las otras 4 (de canto) llevan las rayitas que
 * simulan las hojas apiladas, en la dirección que corresponda a ese
 * mismo eje. Así, si la posteta está "parada" se ve la tapa blanca
 * arriba/abajo; si está "acostada" la tapa blanca queda de lado.
 */
function postetaCuboidHTML({ w, h, d, stackAxisWorld, colorTapa, colorCanto, piezas, border = '' }) {
  const halfW = w / 2, halfH = h / 2, halfD = d / 2;

  const frontBackEsTapa = stackAxisWorld === 'z';
  const rightLeftEsTapa = stackAxisWorld === 'x';
  const topBottomEsTapa = stackAxisWorld === 'y';

  const frontBackColor = frontBackEsTapa ? colorTapa : postetaStripes(colorCanto, piezas, stackAxisWorld === 'x' ? 'to right' : 'to bottom');
  const rightLeftColor = rightLeftEsTapa ? colorTapa : postetaStripes(colorCanto, piezas, stackAxisWorld === 'z' ? 'to right' : 'to bottom');
  const topBottomColor = topBottomEsTapa ? colorTapa : postetaStripes(colorCanto, piezas, stackAxisWorld === 'x' ? 'to right' : 'to bottom');

  return `
    ${face('f-front', w, h, `translateZ(${halfD}px)`, frontBackColor, border)}
    ${face('f-back', w, h, `translateZ(${-halfD}px) rotateY(180deg)`, frontBackColor, border)}
    ${face('f-right', d, h, `translateX(${halfW}px) rotateY(90deg)`, rightLeftColor, border)}
    ${face('f-left', d, h, `translateX(${-halfW}px) rotateY(-90deg)`, rightLeftColor, border)}
    ${face('f-top', w, d, `translateY(${-halfH}px) rotateX(90deg)`, topBottomColor, border)}
    ${face('f-bottom', w, d, `translateY(${halfH}px) rotateX(-90deg)`, topBottomColor, border)}
  `;
}

// largo->X, ancho->Z, alto->Y (misma convención que el resto del archivo).
const EJE_A_MUNDO = { largo: 'x', ancho: 'z', alto: 'y' };

// Convierte una coordenada "desde el borde/piso" (mm) de un eje horizontal
// (largo->X, ancho->Z) a la coordenada centrada que usa `anchored()`.
function horizCoord(centerDesdeBorde, dimTotal, scale) {
  return centerDesdeBorde * scale - (dimTotal * scale) / 2;
}
// Igual, pero para el eje vertical (alto->Y). `anchored()` ya niega la Y
// (CSS crece hacia abajo), así que aquí se regresa "altura sobre el
// centro": alto=0 es el PISO del corrugado y queda abajo en pantalla, y
// las camas de más arriba se dibujan más arriba.
function vertCoord(centerDesdeBorde, dimTotal, scale) {
  return centerDesdeBorde * scale - (dimTotal * scale) / 2;
}

/**
 * Vista: postetas (piezas dobladas apiladas) acomodadas dentro del
 * corrugado. Soporta VARIAS camas, cada una con su propio eje de apilado
 * (parada = alto, acostada = largo o ancho) — se dibujan apiladas en el
 * eje que usó la primera cama, dejando que cada una tenga su propia
 * orientación interna.
 */
function renderProductScene(mountEl, { corrugado, estrategia, grosorPiezaMm }) {
  const { largo, ancho, alto } = corrugado; // mm: largo->X, ancho->Z, alto->Y
  const scale = SCENE_PX / Math.max(largo, ancho, alto);
  const contW = largo * scale, contH = alto * scale, contD = ancho * scale;

  let units = '';

  function dibujarCelda(cama, color, offsetA, sizeA, sizeB, i, j, stackCenter, stackLen) {
    const centers = {};
    centers[cama.ejeApilado] = stackCenter;
    centers[cama.ejeA] = offsetA + (i + 0.5) * sizeA;
    centers[cama.ejeB] = cama.origen[cama.ejeB] + (j + 0.5) * sizeB;

    const sizes = {};
    sizes[cama.ejeApilado] = stackLen;
    sizes[cama.ejeA] = sizeA;
    sizes[cama.ejeB] = sizeB;

    const cx = horizCoord(centers.largo, largo, scale);
    const cz = horizCoord(centers.ancho, ancho, scale);
    const cy = vertCoord(centers.alto, alto, scale);
    const boxW = sizes.largo * scale, boxD = sizes.ancho * scale, boxH = sizes.alto * scale;

    return anchored(cx, cy, cz, postetaCuboidHTML({
      w: boxW * 0.92, h: boxH * 0.92, d: boxD * 0.92,
      stackAxisWorld: EJE_A_MUNDO[cama.ejeApilado],
      colorTapa: color.top,
      colorCanto: color.front,
      piezas: cama.piezasPorPosteta / 3,
      border: 'box-shadow: inset 0 0 0 1px rgba(255,255,255,0.3);',
    }));
  }

  estrategia.camas.forEach((cama, camaIndex) => {
    const color = CAMA_COLORS[camaIndex % CAMA_COLORS.length];
    // Cada posteta se dibuja por separado (no un bloque continuo), para
    // que se vea que son grupos completos y ninguno queda volando.
    const alturaPosteta = cama.piezasPorPosteta * grosorPiezaMm;
    const postetas = cama.postetasEnEje || 1;

    for (let k = 0; k < postetas; k++) {
      const inicio = cama.origen[cama.ejeApilado] + k * alturaPosteta;
      const centro = inicio + alturaPosteta / 2;

      // Cuadrícula principal.
      for (let i = 0; i < cama.cols; i++) {
        for (let j = 0; j < cama.filas; j++) {
          units += dibujarCelda(cama, color, cama.origen[cama.ejeA], cama.dimA, cama.dimB, i, j, centro, alturaPosteta);
        }
      }

      // Tira sobrante rellena con postetas ROTADAS 90° (mismo truco que
      // la tarima) — mismo eje de apilado y misma cama, distinta
      // orientación.
      if (cama.extra > 0) {
        const offsetExtraA = cama.origen[cama.ejeA] + cama.cols * cama.dimA;
        for (let i = 0; i < cama.extraCols; i++) {
          for (let j = 0; j < cama.extraFilas; j++) {
            units += dibujarCelda(cama, color, offsetExtraA, cama.dimB, cama.dimA, i, j, centro, alturaPosteta);
          }
        }
      }
    }
  });

  const container = anchored(0, 0, 0, cuboidHTML({
    w: contW, h: contH, d: contD,
    colorTop: 'rgba(196,154,108,0.16)',
    colorFront: 'rgba(196,154,108,0.20)',
    colorSide: 'rgba(150,110,70,0.26)',
    border: 'box-shadow: inset 0 0 0 1.5px rgba(120,85,45,0.55);',
  }));

  mountScene(mountEl, container + units);
}

const CORR_COLORS = [
  { top: '#e3c9a0', front: '#c49a5e', side: '#9c7440' },
  { top: '#d8b98a', front: '#b3854a', side: '#8a6236' },
];

/**
 * Vista: corrugados acomodados sobre la tarima, por cama de corrugados.
 * El piso de cada cama puede mezclar 2 orientaciones (grid principal +
 * una tira sobrante con corrugados rotados 90°) — nunca se acuestan de
 * lado, solo se rota el piso. `useExtendida` decide si se dibuja la
 * altura seguro o la extendida (más camas, con aviso en la UI).
 */
function renderPalletScene(mountEl, { corrugado, estiba, useExtendida = false }) {
  const largoTarimaMm = TARIMA.largo_cm * 10;
  const anchoTarimaMm = TARIMA.ancho_cm * 10;
  const altoTarimaMm = TARIMA.alto_tarima_cm * 10;
  const { piso } = estiba;
  const camas = useExtendida ? estiba.camasExtendidas : estiba.camas;

  const totalAlto = altoTarimaMm + camas * corrugado.alto;
  const diagonalPiso = Math.hypot(largoTarimaMm, anchoTarimaMm);
  const sceneMax = Math.max(diagonalPiso, totalAlto) * 1.15;
  const scale = (SCENE_PX * 0.8) / sceneMax;

  const palletW = largoTarimaMm * scale, palletD = anchoTarimaMm * scale, palletH = altoTarimaMm * scale;
  const boxW = piso.wPrincipal * scale, boxD = piso.wRotado * scale;
  const exBoxW = piso.wRotado * scale, exBoxD = piso.wPrincipal * scale;
  const boxH = corrugado.alto * scale;

  let units = '';
  for (let k = 0; k < camas; k++) {
    const color = CORR_COLORS[k % CORR_COLORS.length];
    const cy = palletH / 2 + k * boxH + boxH / 2;

    for (let i = 0; i < piso.cols; i++) {
      for (let j = 0; j < piso.filas; j++) {
        const cx = horizCoord((i + 0.5) * piso.wPrincipal, largoTarimaMm, scale);
        const cz = horizCoord((j + 0.5) * piso.wRotado, anchoTarimaMm, scale);
        units += anchored(cx, cy, cz, cuboidHTML({
          w: boxW * 0.96, h: boxH * 0.96, d: boxD * 0.96,
          colorTop: color.top, colorFront: color.front, colorSide: color.side,
          border: 'box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35);',
        }));
      }
    }

    const offsetX = piso.cols * piso.wPrincipal;
    for (let i = 0; i < piso.extraCols; i++) {
      for (let j = 0; j < piso.extraFilas; j++) {
        const cx = horizCoord(offsetX + (i + 0.5) * piso.wRotado, largoTarimaMm, scale);
        const cz = horizCoord((j + 0.5) * piso.wPrincipal, anchoTarimaMm, scale);
        units += anchored(cx, cy, cz, cuboidHTML({
          w: exBoxW * 0.96, h: boxH * 0.96, d: exBoxD * 0.96,
          colorTop: color.top, colorFront: color.front, colorSide: color.side,
          border: 'box-shadow: inset 0 0 0 2px rgba(255,255,255,0.6);',
        }));
      }
    }
  }

  const pallet = anchored(0, 0, 0, cuboidHTML({
    w: palletW, h: palletH, d: palletD,
    colorTop: '#c8a35f', colorFront: '#a97f3f', colorSide: '#8a672f',
    border: 'box-shadow: inset 0 0 0 1px rgba(90,60,20,0.5);',
  }));

  mountScene(mountEl, pallet + units, { startRy: 40, startRx: -18 });
}

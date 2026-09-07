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
];

// Líneas finas repetidas en la cara frontal, para sugerir que la posteta
// es un bloque de piezas apiladas (como el ícono "postetas" de las fichas
// reales), no una caja sólida.
function postetaStripes(colorBase, lineas) {
  const n = Math.max(4, Math.min(14, lineas));
  const step = 100 / n;
  return `repeating-linear-gradient(to bottom, ${colorBase} 0px, ${colorBase} ${step * 0.72}%, rgba(0,0,0,0.16) ${step * 0.72}%, rgba(0,0,0,0.16) ${step}%)`;
}

/** Vista: postetas (piezas dobladas apiladas) acomodadas dentro del corrugado. */
function renderProductScene(mountEl, { corrugado, acomodo, grosorPiezaMm }) {
  const { largo, ancho, alto } = corrugado; // mm: largo->X, ancho->Z, alto->Y
  const { orientacion, cols, filas, piezasPorPosteta } = acomodo;
  const scale = SCENE_PX / Math.max(largo, ancho, alto);

  const contW = largo * scale, contH = alto * scale, contD = ancho * scale;
  const boxW = orientacion.x * scale, boxD = orientacion.y * scale;
  const boxH = Math.min(alto, piezasPorPosteta * grosorPiezaMm) * scale;

  const color = CAMA_COLORS[0];
  let units = '';
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < filas; j++) {
      const cx = (i + 0.5) * boxW - contW / 2;
      const cz = (j + 0.5) * boxD - contD / 2;
      const cy = (contH - boxH) / 2; // posteta parada desde el piso del corrugado
      units += anchored(cx, cy, cz, cuboidHTML({
        w: boxW * 0.92, h: boxH, d: boxD * 0.92,
        colorTop: color.top,
        colorFront: postetaStripes(color.front, piezasPorPosteta / 3),
        colorSide: postetaStripes(color.side, piezasPorPosteta / 3),
        border: 'box-shadow: inset 0 0 0 1px rgba(255,255,255,0.3);',
      }));
    }
  }

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

/** Vista: corrugados acomodados sobre la tarima, por cama de corrugados. */
function renderPalletScene(mountEl, { corrugado, estiba }) {
  const largoTarimaMm = TARIMA.largo_cm * 10;
  const anchoTarimaMm = TARIMA.ancho_cm * 10;
  const altoTarimaMm = TARIMA.alto_tarima_cm * 10;

  const corrLargo = estiba.rotado ? corrugado.ancho : corrugado.largo;
  const corrAncho = estiba.rotado ? corrugado.largo : corrugado.ancho;
  const { cols, filas, camas } = estiba;

  const sceneMax = Math.max(largoTarimaMm, anchoTarimaMm, altoTarimaMm + camas * corrugado.alto);
  const scale = SCENE_PX / sceneMax;

  const palletW = largoTarimaMm * scale, palletD = anchoTarimaMm * scale, palletH = altoTarimaMm * scale;
  const boxW = corrLargo * scale, boxD = corrAncho * scale, boxH = corrugado.alto * scale;

  let units = '';
  for (let k = 0; k < camas; k++) {
    const color = CORR_COLORS[k % CORR_COLORS.length];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < filas; j++) {
        const cx = (i + 0.5) * boxW - (cols * boxW) / 2;
        const cz = (j + 0.5) * boxD - (filas * boxD) / 2;
        const cy = palletH / 2 + k * boxH + boxH / 2;
        units += anchored(cx, cy, cz, cuboidHTML({
          w: boxW * 0.96, h: boxH * 0.96, d: boxD * 0.96,
          colorTop: color.top, colorFront: color.front, colorSide: color.side,
          border: 'box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35);',
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

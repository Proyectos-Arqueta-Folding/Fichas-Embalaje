/**
 * Vista 3D interactiva (CSS 3D transforms, sin librerías externas).
 * Dibuja el corrugado como una caja translúcida tipo cartón, y adentro
 * las cajas de producto acomodadas por cama (una cama = una capa
 * horizontal), coloreadas por cama para que se distingan a simple vista.
 *
 * Eje mapeado a pantalla: X = largo del corrugado, Y = alto (vertical
 * en pantalla, invertido porque CSS crece hacia abajo), Z = ancho
 * (profundidad). Las camas se apilan en Y.
 *
 * Técnica: cada "cuboid" es un anchor de tamaño cero posicionado con
 * translate3d desde el origen compartido de la escena; cada cara es un
 * div absoluto centrado sobre ese anchor con left/top = -mitad de su
 * propio ancho/alto (en vez de porcentajes, para que las caras laterales
 * —con dimensiones distintas al frente— queden centradas igual).
 */

const SCENE_PX = 260; // tamaño máximo de la arista más larga, en px

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

const CAMA_COLORS = [
  { top: '#eaf3fb', front: '#0060b0', side: '#0b2a4a' },
  { top: '#dcecf9', front: '#5090c0', side: '#2a5a86' },
];

function renderBox3D(mountEl, { corrugado, acomodo }) {
  const { largo, ancho, alto } = corrugado; // mm: largo->X, ancho->Z, alto->Y
  const { orientacion, cols, filas, camas } = acomodo;
  const scale = SCENE_PX / Math.max(largo, ancho, alto);

  const contW = largo * scale;
  const contH = alto * scale;
  const contD = ancho * scale;

  const boxW = orientacion.x * scale;
  const boxH = orientacion.z * scale;
  const boxD = orientacion.y * scale;

  let unitsHTML = '';
  for (let k = 0; k < camas; k++) {
    const color = CAMA_COLORS[k % CAMA_COLORS.length];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < filas; j++) {
        const cx = (i + 0.5) * boxW - contW / 2;
        const cz = (j + 0.5) * boxD - contD / 2;
        const cyTop = k * boxH; // distancia desde el piso del corrugado hasta la base de esta cama
        const cy = contH / 2 - (cyTop + boxH / 2); // centro de la caja, medido desde el centro del corrugado
        unitsHTML += `
          <div class="cuboid-anchor" style="transform: translate3d(${cx}px, ${-cy}px, ${cz}px);">
            ${cuboidHTML({
              w: boxW * 0.92, h: boxH * 0.92, d: boxD * 0.92,
              colorTop: color.top, colorFront: color.front, colorSide: color.side,
              border: 'box-shadow: inset 0 0 0 1px rgba(255,255,255,0.3);'
            })}
          </div>`;
      }
    }
  }

  const containerHTML = `
    <div class="cuboid-anchor">
      ${cuboidHTML({
        w: contW, h: contH, d: contD,
        colorTop: 'rgba(196,154,108,0.16)',
        colorFront: 'rgba(196,154,108,0.20)',
        colorSide: 'rgba(150,110,70,0.26)',
        border: 'box-shadow: inset 0 0 0 1.5px rgba(120,85,45,0.55);'
      })}
    </div>`;

  mountEl.innerHTML = `
    <div class="scene3d-wrap">
      <div class="scene3d-perspective">
        <div class="scene3d" id="scene3d-inner">
          ${containerHTML}
          ${unitsHTML}
        </div>
      </div>
      <div class="scene3d-hint">Arrastra para girar</div>
    </div>
  `;

  const scene = mountEl.querySelector('#scene3d-inner');
  let rx = -22, ry = 35;
  let dragging = false, lastX = 0, lastY = 0;
  let autoRotate = true;

  function apply() {
    scene.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  }
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
    if (autoRotate) {
      ry += 0.25;
      apply();
    }
    if (mountEl.isConnected) requestAnimationFrame(loop);
  })();
}

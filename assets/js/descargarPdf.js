/**
 * Descarga de la ficha en PDF de un solo clic, sin pasar por el diálogo
 * de impresión del navegador.
 *
 * Cómo funciona: se saca la ficha a un contenedor fuera de pantalla con
 * el ANCHO EXACTO del área imprimible de la hoja, html2canvas la
 * fotografía y jsPDF mete esa imagen en una carta horizontal. Las dos
 * librerías se bajan de cdnjs la primera vez que se usa el botón y
 * quedan en caché del navegador.
 *
 * LO QUE SE PIERDE con respecto a imprimir: el PDF lleva una imagen, no
 * texto vectorial. Por eso se captura a 3x (unos 270 ppp), que aguanta
 * bien impreso, pero no se puede seleccionar el texto ni hacer zoom
 * infinito. Quien quiera el PDF en vectores tiene el botón "Imprimir",
 * que sigue ahí y manda a "Guardar como PDF".
 */

const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

// Carta horizontal con el mismo margen que `@page` en styles.css.
const HOJA_ANCHO_MM = 279.4;
const HOJA_ALTO_MM = 215.9;
const HOJA_MARGEN_MM = 10;

// 96 px por pulgada es la referencia del CSS.
const PX_POR_MM = 96 / 25.4;

// Cuántas veces más grande se fotografía. 3 deja ~270 ppp en la hoja.
const ESCALA_CAPTURA = 3;

function cargarScript(url, comoSeLlama, global) {
  if (window[global]) return Promise.resolve(window[global]);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => (window[global]
      ? resolve(window[global])
      : reject(new Error(`${comoSeLlama} cargó incompleto.`)));
    s.onerror = () => reject(new Error(`No se pudo bajar ${comoSeLlama} (¿sin internet?).`));
    document.head.appendChild(s);
  });
}

let cargaLibrerias = null;
function cargarLibrerias() {
  if (!cargaLibrerias) {
    cargaLibrerias = Promise.all([
      cargarScript(HTML2CANVAS_URL, 'el generador de PDF', 'html2canvas'),
      cargarScript(JSPDF_URL, 'el generador de PDF', 'jspdf'),
    ]).catch((err) => {
      cargaLibrerias = null;   // que se pueda reintentar
      throw err;
    });
  }
  return cargaLibrerias;
}

/**
 * Fotografía el nodo de la ficha.
 *
 * La ficha vive con `display: none` (solo se enciende al imprimir), y
 * html2canvas no puede retratar algo oculto. Se mueve a una jaula fuera
 * de pantalla —no invisible— con el ancho de la hoja, y al terminar se
 * regresa exactamente a donde estaba.
 */
async function fotografiarFicha(html2canvas, ficha) {
  const padre = ficha.parentNode;
  const hermano = ficha.nextSibling;
  const estiloPrevio = ficha.getAttribute('style');

  const anchoPx = Math.round((HOJA_ANCHO_MM - 2 * HOJA_MARGEN_MM) * PX_POR_MM);
  const jaula = document.createElement('div');
  jaula.style.cssText = `position:fixed; left:-10000px; top:0; width:${anchoPx}px; background:#fff;`;
  document.body.appendChild(jaula);
  jaula.appendChild(ficha);
  ficha.style.cssText = `display:block; width:${anchoPx}px; background:#fff;`;

  try {
    return await html2canvas(ficha, {
      scale: ESCALA_CAPTURA,
      backgroundColor: '#ffffff',
      logging: false,
      width: anchoPx,
      windowWidth: anchoPx,
    });
  } finally {
    if (estiloPrevio === null) ficha.removeAttribute('style');
    else ficha.setAttribute('style', estiloPrevio);
    if (padre) padre.insertBefore(ficha, hermano);
    jaula.remove();
  }
}

/**
 * Arma y baja el PDF. `nombreArchivo` va sin extensión.
 * Regresa el tamaño en MB, para poder avisarlo.
 */
async function descargarFichaPDF(nombreArchivo) {
  const [html2canvas, jspdf] = await cargarLibrerias();
  const ficha = document.getElementById('print-ficha');
  if (!ficha || !ficha.children.length) throw new Error('Todavía no hay ficha que descargar.');

  const lienzo = await fotografiarFicha(html2canvas, ficha);

  const utilAncho = HOJA_ANCHO_MM - 2 * HOJA_MARGEN_MM;
  const utilAlto = HOJA_ALTO_MM - 2 * HOJA_MARGEN_MM;

  // A lo ancho siempre llena la hoja; si el alto se pasara, se achica
  // todo en proporción para que SIGA CABIENDO EN UNA PÁGINA.
  let ancho = utilAncho;
  let alto = (utilAncho * lienzo.height) / lienzo.width;
  if (alto > utilAlto) {
    ancho = (utilAlto * lienzo.width) / lienzo.height;
    alto = utilAlto;
  }

  const doc = new jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  doc.addImage(
    lienzo.toDataURL('image/png'), 'PNG',
    (HOJA_ANCHO_MM - ancho) / 2, (HOJA_ALTO_MM - alto) / 2,
    ancho, alto, undefined, 'FAST',
  );
  doc.save(`${nombreArchivo}.pdf`);

  return { paginas: doc.getNumberOfPages(), mb: doc.output('blob').size / 1048576 };
}

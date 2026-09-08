/**
 * Lectura automática de las medidas del troquel a partir de la imagen.
 *
 * Corre 100% en el navegador con Tesseract.js (OCR por WebAssembly): la
 * imagen NO se sube a ningún lado, no hay servidor ni API de pago. La
 * primera vez descarga el motor y el idioma (unos MB) y los deja en
 * caché del navegador.
 *
 * El OCR nunca es perfecto, así que esto SIEMPRE es una sugerencia: los
 * campos quedan editables y cada uno ofrece la lista completa de números
 * detectados para corregir de un clic.
 */

const TESSERACT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/7.0.0/tesseract.min.js';

// Rango plausible de una medida de troquel en mm. Fuera de esto casi
// siempre es basura del OCR (números de pieza, ruido, etc.).
const MEDIDA_MIN_MM = 10;
const MEDIDA_MAX_MM = 3000;

let cargaTesseract = null;
function cargarTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (cargaTesseract) return cargaTesseract;
  cargaTesseract = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.onload = () => (window.Tesseract
      ? resolve(window.Tesseract)
      : reject(new Error('El lector de imágenes cargó incompleto.')));
    s.onerror = () => reject(new Error('No se pudo cargar el lector de imágenes.'));
    document.head.appendChild(s);
  });
  return cargaTesseract;
}

/**
 * Prepara la imagen para el OCR: la escala a un tamaño cómodo de leer,
 * la pasa a escala de grises y le sube el contraste. Las cotas de un
 * troquel son texto fino y chico, y sin esto se leen bastante peor.
 */
function prepararImagen(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(3, Math.max(1, 2000 / img.naturalWidth));
      const w = Math.round(img.naturalWidth * escala);
      const h = Math.round(img.naturalHeight * escala);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);

      const datos = ctx.getImageData(0, 0, w, h);
      const p = datos.data;
      for (let i = 0; i < p.length; i += 4) {
        const gris = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        // Contraste alrededor del medio, para separar texto de fondo.
        const v = Math.max(0, Math.min(255, (gris - 128) * 1.6 + 128));
        p[i] = p[i + 1] = p[i + 2] = v;
      }
      ctx.putImageData(datos, 0, 0);

      URL.revokeObjectURL(img.src);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
    img.src = URL.createObjectURL(file);
  });
}

/** Gira el canvas 90° para poder leer las cotas verticales. */
function rotar90(canvas) {
  const girado = document.createElement('canvas');
  girado.width = canvas.height;
  girado.height = canvas.width;
  const ctx = girado.getContext('2d');
  ctx.translate(girado.width / 2, girado.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return girado;
}

function canvasABlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Saca del texto reconocido los tokens que parecen una medida en mm.
 * Se lee de `data.text` y no de `data.words` porque Tesseract 7 solo
 * llena `words`/`blocks` si se lo pides aparte, y aquí no hacen falta
 * las posiciones: el reparto por campo se resuelve por geometría.
 */
function numerosDeTexto(texto) {
  const vistos = new Map();
  const tokens = String(texto || '').match(/\d+(?:[.,]\d+)?/g) || [];
  tokens.forEach((t) => {
    const valor = parseFloat(t.replace(',', '.'));
    if (!isFinite(valor) || valor < MEDIDA_MIN_MM || valor > MEDIDA_MAX_MM) return;
    vistos.set(valor.toFixed(2), valor);
  });
  return [...vistos.values()]
    .sort((a, b) => b - a)
    .map((valor) => ({ valor }));
}

/**
 * Reparte los números detectados entre los 4 campos.
 *
 * - Los dos totales de la lámina son los dos números más grandes (son
 *   las cotas que abarcan la hoja completa).
 * - Para los paneles se usa la geometría del troquel: la lámina mide
 *   2*largo + 2*ancho + la ceja del pegue, así que largo + ancho tiene
 *   que dar cerca de la mitad del ancho total. De los números que
 *   quedan se toma la pareja cuya suma más se acerque a esa mitad.
 *   (Verificado contra los 2 troqueles de ejemplo: acierta en ambos,
 *   mientras que "los dos más grandes" falla en uno.)
 */
function sugerirCampos(numeros) {
  // Se ordena aquí y no se confía en el orden con que llegue la lista.
  const vals = numeros.map((n) => n.valor).sort((a, b) => b - a);
  if (vals.length < 2) return null;

  const laminaAncho = vals[0];
  const laminaAlto = vals[1];
  const resto = vals.slice(2);

  let largo = null;
  let ancho = null;

  if (resto.length === 1) {
    largo = resto[0];
  } else if (resto.length >= 2) {
    const objetivo = laminaAncho / 2;
    let mejorDiff = Infinity;
    for (let i = 0; i < resto.length; i++) {
      for (let j = i + 1; j < resto.length; j++) {
        const diff = Math.abs(resto[i] + resto[j] - objetivo);
        if (diff < mejorDiff) {
          mejorDiff = diff;
          largo = Math.max(resto[i], resto[j]);
          ancho = Math.min(resto[i], resto[j]);
        }
      }
    }
  }

  return { laminaAncho, laminaAlto, largo, ancho, todos: vals };
}

/**
 * Lee las medidas de la imagen del troquel.
 * onProgreso(texto) se llama con el avance para poder mostrarlo.
 */
async function leerMedidasDeTroquel(file, onProgreso = () => {}) {
  onProgreso('Preparando la imagen…');
  const Tesseract = await cargarTesseract();
  const canvas = await prepararImagen(file);
  // Se lee dos veces: normal y girada 90°. En un troquel el alto total
  // casi siempre va acotado en vertical al costado, y Tesseract no lee
  // texto rotado — sin esta segunda pasada se pierde justo esa medida.
  const [imagen, imagenGirada] = await Promise.all([
    canvasABlob(canvas),
    canvasABlob(rotar90(canvas)),
  ]);

  onProgreso('Cargando el lector (solo la primera vez)…');
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        onProgreso(`Leyendo medidas… ${Math.round((m.progress || 0) * 100)}%`);
      } else if (m.status && m.status.includes('loading')) {
        onProgreso('Cargando el lector (solo la primera vez)…');
      }
    },
  });

  try {
    // Ojo: NO se usa tessedit_char_whitelist. Con el motor LSTM de
    // Tesseract 4+ la lista blanca degrada el reconocimiento en vez de
    // ayudar; sale mejor leer normal y filtrar después con la regex.
    const normal = await worker.recognize(imagen);
    onProgreso('Leyendo cotas verticales…');
    const girada = await worker.recognize(imagenGirada);

    const numeros = numerosDeTexto(`${normal.data.text}\n${girada.data.text}`);
    return { numeros, sugerencia: sugerirCampos(numeros) };
  } finally {
    await worker.terminate();
  }
}

/**
 * Logo de Arqueta Folding, en SVG inline.
 *
 * Va como SVG y no como PNG a propósito: se imprime nítido a cualquier
 * tamaño, no depende de un archivo binario en el repo, y sigue
 * funcionando en el bundle de un solo archivo (donde una <img> que
 * apunte a assets/ quedaría rota).
 *
 * Es una reconstrucción vectorial del logo, no el archivo original del
 * manual de marca. Si hace falta la versión exacta, se sustituye el
 * contenido de `marcaArquetaSVG` por el trazo oficial y todo lo demás
 * (encabezado de la app y esquina de la ficha impresa) lo toma solo.
 */

// Azules del cubo, del más oscuro al más claro.
const AF_AZUL = {
  fuerte: '#0f62ac',
  medio: '#4a86c5',
  claro: '#8fb4dc',
  palido: '#c6d9ee',
  tenue: '#dde8f5',
};

/**
 * El cubo: un hexágono isométrico partido en tres caras, cada una
 * subdividida por líneas blancas, con la escuadra blanca en la cara
 * izquierda (el motivo de "folding").
 */
function marcaArquetaSVG({ size = 40, id = 'af' } = {}) {
  return `
    <svg viewBox="0 0 120 132" width="${size}" height="${size * 1.1}"
         xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Arqueta Folding">
      <!-- cara superior -->
      <polygon points="60,2 116,34 60,66 4,34" fill="${AF_AZUL.palido}"/>
      <polygon points="60,2 116,34 88,50 60,34" fill="${AF_AZUL.claro}"/>
      <polygon points="60,34 88,50 60,66 32,50" fill="${AF_AZUL.tenue}"/>
      <!-- cara izquierda -->
      <polygon points="4,34 60,66 60,130 4,98" fill="${AF_AZUL.fuerte}"/>
      <polygon points="4,66 32,82 32,114 4,98" fill="${AF_AZUL.medio}"/>
      <!-- escuadra blanca (motivo de doblez) -->
      <polygon points="30,52 44,60 44,84 62,94 62,104 30,86" fill="#ffffff"/>
      <!-- cara derecha -->
      <polygon points="116,34 116,98 60,130 60,66" fill="${AF_AZUL.medio}"/>
      <polygon points="116,34 116,66 88,82 88,50" fill="${AF_AZUL.fuerte}"/>
      <polygon points="88,82 116,66 116,98 88,114" fill="${AF_AZUL.claro}"/>
      <!-- aristas -->
      <g fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round">
        <polygon points="60,2 116,34 116,98 60,130 4,98 4,34"/>
        <path d="M60,66 L60,130 M60,66 L4,34 M60,66 L116,34"/>
      </g>
    </svg>
  `;
}

/**
 * Logo completo: la marca + el texto. `variante` cambia el color del
 * texto: 'claro' para fondo oscuro (barra de la app) y 'oscuro' para
 * fondo blanco (ficha impresa).
 */
function logoArquetaSVG({ alto = 44, variante = 'oscuro' } = {}) {
  const texto = variante === 'claro' ? '#ffffff' : '#54585c';
  const linea = variante === 'claro' ? 'rgba(255,255,255,.55)' : '#8fb4dc';
  const bajada = variante === 'claro' ? 'rgba(255,255,255,.75)' : '#7c8288';
  const ancho = alto * 4.4;

  return `
    <svg viewBox="0 0 352 80" width="${ancho}" height="${alto}"
         xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Arqueta Folding — Arte Empacado">
      <g transform="translate(0,4) scale(0.545)">${marcaArquetaSVG({ size: 120, id: 'hdr' })
        .replace(/<svg[^>]*>/, '').replace('</svg>', '')}</g>
      <g font-family="'Segoe UI', Arial, Helvetica, sans-serif">
        <text x="88" y="34" font-size="27" font-weight="600" letter-spacing="1.6" fill="${texto}">ARQUETA</text>
        <text x="88" y="62" font-size="27" font-weight="600" letter-spacing="1.6" fill="${texto}">FOLDING</text>
      </g>
      <line x1="88" y1="70" x2="344" y2="70" stroke="${linea}" stroke-width="1.4"/>
      <text x="88" y="79" font-family="'Segoe UI', Arial, Helvetica, sans-serif"
            font-size="9" letter-spacing="5.6" fill="${bajada}">ARTE EMPACADO</text>
    </svg>
  `;
}

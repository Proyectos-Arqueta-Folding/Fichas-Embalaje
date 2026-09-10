/**
 * Logo de Arqueta Folding.
 *
 * Los mapas de bits viven en assets/js/logoImg.js como data-URI, no como
 * <img src="assets/img/..."> — así la misma función sirve en el sitio de
 * GitHub Pages Y en el bundle de un solo archivo del Artifact, donde una
 * ruta a assets/ quedaría rota. Los PNG originales quedan en assets/img/
 * por si hay que regenerarlos.
 *
 * Hay dos versiones, cada una sobre el fondo para el que fue diseñada:
 * la horizontal sobre azul marino para la barra de la app, y la vertical
 * sobre blanco para la esquina superior izquierda de la ficha impresa.
 */

/** Logo para la barra de la app (fondo azul marino). */
function logoAppHTML(alto = 40) {
  return `<img src="${AF_LOGO_APP}" alt="Arqueta Folding — Arte Empacado"
    style="height:${alto}px; width:auto; display:block;">`;
}

/** Logo para la ficha impresa (fondo blanco). */
function logoFichaHTML(alto = 40) {
  return `<img src="${AF_LOGO_FICHA}" alt="Arqueta Folding — Arte Empacado"
    style="height:${alto}px; width:auto; display:block; margin:0 auto;">`;
}

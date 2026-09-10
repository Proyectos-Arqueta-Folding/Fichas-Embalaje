/**
 * Historial de fichas: guardar, versionar, volver a abrir y editar.
 *
 * QUÉ SE GUARDA, Y POR QUÉ NO EL PDF
 * ----------------------------------
 * Cada registro guarda los DATOS DE ENTRADA, la SELECCIÓN manual
 * (corrugado, tamaño de posteta, acomodo, altura extendida) y un
 * RESUMEN de los números que salieron. No se guarda el PDF.
 *
 * La razón: el PDF se vuelve a generar exacto a partir de esos datos,
 * pesa ~1 MB cada uno (llenaría cualquier cuota gratis en unas pocas
 * decenas de fichas) y, sobre todo, un PDF congelado no se puede
 * reabrir para editarlo — que es justo lo que se pidió. Guardando los
 * datos, cualquier ficha vieja se abre, se cambia el corrugado o la
 * posteta, y se guarda como versión nueva.
 *
 * El `resumen` sí queda congelado: es lo que decía la ficha el día que
 * se firmó, y sirve para detectar si un cambio de fórmula movió un
 * número respecto de lo que se mandó a producción.
 *
 * VERSIONES
 * ---------
 * La llave es el CÓDIGO DE PRODUCTO. Al guardar con un código que ya
 * existe se crea V2, V3, etc. Nunca se sobrescribe: el historial es
 * de solo-agregar, para que una ficha que ya se mandó a piso no pueda
 * cambiar bajo los pies de nadie.
 *
 * DÓNDE SE GUARDA
 * ---------------
 * Detrás de un adaptador con 4 operaciones (listar/guardar/obtener/
 * borrar). Hoy corre contra localStorage, que sirve para trabajar ya
 * pero es POR NAVEGADOR: lo que guarde una persona no lo ve otra. Para
 * que las 20 personas compartan el historial hay que conectar el
 * adaptador de Supabase — es cambiar `almacen` por `almacenSupabase`,
 * el resto de la app no se entera.
 */

const HISTORIAL_LLAVE = 'af-fichas-v1';

/** Adaptador contra localStorage. Mismo contrato que tendrá Supabase. */
const almacenLocal = {
  nombre: 'este navegador',
  compartido: false,

  async listar() {
    try {
      const crudo = localStorage.getItem(HISTORIAL_LLAVE);
      return crudo ? JSON.parse(crudo) : [];
    } catch {
      // Modo privado, cuota llena o JSON corrupto: mejor historial
      // vacío que una app rota.
      return [];
    }
  },

  async guardarTodas(fichas) {
    localStorage.setItem(HISTORIAL_LLAVE, JSON.stringify(fichas));
  },

  async guardar(ficha) {
    const fichas = await this.listar();
    fichas.push(ficha);
    await this.guardarTodas(fichas);
    return ficha;
  },

  async obtener(id) {
    return (await this.listar()).find((f) => f.id === id) || null;
  },

  async borrar(id) {
    await this.guardarTodas((await this.listar()).filter((f) => f.id !== id));
  },
};

// Adaptador activo. Cambiar aquí para migrar a Supabase.
let almacen = almacenLocal;

function idFicha() {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Siguiente número de versión para un código. */
async function siguienteVersion(codigo) {
  const clave = (codigo || '').trim().toUpperCase();
  if (!clave) return 1;
  const previas = (await almacen.listar()).filter(
    (f) => (f.codigo || '').trim().toUpperCase() === clave,
  );
  return previas.length ? Math.max(...previas.map((f) => f.version || 1)) + 1 : 1;
}

/**
 * Guarda el estado actual como una versión nueva.
 * `resumen` es la foto de los números, para poder comparar después.
 */
async function guardarFichaActual({ input, seleccion, resumen }) {
  const ficha = {
    id: idFicha(),
    codigo: (input.codigo || '').trim() || 'SIN-CODIGO',
    version: await siguienteVersion(input.codigo),
    guardadaEn: new Date().toISOString(),
    cliente: input.cliente,
    articulo: input.articulo,
    realizado: input.realizado,
    entrada: { ...input },
    seleccion: { ...seleccion },
    resumen: { ...resumen },
  };
  await almacen.guardar(ficha);
  return ficha;
}

/**
 * Agrupa por código y ordena: los códigos por su versión más reciente,
 * y dentro de cada código las versiones de la más nueva a la más vieja.
 */
async function historialAgrupado() {
  const fichas = await almacen.listar();
  const porCodigo = new Map();
  fichas.forEach((f) => {
    const k = (f.codigo || 'SIN-CODIGO').trim().toUpperCase();
    if (!porCodigo.has(k)) porCodigo.set(k, []);
    porCodigo.get(k).push(f);
  });

  return [...porCodigo.entries()]
    .map(([codigo, versiones]) => ({
      codigo,
      versiones: versiones.sort((a, b) => b.version - a.version),
    }))
    .sort((a, b) => new Date(b.versiones[0].guardadaEn) - new Date(a.versiones[0].guardadaEn));
}

/** Fecha corta y legible para la lista. */
function fechaCorta(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

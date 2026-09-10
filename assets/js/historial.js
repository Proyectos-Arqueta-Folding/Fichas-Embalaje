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

/**
 * Adaptador contra Supabase (PostgREST por fetch, sin SDK ni CDN).
 *
 * Es de SOLO AGREGAR: no expone borrar, porque las políticas de la base
 * tampoco lo permiten. Un historial del que cualquiera con la llave
 * pública pudiera borrar versiones no serviría como historial.
 */
const almacenSupabase = {
  nombre: 'Supabase (compartido)',
  compartido: true,
  puedeBorrar: false,

  get base() {
    return `${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.tabla}`;
  },

  get cabeceras() {
    return {
      apikey: SUPABASE_CONFIG.llavePublicable,
      Authorization: `Bearer ${SUPABASE_CONFIG.llavePublicable}`,
      'Content-Type': 'application/json',
    };
  },

  // La base usa snake_case; la app camelCase.
  aFila(f) {
    return {
      id: f.id,
      codigo: f.codigo,
      version: f.version,
      guardada_en: f.guardadaEn,
      cliente: f.cliente,
      articulo: f.articulo,
      realizado: f.realizado,
      entrada: f.entrada,
      seleccion: f.seleccion,
      resumen: f.resumen,
    };
  },

  deFila(r) {
    return {
      id: r.id,
      codigo: r.codigo,
      version: r.version,
      guardadaEn: r.guardada_en,
      cliente: r.cliente,
      articulo: r.articulo,
      realizado: r.realizado,
      entrada: r.entrada,
      seleccion: r.seleccion,
      resumen: r.resumen,
    };
  },

  async listar() {
    const res = await fetch(`${this.base}?select=*&order=guardada_en.desc`, { headers: this.cabeceras });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return (await res.json()).map(this.deFila);
  },

  async guardar(ficha) {
    const res = await fetch(this.base, {
      method: 'POST',
      headers: { ...this.cabeceras, Prefer: 'return=representation' },
      body: JSON.stringify(this.aFila(ficha)),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const [fila] = await res.json();
    return this.deFila(fila);
  },

  async obtener(id) {
    const res = await fetch(`${this.base}?id=eq.${encodeURIComponent(id)}&select=*`, { headers: this.cabeceras });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const filas = await res.json();
    return filas.length ? this.deFila(filas[0]) : null;
  },

  async borrar() {
    throw new Error('El historial compartido es de solo agregar: no se pueden borrar versiones.');
  },
};

// Adaptador activo. Arranca en local y se cambia a Supabase si la base
// responde (ver elegirAlmacen).
let almacen = almacenLocal;

/**
 * Escoge dónde guardar. Se prefiere Supabase, porque es lo único que
 * comparte el historial entre las 20 personas; si no responde —no hay
 * red, falta crear la tabla, o el entorno bloquea la petición, como el
 * sandbox del Artifact— se sigue con localStorage en vez de dejar la
 * app sin historial. La UI dice cuál está en uso.
 */
async function elegirAlmacen() {
  if (typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG.url) {
    return { almacen: almacenLocal, motivo: 'no hay configuración de Supabase' };
  }
  try {
    await almacenSupabase.listar();
    almacen = almacenSupabase;
    return { almacen: almacenSupabase, motivo: null };
  } catch (err) {
    almacen = almacenLocal;
    return { almacen: almacenLocal, motivo: err.message };
  }
}

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

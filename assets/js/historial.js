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
  nombre: 'Supabase',
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
/** Versiones que ya existen para un código. */
async function versionesDe(codigo) {
  const clave = (codigo || '').trim().toUpperCase();
  if (!clave) return [];
  return (await almacen.listar())
    .filter((f) => (f.codigo || '').trim().toUpperCase() === clave)
    .map((f) => f.version)
    .sort((a, b) => a - b);
}

/**
 * Guarda la ficha.
 *
 * `version` la elige el usuario en el formulario. Si ya existe esa
 * versión del mismo código, NO se cambia el número por lo bajo: se
 * avisa. Sobrescribir en silencio sería peor —alguien podría creer que
 * actualizó la V2 cuando en realidad creó la V5— y renumerar en
 * silencio deja al usuario guardando en un lugar que no pidió.
 *
 * Si no se pasa versión, se toma la siguiente libre.
 */
async function guardarFichaActual({ input, seleccion, resumen, version }) {
  const base = {
    codigo: (input.codigo || '').trim() || 'SIN-CODIGO',
    cliente: input.cliente,
    articulo: input.articulo,
    realizado: input.realizado,
    entrada: { ...input },
    seleccion: { ...seleccion },
    resumen: { ...resumen },
  };

  // Versión pedida a mano: se respeta o se avisa, nunca se renumera sola.
  if (version) {
    const usadas = await versionesDe(base.codigo);
    if (usadas.includes(Number(version))) {
      const err = new Error(`Ya existe la V${version} de ${base.codigo}.`);
      err.versionOcupada = true;
      err.libre = (usadas.length ? Math.max(...usadas) : 0) + 1;
      throw err;
    }
    const ficha = { ...base, id: idFicha(), version: Number(version), guardadaEn: new Date().toISOString() };
    await almacen.guardar(ficha);
    return ficha;
  }

  // Sin versión pedida: la siguiente libre, con reintento.
  // Carrera real con 20 personas: dos que guarden el MISMO código casi
  // al mismo tiempo calculan la misma versión, y el índice único de la
  // base rechaza al segundo. En vez de fallarle al usuario, se vuelve a
  // leer la versión más alta y se reintenta — que es justo el
  // comportamiento correcto: la segunda ficha debe quedar como la
  // siguiente versión, no perderse ni pisar a la primera.
  for (let intento = 0; intento < 5; intento++) {
    const ficha = {
      ...base,
      id: idFicha(),
      version: await siguienteVersion(base.codigo),
      guardadaEn: new Date().toISOString(),
    };
    try {
      await almacen.guardar(ficha);
      return ficha;
    } catch (err) {
      // 23505 = llave duplicada en Postgres; 409 = el conflicto en PostgREST.
      const choque = /23505|409|duplicate key|duplicada/i.test(err.message || '');
      if (!choque || intento === 4) throw err;
    }
  }
  throw new Error('No se pudo asignar una versión libre después de varios intentos.');
}

/**
 * Arma el árbol del historial en tres niveles: CLIENTE -> PRODUCTO ->
 * VERSIONES, que es como se busca en la práctica ("la ficha de tal
 * cliente, del producto tal, la versión de tal fecha").
 *
 * Todo se ordena por lo más reciente primero, y cada nivel carga la
 * fecha de su última ficha para poder ubicarse sin abrirlo.
 */
async function arbolHistorial() {
  const fichas = await almacen.listar();

  const porCliente = new Map();
  fichas.forEach((f) => {
    const cliente = (f.cliente || '').trim() || 'SIN CLIENTE';
    const codigo = (f.codigo || 'SIN-CODIGO').trim().toUpperCase();
    if (!porCliente.has(cliente)) porCliente.set(cliente, new Map());
    const productos = porCliente.get(cliente);
    if (!productos.has(codigo)) productos.set(codigo, []);
    productos.get(codigo).push(f);
  });

  const masNueva = (a, b) => new Date(b.ultima) - new Date(a.ultima);

  return [...porCliente.entries()].map(([cliente, mapaProductos]) => {
    const productos = [...mapaProductos.entries()].map(([codigo, lista]) => {
      const versiones = lista.sort((a, b) => b.version - a.version);
      return {
        codigo,
        cliente,
        // El artículo puede haber cambiado entre versiones: manda el de
        // la más reciente.
        articulo: versiones[0].articulo || '—',
        versiones,
        ultima: versiones[0].guardadaEn,
      };
    }).sort(masNueva);

    return {
      cliente,
      productos,
      totalVersiones: productos.reduce((s, p) => s + p.versiones.length, 0),
      ultima: productos[0].ultima,
    };
  }).sort(masNueva);
}

/** Fecha con día, mes, año y hora. Para el renglón de cada versión. */
function fechaLarga(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    + ', ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/** Solo el día. Para los conteos de cliente y producto. */
function fechaDia(iso) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Fecha corta y legible para la lista. */
function fechaCorta(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Conexión a Supabase (base de datos compartida del historial).
 *
 * SOBRE LA LLAVE QUE ESTÁ AQUÍ EN CLARO
 * -------------------------------------
 * Es la llave PUBLICABLE (`sb_publishable_…`), no la secreta. Está
 * diseñada para vivir en el navegador y por eso puede ir en un repo
 * público — es el modelo normal de Supabase.
 *
 * PERO eso solo es seguro si las tablas tienen Row Level Security
 * ACTIVADO. Sin RLS, cualquiera con esta llave puede leer y borrar
 * todo. El SQL de instalación (ver README-supabase.sql) activa RLS y
 * deja permisos de solo LEER e INSERTAR: nadie puede borrar ni
 * modificar una ficha ya guardada, que es justo lo que se quiere de un
 * historial.
 *
 * Lo que NUNCA debe ponerse aquí es la llave `service_role` / secreta:
 * esa se salta RLS por completo.
 */
const SUPABASE_CONFIG = {
  url: 'https://lfseqcqvnzgapvsrjjkt.supabase.co',
  llavePublicable: 'sb_publishable_K1A_BW0d7DOzq8-HPKcKRQ_L8Lt6PX4',
  tabla: 'fichas',
};

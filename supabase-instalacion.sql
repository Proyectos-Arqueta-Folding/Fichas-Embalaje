-- =====================================================================
-- Fichas de Embalaje — instalación de la base de datos
--
-- Cómo correrlo: en supabase.com, proyecto lfseqcqvnzgapvsrjjkt ->
-- menú "SQL Editor" -> "New query" -> pegar todo esto -> "Run".
-- Se puede volver a correr sin problema (todo es IF NOT EXISTS).
-- =====================================================================

create table if not exists public.fichas (
  id           text primary key,
  codigo       text        not null,
  version      integer     not null,
  guardada_en  timestamptz not null default now(),
  cliente      text,
  articulo     text,
  realizado    text,
  -- Datos de entrada, selección manual y foto de los números.
  -- Van como jsonb para no tener que migrar la tabla cada vez que la
  -- ficha gana un campo.
  entrada      jsonb       not null,
  seleccion    jsonb       not null,
  resumen      jsonb       not null
);

-- Dos personas no pueden crear la misma versión del mismo código.
-- El índice va sobre upper(codigo) para que "ft-af0013" y "FT-AF0013"
-- cuenten como el mismo producto.
create unique index if not exists fichas_codigo_version
  on public.fichas (upper(codigo), version);

create index if not exists fichas_guardada_en
  on public.fichas (guardada_en desc);

-- =====================================================================
-- SEGURIDAD
--
-- La llave que trae la app en el código es la PUBLICABLE, pensada para
-- vivir en el navegador. Eso solo es seguro con Row Level Security
-- ACTIVADO: sin RLS, cualquiera con la llave puede leer y borrar todo.
--
-- Se dan permisos de LEER e INSERTAR nada más. Nadie puede borrar ni
-- modificar una ficha ya guardada — que es justo lo que se espera de un
-- historial: una ficha que ya se mandó a piso no debe poder cambiar
-- bajo los pies de nadie.
-- =====================================================================

alter table public.fichas enable row level security;

drop policy if exists "leer fichas" on public.fichas;
create policy "leer fichas"
  on public.fichas for select
  to anon, authenticated
  using (true);

drop policy if exists "agregar fichas" on public.fichas;
create policy "agregar fichas"
  on public.fichas for insert
  to anon, authenticated
  with check (true);

-- A propósito NO se crean políticas de UPDATE ni de DELETE: sin
-- política, RLS las niega.
--
-- Si algún día hace falta borrar (por ejemplo, limpiar pruebas), lo
-- recomendable NO es abrir el borrado a todo el mundo, sino hacerlo
-- desde el panel de Supabase (Table Editor), que entra con la llave de
-- servicio y se salta RLS.

-- =====================================================================
-- Comprobación rápida: debe devolver 2 renglones (leer y agregar).
-- =====================================================================
select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'fichas'
 order by cmd;

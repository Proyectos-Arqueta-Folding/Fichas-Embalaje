-- =====================================================================
-- Fichas de Embalaje — habilitar el borrado de versiones
--
-- Cómo correrlo: supabase.com -> proyecto -> "SQL Editor" -> "New query"
-- -> pegar todo -> "Run". Se puede volver a correr sin problema.
--
-- POR QUÉ BORRADO SUAVE Y NO DELETE
--
-- El renglón no se elimina: se marca `borrada = true` y la app deja de
-- mostrarlo. Dos razones:
--
--  1. Si alguien borra por error, se recupera con un UPDATE (abajo está
--     el comando). Con DELETE, la ficha se va para siempre.
--  2. La llave que trae la app es pública. Con DELETE abierto, quien la
--     encuentre podría vaciar el historial. Aquí lo más que puede hacer
--     es cambiar UNA bandera — no puede alterar medidas, corrugados ni
--     pesos de una ficha ya firmada, porque el permiso de UPDATE se da
--     SOLO sobre la columna `borrada`.
-- =====================================================================

alter table public.fichas
  add column if not exists borrada boolean not null default false;

-- El índice único debe aplicar solo a las fichas VIVAS. Si no, borrar la
-- V2 dejaría ese número ocupado para siempre y no se podría volver a
-- capturar.
drop index if exists fichas_codigo_version;
create unique index if not exists fichas_codigo_version
  on public.fichas (upper(codigo), version)
  where not borrada;

-- Permiso de UPDATE acotado a una sola columna.
-- El revoke primero es indispensable: Supabase suele dar UPDATE a nivel
-- de tabla por omisión, y un permiso de tabla le gana al de columna.
revoke update on public.fichas from anon, authenticated;
grant update (borrada) on public.fichas to anon, authenticated;

drop policy if exists "marcar borrada" on public.fichas;
create policy "marcar borrada"
  on public.fichas for update
  to anon, authenticated
  using (true)
  with check (true);

-- =====================================================================
-- Comprobación: deben salir 3 políticas (select, insert, update).
-- =====================================================================
select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'fichas'
 order by cmd;

-- =====================================================================
-- PARA RECUPERAR UNA FICHA BORRADA POR ERROR
-- (descomenta y ajusta el código y la versión)
--
-- update public.fichas set borrada = false
--  where upper(codigo) = 'FT-AF0013' and version = 2;
--
-- PARA VER LAS QUE ESTÁN BORRADAS
--
-- select codigo, version, cliente, articulo, guardada_en
--   from public.fichas where borrada order by guardada_en desc;
--
-- PARA ELIMINARLAS DE VERDAD (esto sí es irreversible)
--
-- delete from public.fichas where borrada;
-- =====================================================================

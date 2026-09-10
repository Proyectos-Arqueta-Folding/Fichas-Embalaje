-- =====================================================================
-- Fichas de Embalaje — vaciar el basurero (borrado definitivo)
--
-- Cómo correrlo: supabase.com -> proyecto -> "SQL Editor" -> "New query"
-- -> pegar todo -> "Run". Se puede volver a correr sin problema.
--
-- Requiere haber corrido antes supabase-borrado.sql (el que agrega la
-- columna `borrada`).
--
-- QUÉ HABILITA
--
-- El borrado DEFINITIVO, pero SOLO de fichas que ya están en el
-- basurero. La política lleva `using (borrada)`: una ficha viva no se
-- puede eliminar de un solo golpe ni por error ni a propósito — primero
-- tiene que pasar por el basurero, donde todavía se puede recuperar.
--
-- Esa condición es la que hace seguro tener el borrado abierto con una
-- llave pública: nadie puede vaciar el historial de un tirón.
-- =====================================================================

drop policy if exists "vaciar basurero" on public.fichas;
create policy "vaciar basurero"
  on public.fichas for delete
  to anon, authenticated
  using (borrada);

-- =====================================================================
-- Comprobación: deben salir 4 políticas (select, insert, update, delete).
-- =====================================================================
select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'fichas'
 order by cmd;

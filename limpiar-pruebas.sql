-- Borra las fichas de PRUEBA que se crearon al verificar la conexion y
-- la concurrencia. No toca nada mas.
--
-- Correr en supabase.com -> SQL Editor. Desde ahi si se puede borrar:
-- el editor entra con la llave de servicio y se salta el RLS que
-- bloquea el borrado desde la app.

delete from public.fichas where codigo in ('ZZ-PRUEBA', 'ZZ-CARRERA');

-- Cuando ya no quieras los EJEMPLOS, descomenta esta linea:
-- delete from public.fichas where codigo like 'EJ-%';

select codigo, version, cliente, articulo, guardada_en
  from public.fichas
 order by guardada_en desc;

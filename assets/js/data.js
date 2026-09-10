/**
 * Catálogos maestros — versión estática v1 (tomados de los Excel del proyecto).
 * Más adelante esto se migra a tablas en Supabase; por ahora vive aquí para
 * poder iterar el prototipo sin depender de la base de datos.
 */

// De "Corrugados Precios y medidas.xlsx" — dimensiones INTERNAS del corrugado (mm),
// confirmado contra las fichas de ejemplo (AFCR-0005 = 530x360x230 coincide con
// "Dimensiones Internas" de la ficha SUPERPACK).
// Los precios por corrugado NO se incluyen aquí a propósito: el repo es
// público y el cálculo no los necesita.
const CORRUGADOS = [
  { id: 'AFCR-0001', largo: 500, ancho: 400, alto: 370 },
  { id: 'AFCR-0002', largo: 360, ancho: 280, alto: 260 },
  { id: 'AFCR-0004', largo: 220, ancho: 210, alto: 135 },
  { id: 'AFCR-0005', largo: 530, ancho: 360, alto: 230 },
  { id: 'AFCR-0008', largo: 410, ancho: 335, alto: 275 },
  { id: 'AFCR-0010', largo: 475, ancho: 395, alto: 275 },
  { id: 'AFCR-0009', largo: 373, ancho: 335, alto: 252 },
];

// De "Espesores_carton_pegues.xlsx" — espesor de una capa de cartón sólido por calibre (mm).
const ESPESOR_POR_CALIBRE = {
  12: 0.3048,
  14: 0.3556,
  16: 0.4064,
  18: 0.4572,
  20: 0.5080,
  22: 0.5588,
  24: 0.6096,
};

// Microcorrugado 12 pt + flauta (mm) — espesor total ya incluye el liner de 12 pt.
const ESPESOR_MICROCORRUGADO = {
  'MC-F': { label: '12 pt + Flauta F', espesor: 1.1048 },
  'MC-E': { label: '12 pt + Flauta E', espesor: 1.8048 },
  'MC-B': { label: '12 pt + Flauta B', espesor: 3.3048 },
};

// Multiplicador de capas apiladas en la zona de pegue, por tipo de pegue.
// Debe coincidir con las celdas B10:B13 de "Espesores_carton_pegues.xlsx".
const CAPAS_POR_PEGUE = {
  charola: { label: 'Charola', capas: 1 },
  lineal: { label: 'Pegue lineal', capas: 3 },
  fondo_automatico: { label: 'Fondo automático', capas: 4 },
  cuatro_esquinas: { label: '4 esquinas', capas: 4 },
};

// De "Proveedores_Lozano.xlsx" — gramaje (g/m2) de cartón sólido por
// material y calibre, para estimar peso bruto (pendiente de conectar:
// falta definir qué área usar — ver nota en packing.js / conversación).
// OJO calibre 16 de CAPLE CHILENO REV CAFE vino con 2 valores en la
// tabla que dio el usuario (235 y 244 g/m2) — se usó 244 (el segundo);
// falta confirmar cuál es el correcto.
const GRAMAJE_SOLIDO = {
  'MULTICAPA': { 12: 215, 14: 235, 15: 250, 16: 270, 18: 295, 20: 325, 22: 350, 24: 380 },
  'CAPLE CHILENO REV CAFE': { 12: 200, 14: 219, 16: 244, 18: 260, 20: 277, 22: 296, 24: 321 },
};

// Microcorrugado = liner (12 pt, usa el gramaje real de GRAMAJE_SOLIDO
// según el material elegido) + flauta F/E/B. El gramaje de la flauta es
// un ESTIMADO PROVISIONAL (investigación web 2026-09-08, no son datos
// del proveedor real): ~85-90 g/m2 para F/E/B por igual, sin distinguir
// entre ellas todavía. Reemplazar en cuanto el usuario dé datos reales.
const GRAMAJE_FLAUTA_ESTIMADO = 87;
// Si no hay material/liner seleccionado, este es el respaldo (liner
// típico ~250 g/m2 + flauta ~87 g/m2).
const GRAMAJE_MICROCORRUGADO_ESTIMADO = 250 + GRAMAJE_FLAUTA_ESTIMADO;

// Tarima: 120 x 120 cm reales, pero la propia tarima ocupa 20 cm de alto,
// dejando 100 cm de alto útil para estibar corrugados (confirmado con el usuario).
const TARIMA = {
  largo_cm: 120,
  ancho_cm: 120,
  alto_total_cm: 120,
  alto_tarima_cm: 20,
  alto_util_cm: 100,
};

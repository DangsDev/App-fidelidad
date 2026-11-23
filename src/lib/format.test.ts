import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOVEMENT_LABELS, movementLabel, formatSignedPoints, formatDateTime } from './format.ts';

test('etiquetas de tipos de movimiento', () => {
  assert.equal(movementLabel('purchase_earn'), 'Compra');
  assert.equal(movementLabel('purchase_payment'), 'Pago con puntos');
  assert.equal(movementLabel('redemption'), 'Canje');
  assert.equal(movementLabel('admin_adjust_positive'), 'Ajuste a tu favor');
  assert.equal(movementLabel('admin_adjust_negative'), 'Ajuste');
  assert.equal(movementLabel('reversal'), 'Anulación');
  assert.equal(movementLabel('tipo_desconocido'), 'Movimiento');
  assert.equal(Object.keys(MOVEMENT_LABELS).length, 6);
});

test('puntos con signo explícito', () => {
  assert.equal(formatSignedPoints(15), '+15');
  assert.equal(formatSignedPoints(1), '+1');
  assert.equal(formatSignedPoints(-10), '\u221210');
  assert.equal(formatSignedPoints(-1), '\u22121');
  assert.equal(formatSignedPoints(0), '+0');
});

test('fechas en America/Mexico_City', () => {
  // 18:30 UTC = 12:30 en Ciudad de México (UTC-6).
  assert.match(formatDateTime('2026-03-05T18:30:00Z'), /12:30/);
  // 2026-01-01 02:00 UTC todavía es 31 de diciembre en México.
  const newYear = formatDateTime('2026-01-01T02:00:00Z');
  assert.match(newYear, /31/);
  assert.match(newYear, /2025/);
});

test('fecha inválida no rompe la interfaz', () => {
  assert.equal(formatDateTime('no-es-fecha'), 'Fecha no disponible');
  assert.equal(formatDateTime(new Date('invalid')), 'Fecha no disponible');
});

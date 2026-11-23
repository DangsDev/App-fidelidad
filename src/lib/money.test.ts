import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePesosToCents, previewPoints, formatMXN } from './money.ts';

test('parsea importes válidos a centavos', () => {
  assert.equal(parsePesosToCents('155'), 15500);
  assert.equal(parsePesosToCents('155.5'), 15550);
  assert.equal(parsePesosToCents('155.50'), 15550);
  assert.equal(parsePesosToCents(' $1,234.50 '), 123450);
  assert.equal(parsePesosToCents('0.01'), 1);
  assert.equal(parsePesosToCents('19.99'), 1999); // sin error de punto flotante
  assert.equal(parsePesosToCents('1000000'), 100_000_000);
});

test('rechaza importes inválidos', () => {
  for (const bad of ['', ' ', '0', '0.00', '-5', 'abc', '12.345', '1.', '.5', '1e3', '1000000.01', '12,34,5x', '99999999']) {
    assert.equal(parsePesosToCents(bad), null, `debería rechazar "${bad}"`);
  }
});

test('puntos hacia abajo: $10 = 1 punto', () => {
  assert.equal(previewPoints(5000, 1000), 5);
  assert.equal(previewPoints(10000, 1000), 10);
  assert.equal(previewPoints(15000, 1000), 15);
  assert.equal(previewPoints(4999, 1000), 4);
  assert.equal(previewPoints(999, 1000), 0);
});

test('formato MXN', () => {
  assert.match(formatMXN(15550), /155\.50/);
});

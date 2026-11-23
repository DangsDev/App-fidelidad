import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEmail,
  safeNext,
  validatePassword,
  validateFullName,
  normalizeFullName,
  isUserRole,
} from './validation.ts';

test('isEmail acepta correos razonables', () => {
  for (const ok of [
    'ana@ejemplo.com',
    'ana.lopez@ejemplo.mx',
    'a+b@sub.ejemplo.co',
    'ana_93@ejemplo.com',
    'ANA@EJEMPLO.COM',
    '  ana@ejemplo.com  ',
  ]) {
    assert.equal(isEmail(ok), true, `debería aceptar "${ok}"`);
  }
});

test('isEmail rechaza correos inválidos', () => {
  for (const bad of [
    '',
    'ana',
    '@ejemplo.com',
    'ana@',
    'ana@ejemplo',
    'ana ejemplo@correo.com',
    'ana@@ejemplo.com',
    'ana@ejemplo..com',
    '.ana@ejemplo.com',
    'ana@ejemplo.c',
    'ana@ejemplo.c0m',
  ]) {
    assert.equal(isEmail(bad), false, `debería rechazar "${bad}"`);
  }
});

test('safeNext acepta rutas internas', () => {
  assert.equal(safeNext('/'), '/');
  assert.equal(safeNext('/app'), '/app');
  assert.equal(safeNext('/app/historial?page=2'), '/app/historial?page=2');
  assert.equal(safeNext('/restablecer'), '/restablecer');
  assert.equal(safeNext('  /app  '), '/app');
});

test('safeNext bloquea redirecciones abiertas y saltos de línea', () => {
  for (const bad of [
    null,
    undefined,
    '',
    'app',
    'https://malo.com',
    'http://malo.com/app',
    '//malo.com',
    '/\\malo.com',
    '\\\\malo.com',
    'javascript:alert(1)',
    '/app\nmalo',
    '/app\rmalo',
    '/app\tmalo',
    '/app\u0000malo',
    ' //malo.com',
  ]) {
    assert.equal(safeNext(bad), '/', `debería rechazar ${JSON.stringify(bad)}`);
  }
  assert.equal(safeNext('https://malo.com', '/login'), '/login');
});

test('validatePassword exige mínimo 8 y máximo 72 bytes', () => {
  assert.equal(validatePassword('1234567'), 'La contraseña debe tener al menos 8 caracteres.');
  assert.equal(validatePassword('12345678'), null);
  assert.equal(validatePassword('a'.repeat(72)), null);
  assert.equal(validatePassword('a'.repeat(73)), 'La contraseña es demasiado larga (máximo 72 caracteres).');
  // Multibyte: 37 "ñ" = 74 bytes aunque sean 37 caracteres.
  assert.equal(validatePassword('ñ'.repeat(37)), 'La contraseña es demasiado larga (máximo 72 caracteres).');
});

test('validateFullName exige entre 2 y 120 caracteres', () => {
  assert.equal(validateFullName(''), 'Escribe tu nombre (entre 2 y 120 caracteres).');
  assert.equal(validateFullName(' A '), 'Escribe tu nombre (entre 2 y 120 caracteres).');
  assert.equal(validateFullName('  Ana  '), null);
  assert.equal(validateFullName('a'.repeat(120)), null);
  assert.equal(validateFullName('a'.repeat(121)), 'Escribe tu nombre (entre 2 y 120 caracteres).');
});

test('normalizeFullName compacta espacios', () => {
  assert.equal(normalizeFullName('  Ana   María  López '), 'Ana María López');
  assert.equal(normalizeFullName(''), '');
});

test('isUserRole solo admite roles de la base de datos', () => {
  assert.equal(isUserRole('admin'), true);
  assert.equal(isUserRole('employee'), true);
  assert.equal(isUserRole('customer'), true);
  assert.equal(isUserRole('superadmin'), false);
  assert.equal(isUserRole(null), false);
  assert.equal(isUserRole(undefined), false);
});

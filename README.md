# Programa de puntos — MVP

App web (PWA) de fidelización para alimentos y bebidas: clientes con tarjeta QR, trabajadores que registran
compras y canjes, y panel de administración. Next.js (App Router) + TypeScript + Tailwind + Supabase.

## Estado por módulos

| Módulo | Contenido | Estado |
|---|---|---|
| 0 | Estructura, configuración, clientes Supabase, utilidades | ✅ entregado |
| 1 | Base de datos: esquema, triggers, RLS, funciones atómicas, pruebas SQL | ✅ entregado y probado en PostgreSQL 16 |
| 2 | Autenticación y rutas por rol | ✅ implementado |
| 3 | Vistas del cliente (tarjeta QR, historial, recompensas) | ✅ implementado |
| 4 | Panel del trabajador (QR, compra, canje) | ✅ implementado |
| 5 | Panel de administración | ✅ implementado |
| 6 | PWA instalable, identidad Aquelarre y favicons para navegador/iOS | ✅ implementado |
| 7 | Revisión final y despliegue | requiere configuración externa |

El panel se encuentra en `/app` (cliente), `/staff` (trabajador) y `/admin` (administrador). La cámara usa `BarcodeDetector` cuando el navegador lo ofrece; si no, se puede pegar el token del QR o buscar al cliente por nombre/correo. Para usar la cámara se necesita HTTPS (localhost también está permitido).

## Reglas de negocio ya implementadas en la base de datos

- **Puntos:** 1 punto por cada $10 MXN **pagados**, redondeo hacia abajo. Configurable (`loyalty_settings`).
- **Pago mixto:** 1 punto = $1 MXN al pagar (configurable). Lo pagado con puntos **no genera puntos**.
  Ejemplo: compra de $100 usando 10 puntos → paga $90 y gana 9.
- **Correo sin verificar:** puede acumular, **no** puede usar puntos (ni en pago mixto ni en canjes).
- **Anulaciones:** solo administrador, siempre con movimientos compensatorios (el historial nunca se edita).
- **Idempotencia:** cada operación lleva un `client_request_id`; un doble toque o reintento no duplica nada.

## Puesta en marcha de Supabase

1. Crea un proyecto en <https://supabase.com>.
2. En **SQL Editor**, ejecuta **en orden** `supabase/migrations/001…005`. (O instala la CLI, ejecuta `supabase login`, enlaza el proyecto con `supabase link --project-ref TU_PROJECT_REF` y luego corre `supabase db push`.)
3. **Authentication → Providers → Email:** activa **Confirm email**. Sin esto, todos los correos nacen
   verificados y la regla "verificar para canjear" no tendría efecto.
4. **Authentication → URL Configuration:** Site URL = tu dominio; agrega `http://localhost:3000/**` a Redirect URLs.
5. **Authentication → SMTP:** configura tu propio SMTP para producción (el integrado tiene límites bajos).
6. Copia `.env.example` a `.env.local` y pega URL, clave anónima y `service_role`.
7. Crea tu cuenta desde la app y conviértela en administrador (SQL Editor; el rol nunca se asigna desde la app):
   ```sql
   update public.profiles set role = 'admin' where email = 'tu@correo.com';
   ```
8. Entra como administrador, crea o activa las sucursales, configura las reglas y recompensas, e invita al personal desde `/admin`. La invitación de trabajadores requiere `SUPABASE_SERVICE_ROLE_KEY` en el servidor.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm run test:unit    # utilidades de dinero (Node, sin dependencias)
npm run build
```

La cámara para escanear QR exige HTTPS; funciona en `localhost` y en cualquier despliegue (p. ej. Vercel).

## Despliegue

El repositorio queda preparado para un host compatible con Next.js (por ejemplo Vercel), pero el despliegue es manual porque depende de las cuentas y credenciales del propietario:

1. Configura en el host `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `NEXT_PUBLIC_SITE_URL`.
2. Aplica las migraciones a Supabase y configura confirmación de correo, URL de retorno y SMTP según la sección anterior.
3. Publica el proyecto desde la rama deseada y agrega el dominio de producción a las Redirect URLs de Supabase.
4. Comprueba el registro/verificación de cuenta, acceso por rol, registro de compra, canje y anulación con cuentas de cada rol.

El service worker solo almacena recursos estáticos; no guarda HTML autenticado, saldos ni historiales en caché.

## Pruebas de base de datos (PostgreSQL local)

Simulan Supabase con `supabase/local/00_supabase_shim.sql` (esquema `auth`, roles, `auth.uid()`).

```bash
export PGHOST=localhost PGUSER=postgres      # un PostgreSQL ≥ 15 donde puedas crear bases
./supabase/local/run.sh                      # recrea la BD, aplica migraciones y pruebas
./supabase/tests/concurrency.sh              # sesiones paralelas contra el mismo saldo
```

## Seguridad: cómo está pensado

- El navegador **no escribe** en `purchases`, `redemptions`, `points_transactions` ni `audit_logs`; solo las
  funciones `SECURITY DEFINER` (`register_purchase`, `redeem_reward`, `admin_adjust_points`, `void_operation`),
  que validan rol, sucursal, importes y saldo en una sola transacción. Los puntos siempre los calcula el servidor.
- `points_transactions` y `audit_logs` son de solo inserción (trigger, incluso para superusuario).
- Un usuario solo puede editar su `full_name`; rol, saldo, QR y estado están protegidos por privilegios de
  columna **y** por trigger.
- El QR contiene únicamente un token aleatorio de 128 bits. Identificarlo no autoriza nada: toda compra o canje
  exige sesión de trabajador, sucursal asignada y confirmación.
- `SUPABASE_SERVICE_ROLE_KEY` solo se usa en `src/lib/supabase/admin.ts` (`server-only`).

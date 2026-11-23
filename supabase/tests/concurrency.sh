#!/usr/bin/env bash
# Prueba de concurrencia: varias sesiones PARALELAS intentan gastar el mismo saldo.
# Uso: PGHOST=... PGPORT=... PGUSER=... DB=loyalty_test ./tests/concurrency.sh
# (requiere la BD ya migrada; usa datos propios y no interfiere con otras pruebas)
set -uo pipefail
DB=${DB:-loyalty_test}
q() { psql -X -q -t -A -d "$DB" -v ON_ERROR_STOP=1 "$@"; }

EMP=00000000-0000-0000-0000-0000000000f1
CUS=00000000-0000-0000-0000-0000000000f2
q <<SQL
insert into auth.users (id,email,email_confirmed_at) values
  ('$EMP','conc-emp@test.mx',now()), ('$CUS','conc-cus@test.mx',now());
update public.profiles set role='employee' where id='$EMP';
insert into public.employee_branches select '$EMP', id from public.branches limit 1;
insert into public.rewards (id,name,points_cost) values ('00000000-0000-0000-0000-0000000000f3','Premio concurrencia',100);
-- 100 puntos exactos: solo cabe UN canje de 100
select set_config('request.jwt.claim.sub','$EMP',false);
set role authenticated;
select public.register_purchase('$CUS',(select branch_id from public.employee_branches where employee_id='$EMP' limit 1),100000,0,gen_random_uuid());
SQL
BR=$(q -c "select branch_id from public.employee_branches where employee_id='$EMP' limit 1")

call() { # $1 = request_id
  q -c "begin; select set_config('request.jwt.claim.sub','$EMP',true); set local role authenticated;
        select public.redeem_reward('$CUS','00000000-0000-0000-0000-0000000000f3','$BR','$1'); commit;" 2>&1
}

echo "== 1) 8 canjes simultáneos con request_id DISTINTOS y saldo para uno solo =="
OUT=$(mktemp -d)
for i in $(seq 1 8); do call "$(cat /proc/sys/kernel/random/uuid)" > "$OUT/a$i" & done; wait
OK=$(grep -l '"redemption_id"' "$OUT"/a* 2>/dev/null | wc -l)
BAL=$(q -c "select points_balance from public.profiles where id='$CUS'")
echo "canjes exitosos: $OK (esperado 1) | saldo final: $BAL (esperado 0)"
[ "$OK" = 1 ] && [ "$BAL" = 0 ] || { echo "FALLÓ concurrencia 1"; exit 1; }

echo "== 2) 8 envíos simultáneos con el MISMO request_id (doble toque) =="
q -c "select set_config('request.jwt.claim.sub','$EMP',false); set role authenticated;" >/dev/null
q <<SQL >/dev/null
select set_config('request.jwt.claim.sub','$EMP',false);
set role authenticated;
select public.register_purchase('$CUS','$BR',100000,0,gen_random_uuid());
SQL
REQ=$(cat /proc/sys/kernel/random/uuid)
for i in $(seq 1 8); do call "$REQ" > "$OUT/b$i" & done; wait
ROWS=$(q -c "select count(*) from public.redemptions where client_request_id='$REQ'")
BAL=$(q -c "select points_balance from public.profiles where id='$CUS'")
echo "filas de canje con ese request_id: $ROWS (esperado 1) | saldo: $BAL (esperado 0)"
[ "$ROWS" = 1 ] && [ "$BAL" = 0 ] || { echo "FALLÓ concurrencia 2"; exit 1; }

echo "== 3) Integridad final: caché = ledger =="
DIFF=$(q -c "select count(*) from (select p.id from public.profiles p left join public.points_transactions t on t.customer_id=p.id where p.role='customer' group by p.id,p.points_balance having p.points_balance<>coalesce(sum(t.points),0)) x")
echo "clientes con discrepancia: $DIFF (esperado 0)"
[ "$DIFF" = 0 ] || { echo "FALLÓ integridad"; exit 1; }
echo "CONCURRENCIA OK"

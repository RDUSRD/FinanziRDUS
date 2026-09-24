"""Test de integración de FinanciRDUS contra el stack levantado.

Verifica el contrato completo (docs/api.md) contra la API real y el SPA servido por nginx:
autenticación (login, cookie de sesión, sesiones activas, logout), health, categorías, CRUD de
movimientos, presupuestos, stats, export/import (merge, replace, inválidos y límites), proxy,
cabeceras de seguridad y CORS.

La API está cerrada: todo menos `/api/health` y el login pide la cookie de sesión, así que el
test se autentica primero (ADMIN_USERNAME/ADMIN_PASSWORD del entorno, o de tu `.env`).

OJO: es destructivo (los casos de import usan modo replace). Al terminar, re-sembrá el ejemplo:

    make test-integration      # corre el test y vuelve a sembrar
    python3 tests/integration/api_smoke.py   # a mano, con el stack ya levantado

Variables opcionales: API_URL (default http://localhost:8000/api), WEB_URL (default
http://localhost:8080), ADMIN_USERNAME y ADMIN_PASSWORD.
"""

import json
import os
import urllib.request
import urllib.error
import re
import sys
from pathlib import Path

API = os.environ.get("API_URL", "http://localhost:8000/api").rstrip("/")
WEB = os.environ.get("WEB_URL", "http://localhost:8080").rstrip("/")


def env_value(name, default=""):
    """Read a variable from the environment, falling back to the repo's .env."""
    value = os.environ.get(name)
    if value:
        return value
    env_file = Path(__file__).resolve().parents[2] / ".env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, raw = line.partition("=")
            if key.strip() == name:
                return raw.strip().strip("'\"")
    return default


ADMIN_USERNAME = env_value("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = env_value("ADMIN_PASSWORD")

# The session cookie captured from the login, sent by every authenticated request.
SESSION_COOKIE = "financirdus_session"
session_cookie = ""

if not ADMIN_PASSWORD:
    print(
        "ERROR: falta ADMIN_PASSWORD. Definilo en el entorno o en tu .env "
        "(es la credencial de arranque que usa la API).",
        file=sys.stderr,
    )
    sys.exit(2)

passed, failures = 0, []
def check(name, cond, extra=None):
    global passed
    if cond: passed += 1
    else: failures.append(f"{name}" + (f" >>> {extra!r}" if extra is not None else ""))

def req(method, url, body=None, headers=None, auth=True):
    data = None
    hdrs = dict(headers or {})
    if auth and session_cookie:
        hdrs["Cookie"] = session_cookie
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            raw = resp.read().decode()
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, raw
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read().decode()


def j(raw):
    try: return json.loads(raw)
    except Exception: return None

def keys_of(obj):
    return set(obj.keys()) if isinstance(obj, dict) else set()

def shift_month(month_key, delta):
    year, month = (int(part) for part in month_key.split("-"))
    total = year * 12 + (month - 1) + delta
    return f"{total // 12:04d}-{total % 12 + 1:02d}"

# ---------------- health / autenticación ----------------
st, _, raw = req("GET", f"{API}/health", auth=False)
h = j(raw)
check("health 200", st == 200, st)
check("health shape", keys_of(h) == {"status", "db", "version"}, h)
check("health ok", h and h.get("status") == "ok" and h.get("db") == "ok", h)

# La API está cerrada: sin cookie no se ve nada (el health es la excepción).
st, _, raw = req("GET", f"{API}/categories", auth=False)
check("endpoint protegido sin sesión => 401", st == 401, (st, raw[:120]))
st, _, raw = req("GET", f"{API}/data/export", auth=False)
check("export sin sesión => 401", st == 401, (st, raw[:120]))
st, _, raw = req("GET", f"{API}/admin/sessions", auth=False)
check("panel de sesiones sin sesión => 401", st == 401, (st, raw[:120]))

st, _, raw = req(
    "POST",
    f"{API}/auth/login",
    {"username": ADMIN_USERNAME, "password": "contrasena-equivocada"},
    auth=False,
)
check("login con contraseña incorrecta => 401", st == 401, (st, raw[:160]))
check(
    "login fallido con mensaje genérico (no revela el usuario)",
    j(raw) == {"detail": "Usuario o contraseña incorrectos."},
    raw[:160],
)
st, _, raw = req(
    "POST",
    f"{API}/auth/login",
    {"username": "no-existe", "password": "contrasena-equivocada"},
    auth=False,
)
check("login de usuario inexistente => 401 con el mismo mensaje", st == 401 and j(raw) == {"detail": "Usuario o contraseña incorrectos."}, (st, raw[:160]))

st, hdr, raw = req(
    "POST", f"{API}/auth/login", {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}, auth=False
)
login = j(raw)
check("login 200", st == 200, (st, raw[:160]))
check("login shape", keys_of(login) == {"username", "must_change_password", "expires_at"}, login)
check("login devuelve el usuario", login and login["username"] == ADMIN_USERNAME, login)
set_cookie = hdr.get("set-cookie", "")
check("login setea la cookie de sesión", set_cookie.startswith(f"{SESSION_COOKIE}="), set_cookie)
check(
    "la cookie es httpOnly, SameSite=Lax y Path=/",
    "httponly" in set_cookie.lower() and "samesite=lax" in set_cookie.lower() and "Path=/" in set_cookie,
    set_cookie,
)
check("la cookie no es Secure en HTTP local (si no, el navegador no la manda)", "secure" not in set_cookie.lower(), set_cookie)
session_cookie = set_cookie.split(";")[0]
check("la cookie no viaja en el cuerpo de la respuesta", SESSION_COOKIE not in raw, raw[:120])

st, _, raw = req("GET", f"{API}/auth/me")
check("me 200 con la cookie", st == 200 and j(raw)["username"] == ADMIN_USERNAME, (st, raw[:160]))
check("me marca la sesión actual", j(raw)["session"]["is_current"] is True, raw[:200])

# ---------------- categories ----------------
st, _, raw = req("GET", f"{API}/categories")
cats = j(raw) or []
check("categories 200 y 15 items", st == 200 and len(cats) == 15, len(cats))
check("categories shape", all(keys_of(c) == {"id", "type", "label", "sort_order", "is_system"} for c in cats))
gasto_ids = [c["id"] for c in cats if c["type"] == "gasto"]
ingreso_ids = [c["id"] for c in cats if c["type"] == "ingreso"]
check("11 categorías de gasto (incluye Deudas)", gasto_ids == ["supermercado","comidas-afuera","transporte","alquiler-servicios","salud","suscripciones","ropa","ocio","ahorro","otros","deudas"], gasto_ids)
check("4 categorías de ingreso", ingreso_ids == ["sueldo","freelance","inversiones","otros-ingresos"], ingreso_ids)
check("catálogo ordenado (gasto primero)", [c["type"] for c in cats] == ["gasto"]*11 + ["ingreso"]*4, [c["type"] for c in cats])
check("sort_order ascendente dentro de cada tipo", [c["sort_order"] for c in cats if c["type"]=="gasto"] == list(range(1,12)) and [c["sort_order"] for c in cats if c["type"]=="ingreso"] == list(range(1,5)))
check("sólo 'deudas' es system", [c["id"] for c in cats if c["is_system"]] == ["deudas"], [c["id"] for c in cats if c["is_system"]])
budget_gasto_ids = [g for g in gasto_ids if g != "deudas"]

# ---------------- summary (mes de referencia) ----------------
st, _, raw = req("GET", f"{API}/stats/summary")
s = j(raw)
check("summary 200", st == 200, st)
check("summary shape", keys_of(s) == {"month","income_cents","expenses_cents","balance_cents","average_prev","comparison"}, s)
check("summary average_prev shape", keys_of(s["average_prev"]) == {"avg_cents","months_used"})
check("summary comparison shape", keys_of(s["comparison"]) == {"pct","direction"})
check("balance = income - expenses", s["balance_cents"] == s["income_cents"] - s["expenses_cents"], s)
check("comparison coherente", (s["comparison"]["direction"] == "above") == (s["comparison"]["pct"] > 0), s["comparison"])
check("promedio sobre 6 meses (seed)", s["average_prev"]["months_used"] == 6, s["average_prev"])
m, inc, exp = s["month"], s["income_cents"], s["expenses_cents"]
print(f"[info] mes actual del servidor: {m} · ingresos {inc/100:,.2f} · gastos {exp/100:,.2f} · queda {s['balance_cents']/100:,.2f} · {s['comparison']['pct']*100:.1f}% {s['comparison']['direction']}")

# ---------------- carteras y deuda (saldo negativo) ----------------
st, _, raw = req("GET", f"{API}/accounts")
acc = j(raw)
check("accounts 200", st == 200, (st, raw[:160]))
check("accounts shape", keys_of(acc) == {"total_debt_cents", "items"}, keys_of(acc))
check("account item shape", all(keys_of(a) == {"id","name","opening_balance_cents","balance_cents","is_debt","paid_cents","remaining_cents","pct_paid"} for a in acc["items"]))
check("seed con carteras", len(acc["items"]) >= 3, len(acc["items"]))
check("seed con deuda total > 0", acc["total_debt_cents"] > 0, acc["total_debt_cents"])
check("total_debt = suma de saldos negativos",
      acc["total_debt_cents"] == sum(-a["balance_cents"] for a in acc["items"] if a["balance_cents"] < 0), acc)
debt = next((a for a in acc["items"] if a["is_debt"]), None)
check("cartera de deuda coherente (opening<0, remaining=-balance, 0<=pct<=1)",
      debt is not None and debt["opening_balance_cents"] < 0
      and debt["remaining_cents"] == -debt["balance_cents"] and 0 <= debt["pct_paid"] <= 1, debt)
default_acc = next(a["id"] for a in acc["items"] if not a["is_debt"])
print("[info] carteras:", ", ".join(f"{a['name']}={a['balance_cents']/100:,.2f}" for a in acc["items"]))

st, _, raw = req("POST", f"{API}/accounts", {"name": "Banco Prueba", "opening_balance_cents": 0})
check("POST account 201", st == 201 and j(raw)["name"] == "Banco Prueba", (st, raw[:160]))
new_acc_id = j(raw)["id"]
st, _, raw = req("POST", f"{API}/accounts", {"name": "Banco Prueba", "opening_balance_cents": 0})
check("POST account duplicado => 422", st == 422, (st, raw[:160]))
st, _, raw = req("POST", f"{API}/accounts", {"name": "Deuda Prueba", "opening_balance_cents": -5000})
debt_acc = j(raw)
check("POST account con saldo negativo 201", st == 201 and debt_acc["is_debt"] is True and debt_acc["balance_cents"] == -5000, (st, raw[:160]))
debt_acc_id = debt_acc["id"]
st, _, raw = req("DELETE", f"{API}/accounts/{new_acc_id}")
check("DELETE account 204", st == 204, st)
st, _, raw = req("DELETE", f"{API}/accounts/99999999")
check("DELETE account inexistente => 404", st == 404, st)

# pago de deuda: sube el saldo hacia 0, fuerza categoría Deudas y cuenta como gasto del mes
st, _, raw = req("POST", f"{API}/movements", {"type": "gasto", "account_id": debt_acc_id, "is_debt_payment": True, "entry_currency": "USD", "entry_amount_cents": 5000, "date": f"{m}-12", "note": "pago"})
pay = j(raw)
check("POST pago de deuda 201", st == 201, (st, raw[:200]))
check("pago fuerza categoría Deudas y gasto", pay["category_id"] == "deudas" and pay["type"] == "gasto" and pay["is_debt_payment"] is True, pay)
st, _, raw = req("GET", f"{API}/accounts")
debt_after = next(a for a in j(raw)["items"] if a["id"] == debt_acc_id)
check("el pago sube el saldo hacia 0", debt_after["balance_cents"] == debt_acc["balance_cents"] + 5000, (debt_acc["balance_cents"], debt_after["balance_cents"]))
check("el pago cuenta como gasto del mes", j(req("GET", f"{API}/stats/summary?month={m}")[2])["expenses_cents"] == exp + 5000)
req("DELETE", f"{API}/movements/{pay['id']}")
st, _, raw = req("POST", f"{API}/movements", {"type": "gasto", "account_id": default_acc, "is_debt_payment": True, "entry_currency": "USD", "entry_amount_cents": 5000, "date": f"{m}-12", "note": "x"})
check("pago de deuda en cartera sin deuda => 422", st == 422, (st, raw[:160]))
st, _, raw = req("DELETE", f"{API}/accounts/{debt_acc_id}")
check("DELETE account de deuda sin movimientos 204", st == 204, st)

# filtro por cartera en movimientos y stats
st, _, raw = req("GET", f"{API}/movements?month={m}&account={default_acc}")
filtered = j(raw) or []
check("filtro por cartera en movimientos", st == 200 and filtered and all(x["account_id"] == default_acc for x in filtered), len(filtered))
st, _, raw = req("GET", f"{API}/stats/summary?month={m}&account={default_acc}")
check("summary filtrado por cartera 200", st == 200, (st, raw[:120]))
st, _, raw = req("GET", f"{API}/stats/summary?month={m}&account=all")
check("account=all 200", st == 200, (st, raw[:120]))
st, _, raw = req("GET", f"{API}/stats/summary?month={m}&account=nope")
check("account inválido => 422", st == 422, (st, raw[:120]))

# ---------------- movements ----------------
st, _, raw = req("GET", f"{API}/movements?month={m}")
movs = j(raw) or []
check("movements 200", st == 200, st)
check("movements del mes (~23 del seed)", len(movs) >= 20, len(movs))
check("movement shape", all(keys_of(x) == {"id","type","category_id","account_id","account_name","is_debt_payment","amount_cents","entry_currency","entry_amount_cents","rate_micros","date","note","created_at","items"} for x in movs))
check("movement items: lista de {description, amount_cents}",
      all(isinstance(x["items"], list) and all(set(i) == {"description","amount_cents"} for i in x["items"]) for x in movs))
check("seed con al menos una factura con líneas", any(x["items"] for x in movs), [len(x["items"]) for x in movs])
check("todos con cartera", all(x["account_id"] and x["account_name"] for x in movs))
check("todos del mes pedido", all(x["date"].startswith(m) for x in movs))
check("entry_currency válido", all(x["entry_currency"] in ("USD","VES") for x in movs))
check("USD sin tasa", all(x["rate_micros"] is None for x in movs if x["entry_currency"] == "USD"))
check("VES con tasa > 0", all(isinstance(x["rate_micros"], int) and x["rate_micros"] > 0 for x in movs if x["entry_currency"] == "VES"))
check("seed con al menos un registro cargado en VES", any(x["entry_currency"] == "VES" for x in movs), [x["entry_currency"] for x in movs])
check("amount_cents USD coherente con la entrada Bs",
      all(abs(x["amount_cents"] - x["entry_amount_cents"] * 1_000_000 / x["rate_micros"]) <= 1
          for x in movs if x["entry_currency"] == "VES"))
dates = [x["date"] for x in movs]
check("ordenado por fecha desc", dates == sorted(dates, reverse=True), (dates[:3], sorted(dates, reverse=True)[:3]))
check("montos enteros positivos", all(isinstance(x["amount_cents"], int) and x["amount_cents"] > 0 for x in movs))
check("11 categorías de gasto presentes (incluye Deudas)", len({x["category_id"] for x in movs if x["type"]=="gasto"}) == 11)
check("created_at con offset horario", all(re.search(r"[+-]\d\d:\d\d$", x["created_at"]) for x in movs), movs[0]["created_at"])
check("suma de gastos coincide con el KPI", sum(x["amount_cents"] for x in movs if x["type"]=="gasto") == exp)
check("suma de ingresos coincide con el KPI", sum(x["amount_cents"] for x in movs if x["type"]=="ingreso") == inc)
st, _, raw = req("GET", f"{API}/movements?month={m}&type=gasto&category=ocio")
only = j(raw) or []
check("filtros month+type+category", st == 200 and only and all(x["type"]=="gasto" and x["category_id"]=="ocio" for x in only), len(only))

# ---------------- by-category / monthly ----------------
st, _, raw = req("GET", f"{API}/stats/by-category?month={m}")
bc = j(raw)
check("by-category 200", st == 200, st)
check("by-category shape", keys_of(bc) == {"month","total_cents","items"}, keys_of(bc))
check("by-category item shape", all(keys_of(i) == {"category_id","label","cents","share"} for i in bc["items"]))
check("total = KPI de gastos", bc["total_cents"] == exp, (bc["total_cents"], exp))
check("suma de items = total", sum(i["cents"] for i in bc["items"]) == bc["total_cents"])
check("shares suman 1", abs(sum(i["share"] for i in bc["items"]) - 1) < 1e-9, sum(i["share"] for i in bc["items"]))
check("items ordenados desc por cents", [i["cents"] for i in bc["items"]] == sorted((i["cents"] for i in bc["items"]), reverse=True))
check("11 categorías con gasto", len(bc["items"]) == 11, len(bc["items"]))

st, _, raw = req("GET", f"{API}/stats/monthly?months=6")
mt = j(raw) or []
check("monthly 200 y 6 items", st == 200 and len(mt) == 6, len(mt))
check("monthly shape", all(keys_of(x) == {"month","expenses_cents","income_cents"} for x in mt))
check("monthly termina en el mes actual", mt[-1]["month"] == m, mt[-1]["month"])
check("monthly ascendente y sin huecos", [x["month"] for x in mt] == sorted(x["month"] for x in mt) and all(x["expenses_cents"] > 0 for x in mt[:-1]))
check("monthly[0] es 5 meses antes", mt[0]["month"] == shift_month(m, -5), mt[0]["month"])

# ---------------- borde inferior de la ventana de meses (422, nunca 500) ----------------
st, _, raw = req("GET", f"{API}/stats/summary?month=0001-06")
check("summary ventana: month=0001-06 sin 6 meses previos => 422", st == 422, (st, raw[:120]))
st, _, raw = req("GET", f"{API}/stats/summary?month=0001-07")
check("summary ventana: month=0001-07 (borde inferior) => 200", st == 200, (st, raw[:120]))
st, _, raw = req("GET", f"{API}/stats/monthly?end=0001-01&months=2")
check("monthly ventana: end=0001-01&months=2 se sale del rango => 422", st == 422, (st, raw[:120]))
st, _, raw = req("GET", f"{API}/stats/monthly?end=0001-01&months=1")
check("monthly ventana: end=0001-01&months=1 (borde inferior) => 200", st == 200, (st, raw[:120]))

# ---------------- budgets ----------------
st, _, raw = req("GET", f"{API}/budgets?month={m}")
bd = j(raw)
check("budgets 200", st == 200, st)
check("budgets shape", keys_of(bd) == {"month","total_cap_cents","total_spent_cents","items"}, keys_of(bd))
check("budgets: 10 categorías de gasto", len(bd["items"]) == 10, len(bd["items"]))
check("budget item shape", all(keys_of(i) == {"category_id","label","cap_cents","spent_cents","pct","status"} for i in bd["items"]))
statuses = {i["status"] for i in bd["items"]}
check("estados válidos", statuses <= {"none","ok","warn","over"}, statuses)
check("seed con estados over/warn/ok", {"over","warn","ok"} <= statuses, statuses)
check("total_cap = suma de topes", bd["total_cap_cents"] == sum(i["cap_cents"] for i in bd["items"]))
debt_payments = sum(x["amount_cents"] for x in movs if x["is_debt_payment"])
check("total_spent = KPI de gastos sin los pagos de deuda (categoría system)",
      bd["total_spent_cents"] == exp - debt_payments, (bd["total_spent_cents"], exp, debt_payments))
for i in bd["items"]:
    if i["cap_cents"] > 0:
        check(f"pct {i['category_id']}", abs(i["pct"] - i["spent_cents"]/i["cap_cents"]) < 1e-9)
    expect = ("none" if i["cap_cents"] <= 0 else "over" if i["spent_cents"] > i["cap_cents"]
              else "warn" if i["spent_cents"] >= 0.8*i["cap_cents"] else "ok")
    check(f"status {i['category_id']}", i["status"] == expect, (i["status"], expect))
print("[info] presupuestos:", ", ".join(f"{i['category_id']}={i['status']}" for i in bd["items"]))

# ---------------- plan 25/15/50/10 ----------------
st, _, raw = req("GET", f"{API}/plan?month={m}")
pl = j(raw)
check("plan 200", st == 200, (st, raw[:160]))
check("plan shape", keys_of(pl) == {"month","income_cents","jars"}, keys_of(pl))
check("plan: 4 frascos", len(pl["jars"]) == 4, len(pl["jars"]))
check("plan jar shape", all(keys_of(x) == {"jar_id","label","pct","target_cents","spent_cents","remaining_cents","used","status","category_ids"} for x in pl["jars"]))
check("plan pcts 25/15/50/10", [x["pct"] for x in pl["jars"]] == [25,15,50,10], [x["pct"] for x in pl["jars"]])
check("plan ingresos = KPI de ingresos", pl["income_cents"] == inc, (pl["income_cents"], inc))
check("plan targets suman el ingreso", sum(x["target_cents"] for x in pl["jars"]) == inc, sum(x["target_cents"] for x in pl["jars"]))
check("plan remaining = target - spent", all(x["remaining_cents"] == x["target_cents"] - x["spent_cents"] for x in pl["jars"]))
check("plan status válidos", {x["status"] for x in pl["jars"]} <= {"none","ok","warn","over"})
check("plan mapea las 10 categorías de gasto (sin Deudas)", sorted(c for x in pl["jars"] for c in x["category_ids"]) == sorted(budget_gasto_ids), [c for x in pl["jars"] for c in x["category_ids"]])
st, _, raw = req("PUT", f"{API}/plan/categories/ocio", {"jar_id":"esencial"})
check("PUT plan 200", st == 200 and j(raw) == {"category_id":"ocio","jar_id":"esencial"}, (st, raw[:160]))
st, _, raw = req("GET", f"{API}/plan?month={m}")
eso = next(x for x in j(raw)["jars"] if x["jar_id"] == "esencial")
check("PUT plan mueve la categoría", "ocio" in eso["category_ids"], eso["category_ids"])
req("PUT", f"{API}/plan/categories/ocio", {"jar_id":"recompensas"})  # restaurar el seed
st, _, raw = req("PUT", f"{API}/plan/categories/sueldo", {"jar_id":"esencial"})
check("PUT plan en categoría de ingreso => 422", st == 422, (st, raw[:160]))
st, _, raw = req("PUT", f"{API}/plan/categories/ocio", {"jar_id":"no-existe"})
check("PUT plan frasco inexistente => 422", st == 422, (st, raw[:160]))

# ---------------- CRUD ----------------
new = {"type":"gasto","category_id":"ocio","account_id":default_acc,"entry_currency":"USD","entry_amount_cents":123456,"date":f"{m}-10","note":"prueba smoke"}
st, _, raw = req("POST", f"{API}/movements", new)
created = j(raw)
check("POST 201", st == 201, (st, raw[:200]))
check("POST shape", keys_of(created) == {"id","type","category_id","account_id","account_name","is_debt_payment","amount_cents","entry_currency","entry_amount_cents","rate_micros","date","note","created_at","items"})
check("POST USD: amount_cents = entry_amount_cents y sin tasa",
      created["amount_cents"] == 123456 and created["entry_currency"] == "USD" and created["rate_micros"] is None, created)
check("POST guarda la cartera", created["account_id"] == default_acc and created["account_name"], created)
mid = created["id"]
st, _, raw = req("POST", f"{API}/movements", {k: v for k, v in new.items() if k != "account_id"})
check("POST sin cartera => 422", st == 422, (st, raw[:160]))
st, _, raw = req("POST", f"{API}/movements", {**new, "account_id": 99999999})
check("POST con cartera inexistente => 422", st == 422, (st, raw[:160]))
st, _, raw = req("GET", f"{API}/stats/summary?month={m}")
check("POST impacta el KPI de gastos", j(raw)["expenses_cents"] == exp + 123456, j(raw)["expenses_cents"])

st, _, raw = req("POST", f"{API}/movements", {**new, "type":"gasto", "category_id":"sueldo"})
check("POST categoría de otro tipo => 422", st == 422 and isinstance(j(raw).get("detail"), str), (st, raw[:160]))
st, _, raw = req("POST", f"{API}/movements", {**new, "entry_amount_cents":0})
check("POST monto 0 => 422", st == 422, (st, raw[:160]))
st, _, raw = req("POST", f"{API}/movements", {**new, "entry_currency":"VES"})
check("POST VES sin tasa => 422", st == 422, (st, raw[:160]))
st, _, raw = req("POST", f"{API}/movements", {**new, "rate_micros":40000000})
check("POST USD con tasa => 422", st == 422, (st, raw[:160]))
st, _, raw = req("POST", f"{API}/movements", {**new, "date":f"{m[:4]}-02-30"})
check("POST 31-feb => 422", st == 422, (st, raw[:160]))
st, _, raw = req("POST", f"{API}/movements", {**new, "category_id":"no-existe"})
check("POST categoría inexistente => 422", st == 422, (st, raw[:160]))
movs_before_long = len(j(req("GET", f"{API}/movements?month={m}")[2]))
st, _, raw = req("POST", f"{API}/movements", {**new, "note":"x"*300})
check("POST nota de 300 caracteres => 422 y no lo crea",
      st == 422 and len(j(req("GET", f"{API}/movements?month={m}")[2])) == movs_before_long, (st, raw[:160]))

# alta en bolívares: Bs 4.000,00 @ 40 Bs/USD => $100,00 (10000 centavos)
ves = {"type":"gasto","category_id":"supermercado","account_id":default_acc,"entry_currency":"VES","entry_amount_cents":400000,"rate_micros":40000000,"date":f"{m}-11","note":"prueba VES"}
st, _, raw = req("POST", f"{API}/movements", ves)
vcreated = j(raw)
check("POST VES 201", st == 201, (st, raw[:200]))
check("POST VES calcula USD (Bs 4.000 @ 40 => $100)",
      vcreated["amount_cents"] == 10000 and vcreated["entry_currency"] == "VES"
      and vcreated["entry_amount_cents"] == 400000 and vcreated["rate_micros"] == 40000000, vcreated)
req("DELETE", f"{API}/movements/{vcreated['id']}")

# líneas de detalle: con líneas, el total se deriva de la suma de las líneas
items_new = {"type":"gasto","category_id":"supermercado","account_id":default_acc,"entry_currency":"USD","date":f"{m}-09","note":"con lineas","items":[{"description":"Leche","amount_cents":350},{"description":"Pan","amount_cents":150}]}
st, _, raw = req("POST", f"{API}/movements", items_new)
iline = j(raw)
check("POST con líneas 201", st == 201, (st, raw[:200]))
check("POST con líneas deriva el total (y normaliza a USD sin tasa)",
      iline["amount_cents"] == 500 and iline["entry_currency"] == "USD" and iline["entry_amount_cents"] == 500 and iline["rate_micros"] is None, iline)
check("POST con líneas devuelve items en orden",
      iline["items"] == [{"description":"Leche","amount_cents":350},{"description":"Pan","amount_cents":150}], iline["items"])
check("POST con líneas impacta el KPI", j(req("GET", f"{API}/stats/summary?month={m}")[2])["expenses_cents"] == exp + 123456 + 500)
st, _, raw = req("PATCH", f"{API}/movements/{iline['id']}", {"items":[{"description":"Cafe","amount_cents":900}]})
check("PATCH reemplaza líneas y recalcula el total", st == 200 and j(raw)["amount_cents"] == 900 and j(raw)["items"] == [{"description":"Cafe","amount_cents":900}], raw[:200])
st, _, raw = req("PATCH", f"{API}/movements/{iline['id']}", {"items":[]})
check("PATCH limpia líneas y conserva el último total como monto manual", st == 200 and j(raw)["items"] == [] and j(raw)["amount_cents"] == 900, raw[:200])
st, _, raw = req("POST", f"{API}/movements", {**items_new, "entry_currency":"VES", "rate_micros":40000000})
ves_lines = j(raw)
check("POST VES con líneas es válido y convierte la suma una sola vez (Bs 500 @ 40 => $0,13)",
      st == 201 and ves_lines["entry_currency"] == "VES" and ves_lines["entry_amount_cents"] == 500
      and ves_lines["rate_micros"] == 40000000 and ves_lines["amount_cents"] == 13, (st, raw[:200]))
req("DELETE", f"{API}/movements/{ves_lines['id']}")
st, _, raw = req("POST", f"{API}/movements", {**items_new, "items":[{"description":"x","amount_cents":0}]})
check("POST línea con precio 0 => 422", st == 422, (st, raw[:160]))
st, _, raw = req("POST", f"{API}/movements", {**items_new, "items":[{"description":"   ","amount_cents":10}]})
check("POST línea sin descripción => 422", st == 422, (st, raw[:160]))
req("DELETE", f"{API}/movements/{iline['id']}")
check("borrar la factura con líneas no deja residuo en el KPI", j(req("GET", f"{API}/stats/summary?month={m}")[2])["expenses_cents"] == exp + 123456)

st, _, raw = req("PATCH", f"{API}/movements/{mid}", {"entry_amount_cents": 999900})
check("PATCH 200 y aplica", st == 200 and j(raw)["amount_cents"] == 999900, (st, raw[:160]))
check("PATCH preserva lo no enviado", j(raw)["category_id"] == "ocio" and j(raw)["note"] == "prueba smoke")
st, _, raw = req("PATCH", f"{API}/movements/{mid}", {"type":"ingreso"})
check("PATCH incoherente => 422", st == 422, (st, raw[:160]))
st, _, raw = req("PATCH", f"{API}/movements/99999999", {"entry_amount_cents": 100})
check("PATCH inexistente => 404", st == 404, st)
st, _, raw = req("DELETE", f"{API}/movements/{mid}")
check("DELETE 204", st == 204, st)
st, _, raw = req("PATCH", f"{API}/movements/{mid}", {"entry_amount_cents": 100})
check("PATCH tras DELETE => 404", st == 404, st)

# ---------------- budgets CRUD ----------------
st, _, raw = req("PUT", f"{API}/budgets/ocio", {"cap_cents": 1000})
check("PUT budget 200", st == 200 and j(raw) == {"category_id":"ocio","cap_cents":1000}, (st, raw[:160]))
st, _, raw = req("GET", f"{API}/budgets?month={m}")
ocio = next(i for i in j(raw)["items"] if i["category_id"] == "ocio")
check("tope bajo => over", ocio["status"] == "over" and ocio["cap_cents"] == 1000 and ocio["pct"] > 1, ocio)
st, _, raw = req("PUT", f"{API}/budgets/sueldo", {"cap_cents": 5000})
check("PUT budget en categoría de ingreso => 422", st == 422, (st, raw[:160]))
st, _, raw = req("PUT", f"{API}/budgets/ocio", {"cap_cents": 0})
check("PUT cap 0 => 422", st == 422, (st, raw[:160]))
st, _, raw = req("DELETE", f"{API}/budgets/ocio")
check("DELETE budget 204", st == 204, st)
st, _, raw = req("GET", f"{API}/budgets?month={m}")
ocio = next(i for i in j(raw)["items"] if i["category_id"] == "ocio")
check("sin tope => none y cap 0", ocio["status"] == "none" and ocio["cap_cents"] == 0, ocio)
req("PUT", f"{API}/budgets/ocio", {"cap_cents": 3000000})  # restaurar el seed

# ---------------- export / import ----------------
st, hdr, raw = req("GET", f"{API}/data/export")
exp_data = j(raw)
check("export 200", st == 200, st)
check("export shape", keys_of(exp_data) == {"version","exported_at","accounts","movements","budgets","jar_categories"}, keys_of(exp_data))
check("export version 4", exp_data["version"] == 4, exp_data["version"])
check("export content-disposition", "attachment" in hdr.get("content-disposition","") and "financirdus-" in hdr.get("content-disposition",""), hdr.get("content-disposition"))
check("export trae todos los movimientos", len(exp_data["movements"]) == len(req("GET", f"{API}/movements")[2] and j(req("GET", f"{API}/movements")[2])), len(exp_data["movements"]))
check("export budgets es dict de gasto", all(k in gasto_ids and isinstance(v, int) and v > 0 for k, v in exp_data["budgets"].items()), exp_data["budgets"])
check("export accounts shape", all(set(a) == {"name","opening_balance_cents"} for a in exp_data["accounts"]), exp_data["accounts"])
check("export movement shape", all(set(x) == {"type","category_id","amount_cents","entry_currency","entry_amount_cents","rate_micros","date","note","account_id","account_name","is_debt_payment","items"} for x in exp_data["movements"]))
check("export movement items shape", all(isinstance(x["items"], list) and all(set(i) == {"description","amount_cents"} for i in x["items"]) for x in exp_data["movements"]))
check("export conserva las líneas del seed", any(x["items"] for x in exp_data["movements"]))
check("export jar_categories mapea categorías de gasto a frascos",
      all(k in gasto_ids and v in {"crecimiento","estabilidad","esencial","recompensas"} for k, v in exp_data["jar_categories"].items()), exp_data["jar_categories"])

before_total = len(j(req("GET", f"{API}/movements")[2]))
st, _, raw = req("POST", f"{API}/data/import?mode=merge", exp_data)
res = j(raw)
check("import merge 200", st == 200, (st, raw[:200]))
check("import merge shape", keys_of(res) == {"mode","movements_imported","movements_skipped","budgets_imported","accounts_imported"}, res)
check("import merge v3 conserva las carteras", len(j(req("GET", f"{API}/accounts")[2])["items"]) >= 3)
check("import merge idempotente (no duplica)", len(j(req("GET", f"{API}/movements")[2])) == before_total, (before_total, len(j(req("GET", f"{API}/movements")[2]))))
check("import merge reporta lo salteado", res["movements_skipped"] == len(exp_data["movements"]), res)
check("import merge v2 preserva la entrada en Bs",
      any(x["entry_currency"] == "VES" and x["rate_micros"] for x in j(req("GET", f"{API}/movements")[2])))

# JSON inválido tiene que mandarse como texto crudo, no como JSON serializado
def raw_post(url, text):
    headers = {"Content-Type": "application/json"}
    if session_cookie:
        headers["Cookie"] = session_cookie
    r = urllib.request.Request(url, data=text.encode(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp: return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
for text, label in [("{ esto no es json", "JSON roto"),
                    (json.dumps({"version":9,"movements":[],"budgets":{}}), "version distinta"),
                    (json.dumps({"version":1,"movements":{},"budgets":{}}), "movements no lista"),
                    (json.dumps({"version":1,"movements":[{"type":"gasto","category_id":"nope","amount_cents":1,"date":f"{m}-01","note":""}],"budgets":{}}), "categoría inválida"),
                    (json.dumps({"version":1,"movements":[{"type":"gasto","category_id":"ocio","amount_cents":1,"date":f"{m[:4]}-02-30","note":""}],"budgets":{}}), "fecha inválida")]:
    st, raw = raw_post(f"{API}/data/import?mode=replace", text)
    detail = j(raw)
    detail = detail.get("detail") if isinstance(detail, dict) else raw[:60]
    check(f"import inválido: {label} => 422", st == 422, (st, raw[:120]))
    check(f"import inválido: {label} no toca los datos", len(j(req("GET", f"{API}/movements")[2])) == before_total, len(j(req("GET", f"{API}/movements")[2])))
    check(f"import inválido: {label} con mensaje", isinstance(detail, str) and len(detail) > 5, detail)

st, _, raw = req("POST", f"{API}/data/import?mode=replace", {"version":1,"movements":[{"type":"gasto","category_id":"salud","amount_cents":500000,"date":f"{m}-05","note":"reemplazo"}],"budgets":{"salud":1000000}})
res = j(raw)
check("import replace 200", st == 200 and res["mode"] == "replace", (st, raw[:160]))
check("import replace deja sólo lo importado", len(j(req("GET", f"{API}/movements")[2])) == 1, len(j(req("GET", f"{API}/movements")[2])))
check("import replace deja sólo los presupuestos importados", list(j(req("GET", f"{API}/budgets?month={m}")[2])["items"][4].values()) and j(req("GET", f"{API}/budgets?month={m}")[2])["items"][4]["cap_cents"] == 1000000)
only_mov = j(req("GET", f"{API}/movements")[2])[0]
check("import v1 normaliza a USD (entry=amount, sin tasa)",
      only_mov["entry_currency"] == "USD" and only_mov["entry_amount_cents"] == 500000 and only_mov["rate_micros"] is None, only_mov)

ves_payload = {"version":2,"movements":[{"type":"gasto","category_id":"supermercado","amount_cents":10000,"entry_currency":"VES","entry_amount_cents":400000,"rate_micros":40000000,"date":f"{m}-06","note":"ves roundtrip"}],"budgets":{},"jar_categories":{"ahorro":"estabilidad"}}
st, _, raw = req("POST", f"{API}/data/import?mode=replace", ves_payload)
check("import replace v2 200", st == 200, (st, raw[:160]))
rt = j(req("GET", f"{API}/movements")[2])[0]
check("import v2 conserva la entrada en Bs",
      rt["entry_currency"] == "VES" and rt["entry_amount_cents"] == 400000 and rt["rate_micros"] == 40000000 and rt["amount_cents"] == 10000, rt)
st, _, raw = req("GET", f"{API}/plan?month={m}")
ahorro_jar = next(x["jar_id"] for x in j(raw)["jars"] if "ahorro" in x["category_ids"])
check("import v2 restaura el mapeo de frascos", ahorro_jar == "estabilidad", ahorro_jar)

# ---------------- SPA servida por nginx ----------------
st, hdr, raw = req("GET", f"{WEB}/")
check("SPA 200", st == 200, st)
check("SPA es html con #root", "text/html" in hdr.get("content-type","") and 'id="root"' in raw, hdr.get("content-type"))
check("SPA tiene title y lang", "<title>" in raw and 'lang="es"' in raw)
check("SPA sin scripts inline (CSP estricta ok)", not re.search(r"<script[^>]*>[^<]", raw))
check("cabeceras de seguridad en el HTML", bool(hdr.get("content-security-policy")) and hdr.get("x-content-type-options") == "nosniff" and hdr.get("x-frame-options") == "DENY", {k: v for k, v in hdr.items() if k.startswith("x-") or k == "content-security-policy"})
asset = re.search(r'src="(/assets/[^"]+)"', raw)
check("asset JS referenciado", bool(asset), raw[:200])
if asset:
    st2, hdr2, body = req("GET", f"{WEB}{asset.group(1)}")
    check("asset JS 200 y no vacío", st2 == 200 and len(body) > 1000, (st2, len(body)))
    check("cabeceras de seguridad en los assets (herencia de add_header)", hdr2.get("x-frame-options") == "DENY" and bool(hdr2.get("content-security-policy")), hdr2)
    check("assets con cache largo", "max-age=31536000" in (hdr2.get("cache-control") or ""), hdr2.get("cache-control"))
st, _, raw = req("GET", f"{WEB}/api/health")
check("proxy /api desde el mismo origen", st == 200 and j(raw)["status"] == "ok", (st, raw[:120]))
st, _, raw = req("GET", f"{WEB}/una/ruta/profunda")
check("SPA fallback a index.html", st == 200 and 'id="root"' in raw, st)

# ---------------- CORS (sólo para dev) ----------------
st, hdr, _ = req("OPTIONS", f"{API}/health", headers={"Origin":"http://localhost:5173","Access-Control-Request-Method":"GET"})
check("CORS preflight permite el origen de dev", hdr.get("access-control-allow-origin") == "http://localhost:5173", hdr.get("access-control-allow-origin"))
st, hdr, _ = req("GET", f"{API}/health", headers={"Origin":"http://evil.example"})
check("CORS no permite orígenes ajenos", hdr.get("access-control-allow-origin") is None, hdr.get("access-control-allow-origin"))

# ---------------- límites documentados ----------------
before_limits = len(j(req("GET", f"{API}/movements")[2]))
limits_acc = j(req("GET", f"{API}/accounts")[2])["items"][0]["id"]

def raw_declared_length(base_url, path, length):
    """Manda solo los headers con un Content-Length grande y lee la respuesta temprana.

    Un cuerpo de 11 MB no se puede mandar con urllib: el servidor contesta y cierra antes
    (broken pipe), que es justo el comportamiento correcto. Asi se verifica el rechazo real.
    La API está cerrada, así que la petición necesita la cookie de sesión: sin ella el
    rechazo temprano llegaría después del 401, no del 413.
    """
    import socket
    from urllib.parse import urlsplit
    target = urlsplit(base_url)
    host = target.hostname or "127.0.0.1"
    port = target.port or 80
    sock = socket.create_connection((host, port), timeout=20)
    cookie_line = f"Cookie: {session_cookie}\r\n" if session_cookie else ""
    head = (f"POST {path} HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Type: application/json\r\n"
            f"{cookie_line}"
            f"Content-Length: {length}\r\nConnection: close\r\n\r\n")
    sock.sendall(head.encode())
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = sock.recv(4096)
        if not chunk: break
        data += chunk
    head_text, _, rest = data.partition(b"\r\n\r\n")
    declared = 0
    for line in head_text.decode(errors="replace").split("\r\n"):
        if line.lower().startswith("content-length"):
            declared = int(line.split(":")[1].strip())
    while len(rest) < declared:
        chunk = sock.recv(4096)
        if not chunk: break
        rest += chunk
    sock.close()
    return int(head_text.split(b" ")[1]), rest.decode(errors="replace")

st, raw = raw_declared_length(API, "/api/data/import?mode=merge", 11 * 1024 * 1024)
print("[info] rechazo temprano por Content-Length:", st, raw[:80].replace("\n", " "))
body = j(raw)
check("import con cuerpo > 5 MB => 413 (rechazo temprano por Content-Length)", st == 413, (st, raw[:120]))
check("413 con mensaje claro", isinstance(body, dict) and isinstance(body.get("detail"), str) and "5 MB" in body["detail"], raw[:160])
check("413 no modificó los datos", len(j(req("GET", f"{API}/movements")[2])) == before_limits)

many = json.dumps({"version":1,"movements":[{"type":"gasto","category_id":"ocio","amount_cents":1,"date":f"{m}-01","note":""} for _ in range(20001)],"budgets":{}})
print("[info] payload de 20001 movimientos:", round(len(many)/1024/1024, 1), "MB")
st, raw = raw_post(f"{API}/data/import?mode=merge", many)
check("import con 20001 movimientos => 422", st == 422, (st, raw[:140]))
check("20001 movimientos no modificó los datos", len(j(req("GET", f"{API}/movements")[2])) == before_limits)

st, _, raw = req("POST", f"{API}/movements", {"type":"gasto","category_id":"ocio","account_id":limits_acc,"entry_amount_cents":2147483648,"date":f"{m}-01","note":""})
check("monto > máximo de INTEGER => 422", st == 422 and "grande" in raw, (st, raw[:140]))
st, _, raw = req("POST", f"{API}/movements", {"type":"gasto","category_id":"ocio","account_id":limits_acc,"entry_amount_cents":2147483647,"date":f"{m}-01","note":"maximo"})
check("monto = máximo de INTEGER se acepta", st == 201, (st, raw[:140]))
if st == 201:
    req("DELETE", f"{API}/movements/{j(raw)['id']}")
st, _, raw = req("PUT", f"{API}/budgets/ocio", {"cap_cents": 2147483648})
check("tope > máximo de INTEGER => 422", st == 422 and "grande" in raw, (st, raw[:140]))

st, raw = raw_post(f"{API}/data/import?mode=replace", json.dumps({"version":1,"movements":[],"budgets":{"no-existe":5000}}))
check("import con categoría de presupuesto inválida => 422", st == 422, (st, raw[:140]))
check("presupuesto inválido no toca los datos", len(j(req("GET", f"{API}/movements")[2])) == before_limits)
st, raw = raw_post(f"{API}/data/import?mode=replace", json.dumps({"version":1,"movements":[],"budgets":{"ocio":0}}))
check("presupuesto 0 en import = sin tope (sin error)", st == 200, (st, raw[:140]))
st, _, raw = req("GET", f"{API}/budgets?month={m}")
items_after = j(raw)["items"]
ocio_after = next(i for i in items_after if i["category_id"] == "ocio")
check("un presupuesto importado en 0 queda como 'sin tope' (cap 0 + status none)",
      ocio_after["cap_cents"] == 0 and ocio_after["status"] == "none", ocio_after)
check("tras el replace no sobreviven topes de otras categorias",
      all(i["cap_cents"] == 0 for i in items_after), [i["cap_cents"] for i in items_after])

# nginx corta el cuerpo antes de llegar a la API (defensa en profundidad)
st_proxy, proxy_body = raw_declared_length(WEB, "/api/data/import?mode=merge", 7 * 1024 * 1024)
check("el proxy también corta el cuerpo gigante (413)", st_proxy == 413, (st_proxy, proxy_body[:80]))

# ---------------- sesiones activas, CSRF y cierre ----------------
st, _, raw = req("GET", f"{API}/admin/sessions")
sessions = (j(raw) or {}).get("items", [])
check("sesiones activas 200", st == 200, (st, raw[:160]))
check("sesión item shape", all(set(s) == {"id","created_at","last_seen_at","expires_at","ip","user_agent","is_current"} for s in sessions), sessions)
check("la sesión de este test es la única marcada como actual", [s["is_current"] for s in sessions].count(True) == 1, sessions)
check("cada sesión vence después de haberse creado", all(s["expires_at"] > s["created_at"] for s in sessions), sessions)

st, _, raw = req("DELETE", f"{API}/admin/sessions/99999999")
check("cerrar una sesión inexistente => 404", st == 404, (st, raw[:120]))

st, _, raw = req("POST", f"{API}/auth/logout", headers={"Origin": "http://evil.example"})
check("CSRF: mutación con origen ajeno => 403 y mensaje", st == 403 and j(raw) == {"detail": "Origen no permitido."}, (st, raw[:120]))
st, _, raw = req("POST", f"{API}/auth/logout", headers={"Sec-Fetch-Site": "cross-site"})
check("CSRF: petición cross-site => 403", st == 403, (st, raw[:120]))
st, _, raw = req("GET", f"{API}/categories")
check("el intento cross-site no cerró la sesión", st == 200, (st, raw[:120]))

st, hdr, raw = req("POST", f"{API}/auth/logout")
check("logout 204", st == 204, st)
check("logout borra la cookie", SESSION_COOKIE in hdr.get("set-cookie", ""), hdr.get("set-cookie"))
check("la sesión revocada deja de servir (revocación en el servidor)", req("GET", f"{API}/categories")[0] == 401)

st, _, raw = req("POST", f"{API}/auth/login", {"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}, auth=False)
check("se puede volver a entrar después del logout", st == 200, (st, raw[:160]))

print()
print(f"{passed} passed, {len(failures)} failed")
if failures:
    print("\nFALLOS:")
    for f in failures: print(" -", f)
    sys.exit(1)

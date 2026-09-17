"""Test de integración de FinanciRDUS contra el stack levantado.

Verifica el contrato completo (docs/api.md) contra la API real y el SPA servido por nginx:
health, categorías, CRUD de movimientos, presupuestos, stats, export/import (merge, replace,
inválidos y límites), proxy, cabeceras de seguridad y CORS.

OJO: es destructivo (los casos de import usan modo replace). Al terminar, re-sembrá el ejemplo:

    make test-integration      # corre el test y vuelve a sembrar
    python3 tests/integration/api_smoke.py   # a mano, con el stack ya levantado

Variables opcionales: API_URL (default http://localhost:8000/api) y WEB_URL (default http://localhost:8080).
"""

import json
import os
import urllib.request
import urllib.error
import re
import sys

API = os.environ.get("API_URL", "http://localhost:8000/api").rstrip("/")
WEB = os.environ.get("WEB_URL", "http://localhost:8080").rstrip("/")

passed, failures = 0, []
def check(name, cond, extra=None):
    global passed
    if cond: passed += 1
    else: failures.append(f"{name}" + (f" >>> {extra!r}" if extra is not None else ""))

def req(method, url, body=None, headers=None):
    data = None
    hdrs = dict(headers or {})
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

# ---------------- health / categories ----------------
st, _, raw = req("GET", f"{API}/health")
h = j(raw)
check("health 200", st == 200, st)
check("health shape", keys_of(h) == {"status", "db", "version"}, h)
check("health ok", h and h.get("status") == "ok" and h.get("db") == "ok", h)

st, _, raw = req("GET", f"{API}/categories")
cats = j(raw) or []
check("categories 200 y 14 items", st == 200 and len(cats) == 14, len(cats))
check("categories shape", all(keys_of(c) == {"id", "type", "label", "sort_order"} for c in cats))
gasto_ids = [c["id"] for c in cats if c["type"] == "gasto"]
ingreso_ids = [c["id"] for c in cats if c["type"] == "ingreso"]
check("10 categorías de gasto (legacy)", gasto_ids == ["supermercado","comidas-afuera","transporte","alquiler-servicios","salud","suscripciones","ropa","ocio","ahorro","otros"], gasto_ids)
check("4 categorías de ingreso", ingreso_ids == ["sueldo","freelance","inversiones","otros-ingresos"], ingreso_ids)
check("catálogo ordenado (gasto primero)", [c["type"] for c in cats] == ["gasto"]*10 + ["ingreso"]*4, [c["type"] for c in cats])
check("sort_order ascendente dentro de cada tipo", [c["sort_order"] for c in cats if c["type"]=="gasto"] == list(range(1,11)) and [c["sort_order"] for c in cats if c["type"]=="ingreso"] == list(range(1,5)))

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

# ---------------- movements ----------------
st, _, raw = req("GET", f"{API}/movements?month={m}")
movs = j(raw) or []
check("movements 200", st == 200, st)
check("movements del mes (~23 del seed)", len(movs) >= 20, len(movs))
check("movement shape", all(keys_of(x) == {"id","type","category_id","amount_cents","date","note","created_at"} for x in movs))
check("todos del mes pedido", all(x["date"].startswith(m) for x in movs))
dates = [x["date"] for x in movs]
check("ordenado por fecha desc", dates == sorted(dates, reverse=True), (dates[:3], sorted(dates, reverse=True)[:3]))
check("montos enteros positivos", all(isinstance(x["amount_cents"], int) and x["amount_cents"] > 0 for x in movs))
check("10 categorías de gasto presentes", len({x["category_id"] for x in movs if x["type"]=="gasto"}) == 10)
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
check("10 categorías con gasto", len(bc["items"]) == 10, len(bc["items"]))

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
check("total_spent = KPI de gastos", bd["total_spent_cents"] == exp, (bd["total_spent_cents"], exp))
for i in bd["items"]:
    if i["cap_cents"] > 0:
        check(f"pct {i['category_id']}", abs(i["pct"] - i["spent_cents"]/i["cap_cents"]) < 1e-9)
    expect = ("none" if i["cap_cents"] <= 0 else "over" if i["spent_cents"] > i["cap_cents"]
              else "warn" if i["spent_cents"] >= 0.8*i["cap_cents"] else "ok")
    check(f"status {i['category_id']}", i["status"] == expect, (i["status"], expect))
print("[info] presupuestos:", ", ".join(f"{i['category_id']}={i['status']}" for i in bd["items"]))

# ---------------- CRUD ----------------
new = {"type":"gasto","category_id":"ocio","amount_cents":123456,"date":f"{m}-10","note":"prueba smoke"}
st, _, raw = req("POST", f"{API}/movements", new)
created = j(raw)
check("POST 201", st == 201, (st, raw[:200]))
check("POST shape", keys_of(created) == {"id","type","category_id","amount_cents","date","note","created_at"})
mid = created["id"]
st, _, raw = req("GET", f"{API}/stats/summary?month={m}")
check("POST impacta el KPI de gastos", j(raw)["expenses_cents"] == exp + 123456, j(raw)["expenses_cents"])

st, _, raw = req("POST", f"{API}/movements", {**new, "type":"gasto", "category_id":"sueldo"})
check("POST categoría de otro tipo => 422", st == 422 and isinstance(j(raw).get("detail"), str), (st, raw[:160]))
st, _, raw = req("POST", f"{API}/movements", {**new, "amount_cents":0})
check("POST monto 0 => 422", st == 422, (st, raw[:160]))
st, _, raw = req("POST", f"{API}/movements", {**new, "date":f"{m[:4]}-02-30"})
check("POST 31-feb => 422", st == 422, (st, raw[:160]))
st, _, raw = req("POST", f"{API}/movements", {**new, "category_id":"no-existe"})
check("POST categoría inexistente => 422", st == 422, (st, raw[:160]))
movs_before_long = len(j(req("GET", f"{API}/movements?month={m}")[2]))
st, _, raw = req("POST", f"{API}/movements", {**new, "note":"x"*300})
check("POST nota de 300 caracteres => 422 y no lo crea",
      st == 422 and len(j(req("GET", f"{API}/movements?month={m}")[2])) == movs_before_long, (st, raw[:160]))

st, _, raw = req("PATCH", f"{API}/movements/{mid}", {"amount_cents": 999900})
check("PATCH 200 y aplica", st == 200 and j(raw)["amount_cents"] == 999900, (st, raw[:160]))
check("PATCH preserva lo no enviado", j(raw)["category_id"] == "ocio" and j(raw)["note"] == "prueba smoke")
st, _, raw = req("PATCH", f"{API}/movements/{mid}", {"type":"ingreso"})
check("PATCH incoherente => 422", st == 422, (st, raw[:160]))
st, _, raw = req("PATCH", f"{API}/movements/99999999", {"amount_cents": 100})
check("PATCH inexistente => 404", st == 404, st)
st, _, raw = req("DELETE", f"{API}/movements/{mid}")
check("DELETE 204", st == 204, st)
st, _, raw = req("PATCH", f"{API}/movements/{mid}", {"amount_cents": 100})
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
check("export shape", keys_of(exp_data) == {"version","exported_at","movements","budgets"}, keys_of(exp_data))
check("export version 1", exp_data["version"] == 1)
check("export content-disposition", "attachment" in hdr.get("content-disposition","") and "financirdus-" in hdr.get("content-disposition",""), hdr.get("content-disposition"))
check("export trae todos los movimientos", len(exp_data["movements"]) == len(req("GET", f"{API}/movements")[2] and j(req("GET", f"{API}/movements")[2])), len(exp_data["movements"]))
check("export budgets es dict de gasto", all(k in gasto_ids and isinstance(v, int) and v > 0 for k, v in exp_data["budgets"].items()), exp_data["budgets"])
check("export movement shape", all(set(x) == {"type","category_id","amount_cents","date","note"} for x in exp_data["movements"]))

before_total = len(j(req("GET", f"{API}/movements")[2]))
st, _, raw = req("POST", f"{API}/data/import?mode=merge", exp_data)
res = j(raw)
check("import merge 200", st == 200, (st, raw[:200]))
check("import merge shape", keys_of(res) == {"mode","movements_imported","movements_skipped","budgets_imported"}, res)
check("import merge idempotente (no duplica)", len(j(req("GET", f"{API}/movements")[2])) == before_total, (before_total, len(j(req("GET", f"{API}/movements")[2]))))
check("import merge reporta lo salteado", res["movements_skipped"] == len(exp_data["movements"]), res)

# JSON inválido tiene que mandarse como texto crudo, no como JSON serializado
def raw_post(url, text):
    r = urllib.request.Request(url, data=text.encode(), method="POST", headers={"Content-Type":"application/json"})
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

def raw_declared_length(port, path, length):
    """Manda solo los headers con un Content-Length grande y lee la respuesta temprana.

    Un cuerpo de 11 MB no se puede mandar con urllib: el servidor contesta y cierra antes
    (broken pipe), que es justo el comportamiento correcto. Asi se verifica el rechazo real.
    """
    import socket
    sock = socket.create_connection(("127.0.0.1", port), timeout=20)
    head = (f"POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\n"
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

st, raw = raw_declared_length(8000, "/api/data/import?mode=merge", 11 * 1024 * 1024)
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

st, _, raw = req("POST", f"{API}/movements", {"type":"gasto","category_id":"ocio","amount_cents":2147483648,"date":f"{m}-01","note":""})
check("monto > máximo de INTEGER => 422", st == 422 and "grande" in raw, (st, raw[:140]))
st, _, raw = req("POST", f"{API}/movements", {"type":"gasto","category_id":"ocio","amount_cents":2147483647,"date":f"{m}-01","note":"maximo"})
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
st_proxy, proxy_body = raw_declared_length(8080, "/api/data/import?mode=merge", 7 * 1024 * 1024)
check("el proxy también corta el cuerpo gigante (413)", st_proxy == 413, (st_proxy, proxy_body[:80]))

print()
print(f"{passed} passed, {len(failures)} failed")
if failures:
    print("\nFALLOS:")
    for f in failures: print(" -", f)
    sys.exit(1)

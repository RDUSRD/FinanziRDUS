# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Una sola persona: el dueño de la app, que registra sus finanzas personales. La usa
**principalmente desde el celular, en el momento** en que ocurre el gasto o el ingreso, y
también la revisa desde la computadora para entender cómo viene el mes. No hay otros roles,
invitados ni multiusuario: la app no tiene autenticación a propósito.

## Product Purpose

Registrar los gastos e ingresos del mes, definir topes por categoría y responder rápido tres
preguntas: cuánto queda, en qué se va la plata y cómo viene contra los meses anteriores. Suma
un panel con la metodología 25/15/50/10 que compara el objetivo de cada frasco contra lo
gastado. Éxito = cargar un movimiento sin fricción en segundos y entender el estado del mes de
un vistazo.

## Positioning

Combina tres cosas que una app de gastos genérica no tiene juntas: la metodología de frascos
**25/15/50/10** integrada a los datos reales, **doble moneda** (el dólar es la moneda canónica
de la cartera; un movimiento se puede cargar en bolívares con su tasa y el backend calcula el
equivalente en USD conservando el monto original) y **carteras con deuda** (saldo por cartera,
deuda total y pago de deuda como movimiento). Es una herramienta privada de una sola persona,
no un producto de mercado.

## Operating Context

- Corre local o en LAN con Docker Compose (`db` + `api` + `web`); sin terceros, sin cookies,
  sin analítica, sin CDNs ni fuentes externas.
- El backend calcula (totales, porcentajes, promedios, estados de presupuesto, conversión de
  bolívares); el frontend solo formatea y presenta.
- El dinero son **centavos enteros** de punta a punta; los meses son strings `YYYY-MM`; "hoy"
  se resuelve con `APP_TZ` (`America/Caracas` por defecto).
- Hay un modo de desarrollo con Vite en `:5173` proxeando `/api`, y un stack completo en
  `:8080` servido por nginx.
- Datos de ejemplo (seed) de un mes completo repartido en las 10 categorías de gasto, 6 meses
  de historial, 10 presupuestos y carteras, para que los gráficos tengan datos reales.

## Capabilities and Constraints

- Alta, edición y borrado de movimientos (gasto o ingreso) con monto, categoría, fecha, nota y
  cartera; monto en USD o en Bs con tasa.
- Tres KPIs: ingresos del mes, gastos del mes y cuánto queda (rojo si es negativo).
- Comparación del gasto del mes contra el promedio de los 6 meses **anteriores**.
- Donut de gastos por categoría (SVG propio) y barras de los últimos 6 meses (SVG propio, sin
  librerías de charts).
- Presupuestos por categoría con umbrales: ≥80% ámbar, >100% rojo.
- Plan 25/15/50/10 con cuatro frascos y reasignación de categorías a frascos.
- Carteras con nombre, con deuda total y registro de pago de deuda.
- Export e import JSON (fusionar o reemplazar; transaccional; tope 5 MB / 20.000 movimientos).
- Filtro por cartera y por categoría; navegación por mes.
- Categorías vienen de la API (10 de gasto, 4 de ingreso), nunca hardcodeadas.
- Restricciones fijas: un solo usuario sin login, PostgreSQL, React + TypeScript + Tailwind.
  El backend no se toca en un rediseño de UI; el contrato de la API está congelado.
- Toda la funcionalidad existente y las reglas de negocio deben sobrevivir intactas al
  rediseño. El look actual **no** es una referencia vinculante: se reemplaza.

## Brand Commitments

- Nombre del producto: **FinanciRDUS**.
- Ninguna paleta, tipografía ni motivo visual está fijado; el dueño pidió reemplazar por
  completo el mundo visual actual (oscuro + teal).
- Voz en **español rioplatense/venezolano**, cercana y directa, tuteando con "vos"
  ("cargás", "tenés", "cuánto te queda"). Debe conservarse.

## Evidence on Hand

- `legacy/index.html`: la app original de un solo archivo, referencia de reglas de negocio y de
  contenido real (etiquetas, textos, estructura del panel).
- `backend/app/seed.py` y los datos sembrados: contenido real para gráficos, tablas y estados.
- `docs/architecture.md`, `docs/api.md`, `docs/data-model.md`: contrato congelado.
- No existen logos, fotos, testimonios, precios ni material de marketing. Nada de eso debe
  inventarse.

## Product Principles

1. **Registrar gana a todo**: la acción más frecuente es cargar un movimiento; tiene que costar
   segundos, sobre todo en el celular.
2. **El backend calcula, el frontend formatea**: ninguna cifra de negocio se recalcula en el
   cliente.
3. **El mes es la unidad**: toda la navegación y la jerarquía giran alrededor de entender el mes
   actual.
4. **Una sola persona, cero ceremonia**: sin login, sin onboarding, sin pasos de confirmación
   innecesarios; pero nada destructivo sin confirmar.
5. **La accesibilidad no se negocia**: teclado, foco visible, contraste AA y una sola región
   live son parte del producto, no un extra.

## Accessibility & Inclusion

WCAG 2.2 AA obligatorio: contraste ≥4.5:1 en texto y ≥3:1 en controles y gráficos, `<label>`
asociado a cada control, foco visible, navegación completa por teclado, targets táctiles ≥44px,
`prefers-reduced-motion` respetado, errores de formulario con `aria-invalid`/`aria-describedby`
y una sola región live para los anuncios.

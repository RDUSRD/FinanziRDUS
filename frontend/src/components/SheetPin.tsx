/**
 * El alfiler de la hoja: el objeto que la clava al tablero.
 *
 * Está dibujado como una marca grabada —una familia de opacidades sobre la misma
 * tinta, más la luz sin imprimir sobre la cúpula—, que es como este mundo dibuja
 * algo con volumen. La penumbra va en degradado para que lea como sombra
 * proyectada y no como una base. Es decoración: el alfiler de cada facturita es
 * otro, el glifo en línea del botón.
 *
 * La punta entra en el papel a 26 de los 30 del viewBox, así que `.sheet-pin`
 * ancla el dibujo por esa línea para que el borde de la hoja la cruce.
 */
export function SheetPin({ size = 42 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size * 30) / 40}
      viewBox="0 0 40 30"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* La penumbra que deja apoyado: blanda, sin borde. */}
        <radialGradient id="sheet-pin-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopOpacity="0.34" />
          <stop offset="55%" stopOpacity="0.14" />
          <stop offset="100%" stopOpacity="0" />
        </radialGradient>
        {/* La cúpula: el rango va de la luz a la sombra, como el grabado de los
         * gráficos —si el rango es angosto, la cabeza lee plana—. */}
        <radialGradient id="sheet-pin-dome" cx="30%" cy="20%" r="92%">
          <stop offset="0%" stopOpacity="0.4" />
          <stop offset="46%" stopOpacity="0.74" />
          <stop offset="100%" stopOpacity="1" />
        </radialGradient>
      </defs>

      {/* La sombra sobre el papel, por debajo de la cabeza. */}
      <ellipse cx="20" cy="26.2" rx="14" ry="4.4" fill="url(#sheet-pin-shadow)" />
      {/* El canto: el espesor de la cabeza, en sombra. */}
      <ellipse cx="20" cy="14.4" rx="13" ry="5.6" fill="currentColor" opacity="0.68" />
      {/* La cúpula. */}
      <ellipse cx="20" cy="11.6" rx="13" ry="8" fill="url(#sheet-pin-dome)" />
      {/* La luz: papel sin imprimir sobre la cúpula. */}
      <ellipse
        className="sheet-pin-gleam"
        cx="14.8"
        cy="9"
        rx="4.2"
        ry="2.1"
        opacity="0.45"
        transform="rotate(-16 14.8 9)"
      />
      {/* El cuello, que baja hasta la hoja. */}
      <path d="M16.8 16.8h6.4l-1 8.6h-4.4z" fill="currentColor" opacity="0.78" />
      {/* La entrada: donde la punta atraviesa el papel. */}
      <ellipse cx="20" cy="25.6" rx="1.7" ry="1.1" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

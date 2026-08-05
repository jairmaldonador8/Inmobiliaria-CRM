# Research Brief: Mobile-first «Fintech Muro»

> Deep-research del 2026-08-05 para el spec
> `2026-08-05-mobile-first-fintech-muro-design.md`. Fuentes: repo (Tailwind,
> tokens, datos) + web (MDN, WebKit bugs, Apple HIG/Material, Tailwind v4,
> docs locales de Next 16), cross-checked.

## Hallazgos del repo (cambian el plan)

- **Tailwind v4 CSS-first**: NO hay `tailwind.config`; tokens en
  `globals.css` con `@theme inline` + vars en `:root`. Los tokens nuevos del
  kit van ahí (namespaces `--color-*`, `--shadow-*`, `--radius-*`, `--blur-*`
  generan utilidades automáticamente).
- **Truco vigente**: `slate` y `white` están REMAPEADOS a la rampa cálida Muro
  en `globals.css:14-28` (los JSX dicen `bg-white`/`text-slate-900` pero
  pintan crema/tinta). El kit debe convivir con ese remap, no duplicarlo.
- **`--chart-1..5` ya existen y están SIN USAR** (#6B4A33, #C98A3B, #9C6B4A,
  #D8C9B0, #7D8A5C) — listos para las gráficas SVG.
- **CRÍTICO — `viewport` export ausente**: no hay `viewportFit: 'cover'` →
  TODOS los `env(safe-area-inset-*)` que la app YA usa (nav-asesor,
  3 bottom-sheets) resuelven a 0 en iPhone. Prerequisito del kit:
  `export const viewport: Viewport = { width: 'device-width', initialScale: 1,
  viewportFit: 'cover' }` en `src/app/layout.tsx`.
- **El área asesor NO tiene variante desktop** (`max-w-md` siempre, comentario
  explícito en su layout) → se puede restilizar SIN guards `lg:`. Solo
  `(admin)` necesita el par `lg:hidden` / `hidden lg:block` (convención ya
  establecida en asesores/leads pages).
- **La tab bar del asesor YA existe** (`src/components/nav/nav-asesor.tsx`:
  fixed bottom, array `PESTANAS`, `aria-current`, safe-area) — la TabBarAdmin
  se modela sobre ella y la del asesor se re-viste, no se reconstruye.
- **Cero código de gráficas hoy** (ni librerías ni SVG); KPIs = tarjetas
  numéricas con `data-testid` (`kpi-bandeja`, `kpi-propiedades`) que los
  tests conocen — PRESERVAR esos testids.
- **Datos faltantes confirmados** para el dashboard C2: no hay serie de leads
  por día (solo un count del mes) ni «cierres del mes» admin. El patrón para
  cierres ya existe en la cola del asesor: contar `seguimientos` con
  `tipo='sistema'` y `nota=NOTA_CIERRE.cerrado_ganado` (dedup por lead_id) —
  copiar ese patrón con el admin client. «Citas hoy» del mockup TAMPOCO tiene
  query (tabla visitas existe; query nueva).
- Componentes: shadcn estilo base-nova sobre **Base UI** (no Radix), CVA +
  `cn()`, lucide-react, Poppins/Jost vía `next/font`. `Card` de ui/ casi no se
  usa (las páginas hacen tarjetas a mano). `loading.tsx` del admin espeja el
  grid de KPIs — actualizar en lockstep si cambia la forma.

## Hallazgos web (estado del arte 2026)

### Glass / backdrop-filter en móvil
- **Presupuesto: 1–3 elementos con blur por pantalla** (consenso 2025-26);
  cada `backdrop-filter` es una pasada GPU por frame. Regla del kit: blur REAL
  solo en la tab bar (contenido scrollea debajo) y máx. 1 superficie hero;
  las demás tarjetas fingen el cristal con tinte semitransparente + borde
  claro + sombra (sobre fondo estático es indistinguible).
- Radio de blur 8–16px (más = costo superlineal). `-webkit-backdrop-filter`
  primero, luego sin prefijo (iOS <18).
- **Gotcha «backdrop root»** (MDN): un ancestro con `opacity<1`, `filter`,
  `mask`, `mix-blend-mode` o su propio backdrop-filter corta lo que el blur
  ve → nunca anidar glass en glass ni animar opacity de un ancestro del glass.
- Bugs WebKit con border-radius + blur (#158807, #98538): aplicar radius y
  blur en el MISMO elemento + `isolation: isolate`.
- iOS + `position:fixed` con blur = jank al scrollear → wrapper fijo
  transparente con hijo absoluto que lleva el glass (patrón también requerido
  por el tinte de chrome de Safari 26).

### PWA standalone iOS
- `env(safe-area-inset-*)` exige `viewport-fit=cover` (vía `viewport` export;
  verificado contra el Next 16 local). Tab bar flotante:
  `bottom: max(12px, env(safe-area-inset-bottom))`; el scroll container
  compensa con padding-bottom.
- **Safari 26 ignora `theme-color`**: muestrea el CSS real (background de
  html/body y elementos fijos en los bordes). Poner `background-color`
  explícito en body; overlays invisibles con `display:none`, no `opacity:0`.
- `prefers-reduced-motion` ~95 % soporte → gatear animaciones.
  `prefers-reduced-transparency` NO existe en Safari/iOS → los tintes deben
  pasar contraste AA POR SÍ SOLOS, sin contar el blur (regla de kit).
- Tab bar flotante tipo píldora = estándar nativo de iOS 26 (Liquid Glass),
  no una moda. Apple: 2–5 tabs, targets 44pt; Material: 48dp → diseñar hit
  areas ≥48px. 4-5 items es lo correcto.

### Gráficas SVG a mano
- Curvas suaves: **Catmull-Rom → Bézier cúbica**: para P1→P2 con vecinos
  P0,P3: `B1 = P1 + (P2−P0)/6`, `B2 = P2 − (P3−P1)/6` (¡B2 RESTA!), endpoints
  duplicados. Cuidado con overshoot en mínimos/máximos → clamp de Y de los
  puntos de control al rango del segmento.
- Área: segundo path cerrado a la baseline con `linearGradient` vertical
  (color del trazo 25 %→0). **IDs de gradiente únicos por instancia** (IDs
  duplicados entre componentes montados rompen el fill).
- Responsive: `viewBox` + width 100 %; si estira, `preserveAspectRatio="none"`
  + `vector-effect="non-scaling-stroke"`.
- A11y: `role="img"` + `<title>` describiendo la CONCLUSIÓN («tendencia al
  alza…»); si el valor está impreso al lado, `aria-hidden` en el SVG y label
  en el compuesto.

### Tailwind v4
- Tokens del kit en `@theme` (p. ej. `--shadow-glass`, `--blur-glass`,
  `--radius-card` → `shadow-glass`, `backdrop-blur-glass`, `rounded-card`).
- Variante custom útil: `@custom-variant standalone
  (@media (display-mode: standalone));` → `standalone:pb-...`.

## Enfoque recomendado (consolidado)

Fase 0 del plan incorpora como PRIMERAS tareas: (1) `viewport` export con
`viewportFit: 'cover'` (arregla de paso los safe-areas rotos de hoy);
(2) tokens `@theme` del kit; (3) componentes con la regla de presupuesto de
blur (TarjetaGlass sin blur real por default; prop `conBlur` solo para hero/
tab bar). GraficaLinea con Catmull-Rom + clamp + IDs únicos (`useId`).
TabBarAdmin modelada sobre nav-asesor.tsx. Los datos nuevos (serie 30 días,
cierres admin, citas hoy) son tareas TDD previas a la vista del dashboard.
Preservar `data-testid` de KPIs y actualizar `loading.tsx` en lockstep.

## Fuentes principales

Repo: `globals.css`, `components.json`, `nav-asesor.tsx`, `admin/page.tsx`,
`asesor/page.tsx`, `formato.ts` (NOTA_CIERRE), docs locales de Next 16
(`generate-viewport.md`, `extra-types.d.ts`). Web: MDN backdrop-filter,
WebKit bugs 158807/98538, 1ar.io + nasedk.in (Safari 26 theme-color),
web.dev PWA, caniuse (reduced-transparency/motion), JointJS + F. Romain
(Catmull-Rom), TPGi/Soueidan (SVG a11y), Learn UI Design (iOS 26 tab bar),
m3.material.io, tailwindcss.com v4 (@theme, @custom-variant).

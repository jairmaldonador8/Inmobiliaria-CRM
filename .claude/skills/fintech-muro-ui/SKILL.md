---
name: fintech-muro-ui
description: Use when building or reviewing any view/component of the «Fintech Muro» mobile redesign — glass cards, gradient backgrounds, SVG charts, tab bar, or any mobile-only styling in this repo.
---

# Fintech Muro UI (kit móvil)

## Overview
Estética fintech (glass + gradiente cálido) en la paleta Muro, SOLO en móvil.
Mockup canónico: `design-propuestas/fintech-muro-aprobado.html` (teléfono derecho).
Research completo: `docs/ultrapowers/research/2026-08-05-fintech-muro-research.md`.

## Reglas duras

1. **Presupuesto de blur: máx. 1–3 elementos con `backdrop-filter` por pantalla.**
   Blur REAL solo donde el contenido scrollea debajo (tab bar, header sticky).
   Las tarjetas normales FINGEN el cristal: tinte `rgba(250,247,241,0.62-0.68)`
   + borde `1px rgba(255,255,255,0.8)` + sombra cálida — sobre el fondo estático
   es indistinguible y cuesta 0 GPU.
2. **Escritorio intocable**: en `(admin)`, par de hermanos `lg:hidden` (nuevo) /
   `hidden lg:block` (actual). En `(asesor)` NO hay variante desktop
   (`max-w-md` siempre) — restilizar directo, sin guards.
3. **Contraste AA sin contar el blur** (Safari/iOS no soporta
   `prefers-reduced-transparency`): el texto debe pasar contraste sobre el
   tinte sólido. Texto secundario `#8E7F68` sobre cristal: verificar siempre.
4. **Preservar `data-testid`** existentes (`kpi-bandeja`, `kpi-propiedades`) y
   actualizar `src/app/(admin)/admin/loading.tsx` si cambia la forma del grid.
5. Animaciones detrás de `motion-safe:` / `@media (prefers-reduced-motion)`.

## Recetas

**Fondo de vista** (gradiente + orbes, estático):
```css
background: linear-gradient(150deg,#F5F1E8 0%,#F3DCC2 32%,#EBBF9A 62%,#DFA987 100%);
/* orbes: radial-gradient(circle, rgba(201,138,59,.38), transparent 70%) y
   rgba(163,78,40,.22) — divs absolutos, sin animar */
```

**Glass real** (solo tab bar / hero): radius y blur en el MISMO elemento +
`isolation:isolate` (bugs WebKit #158807/#98538); `-webkit-backdrop-filter`
ANTES del sin prefijo; nunca anidar glass en glass ni poner `opacity<1`,
`filter` o `mask` en un ancestro (backdrop root corta el blur → «no hace nada»).
Fixed con blur en iOS jankea: wrapper `fixed` transparente + hijo absoluto con
el glass (mismo patrón que exige el tinte de chrome de Safari 26, que IGNORA
theme-color y muestrea el CSS real — body siempre con background explícito;
overlays ocultos con `display:none`, no `opacity:0`).

**Tokens** (Tailwind v4 `@theme` en `globals.css` — genera utilidades):
```css
@theme {
  --shadow-glass: 0 10px 30px rgb(107 74 51 / 0.20);  /* shadow-glass */
  --blur-glass: 12px;                                  /* backdrop-blur-glass */
  --radius-hero: 1.5rem;                               /* rounded-hero */
}
@custom-variant standalone (@media (display-mode: standalone));
```
OJO: `slate`/`white` ya están remapeados a la rampa Muro (globals.css:14-28) —
los JSX existentes con `bg-white`/`text-slate-*` pintan crema/tinta; no
duplicar ese remap. `--chart-1..5` existen sin uso: úsalos en gráficas.

**Safe areas**: requiere `viewportFit: 'cover'` en el `viewport` export del
layout raíz (sin él, TODOS los `env(safe-area-inset-*)` valen 0 — hoy es el
caso). Tab bar flotante: `bottom: max(12px, env(safe-area-inset-bottom))`;
el scroll container compensa con padding-bottom. Targets ≥48px, 4–5 tabs.
Modelar `TabBarAdmin` sobre `src/components/nav/nav-asesor.tsx` (ya resuelve
PESTANAS/aria-current/safe-area).

**Gráfica de línea SVG** (sin librerías): Catmull-Rom → Bézier: para P1→P2 con
vecinos P0,P3: `B1 = P1+(P2−P0)/6`, `B2 = P2−(P3−P1)/6` (B2 RESTA; endpoints
duplicados; clamp de Y de controles al rango del segmento para no «inventar»
picos). Área: segundo path cerrado a baseline con linearGradient vertical
(trazo 25%→0). **IDs de gradiente con `useId()`** (duplicados rompen fills).
Responsive: `viewBox` + `preserveAspectRatio="none"` +
`vector-effect="non-scaling-stroke"`. A11y: si el valor está impreso al lado,
`aria-hidden` en el SVG; si no, `role="img"` + `<title>` con la CONCLUSIÓN.

## Common mistakes
- Blur en cada tarjeta → jank en Android medio. Solo tab bar + 1 hero.
- Confiar en `prefers-reduced-transparency` para iOS (no existe ahí).
- Gradiente de gráfica con id fijo montado dos veces → fill roto.
- Olvidar el par `hidden lg:block` en admin → escritorio redisenado por accidente.
- `theme-color` como única fuente del chrome (Safari 26 lo ignora).

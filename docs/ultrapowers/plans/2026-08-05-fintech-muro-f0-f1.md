# Fintech Muro — Fase 0 (kit) + Fase 1 (corazón admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ultrapowers:subagent-driven-development (recommended) or ultrapowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kit visual «Fintech Muro» (tokens + componentes glass/gráficas/tab bar) y su estreno en el corazón admin móvil: dashboard, bandeja y navegación — sin tocar escritorio.

**Architecture:** Tokens Tailwind v4 en `@theme` + componentes del kit en `src/components/fintech/` (NO en `ui/`, que es territorio del registry shadcn); vistas admin con par `lg:hidden` (nuevo) / `hidden lg:block` (actual); área asesor sin guards (no tiene desktop). Gráficas SVG a mano (función pura testeable). Datos nuevos del dashboard como consultas TDD previas a la vista.

**Tech Stack:** Next.js 16.2.12 (¡docs locales mandan!), Tailwind v4 CSS-first, Base UI + CVA, lucide-react, Vitest/jsdom + @testing-library.

**Skills:** CADA implementador invoca `fintech-muro-ui` (proyecto) ANTES de empezar; además `testing-tdd`, `tailwind-patterns`, `react-best-practices`; `dataviz` para decisiones de gráficas; `ui-typography` para textos visibles.

**Preferencias:** auto-commit ON, auto-push ON (cada push deploya a producción — el usuario trackea ahí).

**Referencias:** spec `docs/ultrapowers/specs/2026-08-05-mobile-first-fintech-muro-design.md`, research `docs/ultrapowers/research/2026-08-05-fintech-muro-research.md`, mockup canónico `design-propuestas/fintech-muro-aprobado.html` (teléfono derecho).

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/app/layout.tsx` (modificar) | `viewport` export con `viewportFit: 'cover'` |
| `src/app/globals.css` (modificar) | Tokens `@theme` del kit + variante `standalone` |
| `src/components/fintech/fondo-fintech.tsx` (crear) | Gradiente + orbes de fondo |
| `src/components/fintech/tarjeta-glass.tsx` (crear) | Tarjeta cristal (tinte por default; `conBlur` opcional) |
| `src/components/fintech/tarjeta-tinta.tsx` (crear) | Tarjeta oscura café con CTA píldora |
| `src/components/fintech/stat-card.tsx` (crear) | Cifra + etiqueta + tendencia |
| `src/lib/fintech/curva.ts` (crear) | Función pura Catmull-Rom→Bézier (`dLinea`, `dArea`) |
| `src/components/fintech/grafica-linea.tsx` (crear) | SVG que usa curva.ts, gradiente con `useId` |
| `src/lib/dashboard/consultas.ts` (crear) | `serieLeads30Dias`, `cierresGanadosMes`, `citasHoy` |
| `src/components/nav/tab-bar-admin.tsx` (crear) | Tab bar inferior glass + hoja «Más» |
| `src/app/(admin)/admin/layout.tsx` (modificar) | Montar TabBarAdmin (móvil); top bar móvil sin hamburguesa |
| `src/components/nav/nav-admin.tsx` (modificar) | `BarraMovilAdmin` pierde el Sheet (solo wordmark + campanita) |
| `src/app/(admin)/admin/page.tsx` (modificar) | Dashboard: par móvil nuevo / desktop intacto |
| `src/app/(admin)/admin/loading.tsx` (modificar) | Skeleton en lockstep |
| `src/app/(admin)/admin/bandeja/page.tsx` (modificar) | Bandeja: par móvil nuevo / desktop intacto |
| Tests | `src/test/fintech-curva.test.ts`, `src/test/fintech-componentes.test.tsx`, `src/test/dashboard-consultas.test.ts`, `src/test/tab-bar-admin.test.tsx` |

**Decisión cerrada (era el punto 0.5 del spec):** en móvil la hamburguesa
desaparece — `BarraMovilAdmin` queda como top bar mínima (wordmark + campanita)
y TODA la navegación vive en la TabBarAdmin + hoja «Más». En escritorio nada
cambia (sidebar `lg:flex` intacto).

---

### Task 1: Viewport + tokens del kit

**Files:** Modify: `src/app/layout.tsx`, `src/app/globals.css`

- [ ] **Step 1:** En `src/app/layout.tsx` agregar (junto al `metadata` existente):

```ts
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sin cover, TODOS los env(safe-area-inset-*) valen 0 en iPhone — la app ya
  // los usa (nav asesor, bottom sheets); esto los enciende de verdad.
  viewportFit: "cover",
};
```

- [ ] **Step 2:** En `globals.css`, después del `@theme inline` existente, agregar:

```css
/* ── Kit Fintech Muro (rediseño móvil) ─────────────────────────── */
@theme {
  --shadow-glass: 0 10px 30px rgb(107 74 51 / 0.2);
  --shadow-glass-sm: 0 4px 16px rgb(107 74 51 / 0.1);
  --blur-glass: 12px;
  --radius-hero: 1.5rem;
}
@custom-variant standalone (@media (display-mode: standalone));
```

(NO tocar el remap slate→Muro ni los `--chart-*`; ya existen y se usan tal cual.)

- [ ] **Step 3:** `npm run build` → OK. Verificar en el HTML generado (`.next` o curl local) que el meta viewport incluye `viewport-fit=cover`.
- [ ] **Step 4:** **Commit** `feat: viewport cover y tokens del kit fintech muro` y push.

### Task 2: Componentes base del kit (fondo, glass, tinta, stat)

**Files:** Create: `src/components/fintech/{fondo-fintech,tarjeta-glass,tarjeta-tinta,stat-card}.tsx` · Test: `src/test/fintech-componentes.test.tsx`

- [ ] **Step 1 (tests primero, jsdom):** casos: (a) `TarjetaGlass` por default NO tiene clase de backdrop-blur (presupuesto de blur: el cristal se finge con tinte) y con `conBlur` sí; (b) `StatCard` renderiza etiqueta en uppercase, valor, y tendencia con ▲/#65A30D o ▼/#A34E28 según signo; (c) `TarjetaTinta` renderiza el CTA como link cuando recibe `href`; (d) `FondoFintech` renderiza los orbes con `aria-hidden`. Correr → fallan.
- [ ] **Step 2:** Implementar. Guías duras (del skill @fintech-muro-ui):
  - `FondoFintech`: `<div className="relative min-h-dvh overflow-hidden" style={{background: 'linear-gradient(150deg,#F5F1E8 0%,#F3DCC2 32%,#EBBF9A 62%,#DFA987 100%)'}}>` + 2 orbes absolutos `aria-hidden` (radial ocre .38 / barro .22) + `<div className="relative">{children}</div>`.
  - `TarjetaGlass`: `rounded-2xl border border-white/80 bg-[#FAF7F1]/65 shadow-glass-sm` + variante `hero` (`rounded-hero shadow-glass p-4`) + prop `conBlur` → agrega `backdrop-blur-glass [-webkit-backdrop-filter:blur(12px)] isolate` (blur y radius en el MISMO elemento).
  - `TarjetaTinta`: `rounded-2xl bg-[#221B14]/90 text-[#F2EDE4]` etiquetas `text-[#C9B896]`, CTA `rounded-full bg-[#C98A3B] text-[#221B14]`.
  - `StatCard`: composición sobre TarjetaGlass; etiqueta `text-[11px] uppercase tracking-wide text-slate-500`.
  - Todos aceptan `className` vía `cn()` y usan CVA solo si hay ≥2 variantes reales (YAGNI).
- [ ] **Step 3:** `npm run test` → PASS; `npx tsc --noEmit` limpio. **Commit** `feat: componentes base del kit fintech muro` y push.

### Task 3: Curvas y GraficaLinea

**Files:** Create: `src/lib/fintech/curva.ts`, `src/components/fintech/grafica-linea.tsx` · Test: `src/test/fintech-curva.test.ts` (+ casos de render en `fintech-componentes.test.tsx`)

- [ ] **Step 1 (TDD de la función pura):** `dLinea(puntos: {x,y}[]): string` y `dArea(puntos, baseline): string`. Casos: 2 puntos → una curva `C`; los puntos de control siguen Catmull-Rom (`B1 = P1+(P2−P0)/6`, `B2 = P2−(P3−P1)/6` — ¡B2 resta!, endpoints duplicados); **clamp**: con puntos [0,10,0] ningún control Y sale de [0,10] (no inventa picos); `dArea` termina en `L xN baseline L x0 baseline Z`; 0–1 puntos → `''`. Correr → falla.
- [ ] **Step 2:** Implementar `curva.ts` (función pura, sin React). 
- [ ] **Step 3:** `GraficaLinea({ datos: number[], color?: string, alto?: number, etiquetaAccesible?: string })`: normaliza datos a viewBox 0-100×0-alto con padding, gradiente vertical del color (25%→0) con **id de `useId()`**, `<path>` área + `<path>` línea (`strokeWidth 2.5, strokeLinecap round, vector-effect="non-scaling-stroke"`), `preserveAspectRatio="none"`, y a11y: si recibe `etiquetaAccesible` → `role="img"` + `<title>`; si no → `aria-hidden`. Render tests: dos instancias montadas tienen ids de gradiente DISTINTOS; datos vacíos no revienta.
- [ ] **Step 4:** Suite completa + tsc. **Commit** `feat: grafica de linea svg con curvas catmull-rom` y push.

### Task 4: Datos nuevos del dashboard (TDD)

**Files:** Create: `src/lib/dashboard/consultas.ts` · Test: `src/test/dashboard-consultas.test.ts`

NO es visual: son las queries que el dashboard C2 necesita y hoy no existen.

- [ ] **Step 1:** Leer primero: `src/app/(admin)/admin/page.tsx` (queries actuales), `src/lib/leads/formato.ts` (NOTA_CIERRE), `src/app/(asesor)/asesor/page.tsx:56-63` (patrón de cierres a copiar), y el schema de `visitas` en `supabase/migrations/0001_schema.sql` (columnas reales: fecha/estado).
- [ ] **Step 2 (tests primero, mock chainable estilo `src/test/asesores-consultas.test.ts`):**
  - `serieLeads30Dias(supabase)`: trae `creado_en` de leads no archivados de los últimos 30 días y agrupa EN JS por día calendario de **America/Monterrey** → `number[]` de 30 posiciones (días sin leads = 0). Test: leads en frontera de medianoche UTC caen al día correcto de Monterrey (usar fechas fijas, sin `new Date()` sin argumentos en asserts).
  - `cierresGanadosMes(supabase)`: patrón del asesor (seguimientos `tipo='sistema'`, `nota=NOTA_CIERRE.cerrado_ganado`, desde inicio de mes, dedup por `lead_id`) — sin filtro de asesor (admin ve todo).
  - `citasHoy(supabase)`: visitas con `estado='agendada'` y fecha dentro del día actual de Monterrey.
- [ ] **Step 3:** Implementar (usa `@date-fns/tz` SOLO si ya está instalado — si no, `Intl.DateTimeFormat` con `timeZone: 'America/Monterrey'` para derivar el día calendario; NO instalar dependencias en esta task sin reportarlo).
- [ ] **Step 4:** Suite + tsc. **Commit** `feat: consultas del dashboard fintech (serie, cierres, citas)` y push.

### Task 5: TabBarAdmin + hoja «Más» + layout

**Files:** Create: `src/components/nav/tab-bar-admin.tsx` · Modify: `src/app/(admin)/admin/layout.tsx`, `src/components/nav/nav-admin.tsx` · Test: `src/test/tab-bar-admin.test.tsx`

- [ ] **Step 1:** Leer `src/components/nav/nav-asesor.tsx` COMPLETO — es el modelo (array `PESTANAS`, `esActiva`, `aria-current`, safe-area). 
- [ ] **Step 2 (tests primero):** (a) marca activa la pestaña según pathname (mock `usePathname`); (b) la hoja «Más» lista asesores/plantillas/sugerencias/ajustes/notificaciones; (c) el contenedor flotante usa `bottom` con `max(...)` de safe-area y el elemento con blur es el HIJO del wrapper fijo (wrapper transparente — patrón anti-jank iOS del skill).
- [ ] **Step 3:** Implementar: wrapper `fixed inset-x-0 bottom-0 z-40 lg:hidden` transparente con `pb-[max(0.75rem,env(safe-area-inset-bottom))]`; hijo: píldora centrada `mx-auto max-w-md rounded-full border border-white/80 bg-[#FAF7F1]/70 backdrop-blur-glass [-webkit-backdrop-filter:blur(12px)] isolate shadow-glass` con 5 items (Inicio `/admin` exacta, Bandeja, Leads, Propiedades, Más) — targets `min-h-12`, iconos lucide, etiqueta 10-11px. «Más» abre `Sheet side="bottom"` (componente ui existente) con los demás destinos + `PieSesion` si aplica.
- [ ] **Step 4:** En `admin/layout.tsx`: montar `<TabBarAdmin />`; `<main>` móvil gana `pb-28` (deja pasar la píldora); desktop (`lg:*`) INTACTO. En `nav-admin.tsx`: `BarraMovilAdmin` pierde SheetTrigger/Sheet (queda wordmark + campanita); NO tocar `NavAdmin` (sidebar desktop).
- [ ] **Step 5:** Suite + tsc + build; revisar en DevTools móvil que bandeja/leads/props navegan y el escritorio (≥1024px) se ve idéntico. **Commit** `feat: tab bar inferior glass del admin` y push.

### Task 6: Dashboard móvil Fintech Muro

**Files:** Modify: `src/app/(admin)/admin/page.tsx`, `src/app/(admin)/admin/loading.tsx`

- [ ] **Step 1:** Leer el mockup canónico `design-propuestas/fintech-muro-aprobado.html` (teléfono derecho) — es la referencia visual literal.
- [ ] **Step 2:** Reestructurar la página como par: `<div className="lg:hidden">` (nuevo, envuelto en `FondoFintech`) + `<div className="hidden lg:block">` (el JSX ACTUAL, sin cambios). Móvil: héroe `TarjetaGlass variante hero` con `GraficaLinea` de `serieLeads30Dias` + cifra del mes; fila de `StatCard` (Sin atender >24h con #A34E28, Citas hoy, Asesores activos); `TarjetaTinta` con `cierresGanadosMes` y CTA a `/admin/leads`; **pipeline de cápsulas por etapa** (barra horizontal segmentada en TarjetaGlass: un segmento redondeado por etapa activa con ancho proporcional al conteo y color de `--chart-1..4`, leyenda compacta debajo — los datos salen GRATIS de la query de leads con `etapa` que la página ya hace en la línea ~69, agrupar en JS); sección «Sin atender» reutilizando la lista actual pero en TarjetaGlass compactas. (Chip flotante de GraficaLinea: NO — la cifra vive en el header de la tarjeta, como en el mockup canónico.) ⚠️ Los `data-testid` (`kpi-bandeja`, `kpi-propiedades`) se quedan SOLO en la variante desktop (los tests actuales esperan unicidad — verificar con grep en src/test antes de decidir duplicarlos).
- [ ] **Step 3:** `loading.tsx` en lockstep: skeleton móvil nuevo (bloques glass) + skeleton desktop actual intacto (mismo par de guards).
- [ ] **Step 4:** Suite completa + tsc + build. Revisión visual móvil + desktop idéntico. **Commit** `feat: dashboard admin fintech muro en movil` y push. El usuario lo ve en su PWA.

### Task 7: Bandeja móvil

**Files:** Modify: `src/app/(admin)/admin/bandeja/page.tsx` (+ el componente de asignación que ya exista — leerlo primero: `src/components/leads/asignar-lead.tsx`)

- [ ] **Step 1:** Leer la página actual y `asignar-lead.tsx` (server action `asignarLead` ya probada — REUSAR, no duplicar).
- [ ] **Step 2:** Par móvil/desktop: móvil = `FondoFintech` + TarjetaGlass por lead (nombre, propiedad, `formatDistanceToNow` de espera — >24h en #A34E28 con font-semibold), tap en «Asignar» → `Sheet side="bottom"` con lista de asesores (foto/nombre, tap = asignar con el action existente + toast sonner ya configurado). Desktop intacto.
- [ ] **Step 3:** Si hay lógica nueva extraíble (ej. ordenar/urgencia), función pura con test; la UI se verifica con build + viewport.
- [ ] **Step 4:** Suite + tsc + build. **Commit** `feat: bandeja admin fintech muro en movil` y push.

### Task 8: Verificación integral y bitácora

- [ ] **Step 1:** `npm run test` (todas), `npm run test:rls` (integración, no debe verse afectada), `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 2:** Smoke en producción tras el último push: dashboard y bandeja en el teléfono (PWA) + escritorio intacto en la compu. Confirmar con el usuario en su PWA.
- [ ] **Step 3:** Nota en `docs/decisiones.md` (Fase 0+1 del rediseño desplegadas; decisiones: hamburguesa eliminada en móvil, pipeline de cápsulas incluido en dashboard, chip flotante descartado a favor de cifra en header). **Commit** y push.

---

## Después de este plan

Fases 2–4 (leads/detalle, catálogo/equipo, pulido asesor) → plan propio
`2026-08-06-fintech-muro-f2-f4.md` cuando este cierre. No adelantar vistas.

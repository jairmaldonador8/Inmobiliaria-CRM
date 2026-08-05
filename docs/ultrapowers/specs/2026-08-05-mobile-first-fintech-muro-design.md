# Mobile-first «Fintech Muro» — Diseño

> Spec aprobado en brainstorming (con visual companion) el 2026-08-05. Rediseño
> móvil de TODAS las vistas de Klo-Ser con estética fintech en la paleta Muro.
> Complementa `docs/VISION-PRODUCTO.md`. Corre en paralelo conceptual a la
> Fase B de guardias (specs separados; coordinar merges por archivo).

## Problema

El usuario (dueño/admin) ahora opera Klo-Ser como PWA instalada en su teléfono.
El lado admin es de escritorio (tablas apretadas, tap targets chicos, hamburguesa);
el lado asesor ya es de tarjetas pero le falta pulido. Se quiere una app
visualmente innovadora nivel fintech premium.

## Decisiones tomadas con el usuario (vía visual companion + terminal)

1. **Alcance: TODO en una sola pasada** — las ~14 vistas (admin + asesor).
2. **Escritorio intacto**: las vistas ≥`lg` no cambian; todo el trabajo vive
   bajo el breakpoint móvil. (El escritorio podrá adoptar el estilo en un
   proyecto futuro separado.)
3. **Dirección visual: «Fintech Muro» (C2)** — el usuario trajo 2 referencias
   fintech (panel héroe con gráfica + glassmorphism sobre gradiente difuso);
   se eligió la ejecución en paleta propia tras ver C1 (fría literal) vs C2
   lado a lado: gradiente hueso→durazno→ámbar con orbes de luz cálidos,
   tarjetas de cristal esmerilado, tarjeta oscura tinta café para el dato
   estrella, acento ocre #C98A3B, pulido fintech en todos los detalles.
   Mockup aprobado copiado a `design-propuestas/fintech-muro-aprobado.html`
   (referencia canónica; el original vive en `.ultrapowers/brainstorm/` sin
   versionar — los implementadores deben usar la copia).
4. **Navegación admin móvil: tab bar inferior glass flotante** — Inicio ·
   Bandeja · Leads · Propiedades · Más (hoja deslizante con asesores,
   plantillas, sugerencias, ajustes, notificaciones). Reemplaza a la
   hamburguesa `BarraMovilAdmin` SOLO en móvil.
5. **Enfoque de ejecución: sistema primero** (Enfoque 1) — kit de tokens y
   componentes en Fase 0, luego migración vista por vista con deploy
   individual (el usuario trackea el avance en su PWA de producción).

## Fase 0 — Kit «Fintech Muro»

### Tokens (CSS variables en `src/app/globals.css`)

- Fondo: gradiente `150deg` #F5F1E8 → #F3DCC2 (32%) → #EBBF9A (62%) → #DFA987
  + 2 orbes radiales (ocre rgba(201,138,59,.38) y barro rgba(163,78,40,.22)).
- Cristal: fondo rgba(250,247,241,0.62–0.68) + `backdrop-blur` 12px + borde
  rgba(255,255,255,0.8) 1px.
- Sombra cálida: `0 10px 30px rgba(107,74,51,0.20)` (tarjetas hero),
  `0 4px 16px rgba(107,74,51,0.10)` (tarjetas normales).
- Tarjeta tinta: rgba(34,27,20,0.88) + blur, texto #F2EDE4, etiquetas #C9B896.
- Radios: 24 (tarjeta hero) / 16 (tarjeta) / 14 (chips) / 999 (píldoras).
- Datos (paleta YA validada con dataviz, no cambiar): #65A30D verde,
  #0891B2 cian, #EA580C naranja, #6366F1 índigo; #A34E28 SOLO urgencia.
- Tendencias: ▲ #65A30D / ▼ #A34E28.

### Componentes (`src/components/ui/`, nuevos, sin tocar los existentes)

| Componente | Responsabilidad |
|---|---|
| `FondoFintech` | Wrapper de vista móvil: gradiente + orbes (posición estable, sin animación en v1) |
| `TarjetaGlass` | Tarjeta de cristal base (variantes: hero/normal/compacta) |
| `TarjetaTinta` | Tarjeta oscura café del dato estrella con CTA píldora ocre |
| `StatCard` | Cifra grande + etiqueta uppercase pequeña + tendencia opcional |
| `GraficaLinea` | SVG puro: línea suave (curvas C), relleno degradado al color del trazo, chip flotante opcional del último dato |
| `TabBarAdmin` | Barra inferior glass flotante (5 items, safe-area iOS) + hoja «Más» deslizante |

Reglas: cero librerías nuevas; SVG a mano; los componentes actuales de
escritorio NO se modifican.

## Fases 1–4 — Migración de vistas (orden de deploy)

**Fase 1 (corazón admin):**
0. **Datos nuevos del dashboard** (tarea propia, NO es solo visual): el
   dashboard actual solo trae conteos — faltan la serie de leads por día
   (30 días) para GraficaLinea y el agregado «cierres del mes» (de los
   seguimientos tipo sistema de cierre) para TarjetaTinta. Queries en
   `src/lib/` con TDD antes de la vista.
0.5. **Decisión de la hamburguesa** (tarea temprana, gatea el layout): si
   `BarraMovilAdmin` se elimina en móvil o se conserva para tablet angosta.
1. `/admin` dashboard = mockup C2: GraficaLinea héroe (leads 30 días),
   StatCards (sin atender/citas hoy/asesores), TarjetaTinta (cierres del mes),
   pipeline de cápsulas por etapa.
2. `/admin/bandeja`: tabla → TarjetaGlass por lead (nombre, propiedad, tiempo
   esperando con color de urgencia >24h #A34E28); asignar = tap → hoja con
   lista de asesores (reusa `asignarLead`).
3. `TabBarAdmin` reemplaza la hamburguesa en móvil (la hamburguesa/Sheet se
   conserva para escritorio angosto si aplica; decidir en implementación).

**Fase 2 (trabajo con leads):**
4. `/admin/leads`: lista con filtros como chips deslizables horizontales.
5. `/admin/leads/[id]` y `/asesor/leads/[id]`: timeline de seguimientos
   estilo fintech; acciones (WhatsApp, etapa, reasignar) como píldoras fijas
   al fondo alcanzables con el pulgar.

**Fase 3 (catálogo y equipo):**
6. Propiedades (admin y asesor): grid foto-primero, precio prominente,
   chips de recámaras/baños/m².
7. `/admin/asesores`: tarjetas por asesor con badge de push y stats.
8. Ajustes, plantillas, sugerencias, notificaciones: formularios y listas
   al nuevo estilo (inputs glass, botones píldora café).

**Fase 4 (pulido asesor):**
9. Cola del día, kanban y perfil: adoptar tokens (glass, tap targets ≥44px,
   jerarquía tipográfica, transiciones suaves ~200ms).

## Reglas transversales

- **Escritorio intocable**: todo bajo el breakpoint (patrón actual del repo:
  `hidden lg:block` para desktop / `lg:hidden` para móvil). Verificable en
  cada revisión de tarea.
- **Presupuesto de rendimiento**: `backdrop-blur` máx. en ~6 elementos
  simultáneos; en listas >20 ítems, tarjetas sólidas #FAF7F1 con la misma
  geometría (sin blur). Orbes con `transform: translateZ(0)` si hay jank.
- **Accesibilidad**: contraste AA verificado por componente (texto secundario
  #8E7F68 sobre cristal es el riesgo); tap targets ≥44×44px; foco visible.
- **Tipografía**: la actual de la app (no introducir fuentes nuevas en este
  proyecto); etiquetas uppercase con tracking para jerarquía fintech.
- **Safe areas iOS**: TabBar y píldoras de acción respetan
  `env(safe-area-inset-bottom)` (la PWA corre standalone).

## Pruebas

- Lógica nueva (hoja «Más», filtros por chips, decisiones de qué banner/lista)
  → TDD unitario como en Fase A.
- Componentes del kit → tests de render básicos (jsdom, @testing-library ya
  instalado): variantes, contraste de clases, safe-area presente.
- Visual → `npm run build` + revisión en viewport móvil (DevTools) por tarea;
  el usuario valida en su PWA tras cada deploy.
- Los tests existentes (82) no deben romperse; el escritorio no cambia.

## Fuera de alcance (YAGNI)

- Rediseño del escritorio (proyecto futuro).
- Modo oscuro del nuevo estilo (el toggle noche del mockup Muro queda para
  después del rediseño móvil).
- Animaciones del wordmark «El acuerdo» dentro de la app (ya existen en
  login; no expandir en este proyecto).
- Librerías de gráficas/animación.

## Dependencias y coordinación

- Independiente de la Fase B de guardias en datos; toca las mismas vistas que
  B tocará (cola, bandeja) → si B entra primero en una vista, el rediseño la
  migra después con el layout nuevo (orden de fases lo permite).
- El mockup HTML aprobado (`fintech-ejecucion.html`, opción C2) es la
  referencia visual canónica para el implementador del kit.

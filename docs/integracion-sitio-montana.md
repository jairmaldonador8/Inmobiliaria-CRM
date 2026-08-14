# Integración: leads del sitio oficial de Montana → CRM Klo-Ser

Este documento es el contrato para el sitio oficial de Montana (repo aparte).
Con esto, cada formulario enviado por un visitante se convierte en un lead del
CRM **al instante**: se deduplica, se asigna al asesor de guardia y dispara la
notificación push — todo del lado del CRM, el sitio solo hace un POST.

## Endpoint

```
POST https://www.klo-ser.com/api/leads/captura
Authorization: Bearer <LEADS_CAPTURA_SECRET>
Content-Type: application/json
```

En desarrollo: `http://localhost:3000/api/leads/captura` (el secreto de DEV se
comparte por canal seguro, nunca por chat/commit).

**⚠️ Server-to-server únicamente.** El formulario del sitio postea al backend
del propio sitio (route handler / server action), y ese backend llama al CRM.
El secreto **jamás** debe llegar al navegador del visitante: nada de llamar
este endpoint con `fetch` desde el cliente ni de exponer el token en variables
`NEXT_PUBLIC_*`.

## Payload

```json
{
  "solicitud_id": "8f14e45f-ceea-4e6f-b7fe-6f2c0e7c1a11",
  "nombre": "Ana López",
  "telefono": "81 1234 5678",
  "email": "ana@ejemplo.com",
  "mensaje": "Me interesa agendar una visita",
  "propiedad_easybroker_id": "EB-C1234",
  "pagina": "/propiedades/EB-C1234"
}
```

| Campo | Requerido | Notas |
|---|---|---|
| `solicitud_id` | **Sí** | Id único **por envío del formulario** (`crypto.randomUUID()` generado en el backend del sitio). Es la llave de idempotencia: reintentar con el mismo id nunca duplica el lead. Máx 120 chars. |
| `nombre` | **Sí** | Máx 200 chars. |
| `telefono` | Uno de los dos | Cualquier formato; el CRM lo normaliza a `52XXXXXXXXXX`. |
| `email` | Uno de los dos | El CRM lo pasa a minúsculas. Sin teléfono **ni** email el envío se rechaza (400): un lead incontactable no sirve — validen esto en el formulario. |
| `mensaje` | No | Máx 5000 chars. |
| `propiedad_easybroker_id` | No | `public_id` de EasyBroker si el formulario está en la ficha de una propiedad. Con esto el asesor recibe el lead ya ligado a la propiedad. |
| `pagina` | No | Ruta o nombre del formulario de origen (p. ej. `/contacto`). Aparece en el CRM como detalle de la fuente. |

## Respuestas

| Status | Body | Significado |
|---|---|---|
| `201` | `{"ok":true,"resultado":"nuevo"}` | Lead creado y asignado; el asesor ya fue notificado. |
| `200` | `{"ok":true,"resultado":"reingreso"}` | Ese teléfono/email ya era un lead vivo: quedó registrado como nueva consulta del mismo lead (también notifica). |
| `200` | `{"ok":true,"resultado":"duplicado"}` | Ese `solicitud_id` ya se había procesado (reintento): no se hizo nada. |
| `400` | `{"ok":false,"error":"..."}` | Payload inválido; el error dice qué faltó. No reintentar sin corregir. |
| `401` | — | Falta o está mal el Bearer. |
| `500` | `{"ok":false,"error":"error interno"}` | Fallo del CRM. **Reintentar es seguro** (misma `solicitud_id`). |

Política de reintentos sugerida: timeout de 10 s y 1–2 reintentos con el mismo
`solicitud_id` ante `500` o error de red. Ante `4xx`, no reintentar.

## Ejemplo (Next.js, route handler del sitio)

```ts
// app/api/contacto/route.ts — en el repo del SITIO, no en el CRM
import { randomUUID } from 'node:crypto'

export async function POST(request: Request) {
  const form = await request.json() // lo que llenó el visitante, ya validado

  const respuesta = await fetch('https://www.klo-ser.com/api/leads/captura', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.KLOSER_LEADS_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      solicitud_id: randomUUID(),
      nombre: form.nombre,
      telefono: form.telefono,
      email: form.email,
      mensaje: form.mensaje,
      propiedad_easybroker_id: form.propiedadId ?? null,
      pagina: form.origen ?? '/contacto',
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!respuesta.ok && respuesta.status >= 500) {
    // reintento único con la MISMA solicitud_id sería seguro; como mínimo,
    // loguear para no perder el lead en silencio
    console.error('[kloser] captura fallo', respuesta.status, await respuesta.text())
  }

  return Response.json({ ok: true }) // el visitante ve éxito según su propio flujo
}
```

## Recomendaciones al sitio

- **Anti-spam es responsabilidad del sitio** (honeypot, rate limit por IP,
  turnstile/captcha si hace falta): el CRM confía en lo que llega con el
  secreto y notifica a un humano por cada lead.
- Generen la `solicitud_id` **en el backend del sitio**, no en el navegador.
- Si el formulario vive en la ficha de una propiedad, manden siempre
  `propiedad_easybroker_id` — cambia mucho la calidad del primer contacto.
- No bloqueen la UX del visitante esperando al CRM: registren el envío y
  muestren éxito; el POST al CRM puede correr después de responderle.

## Prueba de humo (con el secreto de DEV)

```bash
curl -s -X POST http://localhost:3000/api/leads/captura \
  -H "Authorization: Bearer $LEADS_CAPTURA_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"solicitud_id":"prueba-1","nombre":"Prueba Sitio","telefono":"8100000000","pagina":"/contacto"}'
# → 201 {"ok":true,"resultado":"nuevo"} la primera vez
# → 200 {"ok":true,"resultado":"duplicado"} si se repite la misma solicitud_id
```

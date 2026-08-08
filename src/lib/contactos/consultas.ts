/**
 * Regla de la lista «Sin respuesta» de la cola del día.
 *
 * Función PURA: recibe los leads que la página ya consultó y los contactos
 * de esos leads, y decide cuáles se listan. Sin I/O, para poder probar la
 * sutileza sin Supabase — mismo criterio que `avance-etapa.ts`.
 *
 * LA REGLA: un lead se lista si su contacto MÁS RECIENTE está sin
 * respuesta. NO «si tiene algún contacto sin respuesta» — con esa lectura
 * un «no me contestó» de la semana pasada mantendría al lead en la lista
 * para siempre, aunque después haya contestado.
 */

import { esSinRespuesta } from '@/lib/contactos/formato'

type LeadMinimo = { id: string; clasificacion_eb: string | null }
type ContactoMinimo = { lead_id: string; resultado: string; creado_en: string }

export function leadsSinRespuesta<T extends LeadMinimo>(
  leads: T[],
  contactos: ContactoMinimo[]
): T[] {
  // Contacto más reciente por lead. Mismo patrón que `ultimoSeguimiento` en
  // la cola del día: recorrer una sola vez quedándose con el mayor.
  const masReciente = new Map<string, ContactoMinimo>()
  for (const contacto of contactos) {
    const previo = masReciente.get(contacto.lead_id)
    if (!previo || new Date(contacto.creado_en) > new Date(previo.creado_en)) {
      masReciente.set(contacto.lead_id, contacto)
    }
  }

  return leads.filter((lead) => {
    // `clasificacion_eb == null` SÍ se incluye: no se penaliza al lead por
    // falta de dato. Es el MISMO criterio de las otras dos colas, y la razón
    // por la que este filtro vive en JS y no en SQL (allá el NULL lo
    // descartaría).
    if (lead.clasificacion_eb === 'saliente') return false

    const contacto = masReciente.get(lead.id)
    return contacto ? esSinRespuesta(contacto.resultado) : false
  })
}

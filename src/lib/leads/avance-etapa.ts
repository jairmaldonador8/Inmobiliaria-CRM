/**
 * Regla del avance AUTOMÁTICO de etapa por eventos de visita: agendar una
 * visita empuja el lead a «Cita agendada» y marcarla como realizada lo
 * empuja a «Visitó».
 *
 * Función PURA y sin I/O (igual que `dashboard/pipeline.ts`), porque toda la
 * sutileza del cambio vive aquí y conviene poder probarla sin Supabase.
 *
 * La regla en una frase: **el avance solo empuja hacia adelante, nunca hacia
 * atrás, y nunca toca un lead que ya salió del tablero.**
 *
 * De ahí salen los tres casos que importan:
 *
 * 1. Un lead en «Negociación» al que le agendas otra visita NO regresa a
 *    «Cita agendada». Agendar una visita tardía es normal; perder el avance
 *    del pipeline por eso no lo es.
 * 2. Un lead CERRADO (ganado o perdido) es intocable: no revive por agendar
 *    una visita. Revivir un lead perdido existe, pero es una decisión
 *    explícita del asesor (`reactivarLead`), no un efecto colateral.
 * 3. Una etapa fuera del tablero (`apartado`, fusionada en la migración 0012,
 *    o cualquier valor futuro que no conozcamos) también se deja intacta:
 *    ante la duda, no movemos nada.
 */

import { ETAPAS_KANBAN, type EtapaKanban } from '@/lib/leads/formato'

/**
 * Devuelve la etapa a la que debe moverse el lead, o `null` si no hay que
 * moverlo. `null` es la respuesta correcta —y la más común— en:
 * lead ya en la etapa destino, lead más adelante en el pipeline, lead
 * cerrado, y etapa desconocida.
 */
export function etapaTrasEvento(etapaActual: string, destino: EtapaKanban): EtapaKanban | null {
  const indiceActual = (ETAPAS_KANBAN as readonly string[]).indexOf(etapaActual)

  // -1: la etapa actual no es una columna del tablero (cerrado_ganado,
  // cerrado_perdido, apartado, o algo que todavía no existe). Intocable.
  if (indiceActual === -1) return null

  const indiceDestino = (ETAPAS_KANBAN as readonly string[]).indexOf(destino)
  if (indiceDestino === -1) return null

  // Solo hacia adelante: igual o más avanzado se queda como está.
  return indiceActual < indiceDestino ? destino : null
}

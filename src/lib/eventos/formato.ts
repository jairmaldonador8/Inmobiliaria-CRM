/**
 * Vocabulario de presentación de la historia del lead (lead_eventos):
 * etiqueta en español + icono por tipo de evento.
 *
 * Sin 'server-only': mismo criterio que `leads/formato.ts` — hoy solo lo
 * consumen Server Components, pero el vocabulario no tiene secretos.
 *
 * Fallbacks deliberados (nunca "undefined" en la UI):
 * - `lead_reasignado` con `payload.a === null` es una devolución a la
 *   bandeja (reasignar a nadie), no un nombre que faltó.
 * - Nombres sin resolver (la RLS del asesor solo le deja leer SU fila de
 *   `usuarios`) caen a un texto genérico.
 * - El marcador de backfill viaja como STRING 'true' en el payload
 *   (`payload.backfill === 'true'`) — aquí simplemente se ignora.
 */
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  ArrowRightLeft,
  Bell,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  FileText,
  Hand,
  MessageCircle,
  MessageCircleReply,
  NotebookPen,
  Siren,
  Sparkles,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react'

import { etiquetaEtapa, etiquetaFuenteConDetalle } from '@/lib/leads/formato'
import { etiquetaTipoSeguimiento } from '@/lib/seguimientos/formato'
import { etiquetaResultado } from '@/lib/contactos/formato'

export type PayloadEvento = Record<string, unknown>

/** Mapa uuid → nombre para resolver actor_id y payload.a/de. */
export type NombresPorId = ReadonlyMap<string, string>

function comoTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length > 0 ? valor : null
}

/**
 * Etiqueta en español del evento. Tolerante a payloads incompletos y a
 * tipos desconocidos (devuelve el propio tipo, patrón `etiquetaEtapa`).
 */
export function etiquetaEvento(tipo: string, payload: PayloadEvento, nombres: NombresPorId): string {
  switch (tipo) {
    case 'lead_creado': {
      const fuente = comoTexto(payload.fuente)
      if (!fuente) return 'Se creó el lead'
      return `Llegó desde ${etiquetaFuenteConDetalle(fuente, comoTexto(payload.fuente_detalle))}`
    }
    case 'lead_asignado': {
      const destino = comoTexto(payload.a)
      const nombre = destino ? nombres.get(destino) : undefined
      return nombre ? `Se asignó a ${nombre}` : 'Se asignó a un asesor'
    }
    case 'lead_reasignado': {
      const destino = comoTexto(payload.a)
      // a === null → reasignación a la bandeja (quitarle el lead al asesor).
      if (!destino) return 'Se devolvió a la bandeja'
      const nombre = nombres.get(destino)
      return nombre ? `Se reasignó a ${nombre}` : 'Se reasignó a otro asesor'
    }
    case 'etapa_cambiada': {
      const etapa = comoTexto(payload.a)
      return etapa ? `Pasó a ${etiquetaEtapa(etapa)}` : 'Cambió de etapa'
    }
    case 'lead_archivado':
      return 'Se archivó el lead'
    case 'lead_desarchivado':
      return 'Se reactivó el lead'
    case 'seguimiento_registrado': {
      const tipoSeguimiento = comoTexto(payload.tipo)
      return tipoSeguimiento
        ? `Seguimiento registrado: ${etiquetaTipoSeguimiento(tipoSeguimiento)}`
        : 'Seguimiento registrado'
    }
    case 'whatsapp_enviado':
      return 'Se le envió WhatsApp'
    case 'whatsapp_desenlace': {
      const desenlace = comoTexto(payload.desenlace)
      return desenlace
        ? `WhatsApp: ${etiquetaResultado(desenlace)}`
        : 'Se registró el desenlace del WhatsApp'
    }
    case 'visita_agendada':
      return payload.reagendada ? 'Visita reagendada' : 'Visita agendada'
    case 'visita_realizada':
      return 'Visita realizada'
    case 'visita_cancelada':
      return 'Visita cancelada'
    case 'tomado_de_bandeja':
      return 'Tomó el lead de la bandeja'
    // Tipos de supervisión: solo el admin los recibe (la RLS de lead_eventos
    // los filtra para el asesor — la UI no necesita filtrar nada).
    case 'escalamiento_paso': {
      const paso = comoTexto(payload.paso)
      return paso ? `Escalamiento: ${paso}` : 'Escalamiento'
    }
    case 'push_recordatorio':
      return 'Recordatorio enviado'
    default:
      return tipo
  }
}

/** Icono por tipo (mapa como ICONOS_TIPO de timeline-seguimientos). */
export const ICONOS_EVENTO: Record<string, LucideIcon> = {
  lead_creado: Sparkles,
  lead_asignado: UserRoundPlus,
  lead_reasignado: ArrowRightLeft,
  etapa_cambiada: ArrowRight,
  lead_archivado: Archive,
  lead_desarchivado: ArchiveRestore,
  seguimiento_registrado: NotebookPen,
  whatsapp_enviado: MessageCircle,
  whatsapp_desenlace: MessageCircleReply,
  visita_agendada: CalendarPlus,
  visita_realizada: CalendarCheck,
  visita_cancelada: CalendarX,
  tomado_de_bandeja: Hand,
  escalamiento_paso: Siren,
  push_recordatorio: Bell,
}

/** Icono del tipo, con fallback (patrón del timeline de seguimientos). */
export function iconoEvento(tipo: string): LucideIcon {
  return ICONOS_EVENTO[tipo] ?? FileText
}

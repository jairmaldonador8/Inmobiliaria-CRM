// @vitest-environment node
/**
 * Tests de la regla del avance automático de etapa por eventos de visita
 * (src/lib/leads/avance-etapa.ts). Función pura, sin I/O.
 *
 * El valor de estos tests está en los NO: la parte fácil es que un lead
 * nuevo avance; la que rompe datos reales es que un lead cerrado reviva
 * solo, o que uno en «Negociación» retroceda porque le agendaron otra
 * visita.
 */
import { describe, expect, it } from 'vitest'

import { etapaTrasEvento } from '@/lib/leads/avance-etapa'

describe('etapaTrasEvento — avanza', () => {
  it('un lead «nuevo» al que le agendan visita pasa a «cita_agendada»', () => {
    expect(etapaTrasEvento('nuevo', 'cita_agendada')).toBe('cita_agendada')
  })

  it('un lead «contactado» al que le agendan visita pasa a «cita_agendada»', () => {
    expect(etapaTrasEvento('contactado', 'cita_agendada')).toBe('cita_agendada')
  })

  it('un lead «cita_agendada» cuya visita se marca realizada pasa a «visita_realizada»', () => {
    expect(etapaTrasEvento('cita_agendada', 'visita_realizada')).toBe('visita_realizada')
  })

  it('salta etapas si hace falta: de «nuevo» directo a «visita_realizada»', () => {
    // Pasa cuando el asesor captura la visita ya hecha sin haber tocado el
    // tablero: no lo obligamos a pasar por las etapas intermedias.
    expect(etapaTrasEvento('nuevo', 'visita_realizada')).toBe('visita_realizada')
  })
})

describe('etapaTrasEvento — NO retrocede', () => {
  it('un lead en «negociacion» al que le agendan otra visita NO regresa a «cita_agendada»', () => {
    expect(etapaTrasEvento('negociacion', 'cita_agendada')).toBeNull()
  })

  it('un lead en «visita_realizada» al que le agendan otra visita NO regresa', () => {
    expect(etapaTrasEvento('visita_realizada', 'cita_agendada')).toBeNull()
  })

  it('un lead ya en la etapa destino se queda igual (no reescribe ni registra nada)', () => {
    expect(etapaTrasEvento('cita_agendada', 'cita_agendada')).toBeNull()
    expect(etapaTrasEvento('visita_realizada', 'visita_realizada')).toBeNull()
  })
})

describe('etapaTrasEvento — no toca lo que salió del tablero', () => {
  it('un lead «cerrado_perdido» NO revive por agendarle una visita', () => {
    expect(etapaTrasEvento('cerrado_perdido', 'cita_agendada')).toBeNull()
    expect(etapaTrasEvento('cerrado_perdido', 'visita_realizada')).toBeNull()
  })

  it('un lead «cerrado_ganado» tampoco se mueve', () => {
    expect(etapaTrasEvento('cerrado_ganado', 'cita_agendada')).toBeNull()
    expect(etapaTrasEvento('cerrado_ganado', 'visita_realizada')).toBeNull()
  })

  it('«apartado» (fusionado en la migración 0012) se deja intacto', () => {
    expect(etapaTrasEvento('apartado', 'cita_agendada')).toBeNull()
  })

  it('una etapa desconocida no mueve nada — ante la duda, no tocar', () => {
    expect(etapaTrasEvento('etapa_que_no_existe', 'cita_agendada')).toBeNull()
    expect(etapaTrasEvento('', 'cita_agendada')).toBeNull()
  })
})

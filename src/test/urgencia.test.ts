// @vitest-environment node
/**
 * Tests TDD para src/lib/leads/urgencia.ts (Task FM7, follow-up de review):
 * `esUrgente` es la versión binaria (móvil) de la urgencia de espera de la
 * bandeja. Su frontera debe coincidir con la del escritorio
 * (`urgencia()` en src/app/(admin)/admin/bandeja/page.tsx), que usa
 * `horas < 24` para el tramo ámbar y cae a rojo en `horas === 24` — o sea,
 * urgente cuando `horas >= 24`. Función pura, sin I/O: acepta `ahora` para
 * pruebas deterministas.
 */
import { describe, expect, it } from 'vitest'

import { esUrgente, HORA_MS } from '@/lib/leads/urgencia'

describe('esUrgente', () => {
  const ahora = new Date('2026-08-05T12:00:00.000Z').getTime()

  it('justo antes de 24h → false', () => {
    const creadoEn = new Date(ahora - (24 * HORA_MS - 1)).toISOString()
    expect(esUrgente(creadoEn, ahora)).toBe(false)
  })

  it('exactamente a las 24h → true (frontera inclusiva, igual que el desktop)', () => {
    const creadoEn = new Date(ahora - 24 * HORA_MS).toISOString()
    expect(esUrgente(creadoEn, ahora)).toBe(true)
  })

  it('justo después de 24h → true', () => {
    const creadoEn = new Date(ahora - (24 * HORA_MS + 1)).toISOString()
    expect(esUrgente(creadoEn, ahora)).toBe(true)
  })
})

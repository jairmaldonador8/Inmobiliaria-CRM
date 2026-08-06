/**
 * Tests TDD para el cliente OAuth de Google Calendar (Task 6):
 * `src/lib/google/oauth.ts` y `src/lib/google/estado.ts`.
 *
 * `fetch` se inyecta como parámetro (`fetchFn`, mockeado con `vi.fn()`): estos
 * tests no tocan la red ni dependen de variables de entorno reales — toda la
 * configuración (client_id/secret/redirect_uri, secreto del HMAC) se inyecta
 * explícitamente.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  ErrorGrantInvalido,
  intercambiarCodigo,
  refrescarAccessToken,
  revocarToken,
  urlAutorizacion,
} from '@/lib/google/oauth'
import { crearState, validarState } from '@/lib/google/estado'

const CONFIG = {
  clientId: 'cliente-123.apps.googleusercontent.com',
  clientSecret: 'secreto-cliente-de-prueba',
  redirectUri: 'https://www.klo-ser.com/api/google/oauth/callback',
}

// JWT de prueba: header.payload.signature, payload = { email: 'asesor@gmail.com' }
// codificado en base64url (la firma no se verifica, ver JSDoc de intercambiarCodigo).
function idTokenConEmail(email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ email, sub: '123' })).toString('base64url')
  return `${header}.${payload}.firma-no-verificada`
}

function respuestaOk(cuerpo: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => cuerpo,
    text: async () => JSON.stringify(cuerpo),
  } as Response
}

function respuestaError(status: number, cuerpo: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => cuerpo,
    text: async () => JSON.stringify(cuerpo),
  } as Response
}

describe('urlAutorizacion', () => {
  it('incluye endpoint, access_type=offline, prompt=consent, scopes, redirect_uri, client_id y state', () => {
    const url = new URL(urlAutorizacion('estado-xyz', CONFIG))

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('access_type')).toBe('offline')
    // Crítico: sin prompt=consent, Google no reenvía refresh_token en reconexiones.
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('client_id')).toBe(CONFIG.clientId)
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri)
    expect(url.searchParams.get('state')).toBe('estado-xyz')

    const scopes = (url.searchParams.get('scope') ?? '').split(' ')
    expect(scopes).toContain('https://www.googleapis.com/auth/calendar.events.owned')
    expect(scopes).toContain('https://www.googleapis.com/auth/calendar.freebusy')
  })
})

describe('intercambiarCodigo', () => {
  it('hace POST a https://oauth2.googleapis.com/token y devuelve refreshToken + email', async () => {
    const idToken = idTokenConEmail('asesor@gmail.com')
    const fetchFn = vi.fn().mockResolvedValue(
      respuestaOk({ refresh_token: 'refresh-abc', access_token: 'access-abc', id_token: idToken })
    )

    const resultado = await intercambiarCodigo('codigo-de-autorizacion', fetchFn, CONFIG)

    expect(resultado).toEqual({ refreshToken: 'refresh-abc', email: 'asesor@gmail.com' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(init.method).toBe('POST')
    const cuerpo = new URLSearchParams(init.body as string)
    expect(cuerpo.get('code')).toBe('codigo-de-autorizacion')
    expect(cuerpo.get('client_id')).toBe(CONFIG.clientId)
    expect(cuerpo.get('client_secret')).toBe(CONFIG.clientSecret)
    expect(cuerpo.get('redirect_uri')).toBe(CONFIG.redirectUri)
    expect(cuerpo.get('grant_type')).toBe('authorization_code')
  })

  it('cubre el caso de respuesta sin refresh_token (reconexión: Google no lo reenvía)', async () => {
    const idToken = idTokenConEmail('asesor@gmail.com')
    const fetchFn = vi.fn().mockResolvedValue(
      respuestaOk({ access_token: 'access-abc', id_token: idToken })
    )

    const resultado = await intercambiarCodigo('codigo', fetchFn, CONFIG)

    expect(resultado.refreshToken).toBeUndefined()
    expect(resultado.email).toBe('asesor@gmail.com')
  })

  it('respuesta sin id_token lanza (no se puede obtener el email)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuestaOk({ access_token: 'access-abc' }))
    await expect(intercambiarCodigo('codigo', fetchFn, CONFIG)).rejects.toThrow(/id_token/)
  })

  it('respuesta de error de Google lanza', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuestaError(400, { error: 'invalid_grant' }))
    await expect(intercambiarCodigo('codigo-malo', fetchFn, CONFIG)).rejects.toThrow()
  })
})

describe('refrescarAccessToken', () => {
  it('devuelve el access_token en el camino feliz', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuestaOk({ access_token: 'access-nuevo' }))

    const token = await refrescarAccessToken('refresh-abc', fetchFn, CONFIG)

    expect(token).toBe('access-nuevo')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    const cuerpo = new URLSearchParams(init.body as string)
    expect(cuerpo.get('refresh_token')).toBe('refresh-abc')
    expect(cuerpo.get('grant_type')).toBe('refresh_token')
  })

  it('400 invalid_grant lanza ErrorGrantInvalido: estado terminal, no reintentar', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuestaError(400, { error: 'invalid_grant' }))

    await expect(refrescarAccessToken('refresh-revocado', fetchFn, CONFIG)).rejects.toBeInstanceOf(
      ErrorGrantInvalido
    )
  })

  it('5xx lanza un error genérico (transitorio: sí se puede reintentar), no ErrorGrantInvalido', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuestaError(500, { error: 'internal_error' }))

    await expect(refrescarAccessToken('refresh-abc', fetchFn, CONFIG)).rejects.not.toBeInstanceOf(
      ErrorGrantInvalido
    )
  })

  it('fallo de red (fetch rechaza) lanza un error genérico, no ErrorGrantInvalido', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNRESET'))

    await expect(refrescarAccessToken('refresh-abc', fetchFn, CONFIG)).rejects.not.toBeInstanceOf(
      ErrorGrantInvalido
    )
  })

  it('el error nunca incluye el refresh token ni el client_secret', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuestaError(500, { error: 'boom' }))
    try {
      await refrescarAccessToken('refresh-super-secreto', fetchFn, CONFIG)
      expect.unreachable()
    } catch (err) {
      const mensaje = String((err as Error).message)
      expect(mensaje).not.toContain('refresh-super-secreto')
      expect(mensaje).not.toContain(CONFIG.clientSecret)
    }
  })
})

describe('revocarToken', () => {
  it('200 es éxito', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuestaOk({}))
    await expect(revocarToken('token-vigente', fetchFn)).resolves.toBeUndefined()
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/revoke')
    expect(init.method).toBe('POST')
  })

  it('400 invalid_token también es éxito (idempotente: ya estaba revocado)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuestaError(400, { error: 'invalid_token' }))
    await expect(revocarToken('token-ya-revocado', fetchFn)).resolves.toBeUndefined()
  })

  it('otros errores sí lanzan', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuestaError(500, { error: 'server_error' }))
    await expect(revocarToken('token', fetchFn)).rejects.toThrow()
  })
})

describe('crearState / validarState', () => {
  const SECRETO = Buffer.alloc(32, 9).toString('base64')

  it('round-trip devuelve el userId', () => {
    const state = crearState('user-abc', SECRETO)
    expect(validarState(state, SECRETO)).toBe('user-abc')
  })

  it('state manipulado (firma alterada) falla', () => {
    const state = crearState('user-abc', SECRETO)
    const manipulado = state.slice(0, -1) + (state.endsWith('A') ? 'B' : 'A')
    expect(() => validarState(manipulado, SECRETO)).toThrow()
  })

  it('state manipulado (payload alterado, otro userId) falla', () => {
    const state = crearState('user-abc', SECRETO)
    const [, firma] = state.split('.')
    const payloadFalso = Buffer.from('user-OTRO.9999999999999').toString('base64url')
    expect(() => validarState(`${payloadFalso}.${firma}`, SECRETO)).toThrow()
  })

  it('state expirado (más de 10 minutos) falla', () => {
    const ahora = new Date('2026-01-01T00:00:00.000Z')
    const state = crearState('user-abc', SECRETO, ahora)
    const masTarde = new Date(ahora.getTime() + 11 * 60 * 1000)
    expect(() => validarState(state, SECRETO, masTarde)).toThrow(/expirad/i)
  })

  it('state justo antes de expirar (menos de 10 minutos) es válido', () => {
    const ahora = new Date('2026-01-01T00:00:00.000Z')
    const state = crearState('user-abc', SECRETO, ahora)
    const pocoDespues = new Date(ahora.getTime() + 9 * 60 * 1000)
    expect(validarState(state, SECRETO, pocoDespues)).toBe('user-abc')
  })

  it('state con formato inválido falla', () => {
    expect(() => validarState('esto-no-es-un-state-valido', SECRETO)).toThrow()
    expect(() => validarState('', SECRETO)).toThrow()
    expect(() => validarState('a.b.c', SECRETO)).toThrow()
  })

  it('secretos distintos para crear y validar fallan (subclave distinta)', () => {
    const state = crearState('user-abc', SECRETO)
    const otroSecreto = Buffer.alloc(32, 3).toString('base64')
    expect(() => validarState(state, otroSecreto)).toThrow()
  })
})

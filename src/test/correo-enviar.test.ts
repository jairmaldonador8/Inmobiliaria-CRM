// @vitest-environment node
/**
 * Tests TDD para enviarCorreo() — correo transaccional vía Resend REST
 * (src/lib/correo/enviar.ts). Mismo contrato que enviarPush: best-effort,
 * NUNCA lanza (el correo del paso 2h es un empujón, no la fuente de verdad).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { resendApiKeyMock } = vi.hoisted(() => ({
  resendApiKeyMock: vi.fn(() => 'clave-test'),
}))

vi.mock('@/lib/env-server', () => ({
  resendApiKey: resendApiKeyMock,
  correoRemitente: () => 'Klo-Ser CRM <onboarding@resend.dev>',
}))

import { enviarCorreo } from '@/lib/correo/enviar'

const DATOS = { para: 'dueno@klo-ser.com', asunto: 'Lead sin contestar', html: '<p>2 horas</p>' }

describe('enviarCorreo', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    resendApiKeyMock.mockReturnValue('clave-test')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('manda POST a Resend con Bearer y el payload correcto', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('{}') })

    const r = await enviarCorreo(DATOS)

    expect(r).toEqual({ enviado: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer clave-test' }),
      })
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body).toMatchObject({ to: [DATOS.para], subject: DATOS.asunto, html: DATOS.html })
    expect(body.from).toContain('resend.dev')
  })

  it('sin API key configurada → { enviado: false } sin lanzar', async () => {
    resendApiKeyMock.mockImplementation(() => {
      throw new Error('Falta la variable de entorno RESEND_API_KEY')
    })
    await expect(enviarCorreo(DATOS)).resolves.toEqual({ enviado: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Resend responde 4xx/5xx → { enviado: false } sin lanzar', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: () => Promise.resolve('bad') })
    await expect(enviarCorreo(DATOS)).resolves.toEqual({ enviado: false })
  })

  it('falla de red (fetch rechaza) → { enviado: false } sin lanzar', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))
    await expect(enviarCorreo(DATOS)).resolves.toEqual({ enviado: false })
  })
})

import 'server-only'

import { correoRemitente, resendApiKey } from '@/lib/env-server'

export interface DatosCorreo {
  para: string
  asunto: string
  html: string
}

/**
 * Envía un correo transaccional vía Resend (REST directo, sin SDK — un solo
 * endpoint no amerita dependencia). Mismo contrato que enviarPush:
 * best-effort, NUNCA lanza — el correo del escalamiento a 2h es un empujón;
 * la campanita y el push siguen siendo la fuente de verdad.
 *
 * Solo lo usa el paso `dueno_120` del motor de escalamiento (spec Fase B).
 */
export async function enviarCorreo({ para, asunto, html }: DatosCorreo): Promise<{ enviado: boolean }> {
  try {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: correoRemitente(),
        to: [para],
        subject: asunto,
        html,
      }),
    })

    if (!respuesta.ok) {
      console.error(`enviarCorreo: Resend respondió ${respuesta.status}`, await respuesta.text())
      return { enviado: false }
    }
    return { enviado: true }
  } catch (error) {
    // Falta de API key, red caída, etc.: nunca tumba al caller (el cron).
    console.error('enviarCorreo: fallo inesperado, se omite el envío', error)
    return { enviado: false }
  }
}

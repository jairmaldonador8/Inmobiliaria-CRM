'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { MailCheck } from 'lucide-react'

import { supabasePublishableKey, supabaseUrl } from '@/lib/env'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Cliente SOLO para el ciclo de recuperación, con flujo implícito: el enlace
 * del correo regresa con la sesión en el hash (#access_token), así que
 * funciona aunque el correo se abra en OTRO dispositivo o navegador — cosa
 * que el flujo PKCE del cliente normal no permite (exige el mismo browser).
 */
export function clienteRecuperacion() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { flowType: 'implicit' },
  })
}

/** Pide el correo de recuperación. Nunca revela si el correo existe o no. */
export function FormRecuperar() {
  const [correo, setCorreo] = useState('')
  const [estado, setEstado] = useState<'listo' | 'enviando' | 'enviado'>('listo')

  async function alEnviar(e: React.FormEvent) {
    e.preventDefault()
    const email = correo.trim().toLowerCase()
    if (!email) return
    setEstado('enviando')
    // Best-effort a propósito: la respuesta es idéntica exista o no la
    // cuenta, para no regalar la lista de correos del equipo.
    await clienteRecuperacion()
      .auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/restablecer`,
      })
      .catch(() => {})
    setEstado('enviado')
  }

  if (estado === 'enviado') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-10 place-content-center rounded-full bg-slate-900 text-white">
          <MailCheck className="size-5" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-slate-900">Revisa tu correo</p>
        <p className="text-xs leading-relaxed text-slate-500">
          Si {correo.trim().toLowerCase()} está registrado en Klo-Ser, en un momento le llegan
          las instrucciones para crear una contraseña nueva. Revisa también el spam.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={alEnviar} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="correo">Tu correo</Label>
        <Input
          id="correo"
          type="email"
          autoComplete="email"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          disabled={estado === 'enviando'}
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={estado === 'enviando'}>
        {estado === 'enviando' ? 'Enviando…' : 'Enviarme las instrucciones'}
      </Button>
    </form>
  )
}

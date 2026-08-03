'use client'

import { useActionState } from 'react'

import { iniciarSesion, type EstadoLogin } from '@/lib/auth/acciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function FormLogin() {
  const [estado, accion, pendiente] = useActionState<EstadoLogin, FormData>(
    iniciarSesion,
    null
  )

  return (
    <form action={accion} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="nombre@correo.com"
          className="h-11"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11"
        />
      </div>

      {estado?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pendiente}
        className="h-11 w-full bg-slate-900 text-slate-50 hover:bg-slate-800"
      >
        {pendiente ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}

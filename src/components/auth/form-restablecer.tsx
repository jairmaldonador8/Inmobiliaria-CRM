'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { clienteRecuperacion } from '@/components/auth/form-recuperar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Estado = 'verificando' | 'listo' | 'guardando' | 'invalido'

/**
 * Aterrizaje del enlace del correo de recuperación: el token viene en el
 * hash de la URL (flujo implícito) y el cliente lo convierte en sesión;
 * con ella se fija la contraseña nueva y se cierra la sesión temporal para
 * que entre por la puerta grande con su contraseña ya suya.
 */
export function FormRestablecer() {
  const router = useRouter()
  const supabase = useMemo(() => clienteRecuperacion(), [])
  const [estado, setEstado] = useState<Estado>('verificando')
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')

  useEffect(() => {
    let cancelado = false

    // detectSessionInUrl procesa el hash al crear el cliente; se le da un
    // respiro y se confirma. Sin sesión = enlace inválido o caducado.
    const revisar = async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelado) return
      if (data.session) setEstado('listo')
      else setEstado('invalido')
    }
    const t = window.setTimeout(revisar, 600)

    const { data: escucha } = supabase.auth.onAuthStateChange((evento) => {
      if (cancelado) return
      if (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN') setEstado('listo')
    })

    return () => {
      cancelado = true
      window.clearTimeout(t)
      escucha.subscription.unsubscribe()
    }
  }, [supabase])

  async function alGuardar(e: React.FormEvent) {
    e.preventDefault()
    if (pass1.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (pass1 !== pass2) {
      toast.error('Las contraseñas no coinciden.')
      return
    }
    setEstado('guardando')
    const { error } = await supabase.auth.updateUser({ password: pass1 })
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`)
      setEstado('listo')
      return
    }
    // Cerrar la sesión temporal de recuperación: que entre con la nueva.
    await supabase.auth.signOut().catch(() => {})
    toast.success('Contraseña actualizada — inicia sesión con la nueva')
    router.replace('/login')
  }

  if (estado === 'verificando') {
    return <p className="text-center text-sm text-slate-500">Verificando tu enlace…</p>
  }

  if (estado === 'invalido') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-semibold text-slate-900">Este enlace ya no sirve</p>
        <p className="text-xs leading-relaxed text-slate-500">
          Los enlaces de recuperación caducan pronto y solo se usan una vez.
        </p>
        <Button render={<Link href="/recuperar" />} variant="outline" size="sm">
          Pedir uno nuevo
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={alGuardar} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="pass1">Contraseña nueva</Label>
        <Input
          id="pass1"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={pass1}
          onChange={(e) => setPass1(e.target.value)}
          disabled={estado === 'guardando'}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pass2">Repítela</Label>
        <Input
          id="pass2"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={pass2}
          onChange={(e) => setPass2(e.target.value)}
          disabled={estado === 'guardando'}
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={estado === 'guardando'}>
        {estado === 'guardando' ? 'Guardando…' : 'Guardar mi contraseña'}
      </Button>
    </form>
  )
}

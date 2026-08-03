import { LogOut } from 'lucide-react'

import { cerrarSesion } from '@/lib/auth/acciones'
import { requireAsesor } from '@/lib/auth/usuario-actual'
import { Button } from '@/components/ui/button'

export default async function PaginaPerfil() {
  const usuario = await requireAsesor()

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Perfil
      </h1>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
          Nombre
        </p>
        <p className="mt-1 text-base font-medium text-slate-900">
          {usuario.nombre}
        </p>
      </div>

      <form action={cerrarSesion}>
        <Button type="submit" variant="outline" className="h-11 w-full">
          <LogOut aria-hidden />
          Salir
        </Button>
      </form>
    </section>
  )
}

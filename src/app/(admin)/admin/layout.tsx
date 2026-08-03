import { requireAdmin } from '@/lib/auth/usuario-actual'
import { BarraMovilAdmin, NavAdmin, PieSesion } from '@/components/nav/nav-admin'

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const usuario = await requireAdmin()

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-slate-50">
      {/* Sidebar de escritorio */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-slate-950 text-slate-100 lg:flex">
        <div className="flex items-center gap-3 px-6 pt-6 pb-4">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-semibold tracking-widest text-slate-50"
          >
            MR
          </span>
          <span className="text-sm font-semibold tracking-tight text-white">
            Montana Realty
          </span>
        </div>
        <NavAdmin />
        <PieSesion nombre={usuario.nombre} />
      </aside>

      {/* Barra superior móvil (con drawer) */}
      <BarraMovilAdmin nombre={usuario.nombre} />

      <main className="flex-1 px-4 py-6 lg:ml-60 lg:px-10 lg:py-8">
        {children}
      </main>
    </div>
  )
}

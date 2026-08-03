import { requireAsesor } from '@/lib/auth/usuario-actual'
import { NavAsesor } from '@/components/nav/nav-asesor'

export default async function AsesorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAsesor()

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-slate-50">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-center border-b border-slate-200 bg-white">
        <span className="text-sm font-semibold tracking-tight text-slate-900">
          Montana Realty
        </span>
      </header>

      {/* Columna angosta también en escritorio: los asesores trabajan desde el teléfono */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-6 pb-28">
        {children}
      </main>

      <NavAsesor />
    </div>
  )
}

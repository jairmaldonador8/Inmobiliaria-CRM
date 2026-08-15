import { FormRestablecer } from '@/components/auth/form-restablecer'
import { Wordmark } from '@/components/marca/wordmark'

export const metadata = {
  title: 'Nueva contraseña · Klo-Ser',
}

/** Aterrizaje del enlace del correo de recuperación: crea la nueva. */
export default function PaginaRestablecer() {
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-12">
      <main className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Wordmark aria-hidden className="text-[27px] text-slate-900" />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">
            Tu contraseña nueva
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
          <FormRestablecer />
        </div>
      </main>
    </div>
  )
}

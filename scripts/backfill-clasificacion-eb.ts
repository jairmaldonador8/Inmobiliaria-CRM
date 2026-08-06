// Backfill de leads.clasificacion_eb (migracion 0011) para leads creados
// ANTES de que el sync clasificara contact requests de EasyBroker.
//
// Por que no es un simple UPDATE: no existe GET /v1/contact_requests/{id}
// (ver skill easybroker-api / src/lib/easybroker/mapeo.ts), asi que la unica
// forma de recuperar el property_id / contact_id de un contact request ya
// insertado como lead es RE-PAGINAR todo /v1/contact_requests y hacer match
// por `id` (== leads.easybroker_id). Por eso este backfill es un script
// aparte y no un simple `alter table ... update`.
//
// Regla de clasificacion (identica a la del sync, ver
// src/lib/easybroker/mapeo.ts#clasificarContactRequest):
//   - el CR no trae property_id                        -> sin clasificar
//   - property_id AUSENTE del catalogo local             -> 'saliente'
//   - property_id presente + contacto sin contact_id     -> sin clasificar
//   - property_id presente + GET /v1/contacts falla      -> sin clasificar
//   - property_id presente + contacto con tag "agente"   -> 'co_broke'
//   - property_id presente + contacto sin tag "agente"   -> 'cliente_directo'
//
// Solo toca leads con easybroker_id NOT NULL (vienen de EasyBroker) y
// clasificacion_eb IS NULL (pendientes). Idempotente: correrlo de nuevo solo
// vuelve a intentar los que sigan sin clasificar (los que fallaron por un
// GET /v1/contacts intermitente, o los que no aparecieron en la paginacion
// de esta corrida por un corte anticipado).
//
// IMPORTANTE (entornos): usa las credenciales de Supabase y EasyBroker que
// esten configuradas en el proceso (via .env.local en desarrollo). NO se
// debe correr contra produccion sin que un humano lo decida explicitamente
// apuntando las variables al proyecto/API key reales — este script no hace
// esa verificacion por si mismo.
//
// Uso:
//   npx tsx scripts/backfill-clasificacion-eb.ts             # aplica los cambios
//   npx tsx scripts/backfill-clasificacion-eb.ts --dry-run    # solo reporta, no escribe

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { ebFetch, pausa, PAUSA_ENTRE_PAGINAS_MS, type PaginaEB } from '@/lib/easybroker/cliente';
import {
  clasificarContactRequest,
  type ClasificacionLeadEB,
  type ContactoEB,
  type ContactRequestEB,
} from '@/lib/easybroker/mapeo';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    'Faltan variables de entorno. Se requieren NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY (.env.local).'
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.argv.includes('--dry-run');
// Mismo orden de magnitud que PAUSA_ENTRE_DETALLES_MS en sync.ts: 1 request
// extra (GET /v1/contacts) por lead a clasificar, muy por debajo de 20 req/s.
const PAUSA_CONTACTO_MS = 75;

type Contador = ClasificacionLeadEB | 'sin_clasificar';

async function main(): Promise<void> {
  console.log(`Backfill de clasificacion_eb contra ${SUPABASE_URL}${DRY_RUN ? ' (DRY RUN, no se escribe nada)' : ''}\n`);

  // 1. Leads pendientes: vienen de EasyBroker y aun no tienen clasificacion.
  const { data: pendientes, error: pendientesError } = await admin
    .from('leads')
    .select('id, easybroker_id')
    .not('easybroker_id', 'is', null)
    .is('clasificacion_eb', null);
  if (pendientesError) throw new Error(`No se pudieron leer los leads pendientes: ${pendientesError.message}`);

  if (!pendientes || pendientes.length === 0) {
    console.log('No hay leads pendientes de clasificar. Nada que hacer.');
    return;
  }

  const pendientesPorEbId = new Map<string, string>(
    pendientes.map((l) => [l.easybroker_id as string, l.id as string])
  );
  console.log(`Leads pendientes de clasificar: ${pendientesPorEbId.size}`);

  // 2. Catalogo local de propiedades: solo hace falta saber PRESENCIA/AUSENCIA
  //    del easybroker_id (consulta local, sin llamadas extra a la API).
  const idsPropios = new Set<string>();
  const TAM_PAGINA = 1000;
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await admin
      .from('propiedades')
      .select('easybroker_id')
      .range(desde, desde + TAM_PAGINA - 1);
    if (error) throw new Error(`No se pudo leer el catalogo de propiedades: ${error.message}`);
    for (const fila of data ?? []) idsPropios.add(fila.easybroker_id as string);
    if (!data || data.length < TAM_PAGINA) break;
  }
  console.log(`Propiedades en catalogo local: ${idsPropios.size}\n`);

  // 3. Re-paginar TODO /v1/contact_requests y resolver cada match.
  const contadores: Record<Contador, number> = {
    cliente_directo: 0,
    co_broke: 0,
    saliente: 0,
    sin_clasificar: 0,
  };
  let procesados = 0;

  let pagina = await ebFetch<PaginaEB<ContactRequestEB>>('/v1/contact_requests', { limit: 50 });
  for (;;) {
    for (const cr of pagina.content) {
      const leadId = pendientesPorEbId.get(String(cr.id));
      if (!leadId) continue;

      let clasificacion: ClasificacionLeadEB | null = null;
      if (cr.property_id) {
        const propiedadEsNuestra = idsPropios.has(cr.property_id);
        if (!propiedadEsNuestra) {
          clasificacion = clasificarContactRequest(false, null); // 'saliente'
        } else if (cr.contact_id) {
          await pausa(PAUSA_CONTACTO_MS);
          try {
            const contacto = await ebFetch<ContactoEB>(`/v1/contacts/${cr.contact_id}`);
            clasificacion = clasificarContactRequest(true, contacto.tags ?? []);
          } catch (err) {
            const mensaje = err instanceof Error ? err.message : String(err);
            console.warn(`  lead ${leadId} (cr ${cr.id}): GET /v1/contacts/${cr.contact_id} fallo (${mensaje}), sin clasificar`);
          }
        }
        // property_id presente pero sin contact_id: sin clasificar (clasificacion queda null).
      }
      // Sin property_id en el CR: sin clasificar (clasificacion queda null).

      const etiqueta: Contador = clasificacion ?? 'sin_clasificar';
      contadores[etiqueta] += 1;
      procesados += 1;
      console.log(`  lead ${leadId} (cr ${cr.id}) -> ${etiqueta}`);

      if (!DRY_RUN && clasificacion) {
        const { error: updateError } = await admin
          .from('leads')
          .update({ clasificacion_eb: clasificacion })
          .eq('id', leadId);
        if (updateError) console.error(`  FALLO al actualizar lead ${leadId}: ${updateError.message}`);
      }

      // Resuelto en esta corrida (aunque haya quedado 'sin_clasificar' por
      // falta de datos): no tiene caso volver a buscarlo en otra pagina.
      pendientesPorEbId.delete(String(cr.id));
    }

    if (pendientesPorEbId.size === 0) break;
    if (!pagina.pagination.next_page) break;
    await pausa(PAUSA_ENTRE_PAGINAS_MS);
    pagina = await ebFetch<PaginaEB<ContactRequestEB>>(pagina.pagination.next_page);
  }

  console.log(`\nProcesados: ${procesados}`);
  console.log(`  cliente_directo: ${contadores.cliente_directo}`);
  console.log(`  co_broke:        ${contadores.co_broke}`);
  console.log(`  saliente:        ${contadores.saliente}`);
  console.log(`  sin_clasificar:  ${contadores.sin_clasificar}`);

  if (pendientesPorEbId.size > 0) {
    console.log(
      `\n${pendientesPorEbId.size} leads pendientes NO aparecieron en /v1/contact_requests (fuera del ` +
        'historico paginado disponible, o el contact request ya no existe en EasyBroker). Quedan ' +
        'sin clasificar; correr el script de nuevo mas tarde no los reintenta si ya se borro el CR alla.'
    );
  }
  if (DRY_RUN) {
    console.log('\nDRY RUN: no se escribio nada en Supabase. Quitar --dry-run para aplicar los cambios.');
  }
}

main().catch((err) => {
  console.error('Backfill abortado por error inesperado:', err);
  process.exit(1);
});

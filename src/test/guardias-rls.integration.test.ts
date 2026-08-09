// @vitest-environment node
/**
 * Tests de integracion RLS de la Fase B guardias (migracion 0014):
 * `guardias`, `configuracion`, `propiedades_internas`, `lead_escalamientos`
 * y la columna `leads.escalamiento_desde`.
 *
 * Mismas convenciones que contactos-rls.integration.test.ts: proyecto
 * Supabase REAL de desarrollo, JWTs reales de los usuarios seed.
 *
 * Recordatorio de formas de denegacion:
 *   - policy USING (select/update/delete sobre fila vetada) -> 0 filas, SIN error.
 *   - policy WITH CHECK (insert que no cumple)              -> error 42501.
 *   - grant de columna/tabla ausente                        -> error 42501.
 *
 * Higiene de fixtures: las guardias usan fechas 2099-* (imposible chocar con
 * el rol real de dev) y todo se borra en afterAll. El lead del test de
 * concurrencia no recibe seguimientos, asi que se borra de verdad; sus
 * lead_escalamientos caen en cascada.
 *
 * Ejecutar con: npm run test:rls
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

loadEnv({ path: path.resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const PASSWORD = 'Password123!';
const RUN = Date.now();
const MARK_LEAD = `TEST-GRD-${RUN}-lead-escalado`;
const TEL_LEAD = '5599000021';
const MARK_PROP = `TEST-GRD-${RUN}-propiedad`;
// Fechas EN EL PASADO a proposito, y no solo para no chocar con el rol real:
// una guardia futura seria visible para el resolutor del sync — el archivo de
// integracion del sync corre en paralelo y sus leads de bandeja se asignarian
// a la "siguiente guardia" fantasma de este fixture. La RLS que se prueba
// aqui no depende de fechas.
const FECHA_G1 = '2001-01-11';
const FECHA_G2 = '2001-01-12';

function makeClient(key: string): SupabaseClient {
  return createClient(SUPABASE_URL as string, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let admin: SupabaseClient;
let asesor1: SupabaseClient;
let asesor2: SupabaseClient;
let svc: SupabaseClient;

let adminId: string;
let asesor1Id: string;
let asesor2Id: string;
let agenciaId: string;

let guardiaId: string; // fixture en FECHA_G1/manana, cubierta por asesor1
let propiedadId: string; // fixture con marca exclusiva
let leadId: string; // asignado a asesor1, etapa nuevo, con paso abierto_r1

beforeAll(async () => {
  if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
    throw new Error(
      'Faltan variables en .env.local: se requieren NEXT_PUBLIC_SUPABASE_URL, ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY'
    );
  }

  admin = makeClient(PUBLISHABLE_KEY);
  asesor1 = makeClient(PUBLISHABLE_KEY);
  asesor2 = makeClient(PUBLISHABLE_KEY);
  svc = makeClient(SECRET_KEY);

  const logins = await Promise.all([
    admin.auth.signInWithPassword({ email: 'admin@montana.test', password: PASSWORD }),
    asesor1.auth.signInWithPassword({ email: 'asesor1@montana.test', password: PASSWORD }),
    asesor2.auth.signInWithPassword({ email: 'asesor2@montana.test', password: PASSWORD }),
  ]);
  for (const login of logins) {
    if (login.error || !login.data.session) {
      throw new Error(`Login de usuario seed fallo: ${login.error?.message ?? 'sin sesion'}. Corre npm run seed.`);
    }
  }
  adminId = logins[0].data.session!.user.id;
  asesor1Id = logins[1].data.session!.user.id;
  asesor2Id = logins[2].data.session!.user.id;

  const { data: agencia, error: agenciaError } = await svc
    .from('agencias')
    .select('id')
    .eq('nombre', 'Montana Realty')
    .single();
  if (agenciaError || !agencia) {
    throw new Error(`No se pudo obtener la agencia: ${agenciaError?.message}. Corre npm run seed.`);
  }
  agenciaId = agencia.id;

  // Guardia fixture (svc): FECHA_G1 manana, asesor1.
  const { data: g, error: gError } = await svc
    .from('guardias')
    .insert({ fecha: FECHA_G1, turno: 'manana', hora_inicio: '09:00', hora_fin: '15:00', asesor_id: asesor1Id })
    .select('id')
    .single();
  if (gError || !g) throw new Error(`No se pudo crear la guardia fixture: ${gError?.message}`);
  guardiaId = g.id;

  // Propiedad fixture + marca exclusiva (svc).
  const { data: p, error: pError } = await svc
    .from('propiedades')
    .insert({ agencia_id: agenciaId, titulo: MARK_PROP, easybroker_id: MARK_PROP })
    .select('id')
    .single();
  if (pError || !p) throw new Error(`No se pudo crear la propiedad fixture: ${pError?.message}`);
  propiedadId = p.id;
  const { error: piError } = await svc
    .from('propiedades_internas')
    .insert({ propiedad_id: propiedadId, exclusiva: true });
  if (piError) throw new Error(`No se pudo marcar la exclusiva fixture: ${piError.message}`);

  // Lead en escalamiento abierto (svc): asignado a asesor1, etapa nuevo.
  const { data: l, error: lError } = await svc
    .from('leads')
    .insert({
      agencia_id: agenciaId,
      nombre: MARK_LEAD,
      telefono: TEL_LEAD,
      fuente: 'otro',
      asesor_id: asesor1Id,
      asignado_en: new Date().toISOString(),
      escalamiento_desde: new Date(Date.now() - 45 * 60_000).toISOString(),
    })
    .select('id')
    .single();
  if (lError || !l) throw new Error(`No se pudo crear el lead fixture: ${lError?.message}`);
  leadId = l.id;
  const { error: leError } = await svc
    .from('lead_escalamientos')
    .insert({ lead_id: leadId, paso: 'abierto_r1' });
  if (leError) throw new Error(`No se pudo crear el paso fixture: ${leError.message}`);
}, 30_000);

afterAll(async () => {
  if (svc) {
    // lead_escalamientos cae en cascada con el lead; propiedades_internas con
    // la propiedad. El lead no tiene seguimientos, asi que se borra de verdad.
    if (leadId) await svc.from('leads').delete().eq('id', leadId);
    if (propiedadId) await svc.from('propiedades').delete().eq('id', propiedadId);
    await svc.from('guardias').delete().in('fecha', [FECHA_G1, FECHA_G2]);
  }
  await admin?.auth.signOut();
  await asesor1?.auth.signOut();
  await asesor2?.auth.signOut();
}, 30_000);

describe('guardias: lectura abierta, escritura solo admin (migracion 0014)', () => {
  it('asesor SI lee el rol completo (incluidas guardias ajenas)', async () => {
    const { data, error } = await asesor2.from('guardias').select('id, asesor_id').eq('id', guardiaId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].asesor_id).toBe(asesor1Id);
  });

  it('asesor NO puede insertar guardias (with check admin: 42501)', async () => {
    const { error } = await asesor1
      .from('guardias')
      .insert({ fecha: FECHA_G2, turno: 'manana', hora_inicio: '09:00', hora_fin: '15:00', asesor_id: asesor1Id });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('asesor NO puede actualizar ni borrar guardias (policy USING: 0 filas sin error)', async () => {
    const { data: upd, error: updError } = await asesor1
      .from('guardias')
      .update({ asesor_id: asesor2Id })
      .eq('id', guardiaId)
      .select('id');
    expect(updError).toBeNull();
    expect(upd).toHaveLength(0);

    const { error: delError } = await asesor1.from('guardias').delete().eq('id', guardiaId);
    expect(delError).toBeNull();

    // Verificacion (svc): la guardia sigue intacta.
    const { data: after } = await svc.from('guardias').select('asesor_id').eq('id', guardiaId).single();
    expect(after!.asesor_id).toBe(asesor1Id);
  });

  it('admin SI captura y edita el rol (control positivo)', async () => {
    const { data: creada, error: insError } = await admin
      .from('guardias')
      .insert({ fecha: FECHA_G2, turno: 'tarde', hora_inicio: '15:00', hora_fin: '00:00', asesor_id: asesor2Id })
      .select('id')
      .single();
    expect(insError).toBeNull();

    const { data: editada, error: updError } = await admin
      .from('guardias')
      .update({ asesor_id: asesor1Id })
      .eq('id', creada!.id)
      .select('asesor_id');
    expect(updError).toBeNull();
    expect(editada![0].asesor_id).toBe(asesor1Id);
    // La borra el afterAll (delete por fecha).
  });
});

describe('configuracion: solo admin (el asesor ni sabe que existe)', () => {
  it('asesor NO lee configuracion (policy USING: 0 filas sin error)', async () => {
    const { data, error } = await asesor1.from('configuracion').select('clave');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('admin SI lee las claves del seed (control positivo)', async () => {
    const { data, error } = await admin.from('configuracion').select('clave');
    expect(error).toBeNull();
    expect(data!.map((f) => f.clave)).toContain('umbral_vip_mxn');
  });
});

describe('propiedades_internas: la marca exclusiva es INVISIBLE para asesores', () => {
  it('asesor NO lee la marca aunque la propiedad exista (0 filas sin error)', async () => {
    const { data, error } = await asesor1
      .from('propiedades_internas')
      .select('exclusiva')
      .eq('propiedad_id', propiedadId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('asesor NO puede marcar exclusivas (with check admin: 42501)', async () => {
    const { error } = await asesor1
      .from('propiedades_internas')
      .update({ exclusiva: false })
      .eq('propiedad_id', propiedadId)
      .select('propiedad_id')
      .then((r) => ({ error: r.error ?? (r.data?.length === 0 ? null : new Error('actualizo')) }));
    // update sobre fila vetada por USING: 0 filas sin error tambien es denegacion valida
    expect(error).toBeNull();

    const { error: insError } = await asesor1
      .from('propiedades_internas')
      .insert({ propiedad_id: propiedadId, exclusiva: false });
    expect(insError).not.toBeNull();
    expect(insError!.code).toBe('42501');

    // Verificacion (svc): la marca sigue en true.
    const { data: after } = await svc
      .from('propiedades_internas')
      .select('exclusiva')
      .eq('propiedad_id', propiedadId)
      .single();
    expect(after!.exclusiva).toBe(true);
  });

  it('admin SI lee y escribe la marca (control positivo)', async () => {
    const { data, error } = await admin
      .from('propiedades_internas')
      .select('exclusiva')
      .eq('propiedad_id', propiedadId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].exclusiva).toBe(true);
  });
});

describe('lead_escalamientos: admin solo-lectura; escribe solo el sistema', () => {
  it('asesor NO lee los pasos, ni de su propio lead (0 filas sin error)', async () => {
    // El lead ES de asesor1 — la tabla es invisible incluso para el dueno del
    // lead: la elegibilidad de «Tomar lead» se consulta via server action.
    const { data, error } = await asesor1.from('lead_escalamientos').select('id').eq('lead_id', leadId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('asesor NO puede insertar pasos (grant de INSERT revocado: 42501)', async () => {
    const { error } = await asesor1
      .from('lead_escalamientos')
      .insert({ lead_id: leadId, paso: 'recordatorio_r1' });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('admin SI lee los pasos (control positivo)', async () => {
    const { data, error } = await admin.from('lead_escalamientos').select('paso').eq('lead_id', leadId);
    expect(error).toBeNull();
    expect(data!.map((f) => f.paso)).toEqual(['abierto_r1']);
  });
});

describe('leads.escalamiento_desde y el CAS de «Tomar lead»', () => {
  it('asesor NO puede tocar escalamiento_desde (columna fuera del grant de UPDATE: 42501)', async () => {
    // Sobre su PROPIO lead, para que la unica razon del rechazo sea el grant.
    const { error } = await asesor1
      .from('leads')
      .update({ escalamiento_desde: null })
      .eq('id', leadId);
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('tomar lead concurrente: de dos CAS simultaneos solo UNO gana', async () => {
    // El CAS real corre por service role (tomarLead usa createAdminClient):
    // aqui se simulan dos asesores tomando a la vez. Cada update exige el
    // asesor VIGENTE (asesor1); el que llegue segundo re-evalua el predicado
    // sobre la fila ya cambiada y afecta 0 filas.
    const [r1, r2] = await Promise.all([
      svc
        .from('leads')
        .update({ asesor_id: asesor2Id, asignado_en: new Date().toISOString() })
        .eq('id', leadId)
        .eq('asesor_id', asesor1Id)
        .eq('etapa', 'nuevo')
        .select('id'),
      svc
        .from('leads')
        .update({ asesor_id: adminId, asignado_en: new Date().toISOString() })
        .eq('id', leadId)
        .eq('asesor_id', asesor1Id)
        .eq('etapa', 'nuevo')
        .select('id'),
    ]);

    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    const ganadores = (r1.data?.length ?? 0) + (r2.data?.length ?? 0);
    expect(ganadores).toBe(1);

    // Verificacion (svc): el asesor final es exactamente el del CAS ganador.
    const { data: after } = await svc.from('leads').select('asesor_id').eq('id', leadId).single();
    const ganador = r1.data?.length ? asesor2Id : adminId;
    expect(after!.asesor_id).toBe(ganador);
  });
});

// @vitest-environment node
/**
 * Tests de integracion de `lead_eventos` (migracion 0016): trigger de captura
 * en `leads`, inmutabilidad en 3 capas y RLS de lectura/escritura.
 *
 * Mismas convenciones que src/test/rls.integration.test.ts: corre contra el
 * proyecto Supabase REAL de desarrollo (credenciales en .env.local), con JWTs
 * reales via signInWithPassword de los usuarios seed (admin/asesor1/asesor2,
 * password Password123!, ver scripts/seed.ts).
 *
 * Recordatorio de formas de denegacion:
 *   - policy USING (select sobre fila vetada)   -> 0 filas, SIN error.
 *   - policy WITH CHECK (insert que no cumple)  -> error 42501.
 *   - grant de tabla revocado (update/delete)   -> error 42501.
 *   - trigger de inmutabilidad (service role)   -> error 'lead_eventos es inmutable'.
 *
 * Higiene de fixtures: las filas de `lead_eventos` NO se pueden borrar JAMAS
 * (trigger de inmutabilidad, incluso para service role), y por lo mismo desde
 * la 0016 TODO lead es imborrable (el delete en cascada de su `lead_creado`
 * choca con ese trigger). El afterAll ARCHIVA los leads fixture (archivado:
 * true) y eso es todo: leads archivados y sus eventos se acumulan en la base
 * de dev entre corridas — mismo trade-off aceptado y documentado que los
 * seguimientos en rls.integration.test.ts.
 *
 * Ejecutar con: npm run test:rls -- lead-eventos
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
const ADMIN_EMAIL = 'admin@montana.test';
const ASESOR1_EMAIL = 'asesor1@montana.test';
const ASESOR2_EMAIL = 'asesor2@montana.test';

// Marcador unico por corrida (mismo patron que rls.integration.test.ts).
const RUN = Date.now();
const MARK_LEAD_SIN_ASESOR = `TEST-EVT-${RUN}-lead-sin-asesor`;
const MARK_LEAD_A1 = `TEST-EVT-${RUN}-lead-asesor1`;
const MARK_LEAD_A2 = `TEST-EVT-${RUN}-lead-asesor2`;
// Marca dentro de payload para poder verificar via svc que un insert vetado
// NUNCA dejo fila (los eventos no llevan nombre; el payload jsonb si es libre).
const MARK_PAYLOAD_ESCALAMIENTO = `TEST-EVT-${RUN}-escalamiento-svc`;
const MARK_PAYLOAD_FORJADO = `TEST-EVT-${RUN}-forjado-no-debe-existir`;
const MARK_PAYLOAD_PERMITIDO = `TEST-EVT-${RUN}-insert-permitido`;
// Telefonos ficticios en rango libre (otros archivos usan ...01/02, ...11-14 y ...21).
const TEL_SIN_ASESOR = '5599000031';
const TEL_A1 = '5599000032';
const TEL_A2 = '5599000033';

function makeClient(key: string): SupabaseClient {
  return createClient(SUPABASE_URL as string, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let admin: SupabaseClient;
let asesor1: SupabaseClient;
let asesor2: SupabaseClient;
let svc: SupabaseClient; // secret key: SOLO setup/teardown/verificacion, bypasea RLS

let asesor1Id: string;
let asesor2Id: string;
let agenciaId: string;

let leadSinAsesorId: string; // nace sin asesor; el test 1 lo muta via svc
let leadA1Id: string; // de asesor1 desde el insert
let leadA2Id: string; // de asesor2 desde el insert

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
    admin.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PASSWORD }),
    asesor1.auth.signInWithPassword({ email: ASESOR1_EMAIL, password: PASSWORD }),
    asesor2.auth.signInWithPassword({ email: ASESOR2_EMAIL, password: PASSWORD }),
  ]);
  for (const login of logins) {
    if (login.error || !login.data.session) {
      throw new Error(`Login de usuario seed fallo: ${login.error?.message ?? 'sin sesion'}. Corre npm run seed.`);
    }
  }
  asesor1Id = logins[1].data.session!.user.id;
  asesor2Id = logins[2].data.session!.user.id;

  const { data: agencia, error: agenciaError } = await svc
    .from('agencias')
    .select('id')
    .eq('nombre', 'Montana Realty')
    .single();
  if (agenciaError || !agencia) {
    throw new Error(`No se pudo obtener la agencia "Montana Realty": ${agenciaError?.message}. Corre npm run seed.`);
  }
  agenciaId = agencia.id;

  // Los tres inserts van por svc: el trigger leads_anota_eventos anota
  // lead_creado (y lead_asignado si nacen con asesor) con actor null.
  const { data: l0, error: l0Error } = await svc
    .from('leads')
    .insert({ agencia_id: agenciaId, nombre: MARK_LEAD_SIN_ASESOR, telefono: TEL_SIN_ASESOR, fuente: 'otro' })
    .select('id')
    .single();
  if (l0Error || !l0) throw new Error(`No se pudo crear el lead fixture sin asesor: ${l0Error?.message}`);
  leadSinAsesorId = l0.id;

  const { data: l1, error: l1Error } = await svc
    .from('leads')
    .insert({ agencia_id: agenciaId, nombre: MARK_LEAD_A1, telefono: TEL_A1, fuente: 'otro', asesor_id: asesor1Id })
    .select('id')
    .single();
  if (l1Error || !l1) throw new Error(`No se pudo crear el lead fixture de asesor1: ${l1Error?.message}`);
  leadA1Id = l1.id;

  const { data: l2, error: l2Error } = await svc
    .from('leads')
    .insert({ agencia_id: agenciaId, nombre: MARK_LEAD_A2, telefono: TEL_A2, fuente: 'otro', asesor_id: asesor2Id })
    .select('id')
    .single();
  if (l2Error || !l2) throw new Error(`No se pudo crear el lead fixture de asesor2: ${l2Error?.message}`);
  leadA2Id = l2.id;
}, 30_000);

afterAll(async () => {
  if (svc) {
    // Los eventos NO se pueden borrar (inmutables incluso para service role) y
    // por lo tanto los leads tampoco (cascada bloqueada): se archivan y ya —
    // acumulacion aceptada, ver cabecera. Se ASERTA el resultado: un {error}
    // silencioso de supabase-js dejaria los fixtures activos fugados en dev.
    const leadIds = [leadSinAsesorId, leadA1Id, leadA2Id].filter(Boolean);
    if (leadIds.length > 0) {
      const { error: archivaError } = await svc.from('leads').update({ archivado: true }).in('id', leadIds);
      expect(archivaError).toBeNull();
    }
  }
  await admin?.auth.signOut();
  await asesor1?.auth.signOut();
  await asesor2?.auth.signOut();
}, 30_000);

describe('lead_eventos: trigger de captura, inmutabilidad y RLS (migracion 0016)', () => {
  it('el ciclo de vida del lead via svc anota lead_creado / etapa_cambiada / lead_asignado con actor null', async () => {
    // El insert del beforeAll (svc, sin asesor) ya debio anotar lead_creado.
    const { data: creado, error: creadoError } = await svc
      .from('lead_eventos')
      .select('tipo, actor_id, payload')
      .eq('lead_id', leadSinAsesorId)
      .eq('tipo', 'lead_creado');
    expect(creadoError).toBeNull();
    expect(creado).toHaveLength(1);
    expect(creado![0].payload.fuente).toBe('otro');
    expect(creado![0].actor_id).toBeNull(); // service role = sistema

    // Cambio de etapa via svc -> etapa_cambiada {de, a}.
    const { error: etapaError } = await svc
      .from('leads')
      .update({ etapa: 'contactado' })
      .eq('id', leadSinAsesorId);
    expect(etapaError).toBeNull();
    const { data: etapa, error: etapaEvError } = await svc
      .from('lead_eventos')
      .select('actor_id, payload')
      .eq('lead_id', leadSinAsesorId)
      .eq('tipo', 'etapa_cambiada');
    expect(etapaEvError).toBeNull();
    expect(etapa).toHaveLength(1);
    expect(etapa![0].payload).toEqual({ de: 'nuevo', a: 'contactado' });
    expect(etapa![0].actor_id).toBeNull();

    // Primera asignacion (old.asesor_id null) via svc -> lead_asignado.
    const { error: asignaError } = await svc
      .from('leads')
      .update({ asesor_id: asesor1Id })
      .eq('id', leadSinAsesorId);
    expect(asignaError).toBeNull();
    const { data: asignado, error: asignadoError } = await svc
      .from('lead_eventos')
      .select('actor_id, payload')
      .eq('lead_id', leadSinAsesorId)
      .eq('tipo', 'lead_asignado');
    expect(asignadoError).toBeNull();
    expect(asignado).toHaveLength(1);
    expect(asignado![0].payload).toEqual({ de: null, a: asesor1Id });
    expect(asignado![0].actor_id).toBeNull();
  });

  it('un cambio de etapa hecho por asesor1 autenticado anota etapa_cambiada con actor_id = asesor1', async () => {
    const { data: upd, error: updError } = await asesor1
      .from('leads')
      .update({ etapa: 'contactado' })
      .eq('id', leadA1Id)
      .select('id');
    expect(updError).toBeNull();
    expect(upd).toHaveLength(1);

    // Verificacion (service-role): el trigger corrio con auth.uid() = asesor1.
    const { data: eventos, error: eventosError } = await svc
      .from('lead_eventos')
      .select('actor_id, payload')
      .eq('lead_id', leadA1Id)
      .eq('tipo', 'etapa_cambiada');
    expect(eventosError).toBeNull();
    expect(eventos).toHaveLength(1);
    expect(eventos![0].actor_id).toBe(asesor1Id);
    expect(eventos![0].payload).toEqual({ de: 'nuevo', a: 'contactado' });
  });

  it('lead_eventos es inmutable: ni el service role puede update/delete (trigger), ni el asesor (grant revocado)', async () => {
    // Cualquier evento real del fixture sirve de victima.
    const { data: victima, error: victimaError } = await svc
      .from('lead_eventos')
      .select('id, payload')
      .eq('lead_id', leadA1Id)
      .eq('tipo', 'lead_creado')
      .single();
    expect(victimaError).toBeNull();
    const eventoId = victima!.id;

    // Service role: el trigger BEFORE UPDATE/DELETE lanza la excepcion.
    const { error: svcUpdError } = await svc
      .from('lead_eventos')
      .update({ payload: { hackeado: true } })
      .eq('id', eventoId);
    expect(svcUpdError).not.toBeNull();
    expect(svcUpdError!.message).toContain('lead_eventos es inmutable');

    const { error: svcDelError } = await svc.from('lead_eventos').delete().eq('id', eventoId);
    expect(svcDelError).not.toBeNull();
    expect(svcDelError!.message).toContain('lead_eventos es inmutable');

    // Asesor: ni llega al trigger — el grant de update/delete esta revocado
    // para authenticated (42501), capa 2 del append-only.
    const { error: asesorUpdError } = await asesor1
      .from('lead_eventos')
      .update({ payload: { hackeado: true } })
      .eq('id', eventoId);
    expect(asesorUpdError).not.toBeNull();
    expect(asesorUpdError!.code).toBe('42501');

    const { error: asesorDelError } = await asesor1.from('lead_eventos').delete().eq('id', eventoId);
    expect(asesorDelError).not.toBeNull();
    expect(asesorDelError!.code).toBe('42501');

    // Verificacion (service-role): el payload original sigue intacto.
    const { data: after, error: afterError } = await svc
      .from('lead_eventos')
      .select('payload')
      .eq('id', eventoId)
      .single();
    expect(afterError).toBeNull();
    expect(after!.payload).toEqual(victima!.payload);
  });

  it('asesor1 NO ve eventos de leads ajenos ni tipos de supervision de los suyos; admin ve todo', async () => {
    // Lead ajeno: 0 filas SIN error (policy USING, la trampa clasica).
    const { data: ajenos, error: ajenosError } = await asesor1
      .from('lead_eventos')
      .select('id')
      .eq('lead_id', leadA2Id);
    expect(ajenosError).toBeNull();
    expect(ajenos).toEqual([]);

    // Control positivo: asesor2 (dueno) SI ve los eventos de ese mismo lead.
    const { data: propios, error: propiosError } = await asesor2
      .from('lead_eventos')
      .select('tipo')
      .eq('lead_id', leadA2Id);
    expect(propiosError).toBeNull();
    expect(propios!.map((e) => e.tipo)).toContain('lead_creado');

    // Evento de supervision en el lead PROPIO de asesor1, insertado por el
    // sistema (svc, como lo hara el cron de escalamiento).
    const { error: escError } = await svc.from('lead_eventos').insert({
      lead_id: leadA1Id,
      tipo: 'escalamiento_paso',
      actor_id: null,
      payload: { paso: 'abierto_r1', marca: MARK_PAYLOAD_ESCALAMIENTO },
    });
    expect(escError).toBeNull();

    // El dueno del lead NO lo lista (el select filtra tipos de supervision)...
    const { data: deAsesor, error: deAsesorError } = await asesor1
      .from('lead_eventos')
      .select('tipo')
      .eq('lead_id', leadA1Id);
    expect(deAsesorError).toBeNull();
    expect(deAsesor!.length).toBeGreaterThan(0); // si ve sus eventos normales
    expect(deAsesor!.map((e) => e.tipo)).not.toContain('escalamiento_paso');

    // ...y el admin SI.
    const { data: deAdmin, error: deAdminError } = await admin
      .from('lead_eventos')
      .select('tipo, payload')
      .eq('lead_id', leadA1Id)
      .eq('tipo', 'escalamiento_paso');
    expect(deAdminError).toBeNull();
    expect(deAdmin).toHaveLength(1);
    expect(deAdmin![0].payload.marca).toBe(MARK_PAYLOAD_ESCALAMIENTO);
  });

  it('asesor1 NO puede insertar escalamiento_paso ni etapa_cambiada directo (with check), pero SI un tipo de app', async () => {
    // Tipo de supervision: vetado por la policy de insert (42501). El lead es
    // suyo y el actor_id es el real, para que la UNICA razon del rechazo sea
    // el tipo.
    const { error: escInsError } = await asesor1.from('lead_eventos').insert({
      lead_id: leadA1Id,
      tipo: 'escalamiento_paso',
      actor_id: asesor1Id,
      payload: { marca: MARK_PAYLOAD_FORJADO },
    });
    expect(escInsError).not.toBeNull();
    expect(escInsError!.code).toBe('42501');

    // Tipo reservado al trigger: mismo veto.
    const { error: etapaInsError } = await asesor1.from('lead_eventos').insert({
      lead_id: leadA1Id,
      tipo: 'etapa_cambiada',
      actor_id: asesor1Id,
      payload: { de: 'nuevo', a: 'cerrado_ganado', marca: MARK_PAYLOAD_FORJADO },
    });
    expect(etapaInsError).not.toBeNull();
    expect(etapaInsError!.code).toBe('42501');

    // Verificacion (service-role): ninguna fila forjada llego a la tabla.
    const { data: check, error: checkError } = await svc
      .from('lead_eventos')
      .select('id')
      .eq('payload->>marca', MARK_PAYLOAD_FORJADO);
    expect(checkError).toBeNull();
    expect(check).toEqual([]);

    // Control positivo: un tipo de app (seguimiento_registrado) sobre su
    // propio lead y con su propio actor_id SI pasa la policy. Sin esto, los
    // rechazos de arriba podrian estar en verde porque el INSERT esta roto
    // para todo el mundo, no porque la policy discrimine tipos.
    const { data: ok, error: okError } = await asesor1
      .from('lead_eventos')
      .insert({
        lead_id: leadA1Id,
        tipo: 'seguimiento_registrado',
        actor_id: asesor1Id,
        payload: { tipo: 'otro', marca: MARK_PAYLOAD_PERMITIDO },
      })
      .select('id, tipo, actor_id')
      .single();
    expect(okError).toBeNull();
    expect(ok!.tipo).toBe('seguimiento_registrado');
    expect(ok!.actor_id).toBe(asesor1Id);
  });
});

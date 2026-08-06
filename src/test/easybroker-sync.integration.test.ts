// @vitest-environment node
/**
 * Tests de integracion del sync EasyBroker (Fase 1, Task 10) — CRM Montana Realty.
 *
 * Corren contra el proyecto Supabase REAL (cloud, credenciales en .env.local)
 * usando el service-role (el sync corre server-side con RLS bypaseado, igual
 * que en produccion via cron). NADA de nuestra base se mockea; lo unico que
 * se inyecta son fixtures de EasyBroker (obtenerPagina / obtenerDetalle) para
 * no depender de la red — salvo el smoke test final, que SI pega al sandbox
 * de staging con cursores fijados a "ahora" (0 items esperados).
 *
 * Los tests de este archivo son SECUENCIALES y dependen entre si (el describe
 * construye estado paso a paso: propiedades -> lead nuevo -> dedup -> repeat).
 *
 * Higiene de fixtures:
 *  - leads creados: se ARCHIVAN (seguimientos es append-only e imborrable,
 *    asi que un lead con seguimiento no se puede borrar por FK; ver la nota
 *    equivalente en rls.integration.test.ts).
 *  - notificaciones creadas: se borran (texto like %marker%).
 *  - propiedades TEST-SYNC-%: se intenta borrar fila por fila; las que tengan
 *    referencias FK (leads/seguimientos archivados) se quedan — aceptable en
 *    base de desarrollo, documentado a proposito.
 *  - sync_estado: se hace snapshot en beforeAll y se restaura en afterAll.
 *
 * Ejecutar con: npm run test:rls (excluido del `npm test` normal)
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  avanzarCursor,
  procesarContactRequests,
  procesarPaginaPropiedades,
  reconciliarEstatusPropiedades,
  sincronizarEasyBroker,
} from '@/lib/easybroker/sync';
import type { PaginaEB } from '@/lib/easybroker/cliente';
import type { ContactoEB, ContactRequestEB, PropiedadDetalleEB, PropiedadListaEB } from '@/lib/easybroker/mapeo';

loadEnv({ path: path.resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

// Marcador unico por corrida.
const RUN = Date.now();
const MARK = `TEST-SYNC-${RUN}`;

// Telefonos ficticios unicos por corrida (10 digitos); normalizados = 52 + estos.
const TEL_UNO = `55${String(RUN).slice(-8)}`;
const TEL_DOS = `56${String(RUN).slice(-8)}`;

let svc: SupabaseClient;
let agenciaId: string;
let adminIds: string[];
let asesorId: string;
let syncEstadoSnapshot: Array<Record<string, unknown>> = [];

// Estado que los tests construyen secuencialmente.
let propiedad1Id: string; // uuid de `${MARK}-P1`
let lead1Id: string; // lead creado en el test 2

// ---------------------------------------------------------------------------
// Fixtures EasyBroker (formas verificadas en src/test/fixtures/easybroker/*)
// ---------------------------------------------------------------------------

function itemPropiedad(sufijo: string, overrides: Partial<PropiedadListaEB> = {}): PropiedadListaEB {
  return {
    public_id: `${MARK}-${sufijo}`,
    title: `${MARK} propiedad ${sufijo}`,
    title_image_full: 'https://assets.example.test/portada.jpg',
    title_image_thumb: 'https://assets.example.test/portada-thumb.jpg',
    location: 'Del Valle, San Pedro Garza García, Nuevo León',
    operations: [{ type: 'sale', amount: 1_000_000, currency: 'MXN' }],
    bedrooms: 3,
    bathrooms: 2,
    parking_spaces: 2,
    property_type: 'Casa',
    lot_size: 200,
    construction_size: 180,
    updated_at: '2026-08-01T10:00:00-06:00',
    ...overrides,
  };
}

const DETALLES: Record<string, PropiedadDetalleEB> = {
  [`${MARK}-P1`]: {
    public_id: `${MARK}-P1`,
    description: 'Casa de prueba con detalle completo',
    location: {
      name: 'Del Valle, San Pedro Garza García, Nuevo León',
      latitude: 25.65,
      longitude: -100.36,
    },
    public_url: 'https://www.stagingeb.com/mx/listings/test-sync-p1',
    images: [
      { title: null, url: 'https://assets.example.test/p1-1.jpg' },
      { title: null, url: 'https://assets.example.test/p1-2.jpg' },
    ],
  },
  [`${MARK}-P2`]: {
    public_id: `${MARK}-P2`,
    description: 'Departamento de prueba sin colonia',
    // 2 partes -> colonia null, ciudad 'Monterrey' (ver parsearUbicacion)
    location: { name: 'Monterrey, Nuevo León', latitude: null, longitude: null },
    public_url: null,
    images: [{ title: null, url: 'https://assets.example.test/p2-1.jpg' }],
  },
  [`${MARK}-P3`]: {
    public_id: `${MARK}-P3`,
    description: 'Propiedad para el test de cursor',
    location: { name: 'Cumbres, Monterrey, Nuevo León', latitude: null, longitude: null },
    public_url: null,
    images: [],
  },
  [`${MARK}-P4`]: {
    public_id: `${MARK}-P4`,
    description: 'Propiedad para el test de cursor',
    location: { name: 'Cumbres, Monterrey, Nuevo León', latitude: null, longitude: null },
    public_url: null,
    images: [],
  },
};

const llamadasDetalle: string[] = [];

async function obtenerDetalleFixture(publicId: string): Promise<PropiedadDetalleEB> {
  llamadasDetalle.push(publicId);
  const detalle = DETALLES[publicId];
  if (!detalle) throw new Error(`fixture de detalle no definido para ${publicId}`);
  return detalle;
}

function contactRequest(id: number, overrides: Partial<ContactRequestEB> = {}): ContactRequestEB {
  return {
    id,
    name: `${MARK} Lead Uno`,
    phone: `+52 ${TEL_UNO}`,
    email: `${RUN}-uno@sync.test`,
    contact_id: null,
    property_id: `${MARK}-P1`,
    message: 'Hola, me interesa esta propiedad.',
    source: 'inmuebles24.com',
    happened_at: '2026-08-02T09:30:00-06:00',
    ...overrides,
  };
}

// Fixture de GET /v1/contacts/{id} (clasificacion co-broke vs cliente directo).
// Los contact_id NO listados aqui simulan una llamada que falla (404/500/etc).
const CONTACTOS: Record<number, ContactoEB> = {
  1001: { id: 1001, tags: ['agente'] }, // corredor externo -> co_broke
  1002: { id: 1002, tags: [] }, // sin tag -> cliente_directo
};

const llamadasContacto: number[] = [];

async function obtenerContactoFixture(contactId: number): Promise<ContactoEB> {
  llamadasContacto.push(contactId);
  const contacto = CONTACTOS[contactId];
  if (!contacto) throw new Error(`GET /v1/contacts/${contactId} fallo (fixture no definido)`);
  return contacto;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (!SUPABASE_URL || !SECRET_KEY) {
    throw new Error(
      'Faltan variables en .env.local: se requieren NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY'
    );
  }
  svc = createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: agencia, error: agenciaError } = await svc.from('agencias').select('id').limit(1).single();
  if (agenciaError || !agencia) {
    throw new Error(`No se pudo resolver la agencia: ${agenciaError?.message}. Corre npm run seed.`);
  }
  agenciaId = agencia.id;

  const { data: admins, error: adminsError } = await svc
    .from('usuarios')
    .select('user_id')
    .eq('rol', 'admin')
    .eq('activo', true);
  if (adminsError || !admins || admins.length === 0) {
    throw new Error(`No hay admins activos: ${adminsError?.message}. Corre npm run seed.`);
  }
  adminIds = admins.map((a) => a.user_id);

  const { data: asesores, error: asesoresError } = await svc
    .from('usuarios')
    .select('user_id')
    .eq('rol', 'asesor')
    .eq('activo', true)
    .limit(1);
  if (asesoresError || !asesores || asesores.length === 0) {
    throw new Error(`No hay asesores activos: ${asesoresError?.message}. Corre npm run seed.`);
  }
  asesorId = asesores[0].user_id;

  // Snapshot de sync_estado para restaurarlo al final (tabla compartida).
  const { data: estado, error: estadoError } = await svc
    .from('sync_estado')
    .select('recurso, sync_cursor, ultimo_ok, ultimo_error, lock_until')
    .in('recurso', ['propiedades', 'leads', 'estatus', 'lock']);
  if (estadoError) throw new Error(`No se pudo leer sync_estado: ${estadoError.message}`);
  syncEstadoSnapshot = estado ?? [];
}, 30_000);

afterAll(async () => {
  if (!svc) return;

  // Leads de prueba (de esta corrida y de corridas previas): archivar (no se
  // pueden borrar si tienen seguimientos) y soltar la referencia a la
  // propiedad de prueba para poder borrarla abajo.
  await svc.from('leads').update({ archivado: true, propiedad_id: null }).like('nombre', 'TEST-SYNC-%');

  // Notificaciones de esta corrida: borrar.
  await svc.from('notificaciones').delete().like('texto', `%${MARK}%`);

  // Propiedades TEST-SYNC-% (de esta corrida y de corridas previas): borrar
  // fila por fila, tolerando FKs historicas. Nota: la propiedad referida por
  // un seguimiento (test 4) NO se puede borrar jamas — seguimientos es
  // append-only e imborrable — asi que una propiedad de prueba por corrida
  // queda residente; aceptable en base de desarrollo, documentado a proposito.
  const { data: props } = await svc.from('propiedades').select('id').like('easybroker_id', 'TEST-SYNC-%');
  for (const p of props ?? []) {
    await svc.from('propiedades').delete().eq('id', p.id); // error de FK se ignora a proposito
  }

  // Restaurar sync_estado.
  await svc.from('sync_estado').delete().in('recurso', ['propiedades', 'leads', 'estatus', 'lock']);
  if (syncEstadoSnapshot.length > 0) {
    await svc.from('sync_estado').upsert(syncEstadoSnapshot, { onConflict: 'recurso' });
  }
}, 30_000);

// ---------------------------------------------------------------------------
// Tests (secuenciales)
// ---------------------------------------------------------------------------

describe('Sync EasyBroker Fase 1: idempotencia + dedup (Supabase real)', () => {
  it('1. procesarPaginaPropiedades: idempotente (0 nuevas en la 2a corrida) y refleja cambio de precio', async () => {
    const items = [
      itemPropiedad('P1'),
      itemPropiedad('P2', {
        property_type: 'Departamento',
        operations: [{ type: 'rental', amount: 25_000, currency: 'MXN' }],
        location: 'Monterrey, Nuevo León',
        updated_at: '2026-08-01T11:00:00-06:00',
      }),
    ];

    const ctx = { agenciaId, obtenerDetalle: obtenerDetalleFixture };

    const r1 = await procesarPaginaPropiedades(svc, items, ctx);
    expect(r1.errores).toEqual([]);
    expect(r1.procesadas).toBe(2);
    expect(r1.nuevas).toBe(2);
    expect(r1.actualizadas).toBe(0);
    // El detalle se pidio exactamente una vez por propiedad NUEVA.
    expect(llamadasDetalle.sort()).toEqual([`${MARK}-P1`, `${MARK}-P2`].sort());
    // maxActualizadaEb = max updated_at de la pagina, normalizado a UTC.
    expect(r1.maxActualizadaEb).toBe(new Date('2026-08-01T11:00:00-06:00').toISOString());

    // 2a corrida: mismos public_ids, P1 con precio nuevo.
    const items2 = [
      itemPropiedad('P1', { operations: [{ type: 'sale', amount: 1_250_000, currency: 'MXN' }] }),
      items[1],
    ];
    const r2 = await procesarPaginaPropiedades(svc, items2, ctx);
    expect(r2.errores).toEqual([]);
    expect(r2.nuevas).toBe(0);
    expect(r2.actualizadas).toBe(2);
    // Sin re-fetch de detalle para propiedades existentes.
    expect(llamadasDetalle).toHaveLength(2);

    const { data: p1, error } = await svc
      .from('propiedades')
      .select('id, precio, colonia, ciudad, descripcion, fotos, ultima_sync')
      .eq('easybroker_id', `${MARK}-P1`)
      .single();
    expect(error).toBeNull();
    expect(Number(p1!.precio)).toBe(1_250_000);
    // Los campos de detalle NO se degradan al actualizar desde el listado.
    expect(p1!.colonia).toBe('Del Valle');
    expect(p1!.ciudad).toBe('San Pedro Garza García');
    expect(p1!.descripcion).toBe('Casa de prueba con detalle completo');
    expect(p1!.fotos).toHaveLength(2);
    expect(p1!.ultima_sync).not.toBeNull();
    propiedad1Id = p1!.id;
  });

  it('2. contact request nuevo -> lead en bandeja (asesor null, zona_interes de la propiedad) + notificacion a admins', async () => {
    const r = await procesarContactRequests(svc, [contactRequest(RUN)], { agenciaId, obtenerContacto: obtenerContactoFixture });
    expect(r.errores).toEqual([]);
    expect(r.procesados).toBe(1);
    expect(r.nuevos).toBe(1);
    expect(r.duplicados).toBe(0);
    expect(r.maxHappenedAt).toBe(new Date('2026-08-02T09:30:00-06:00').toISOString());

    const { data: lead, error } = await svc
      .from('leads')
      .select('id, nombre, telefono, email, fuente, fuente_detalle, propiedad_id, asesor_id, zona_interes, easybroker_id, mensaje_original, creado_en, archivado')
      .eq('easybroker_id', String(RUN))
      .single();
    expect(error).toBeNull();
    expect(lead!.nombre).toBe(`${MARK} Lead Uno`);
    expect(lead!.telefono).toBe(`52${TEL_UNO}`);
    expect(lead!.email).toBe(`${RUN}-uno@sync.test`);
    expect(lead!.fuente).toBe('portal');
    expect(lead!.fuente_detalle).toBe('inmuebles24.com');
    expect(lead!.propiedad_id).toBe(propiedad1Id);
    expect(lead!.asesor_id).toBeNull(); // bandeja
    expect(lead!.zona_interes).toBe('Del Valle'); // colonia de P1
    expect(lead!.mensaje_original).toBe('Hola, me interesa esta propiedad.');
    expect(new Date(lead!.creado_en).toISOString()).toBe(new Date('2026-08-02T09:30:00-06:00').toISOString());
    expect(lead!.archivado).toBe(false);
    lead1Id = lead!.id;

    const { data: notifs, error: notifsError } = await svc
      .from('notificaciones')
      .select('destinatario_id, tipo, texto, url')
      .eq('tipo', 'lead_nuevo')
      .like('texto', `%${MARK} Lead Uno%`);
    expect(notifsError).toBeNull();
    expect(notifs!.map((n) => n.destinatario_id).sort()).toEqual([...adminIds].sort());
    for (const n of notifs!) {
      expect(n.texto).toContain('Nuevo lead');
      expect(n.texto).toContain('inmuebles24.com');
      expect(n.url).toBe('/admin/bandeja');
    }
  });

  it('3. mismo contact request otra vez (mismo easybroker_id) -> duplicado, sin lead ni notificacion nuevos', async () => {
    const r = await procesarContactRequests(svc, [contactRequest(RUN)], { agenciaId, obtenerContacto: obtenerContactoFixture });
    expect(r.errores).toEqual([]);
    expect(r.procesados).toBe(1);
    expect(r.nuevos).toBe(0);
    expect(r.duplicados).toBe(1);

    const { data: leads } = await svc.from('leads').select('id').eq('telefono', `52${TEL_UNO}`);
    expect(leads).toHaveLength(1);

    const { data: notifs } = await svc
      .from('notificaciones')
      .select('id')
      .like('texto', `%${MARK}%`);
    expect(notifs).toHaveLength(adminIds.length); // solo las del test 2

    const { data: segs } = await svc.from('seguimientos').select('id').eq('lead_id', lead1Id);
    expect(segs).toHaveLength(0);
  });

  it('4. contact request distinto pero mismo telefono -> seguimiento sistema en el lead existente + notificacion a admins (bandeja)', async () => {
    const cr = contactRequest(RUN + 1, {
      name: `${MARK} Lead Uno Bis`,
      email: `${RUN}-uno-alt@sync.test`,
      source: 'Pincali',
      happened_at: '2026-08-02T12:00:00-06:00',
    });
    const r = await procesarContactRequests(svc, [cr], { agenciaId, obtenerContacto: obtenerContactoFixture });
    expect(r.errores).toEqual([]);
    expect(r.nuevos).toBe(0);
    expect(r.duplicados).toBe(1);

    // No se creo lead nuevo.
    const { data: leads } = await svc.from('leads').select('id').eq('telefono', `52${TEL_UNO}`);
    expect(leads).toHaveLength(1);
    const { data: porEbId } = await svc.from('leads').select('id').eq('easybroker_id', String(RUN + 1));
    expect(porEbId).toHaveLength(0);

    // Seguimiento tipo sistema con la propiedad resuelta, autor null y el
    // easybroker_id del contact request (lo que hace idempotente el reingreso).
    const { data: segs, error: segsError } = await svc
      .from('seguimientos')
      .select('tipo, nota, propiedad_id, autor_id, easybroker_id')
      .eq('lead_id', lead1Id);
    expect(segsError).toBeNull();
    expect(segs).toHaveLength(1);
    expect(segs![0].tipo).toBe('sistema');
    expect(segs![0].autor_id).toBeNull();
    expect(segs![0].propiedad_id).toBe(propiedad1Id);
    expect(segs![0].easybroker_id).toBe(String(RUN + 1));
    expect(segs![0].nota).toContain('volvió a preguntar');
    expect(segs![0].nota).toContain(`${MARK} propiedad P1`); // titulo de la propiedad
    expect(segs![0].nota).toContain('Pincali'); // source

    // Lead en bandeja (asesor null) -> notificacion a TODOS los admins.
    const { data: notifs, error: notifsError } = await svc
      .from('notificaciones')
      .select('destinatario_id, texto, url')
      .eq('tipo', 'lead_reingreso')
      .like('texto', `%${MARK}%`);
    expect(notifsError).toBeNull();
    expect(notifs!.map((n) => n.destinatario_id).sort()).toEqual([...adminIds].sort());
    for (const n of notifs!) {
      expect(n.texto).toContain(`${MARK} Lead Uno`); // nombre del lead EXISTENTE
      expect(n.texto).toContain('volvió a preguntar');
      expect(n.url).toBe('/admin/bandeja');
    }

    // Reintento del MISMO contact request (cron reintenta / invocacion doble):
    // el seguimiento ya registrado con ese easybroker_id lo hace duplicado —
    // ni seguimiento nuevo ni notificacion nueva.
    const rRetry = await procesarContactRequests(svc, [cr], { agenciaId, obtenerContacto: obtenerContactoFixture });
    expect(rRetry.errores).toEqual([]);
    expect(rRetry.nuevos).toBe(0);
    expect(rRetry.duplicados).toBe(1);

    const { data: segsRetry } = await svc.from('seguimientos').select('id').eq('lead_id', lead1Id);
    expect(segsRetry).toHaveLength(1);
    const { data: notifsRetry } = await svc
      .from('notificaciones')
      .select('id')
      .eq('tipo', 'lead_reingreso')
      .like('texto', `%${MARK}%`);
    expect(notifsRetry).toHaveLength(adminIds.length);
  });

  it('5. lead asignado a un asesor + nueva consulta repetida -> notificacion al asesor, no a admins', async () => {
    const { error: asignaError } = await svc
      .from('leads')
      .update({ asesor_id: asesorId, asignado_en: new Date().toISOString() })
      .eq('id', lead1Id);
    expect(asignaError).toBeNull();

    const cr = contactRequest(RUN + 2, {
      email: `${RUN}-uno-tris@sync.test`,
      source: 'lamudi.com.mx',
      happened_at: '2026-08-02T15:00:00-06:00',
    });
    const r = await procesarContactRequests(svc, [cr], { agenciaId, obtenerContacto: obtenerContactoFixture });
    expect(r.errores).toEqual([]);
    expect(r.nuevos).toBe(0);
    expect(r.duplicados).toBe(1);

    // Segundo seguimiento en el mismo lead.
    const { data: segs } = await svc.from('seguimientos').select('id').eq('lead_id', lead1Id);
    expect(segs).toHaveLength(2);

    // Notificacion dirigida al asesor asignado ("Tu lead ...").
    const { data: notifsAsesor, error: nError } = await svc
      .from('notificaciones')
      .select('destinatario_id, texto')
      .eq('tipo', 'lead_reingreso')
      .eq('destinatario_id', asesorId)
      .like('texto', `%${MARK}%`);
    expect(nError).toBeNull();
    expect(notifsAsesor).toHaveLength(1);
    expect(notifsAsesor![0].texto).toContain('Tu lead');
    expect(notifsAsesor![0].texto).toContain(`${MARK} Lead Uno`);

    // Los admins NO recibieron notificacion nueva (siguen solo las del test 4).
    const { data: notifsAdmin } = await svc
      .from('notificaciones')
      .select('id')
      .eq('tipo', 'lead_reingreso')
      .in('destinatario_id', adminIds)
      .like('texto', `%${MARK}%`);
    expect(notifsAdmin).toHaveLength(adminIds.length);
  });

  it('6. cursor: avanza por pagina procesada y NO avanza cuando la pagina siguiente falla', async () => {
    // Cursor limpio para el recurso propiedades.
    await svc.from('sync_estado').delete().in('recurso', ['propiedades', 'leads']);

    const paginaProps: PaginaEB<PropiedadListaEB> = {
      pagination: { limit: 50, page: 1, total: 100, next_page: 'https://fake.easybroker.test/v2pagina' },
      content: [
        itemPropiedad('P3', { updated_at: '2026-08-02T08:00:00-06:00' }),
        itemPropiedad('P4', { updated_at: '2026-08-02T09:00:00-06:00' }),
      ],
    };
    const paginaVacia: PaginaEB<ContactRequestEB> = {
      pagination: { limit: 50, page: 1, total: 0, next_page: null },
      content: [],
    };

    const paginasPedidas: string[] = [];
    const resultado = await sincronizarEasyBroker(svc, {
      obtenerPagina: async (path) => {
        paginasPedidas.push(path);
        if (path.includes('/v1/properties')) return paginaProps as PaginaEB<unknown>;
        if (path.includes('v2pagina')) throw new Error('fallo simulado en pagina 2');
        return paginaVacia as PaginaEB<unknown>;
      },
      obtenerDetalle: obtenerDetalleFixture,
      maxPaginas: 5,
    });

    // La pagina 1 se proceso; la 2 fallo.
    expect(resultado.propiedades.nuevas).toBe(2);
    expect(resultado.errores.some((e) => e.includes('fallo simulado en pagina 2'))).toBe(true);

    // El cursor quedo en el max updated_at de la pagina 1 (progreso conservado),
    // y ultimo_error registrado.
    const { data: estadoProps, error: estadoError } = await svc
      .from('sync_estado')
      .select('sync_cursor, ultimo_ok, ultimo_error')
      .eq('recurso', 'propiedades')
      .single();
    expect(estadoError).toBeNull();
    expect(new Date(estadoProps!.sync_cursor).toISOString()).toBe(
      new Date('2026-08-02T09:00:00-06:00').toISOString()
    );
    expect(estadoProps!.ultimo_error).toContain('fallo simulado');

    // La fase de leads (pagina vacia) termino OK y marco ultimo_ok.
    const { data: estadoLeads } = await svc
      .from('sync_estado')
      .select('ultimo_ok, ultimo_error')
      .eq('recurso', 'leads')
      .single();
    expect(estadoLeads!.ultimo_ok).not.toBeNull();
    expect(estadoLeads!.ultimo_error).toBeNull();

    // La fase de estatus tambien corre en cada invocacion: el stub de este
    // test no conoce /v1/listing_statuses (regresa la pagina vacia generica),
    // asi que el mapa queda vacio -> catalogoCompleto=false a proposito (ver
    // obtenerMapaEstatusEB) y NO desactiva nada por ausencia.
    expect(resultado.estatus.catalogoCompleto).toBe(false);
    expect(resultado.estatus.ausentes).toBe(0);
    expect(resultado.estatus.desactivadas).toBe(0);
    const { data: estadoEstatus } = await svc
      .from('sync_estado')
      .select('ultimo_ok, ultimo_error')
      .eq('recurso', 'estatus')
      .single();
    expect(estadoEstatus!.ultimo_ok).not.toBeNull();
    expect(estadoEstatus!.ultimo_error).toBeNull();
  });

  it('6b. lease: una segunda corrida concurrente se omite con "sync ya en curso"', async () => {
    const paginaVacia: PaginaEB<unknown> = {
      pagination: { limit: 50, page: 1, total: 0, next_page: null },
      content: [],
    };

    // Corrida 1: su fetch se bloquea en un gate DESPUES de adquirir el lease.
    let señalDentro!: () => void;
    const dentro = new Promise<void>((resolve) => {
      señalDentro = resolve;
    });
    let continuar!: () => void;
    const gate = new Promise<void>((resolve) => {
      continuar = resolve;
    });

    const corrida1 = sincronizarEasyBroker(svc, {
      obtenerPagina: async () => {
        señalDentro(); // el lease ya se adquirio si llegamos al fetch
        await gate;
        return paginaVacia;
      },
      maxPaginas: 1,
    });

    await dentro;
    // Corrida 2 mientras la 1 sigue viva: debe omitirse sin tocar nada.
    const corrida2 = await sincronizarEasyBroker(svc, {
      obtenerPagina: async () => paginaVacia,
      maxPaginas: 1,
    });
    expect(corrida2.omitido).toBe(true);
    expect(corrida2.errores).toContain('sync ya en curso');
    expect(corrida2.propiedades.procesadas).toBe(0);
    expect(corrida2.leads.procesados).toBe(0);

    continuar();
    const r1 = await corrida1;
    expect(r1.omitido).toBe(false);
    expect(r1.errores).toEqual([]);

    // El lease se libero en el finally: una tercera corrida SI entra.
    const corrida3 = await sincronizarEasyBroker(svc, {
      obtenerPagina: async () => paginaVacia,
      maxPaginas: 1,
    });
    expect(corrida3.omitido).toBe(false);

    const { data: lock } = await svc
      .from('sync_estado')
      .select('lock_until')
      .eq('recurso', 'lock')
      .single();
    expect(lock!.lock_until).toBeNull();
  });

  it('7. zona_interes: propiedad sin colonia -> se prellenan con la ciudad', async () => {
    const cr = contactRequest(RUN + 3, {
      name: `${MARK} Lead Dos`,
      phone: `81 ${TEL_DOS}`,
      email: `${RUN}-dos@sync.test`,
      property_id: `${MARK}-P2`,
      source: 'sitio propio',
      happened_at: '2026-08-02T16:00:00-06:00',
    });
    const r = await procesarContactRequests(svc, [cr], { agenciaId, obtenerContacto: obtenerContactoFixture });
    expect(r.errores).toEqual([]);
    expect(r.nuevos).toBe(1);

    const { data: lead, error } = await svc
      .from('leads')
      .select('zona_interes, propiedad_id, asesor_id')
      .eq('easybroker_id', String(RUN + 3))
      .single();
    expect(error).toBeNull();
    expect(lead!.zona_interes).toBe('Monterrey'); // P2 no tiene colonia -> ciudad
    expect(lead!.asesor_id).toBeNull();
    expect(lead!.propiedad_id).not.toBeNull();
  });

  it('7b. email raro (comas/parentesis/mayusculas): se guarda en minusculas y dedup por email funciona', async () => {
    // Sin telefono: el dedup solo puede ser por email. El email lleva coma y
    // parentesis (habrian roto un filtro .or() de PostgREST) y mayusculas.
    const emailRaro = `${RUN}-We,ird(+Raro)@Sync.TEST`;
    const crNuevo = contactRequest(RUN + 4, {
      name: `${MARK} Lead Tres`,
      phone: null,
      email: emailRaro,
      property_id: null,
      source: 'sitio propio',
      happened_at: '2026-08-02T17:00:00-06:00',
    });
    const r1 = await procesarContactRequests(svc, [crNuevo], { agenciaId, obtenerContacto: obtenerContactoFixture });
    expect(r1.errores).toEqual([]);
    expect(r1.nuevos).toBe(1);

    const { data: lead, error } = await svc
      .from('leads')
      .select('id, email, telefono, asesor_id')
      .eq('easybroker_id', String(RUN + 4))
      .single();
    expect(error).toBeNull();
    expect(lead!.email).toBe(emailRaro.toLowerCase()); // normalizado en el mapeo
    expect(lead!.telefono).toBeNull();
    expect(lead!.asesor_id).toBeNull();

    // Segundo contact request con el MISMO email (otra combinacion de caso):
    // match por email -> seguimiento, sin lead nuevo.
    const crRepetido = contactRequest(RUN + 5, {
      name: `${MARK} Lead Tres bis`,
      phone: null,
      email: emailRaro.toUpperCase(),
      property_id: null,
      source: 'sitio propio',
      happened_at: '2026-08-02T17:30:00-06:00',
    });
    const r2 = await procesarContactRequests(svc, [crRepetido], { agenciaId, obtenerContacto: obtenerContactoFixture });
    expect(r2.errores).toEqual([]);
    expect(r2.nuevos).toBe(0);
    expect(r2.duplicados).toBe(1);

    const { data: leadsConEmail } = await svc
      .from('leads')
      .select('id')
      .eq('email', emailRaro.toLowerCase());
    expect(leadsConEmail).toHaveLength(1);

    const { data: segs } = await svc
      .from('seguimientos')
      .select('tipo, nota, easybroker_id, propiedad_id')
      .eq('lead_id', lead!.id);
    expect(segs).toHaveLength(1);
    expect(segs![0].tipo).toBe('sistema');
    expect(segs![0].easybroker_id).toBe(String(RUN + 5));
    expect(segs![0].propiedad_id).toBeNull(); // el CR no traia propiedad
    expect(segs![0].nota).toContain('volvió a preguntar');
  });

  it('7c. clasificacion "saliente": property_id ajeno (no en catalogo) -> lead sin propiedad, SIN llamar a /v1/contacts', async () => {
    const llamadasAntes = llamadasContacto.length;
    const cr = contactRequest(RUN + 6, {
      name: `${MARK} Lead Saliente`,
      phone: null,
      email: `${RUN}-saliente@sync.test`,
      property_id: `${MARK}-PROPIEDAD-AJENA-NO-EXISTE`,
      contact_id: 1001, // si se llegara a consultar, traeria tag "agente"; NO debe consultarse
      source: 'MLS',
      happened_at: '2026-08-02T18:00:00-06:00',
    });
    const r = await procesarContactRequests(svc, [cr], { agenciaId, obtenerContacto: obtenerContactoFixture });
    expect(r.errores).toEqual([]);
    expect(r.nuevos).toBe(1);
    expect(r.porClasificacion.saliente).toBe(1);
    expect(r.porClasificacion.clienteDirecto).toBe(0);
    expect(r.porClasificacion.coBroke).toBe(0);
    expect(r.porClasificacion.sinClasificar).toBe(0);
    // Propiedad ajena -> ya se sabe la respuesta sin consultar el contacto (ahorra el request).
    expect(llamadasContacto.length).toBe(llamadasAntes);

    const { data: lead, error } = await svc
      .from('leads')
      .select('clasificacion_eb, propiedad_id')
      .eq('easybroker_id', String(RUN + 6))
      .single();
    expect(error).toBeNull();
    expect(lead!.clasificacion_eb).toBe('saliente');
    expect(lead!.propiedad_id).toBeNull();
  });

  it('7d. clasificacion "co_broke": propiedad nuestra + contacto con tag "agente"', async () => {
    const cr = contactRequest(RUN + 7, {
      name: `${MARK} Lead CoBroke`,
      phone: null,
      email: `${RUN}-cobroke@sync.test`,
      property_id: `${MARK}-P1`,
      contact_id: 1001, // CONTACTOS[1001].tags incluye "agente"
      source: 'MLS',
      happened_at: '2026-08-02T18:15:00-06:00',
    });
    const r = await procesarContactRequests(svc, [cr], { agenciaId, obtenerContacto: obtenerContactoFixture });
    expect(r.errores).toEqual([]);
    expect(r.nuevos).toBe(1);
    expect(r.porClasificacion.coBroke).toBe(1);
    expect(llamadasContacto).toContain(1001);

    const { data: lead, error } = await svc
      .from('leads')
      .select('clasificacion_eb, propiedad_id')
      .eq('easybroker_id', String(RUN + 7))
      .single();
    expect(error).toBeNull();
    expect(lead!.clasificacion_eb).toBe('co_broke');
    expect(lead!.propiedad_id).toBe(propiedad1Id);
  });

  it('7e. clasificacion "cliente_directo": propiedad nuestra + contacto SIN tag "agente"', async () => {
    const cr = contactRequest(RUN + 8, {
      name: `${MARK} Lead Directo`,
      phone: null,
      email: `${RUN}-directo@sync.test`,
      property_id: `${MARK}-P1`,
      contact_id: 1002, // CONTACTOS[1002].tags no incluye "agente"
      source: 'Pincali',
      happened_at: '2026-08-02T18:30:00-06:00',
    });
    const r = await procesarContactRequests(svc, [cr], { agenciaId, obtenerContacto: obtenerContactoFixture });
    expect(r.errores).toEqual([]);
    expect(r.nuevos).toBe(1);
    expect(r.porClasificacion.clienteDirecto).toBe(1);

    const { data: lead, error } = await svc
      .from('leads')
      .select('clasificacion_eb')
      .eq('easybroker_id', String(RUN + 8))
      .single();
    expect(error).toBeNull();
    expect(lead!.clasificacion_eb).toBe('cliente_directo');
  });

  it('7f. si GET /v1/contacts falla, el lead se guarda SIN clasificar y el sync no truena', async () => {
    const cr = contactRequest(RUN + 9, {
      name: `${MARK} Lead ContactoFalla`,
      phone: null,
      email: `${RUN}-contactofalla@sync.test`,
      property_id: `${MARK}-P1`,
      contact_id: 9999, // no esta en CONTACTOS -> obtenerContactoFixture lanza
      source: 'Proppit by Lamudi',
      happened_at: '2026-08-02T18:45:00-06:00',
    });
    const r = await procesarContactRequests(svc, [cr], { agenciaId, obtenerContacto: obtenerContactoFixture });
    // La falla del contacto NO es un error del contact request: se sigue
    // procesando y creando el lead, solo sin clasificar.
    expect(r.errores).toEqual([]);
    expect(r.nuevos).toBe(1);
    expect(r.porClasificacion.sinClasificar).toBe(1);

    const { data: lead, error } = await svc
      .from('leads')
      .select('clasificacion_eb')
      .eq('easybroker_id', String(RUN + 9))
      .single();
    expect(error).toBeNull();
    expect(lead!.clasificacion_eb).toBeNull();
  });

  it('8. smoke: sincronizarEasyBroker contra staging real (cursores en "ahora", maxPaginas 1)', async () => {
    if (!process.env.EASYBROKER_BASE_URL || !process.env.EASYBROKER_API_KEY) {
      throw new Error('Faltan EASYBROKER_BASE_URL / EASYBROKER_API_KEY en .env.local');
    }
    // Cursores fijados a ahora: se ejercita el HTTP real + parsing del envelope
    // sin traer (ni insertar) el historico completo de staging.
    const ahora = new Date().toISOString();
    await avanzarCursor(svc, 'propiedades', ahora);
    await avanzarCursor(svc, 'leads', ahora);

    const resultado = await sincronizarEasyBroker(svc, { maxPaginas: 1 });

    expect(resultado.omitido).toBe(false);
    expect(resultado.errores).toEqual([]);
    // Tolerante: staging es un sandbox vivo; solo se exige consistencia interna.
    expect(resultado.propiedades.procesadas).toBeGreaterThanOrEqual(0);
    expect(resultado.propiedades.procesadas).toBe(
      resultado.propiedades.nuevas + resultado.propiedades.actualizadas
    );
    expect(resultado.leads.procesados).toBe(resultado.leads.nuevos + resultado.leads.duplicados);
    // maxPaginas:1 solo trae ~100 de ~1,474 listing_statuses reales: la pasada
    // es incompleta A PROPOSITO (asi se prueba sin traer todo staging), asi
    // que no debe evaluar bajas por ausencia (ver obtenerMapaEstatusEB).
    expect(resultado.estatus.catalogoCompleto).toBe(false);
    expect(resultado.estatus.ausentes).toBe(0);

    const { data: estados, error } = await svc
      .from('sync_estado')
      .select('recurso, ultimo_ok, ultimo_error')
      .in('recurso', ['propiedades', 'leads', 'estatus']);
    expect(error).toBeNull();
    expect(estados).toHaveLength(3);
    for (const estado of estados!) {
      expect(estado.ultimo_ok).not.toBeNull();
      expect(estado.ultimo_error).toBeNull();
    }
  });
});

describe('reconciliarEstatusPropiedades: activa deriva del estatus real (Supabase real)', () => {
  let p5Id: string;
  let p6Id: string;

  beforeAll(async () => {
    const { data, error } = await svc
      .from('propiedades')
      .insert([
        { agencia_id: agenciaId, easybroker_id: `${MARK}-P5`, titulo: `${MARK} propiedad P5` },
        { agencia_id: agenciaId, easybroker_id: `${MARK}-P6`, titulo: `${MARK} propiedad P6` },
      ])
      .select('id, easybroker_id');
    expect(error).toBeNull();
    // Recien insertadas: quedan en el default del esquema (estatus='published', activa=true).
    p5Id = data!.find((p) => p.easybroker_id === `${MARK}-P5`)!.id;
    p6Id = data!.find((p) => p.easybroker_id === `${MARK}-P6`)!.id;
  });

  afterAll(async () => {
    // Este describe es un suite HERMANO del de arriba: su afterAll (que borra
    // TEST-SYNC-% de propiedades) ya corrio antes de que este siquiera
    // empezara, asi que P5/P6 necesitan su propia limpieza aqui.
    if (!svc) return;
    await svc.from('propiedades').delete().in('easybroker_id', [`${MARK}-P5`, `${MARK}-P6`]);
  });

  it('published -> rented desactiva; propiedad ausente del catalogo tambien desactiva sin borrarla', async () => {
    const propiedades = [
      { id: p5Id, easybroker_id: `${MARK}-P5`, estatus: 'published', activa: true },
      { id: p6Id, easybroker_id: `${MARK}-P6`, estatus: 'published', activa: true },
    ];
    // P5 paso a 'rented' en EB; P6 ya no aparece en listing_statuses (se borro alla).
    const estatusPorId = new Map([[`${MARK}-P5`, 'rented']]);

    const r = await reconciliarEstatusPropiedades(svc, propiedades, estatusPorId, true);
    expect(r.errores).toEqual([]);
    expect(r.procesadas).toBe(2);
    expect(r.cambiosEstatus).toBe(1);
    expect(r.desactivadas).toBe(2);
    expect(r.ausentes).toBe(1);
    expect(r.reactivadas).toBe(0);

    const { data: filas } = await svc
      .from('propiedades')
      .select('easybroker_id, estatus, activa')
      .in('easybroker_id', [`${MARK}-P5`, `${MARK}-P6`]);
    const p5 = filas!.find((f) => f.easybroker_id === `${MARK}-P5`)!;
    const p6 = filas!.find((f) => f.easybroker_id === `${MARK}-P6`)!;
    expect(p5.estatus).toBe('rented');
    expect(p5.activa).toBe(false);
    // Ausente: NO se borra (puede estar referenciada por leads/seguimientos) y
    // NO se inventa un estatus nuevo -- solo se apaga `activa`.
    expect(p6.estatus).toBe('published');
    expect(p6.activa).toBe(false);
  });

  it('vuelve a published -> reactiva; la que sigue ausente permanece desactivada sin escrituras de mas', async () => {
    const propiedades = [
      { id: p5Id, easybroker_id: `${MARK}-P5`, estatus: 'rented', activa: false }, // estado tras el test anterior
      { id: p6Id, easybroker_id: `${MARK}-P6`, estatus: 'published', activa: false },
    ];
    const estatusPorId = new Map([[`${MARK}-P5`, 'published']]); // P6 sigue ausente

    const r = await reconciliarEstatusPropiedades(svc, propiedades, estatusPorId, true);
    expect(r.errores).toEqual([]);
    expect(r.cambiosEstatus).toBe(1);
    expect(r.reactivadas).toBe(1);
    expect(r.desactivadas).toBe(0); // P6 ya estaba inactiva: no hay escritura extra
    expect(r.ausentes).toBe(1);

    const { data: p5 } = await svc
      .from('propiedades')
      .select('estatus, activa')
      .eq('easybroker_id', `${MARK}-P5`)
      .single();
    expect(p5!.estatus).toBe('published');
    expect(p5!.activa).toBe(true);
  });

  it('catalogo incompleto (maxPaginas agotado o error a mitad de la paginacion): NO desactiva por ausencia', async () => {
    // Estado real tras el test anterior: P5 published/activa=true; P6 quedo
    // published/activa=false (nunca aparecio en un mapa, y en el test previo
    // ya estaba inactiva, asi que no hubo escritura).
    const propiedades = [
      { id: p5Id, easybroker_id: `${MARK}-P5`, estatus: 'published', activa: true },
      { id: p6Id, easybroker_id: `${MARK}-P6`, estatus: 'published', activa: false },
    ];
    // Solo P5 vino en esta pagina parcial de listing_statuses; P6 no aparecio,
    // pero con catalogoCompleto=false no hay forma de distinguir "no llegamos
    // a su pagina" de "ya no existe en EB" -> no se toca.
    const estatusPorId = new Map([[`${MARK}-P5`, 'suspended']]);

    const r = await reconciliarEstatusPropiedades(svc, propiedades, estatusPorId, false);
    expect(r.errores).toEqual([]);
    expect(r.cambiosEstatus).toBe(1); // P5 SI se actualiza: su estatus es cierto sin importar la paginacion
    expect(r.desactivadas).toBe(1); // solo P5 (suspended)
    expect(r.ausentes).toBe(0); // no se evalua ausencia con catalogo incompleto

    const { data: p6 } = await svc
      .from('propiedades')
      .select('estatus, activa')
      .eq('easybroker_id', `${MARK}-P6`)
      .single();
    // P6 no se toco en absoluto: conserva exactamente su estado de entrada.
    expect(p6!.estatus).toBe('published');
    expect(p6!.activa).toBe(false);
  });
});

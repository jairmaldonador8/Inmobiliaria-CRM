// Stub vacío de `server-only` para los tests de integración (entorno node,
// fuera de Next): el paquete real lanza al importarse sin bundler. Los tests
// unitarios lo mockean con vi.mock('server-only'); esta config lo resuelve
// vía alias para todo el grafo de módulos de integración.
export {}

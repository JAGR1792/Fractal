# ADR-0008: Experimento de render nuevo (rama `experimento_nuevo_render`)

## Estado
Experimental — no se fusiona a `dev` hasta el veredicto de la Fase 3.

## Contexto

El dibujo de planetas sufre parones y congelamientos que sobreviven a todos
los parches. El diagnóstico (ver `documentacion/arquitectura/renderizador.md`
§10 del experimento y el informe en la rama) localiza tres causas
estructurales, no una:

1. **Allocs en el camino caliente:** `new Float32Array` por cuadro, matrices
   nuevas por cuadro, una Hermite con copia por cuerpo y por punto de estela,
   `shift()` (memmove O(n)) por punto y `splice` (memmove O(n)) en cada poda.
   A alta velocidad el relleno de estelas multiplica ese costo: el frame se
   come su presupuesto de ~16 ms y se congela.
2. **Doble implementación ULTRA/LITE:** ~300 líneas calculando lo mismo con
   fórmulas que divergían en silencio (demo `0.002` vs `0.004`, `10/r` vs
   `12/r`, reloj que retrocedía en LITE y no en ULTRA).
3. **Demo falsa + fundidos:** círculo inventado que luego saltaba a la física
   real, con fundidos que ocultaban el salto en vez de eliminarlo.

La filosofía del proyecto manda: medir antes de optimizar (libro §1.3) y
eliminar mecanismos, no sumarlos.

## Decisión

Rama `experimento_nuevo_render` con tres cambios ya aplicados:

- **Fase 0 — Medición (`medicion.ts`):** anillo fijo de tiempos por cuadro
  (p50/p95/máx, parones > 50 ms), contadores de interpolaciones, bloques
  anexados, podas y bytes subidos. Overlay `#medicion` en la barra y
  `window.__fractalMedicion` para depurar a mano.
- **Fase 1 — Núcleo común (`nucleo-reproduccion.ts`):** único dueño del
  reloj, la fuente, el ritmo y los centros reutilizados (cero allocs).
  ULTRA y LITE solo dibujan. Sin demo ni fundidos: sin fuente el estado es
  `cargando` (diorama congelado, reloj en '—'). LITE espera el escenario
  antes del primer cuadro (N fijo, como ULTRA).
- **Anillo de estelas (`estelas.ts`, libro §3.3.7):** cola circular fija,
  empujar O(1) con tuplas recicladas, `aSegmentos` con scratch destino y
  `RaspaFlotantes` para la subida a GPU. Cero allocs en caliente estable.

Pendiente (siguiente paso del experimento):

- **Backend LITE con motor** (Three.js o Babylon, a decidir) detrás de la
  misma interfaz `Control`, alimentado por el mismo núcleo, para el test A/B:
  si el motor elimina los parones con el mismo feed, el problema era nuestro
  WebGL2; si persisten, está en el núcleo o los datos. Requiere decidir motor
  antes de instalar la dependencia.
- **Pools restantes:** matrices vista/proyección, `mundo` de explosiones y
  `aIntercalado` de chispas siguen creando por cuadro (anotado, no urgente:
  el overlay dirá si pesan).

## Consecuencias

### Ganamos
- Un solo lugar donde el reloj, el ritmo y el mapeo pueden estar mal.
- Números en vivo para decidir con evidencia, no con sensaciones.
- Camino caliente sin allocs en estelas y centros (lo más gordo).

### Perdemos / riesgos
- La rama diverge de `dev`: hay que rebasear antes de fusionar.
- `leerPosicionesActuales` copia (contrato viejo): aceptado, es camino frío.
- Sin fusión hasta el veredicto del motor: el experimento puede descartarse.

---

**Fecha:** 2026-10-14
**Decisores:** Jorge + Alya
**Relacionado:** `documentacion/arquitectura/renderizador.md`, ADR-0005, ADR-0007

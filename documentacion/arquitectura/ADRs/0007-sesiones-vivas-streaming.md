# ADR-0007: Sesiones vivas con cursor (streaming por polling)

## Estado
Aceptado.

## Contexto

El flujo por tramos (POST → esperar → descargar → loopear → re-sembrar)
acumulaba cinco mecanismos para fingir continuidad (ventanas, detector de
bucle, módulo, fundidos, prefetch) y cada re-sembrado inyectaba error de
energía, porque el empalme casi nunca cae en un nodo calculado. Ver
`documentacion/plan_continuidad.md`.

## Decisión

- **Sesión viva en el API:** `POST /api/v1/sesiones` crea una integración
  que nunca termina; integra por tandas bajo demanda y guarda anillo
  (tope 20000 estados). `GET /sesiones/:id/estados?desde=t` devuelve lo
  nuevo desde el cursor con `x-fractal-hasta`. `PATCH` cambia masas/dt/ε
  en caliente sobre la verdad del servidor. `DELETE` cierra. TTL 10 min
  sin lecturas + tope 64 sesiones LRU + recolector cada 60 s.
- **Mismo binario LE v1** para los bloques (reutiliza `codificar`).
- **Frontend por cursor:** polling ~1 s, añade, poda lo viejo de 3000 a 2000
  bloques. Editar masa/dt/ε = PATCH (cero error). Editar velocidades =
  bifurcación (único resembrado restante, explícito y visible).
- **Se borra:** `probarFuente`, `traerBinario`, `Fotogramas`, prefetch,
  sobrepedido, generaciones, `pasosParaDuracion`, `pasosContinuos`,
  grupos Duración/Modo del panel. El wrap de display sobre el bucle
  detectado se conserva (es solo presentación de una ventana con órbita
  completa, no física).

## Consecuencias

### Ganamos
- Cero error de empalme en el flujo normal; la verdad vive en un solo sitio.
- Test fuerte: sesión de K pasos idéntica a `simular()` de K pasos.
- Menos código cliente que con tramos.

### Perdemos
- Sesiones abandonadas consumen memoria hasta el TTL (acotado).
- El polling mete latencia de ~1 s + cómputo bajo demanda (sin prefetch).
- Polling, no WebSocket: se revisa si limita (Fase 3 del plan).

---
**Fecha:** 2026-10-12
**Relacionado:** `documentacion/plan_continuidad.md`, `codigo/api/src/sesion.rs`

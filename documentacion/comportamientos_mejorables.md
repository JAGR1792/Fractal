# Comportamientos mejorables — Fractal

Registro honesto de lo que hoy se nota mal en el render, con causa probable
y arreglo planeado. Actualizar cuando se verifique cada uno en vivo.

## 1. Reinicio visible del loop (T+ ~25 días)

**Qué se ve:** de golpe, los cuerpos saltan a otra posición y el ciclo vuelve
a empezar. Muy notorio mirando la Luna.

**Causas encadenadas:**
- Los fotogramas del servidor son una ventana FINITA (~206 bloques); al
  acabarse, el reproductor hacía módulo al bloque 0.
- La ventana por defecto cubre **0.985 órbitas** (`600×3900` = 2.337e6 s vs
  período lunar 2.372e6 s), así que el detector (`≥ 2π−0.05` = 99.2%) falla
  SIEMPRE y cae al último bloque: salto de ~5° por ciclo. Causa raíz medida.
- El encadenado al 80% siembra desde el estado actual (bien), pero hereda el
  mismo defecto en cada tramo nuevo; y si el cálculo tarda, el wrap le gana.
- La transición demo local → primera fuente también salta (círculo falso vs
  física real).

**Causa raíz del frenazo (2026-10-12, verificado en LITE):** el fundido de
1 s se aplicaba también en cada encadenado, aunque la semilla es el estado
actual exacto (sin salto que ocultar). Durante ese segundo la Luna se
arrastra hacia la foto vieja y luego suelta: a alta velocidad pasa mucho
tiempo sim y se ve como frenazo + cambio de órbita; a baja, solo frenazo.
Además la estela registraba posiciones fundidas (rizos fantasma).
**Arreglo:** fundido solo al Lanzar/montar; encadenados sin fundido; estela
con física cruda; interpolación Hermite (exacta en nodos) para resembrar sin
deriva de energía. Verificado con 33 tests web.

**Cómo reproducirlo:** `?perfil=ultra` con API en `:3000`, velocidad 1x,
mirar la Luna ~20 s hasta el salto.

## 2. Verlet se degrada con muchos cuerpos

**Qué se ve:** con N grande o encuentros cercanos, cuerpos expulsados a lo
loco o temblando sin sentido.

**Causa:** N-cuerpos directo O(N²) sin suavizado gravitacional (softening ε)
ni manejo de colisiones; `dt` fijo de 600 s es enorme para encuentros.

**Estado (2026-10-12):** suavizado implementado end-to-end (motor
`calcular_aceleraciones_suavizadas` + `paso_velocity_verlet_con` + validación
en API + control en el sandbox). Verificado con tests de conservación.
Queda: recomendar ε por defecto en la UI y `dt` adaptativo a futuro.

## 3. Estelas con huecos tras pausas largas

**Qué se ve:** al pausar mucho y reanudar, la estela une puntos lejanos en
el tiempo con una recta.

**Causa:** el anillo guarda posiciones sin marca temporal; al reanudar se
conecta el antes con el después.

**Arreglo aplicado (2026-10-12, rama `dev`):** cada punto de estela guarda
su marca temporal y `aSegmentos` corta el segmento si el salto supera 500 ms.
Tests: recta fantasma tras pausa de 10 s. Pendiente de verificación en vivo
(pausar 1 min y reanudar).

## 4. Transición demo → servidor

**Qué se ve:** al arrancar con API disponible, un salto único del círculo
falso a la física real a los ~2-4 s.

**Causa:** la demo arranca al instante; la fuente llega después y reemplaza.

**Arreglo aplicado (2026-10-12, rama `dev`):** al montar YA con servidor,
el fondo del fundido se siembra con el círculo demo (ULTRA y LITE): el primer
segundo interpola demo→física real en vez de saltar. Los encadenados ya
usaban fundido sin limpiar estelas. Pendiente de verificación en vivo
(arranque con API en `:3000`).

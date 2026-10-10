# Comportamientos mejorables — Fractal

Registro honesto de lo que hoy se nota mal en el render, con causa probable
y arreglo planeado. Actualizar cuando se verifique cada uno en vivo.

## 1. Reinicio visible del loop (T+ ~25 días)

**Qué se ve:** de golpe, los cuerpos saltan a otra posición y el ciclo vuelve
a empezar. Muy notorio mirando la Luna.

**Causas encadenadas:**
- Los fotogramas del servidor son una ventana FINITA (~206 bloques); al
  acabarse, el reproductor hacía módulo al bloque 0.
- La ventana cubre ~0.99 órbitas lunares, así que ni el detector de órbita
  completa (`detectarBucle`) cierra perfecto: queda un salto de ~1 bloque.
- El encadenado al 80% sembraba desde el ÚLTIMO bloque en vez del estado
  actual (corregido en `856cd0e`: ahora usa `leerBloqueActual`), pero si el
  cálculo tarda más que el 20% restante, igual se llega al final y se envuelve.
- La transición demo local → primera fuente también salta (círculo falso vs
  física real).

**Arreglo planeado:** precarga más temprana + tramos más largos (varias
órbitas por pedido), fundido de 1 s en el empalme, y transición demo→server
desde el círculo al estado real con interpolación.

**Cómo reproducirlo:** `?perfil=ultra` con API en `:3000`, velocidad 1x,
mirar la Luna ~20 s hasta el salto.

## 2. Verlet se degrada con muchos cuerpos

**Qué se ve:** con N grande o encuentros cercanos, cuerpos expulsados a lo
loco o temblando sin sentido.

**Causa:** N-cuerpos directo O(N²) sin suavizado gravitacional (softening ε)
ni manejo de colisiones; `dt` fijo de 600 s es enorme para encuentros.

**Arreglo planeado:** parámetro `suavizado` en el motor (`a = Gm/(r²+ε²)^1.5`),
expuesto en el API y el sandbox, con tests de conservación; a futuro `dt`
adaptativo y fusiones.

## 3. Estelas con huecos tras pausas largas

**Qué se ve:** al pausar mucho y reanudar, la estela une puntos lejanos en
el tiempo con una recta.

**Causa:** el anillo guarda posiciones sin marca temporal; al reanudar se
conecta el antes con el después.

**Arreglo planeado:** guardar `t` por punto y cortar el segmento si el salto
temporal supera el paso esperado.

## 4. Transición demo → servidor

**Qué se ve:** al arrancar con API disponible, un salto único del círculo
falso a la física real a los ~2-4 s.

**Causa:** la demo arranca al instante; la fuente llega después y reemplaza.

**Arreglo planeado:** arrancar pausado en el círculo hasta que llegue la
fuente, o interpolar demo→server en 1 s.

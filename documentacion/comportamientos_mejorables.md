# Comportamientos mejorables — Fractal

Registro honesto de lo que hoy se nota mal en el render, con causa probable
y arreglo planeado. Actualizar cuando se verifique cada uno en vivo.

## 1. Reinicio visible del loop (T+ ~25 días) — RESUELTO por diseño

**Qué se veía:** de golpe, los cuerpos saltaban a otra posición y el ciclo
volvía a empezar. Muy notorio mirando la Luna.

**Causas encadenadas:**
- Los fotogramas del servidor eran una ventana FINITA (~206 bloques); al
  acabarse, el reproductor hacía módulo al bloque 0.
- La ventana por defecto cubría **0.985 órbitas** (`600×3900` = 2.337e6 s vs
  período lunar 2.372e6 s), así que el detector (`≥ 2π−0.05` = 99.2%) fallaba
  SIEMPRE y caía al último bloque: salto de ~5° por ciclo. Causa raíz medida.
- El encadenado al 80% sembraba desde el estado actual (bien), pero heredaba el
  mismo defecto en cada tramo nuevo; y si el cálculo tardaba, el wrap le ganaba.
- La transición demo local → primera fuente también saltaba (círculo falso vs
  física real).

**Causa raíz del frenazo (2026-10-12, verificado en LITE):** el fundido de
1 s se aplicaba también en cada encadenado, aunque la semilla es el estado
actual exacto (sin salto que ocultar). Durante ese segundo la Luna se
arrastraba hacia la foto vieja y luego soltaba: a alta velocidad pasa mucho
tiempo sim y se veía como frenazo + cambio de órbita; a baja, solo frenazo.
Además la estela registraba posiciones fundidas (rizos fantasma).
**Arreglo:** fundido solo al Lanzar/montar; encadenados sin fundido; estela
con física cruda; interpolación Hermite (exacta en nodos) para resembrar sin
deriva de energía. Verificado con 33 tests web.

**Estado (ADR-0007):** obsoleto, no parcheado. La raíz era la pila de
mecanismos para fingir continuidad (ventana finita + detector + módulo +
fundidos + prefetch). El API ahora mantiene una **sesión viva** que integra
sin fin con cursor temporal y el frontend consume por cursor: **no hay fin que
reiniciar**, así que no hay reinicio que esconder. Se borraron `probarFuente`,
`traerBinario`, `Fotogramas`, prefetch, sobrepedido, generaciones,
`pasosParaDuracion` y `pasosContinuos`.

**Pendiente:** verificación en vivo de una sesión larga (> 1 órbita lunar) con
UI y API levantadas. El E2E de discontinuidad ya no aplica con ese nombre:
`saltoDeBucle` desapareció junto con el detector de bucle; lo que hay que
comprobar es que el cursor avanza monótono y que no hay salto de posición entre
sondeos consecutivos.

**Cómo reproducirlo (histórico):** `?perfil=ultra` con API en `:3000`,
velocidad 1x, mirar la Luna ~20 s hasta el salto.

## 2. El cursor del API se saltaba medio stream — RESUELTO

**Qué se veía:** el render avanzaba a tirones: se quedaba clavado en el borde
de lo recibido, y al llegar datos nuevos recorría de golpe un tramo enorme.
En ese tramo las posiciones de la estela quedaban muy separadas entre sí y se
dibujaban como una **recta atravesando la circunferencia** (la diagonal de las
capturas), no como la curva recorrida.

**Causa raíz (medida contra la API viva):** en `sesion.rs::leer_desde` el
servidor devolvía como `x-fractal-hasta` el tiempo de lo último **integrado**
en vez de lo último **entregado**. La integración va por delante a propósito
(ventana de precarga de `BLOQUES_POR_TANDA = 400` bloques), pero se entregan
`limite` (200 desde el frontend). El cliente usa `hasta` como cursor del
siguiente poll, así que **avanzaba por encima de bloques que nunca recibió**:

| `limite` | entregados | hueco del cursor | pérdida |
|----------|-----------|------------------|---------|
| 4        | 4         | 2 851 200 s      | 396/400 = **99%** |
| 200      | 200       | 2 400 000 s      | 200/400 = **50%** |

Con `limite = 200` se descartaba **la mitad de cada tanda**, y el render tenía
que rebobinar el hueco a velocidad de reproducción: un tramo de 2.4e6 s de
simulación en 20 s de pared.

**Arreglo (2026-10-13):** `hasta` pasa a ser el tiempo del último bloque
ENTREGADO (o `desde` si no se entregó ninguno), así que el cursor avanza
exactamente sobre lo recibido. Test de regresión
`el_cursor_no_se_salta_bloques_entregados` en `codigo/api/src/sesion.rs`, que
encadena varias vueltas y exige paso constante sin huecos ni repetidos.

**Verificado contra la API real:** antes, pidiendo de 4 en 4, las 6 vueltas
tenían un hueco de 2 851 200 s; después, las 6 vueltas encadenan con paso
exacto de 7200 s y **hueco 0**. Y los 1000 bloques recibidos tienen un único
`dt` (12 000 s), con desplazamiento `= v·dt` exacto (ratio 1.0000 en ambos
cuerpos): el stream no tiene discontinuidades.

> **Relacionado:** el tramo que se recorría de golpe durante el hueco dejaba
> las posiciones de la estela muy separadas entre sí, y esa separación se
> dibujaba como recta. Eliminado el hueco, queda la parte de §8 (la estela
> submuestrea la trayectoria a alta velocidad).

## 3. Verlet se degrada con muchos cuerpos

**Qué se ve:** con N grande o encuentros cercanos, cuerpos expulsados a lo
loco o temblando sin sentido.

**Causa:** N-cuerpos directo O(N²) sin suavizado gravitacional (softening ε)
ni manejo de colisiones; `dt` fijo de 600 s es enorme para encuentros.

**Estado (2026-10-12):** suavizado implementado end-to-end (motor
`calcular_aceleraciones_suavizadas` + `paso_velocity_verlet_con` + validación
en API + control en el sandbox). Verificado con tests de conservación.
Queda: recomendar ε por defecto en la UI y `dt` adaptativo a futuro.

## 4. Estelas con huecos tras pausas largas

**Qué se ve:** al pausar mucho y reanudar, la estela une puntos lejanos en
el tiempo con una recta.

**Causa:** el anillo guarda posiciones sin marca temporal; al reanudar se
conecta el antes con el después.

**Arreglo aplicado (2026-10-12, rama `dev`):** cada punto de estela guarda
su marca temporal y `aSegmentos` corta el segmento si el salto supera 500 ms.
Tests: recta fantasma tras pausa de 10 s.

**Arreglo de raíz (auditoría posterior):** el corte temporal NO cubría el caso
grave. Un teletransporte entre fotogramas consecutivos (~16 ms) pasaba el
filtro de 500 ms y se dibujaba como una **recta atravesando la pantalla y una
cúspide** (justo lo que se veía en vivo). Además la estela sobrevivía a un
cambio de vuelo: al bifurcar (editar velocidades) se sembraba una órbita nueva
sin romper el trazo, así que se unían dos órbitas distintas.

Ahora `aSegmentos` corta por tres motivos independientes:
1. **Hueco**: la separación entre dos puntos supera el paso de muestreo, así
   que entre ellos faltan muestras (ver §8: el paso es fijo y conocido).
2. **Época**: cada punto lleva la época del vuelo; `fijarFuente(…, limpiar=false)`
   la incrementa al resembrar. La posición puede ser continua, la física no.
3. **Salto espacial imposible**: un `RastreadorPasos` guarda la mediana de los
   últimos pasos de cada cuerpo y rechaza el que la supera 200×. Es relativo al
   propio movimiento, así que sirve a cualquier escala, `dt` o velocidad; un
   umbral absoluto no (el paso legítimo depende de todo eso).

Además LITE dibujaba la estela con su **propia lógica duplicada**
(`LINE_STRIP` sin cortes posibles); ahora usa la misma `aSegmentos` con
`gl.LINES`, así que los huecos son reales en ambos perfiles.

Tests: `estelas.test.ts` (hueco de un paso, teletransporte, cambio de época,
paso constante, independencia de los fps). Total web: 47 tests.

## 5. Transición demo → servidor

**Qué se ve:** al arrancar con API disponible, un salto único del círculo
falso a la física real a los ~2-4 s.

**Causa:** la demo arranca al instante; la fuente llega después y reemplaza.

**Arreglo aplicado (2026-10-12, rama `dev`):** al montar YA con servidor,
el fondo del fundido se siembra con el círculo demo (ULTRA y LITE): el primer
segundo interpola demo→física real en vez de saltar. Los encadenados ya
usaban fundido sin limpiar estelas. Pendiente de verificación en vivo
(arranque con API en `:3000`).

## 6. Frontera de reproducción sin guardas (auditoría posterior)

**Qué se veía:** el reloj podía saltar cuando la lista de bloques encogía
(poda) o llegaba una respuesta rancia: al retroceder el techo, `tiempoFuente`
se iba hacia atrás y **los cuerpos se teletransportaban hacia atrás**.

**Causa:** la aritmética de la frontera (`techo` = tercer bloque desde el
final, avance a ritmo fijo, recorte) vivía **duplicada inline** en ULTRA y
LITE, sin tests, y el techo se recalculaba cada fotograma desde la lista
actual: si la lista se acortaba, el techo bajaba.

**Arreglo:** módulo puro `aplicaciones/web/src/frontera.ts`, usado por ambos
renderers, con la guarda `techoVisto`: **el techo nunca retrocede** dentro de
una fuente. `reanclar` reinicia el reloj solo al cambiar de fuente (el tiempo
de una sesión no significa nada en otra). `instanteDe` recorta al techo y sube
al primer bloque disponible. 8 tests en `frontera.test.ts`, incluido el
"no da la vuelta al llegar al borde", que es el reinicio visible de §1.

## 7. Telemetría atada al primer cuerpo de la lista (auditoría posterior)

**Qué se veía:** la telemetría del sandbox asumía que el central era
`base[0]`. En el escenario real (Tierra–Luna, con la Tierra en el índice 0)
daba el resultado correcto, pero con cualquier escenario donde el cuerpo
elegido no orbite al primero (p. ej. la Luna en un Sol–Tierra–Luna) mostraba
`distancia`, `sma` y `período` referidos al cuerpo equivocado.

**Arreglo:** `cuerpoCentral` elige el central por **esfera de influencia**
de Laplace (`r_SOI = d·(m/M)^(2/5)`), entre los candidatos válidos el más
masivo. No vale "la fuerza que más atrae": la Tierra atrae a la Luna con
2.70e-3 m/s² y el Sol con 5.90e-3 m/s², así que por fuerza la Luna saldría
orbitando el Sol, cuando su distancia (384400 km) está dentro de la esfera de
influencia terrestre (~924540 km). Fallback al más masivo cuando no hay
candidato válido (sistema de dos cuerpos). Tests en `mecanica.test.ts`.

**Pendiente:** etiquetar en el panel que `sma` es el semieje **osculador**
(instantáneo), que oscila alrededor del valor medio: es lo que explica que en
vivo se vea 388.1k km mientras la distancia es 384.3k km.

## 8. La estela submuestreaba la trayectoria — RESUELTO

**Qué se veía:** cuando la reproducción iba rápida, la estela dibujaba **cuerdas
rectas** en vez de la curva recorrida. Era la otra mitad de la "recta a través
del círculo".

**Causa:** el render registraba un punto de estela cada 2 fotogramas **de
pared**, pero el reloj avanza en tiempo **sim** a `RITMO_SIM` (~120 000 s de
simulación por segundo de pared). Por tanto el espaciado de la estela en tiempo
sim crecía con la velocidad de reproducción: más velocidad, menos puntos por
órbita y más visible la cuerda.

**Medido con datos reales** (bloques cada 12 000 s, período lunar 2.36e6 s):
cada arista cubría del orden de **7° de órbita**. Y el guard espacial no la
cortaba: su margen es 200× el paso típico, así que una cuerda de ~20× el paso
(el caso real de un hueco) pasaba el filtro.

**Arreglo:** la estela se muestrea en **tiempo sim con paso fijo**
(`PASO_ESTELA_SIM = 12000` s, `RegistroEstela` en `estelas.ts`). El paso es
exactamente el de los bloques del servidor, y no por casualidad: la estela
reconstruye el tramo con Hermite cúbica, así que muestrear más fino que los
nodos no añade información (dibuja la misma curva con más vértices) y muestrear
más grueso sí pierde la curva. El resultado:

- La geometría de la estela **no depende de la velocidad ni de los fps**: hay
  un test que registra el mismo tramo a 20 000 s y a 200 000 s por fotograma y
  exige tiempos y aristas idénticos.
- A velocidad alta el registro **rellena los pasos intermedios** en vez de
  saltárselos; con un hueco enorme reancla para no bloquear el fotograma.
- El corte por hueco pasa a ser determinista (separación > paso), sin depender
  de temporizadores de pared.
- A 1x la estela cubre ~83 días de simulación (600 puntos × 12 000 s).

**Contrapartida honesta:** la estela ya no dura "20 s de pared" fijos, sino un
tramo fijo de tiempo sim. Es lo correcto para una trayectoria: su geometría es
estable en vez de cambiar con la velocidad de reproducción.

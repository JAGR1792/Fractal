/**
 * MOTOR: backend Three.js para el experimento A/B (ADR-0009).
 * Solo tras `?perfil=motor`. Desde cero, pero tras el núcleo común: mismos
 * números que ULTRA/LITE (mismo reloj, misma Hermite, mismo `cargando`
 * honesto, mismos contadores). Si con el motor los parones desaparecen con
 * el mismo feed, el problema era nuestro WebGL2; si son idénticos, es el
 * productor. Lo dice el overlay, no una opinión.
 *
 * Dibujo: una malla por cuerpo (N pequeño), `LineSegments` para estelas,
 * `Points` para estrellas y chispas. Cero allocs por cuadro: instancias,
 * matrices y buffers reutilizados; la cámara es la propia (`camara.ts`),
 * así que el encuadre y los controles son idénticos entre perfiles.
 */
import * as THREE from 'three'
import {
  anguloRotacion,
  aVisual,
  cargarEscenario,
  distanciaCamara,
  escalaMundo,
  tipoPlaneta,
  urlTextura,
  VELOCIDAD_ROTACION,
  type CuerpoVisual,
  type ModoEscala,
} from '../escenario'
import { camaraInicial, conectarControles, ojoDeCamara, type EstadoCamara } from '../camara'
import {
  aSegmentos,
  crearEstela,
  generarEstrellas,
  limpiarEstela,
  PASO_ESTELA_SIM,
  RegistroEstela,
  type Estela,
} from '../estelas'
import { NucleoReproduccion } from '../nucleo-reproduccion'
import { actualizar, aIntercalado, crearSistema, explotar, puedeExplotar } from '../particulas'
import { detectarImpactos } from '../mecanica'
import type { FuenteEstados } from '../api'
import type { FotoMedicion } from '../medicion'

export interface ControlMotor {
  alternarPausa: () => void
  fijarVelocidad: (v: number) => void
  /** Segundos sim por segundo de pared a 1x, según el escenario. */
  fijarRitmo: (ritmo: number) => void
  /** Ritmo de reproducción vigente. */
  leerRitmo: () => number
  seleccionar: (id: string | null) => void
  leerSeleccion: () => string | null
  /** Cambia la fuente (`limpiar=false` conserva estelas en encadenados). */
  fijarFuente: (f: FuenteEstados | null, limpiar?: boolean) => void
  /** Añade bloques del stream (sin resetear el reloj). */
  anexarBloques: (nuevos: Float32Array[]) => void
  /** Poda bloques con t < `mantenerDesde` (memoria acotada). */
  podar: (mantenerDesde: number) => void
  /** Segundos simulados (`NaN` en `cargando`: la barra pinta '—'). */
  leerTiempo: () => number
  leerBloqueActual: () => Float32Array | null
  leerPosicionesActuales: () => number[] | null
  /** Foto de rendimiento para el overlay. */
  leerMedicion: () => FotoMedicion
  destruir: () => void
}

/** Cuerpo demo si el escenario local falla (igual que LITE). */
function demoInicial(): CuerpoVisual[] {
  return aVisual({
    id: 'demo', nombre: 'Demo', descripcion: '', cuerpos: [
      { id: 'sol', nombre: 'Sol', masa: 1.989e30, radio: 6.957e8, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
      { id: 'tierra', nombre: 'Tierra', masa: 5.972e24, radio: 6.371e6, posicion: [1.496e11, 0, 0], velocidad: [0, 29780, 0] },
    ],
  })
}

export async function montarMotor(
  lienzo: HTMLCanvasElement,
  urlEscenario = '/datos/dos_cuerpos.json',
  fuente: FuenteEstados | null = null,
  periodoSim: number | null = null,
  modo: ModoEscala = 'exagerado',
): Promise<ControlMotor> {
  let visuales = demoInicial()
  try {
    visuales = aVisual(await cargarEscenario(urlEscenario), modo)
  } catch { /* sin escenario: demo interna */ }

  const render = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true })
  render.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1))
  const escena = new THREE.Scene()
  escena.background = new THREE.Color(0x08081a)
  const camara = new THREE.PerspectiveCamera(50, 1, 0.1, 2000)
  const cam: EstadoCamara = camaraInicial(distanciaCamara(visuales))
  const desconectar = conectarControles(lienzo, cam, () => undefined)

  // Luz equivalente a ULTRA: ambiente 0.35 + direccional (0.6, 0.8, 1.0).
  escena.add(new THREE.AmbientLight(0xffffff, 0.35))
  const solLuz = new THREE.DirectionalLight(0xffffff, 0.85)
  solLuz.position.set(0.6, 0.8, 1.0)
  escena.add(solLuz)

  // Planetas: una malla por cuerpo (N pequeño en este perfil). El Sol sin luz
  // (emissive honesto); el resto Standard con su textura NASA local.
  const cargador = new THREE.TextureLoader()
  const geoEsfera = new THREE.SphereGeometry(1, 24, 18)
  const mallas: THREE.Mesh[] = visuales.map((c) => {
    const url = urlTextura(c.id)
    const mat = tipoPlaneta(c.id) === 0
      ? new THREE.MeshBasicMaterial({ color: new THREE.Color(c.color[0], c.color[1], c.color[2]) })
      : new THREE.MeshStandardMaterial({ color: new THREE.Color(c.color[0], c.color[1], c.color[2]), roughness: 1, metalness: 0 })
    if (url) {
      const tex = cargador.load(url)
      tex.colorSpace = THREE.SRGBColorSpace
      // u invertida como en ULTRA/LITE: sin esto el este sale espejado.
      tex.wrapS = THREE.RepeatWrapping
      tex.repeat.x = -1
      mat.map = tex
      mat.needsUpdate = true
    }
    const malla = new THREE.Mesh(geoEsfera, mat)
    malla.scale.setScalar(Math.max(c.radioVisual, 1e-6))
    malla.userData.id = c.id
    escena.add(malla)
    return malla
  })

  // Núcleo común: el motor no calcula nada, solo dibuja lo que el núcleo dice.
  const semilla = new Float32Array(visuales.length * 4)
  {
    const e = escalaMundo(visuales)
    visuales.forEach((c, i) => {
      semilla[i * 4] = c.posicion[0] * e
      semilla[i * 4 + 1] = c.posicion[2] * e
      semilla[i * 4 + 2] = c.posicion[1] * e
    })
  }
  const nucleo = new NucleoReproduccion(visuales.length, periodoSim, fuente, semilla)
  /** Scratch reutilizado para el registro de estelas (cero allocs). */
  const raspaPos: [number, number, number] = [0, 0, 0]

  // Estrellas fijas (mismo generador determinista que los otros perfiles).
  {
    const nEstrellas = 800
    const pos = generarEstrellas(nEstrellas, 7, 900)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const colores = new Float32Array(nEstrellas * 3)
    for (let i = 0; i < nEstrellas; i++) {
      const b = 0.3 + 0.7 * (((i * 2654435761) >>> 0) / 4294967296)
      colores[i * 3] = 0.85 * b
      colores[i * 3 + 1] = 0.9 * b
      colores[i * 3 + 2] = 1.0 * b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colores, 3))
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.5, sizeAttenuation: false, vertexColors: true, transparent: true }))
    pts.frustumCulled = false
    escena.add(pts)
  }

  // Estelas: un `LineSegments` con buffers preasignados (anillo × 2 vértices).
  // El alpha por vértice no existe en el material: se hornea en el RGB
  // (fondo oscuro, equivalente visual al fundido).
  const LARGO_ESTELA = 600
  const estelas: Estela[] = visuales.map(() => crearEstela(LARGO_ESTELA))
  const registroEstela = new RegistroEstela(PASO_ESTELA_SIM, LARGO_ESTELA)
  const raspaSegs: number[][] = visuales.map(() => [])
  const maxVertsEstela = Math.max(visuales.length * LARGO_ESTELA * 2, 2)
  const posEstela = new Float32Array(maxVertsEstela * 3)
  const colEstela = new Float32Array(maxVertsEstela * 3)
  const geoEstela = new THREE.BufferGeometry()
  const attrPosEstela = new THREE.BufferAttribute(posEstela, 3)
  const attrColEstela = new THREE.BufferAttribute(colEstela, 3)
  attrPosEstela.setUsage(THREE.DynamicDrawUsage)
  attrColEstela.setUsage(THREE.DynamicDrawUsage)
  geoEstela.setAttribute('position', attrPosEstela)
  geoEstela.setAttribute('color', attrColEstela)
  const lineasEstela = new THREE.LineSegments(
    geoEstela,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true }),
  )
  lineasEstela.frustumCulled = false
  escena.add(lineasEstela)
  /** Época del vuelo (igual que ULTRA/LITE). */
  let epoca = 0

  // Chispas de explosión (mismo sistema que los otros perfiles).
  const chispas = crearSistema(800)
  const ultimasChispas = new Map<string, number>()
  const maxChispas = 800
  const posChispa = new Float32Array(maxChispas * 3)
  const colChispa = new Float32Array(maxChispas * 3)
  const geoChispa = new THREE.BufferGeometry()
  const attrPosChispa = new THREE.BufferAttribute(posChispa, 3)
  const attrColChispa = new THREE.BufferAttribute(colChispa, 3)
  attrPosChispa.setUsage(THREE.DynamicDrawUsage)
  attrColChispa.setUsage(THREE.DynamicDrawUsage)
  geoChispa.setAttribute('position', attrPosChispa)
  geoChispa.setAttribute('color', attrColChispa)
  const ptsChispa = new THREE.Points(
    geoChispa,
    new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true }),
  )
  ptsChispa.frustumCulled = false
  escena.add(ptsChispa)

  let pausado = false
  let velocidad = 1
  let vivo = true
  let seleccionado: string | null = null
  /** Cuerpo que la cámara persigue (clic lo fija, R o clic al vacío lo suelta). */
  let seguido: string | null = null
  /** Reloj propio de la rotación, en tiempo de pared escalado (no simulado). */
  let relojRotacion = 0
  let ultimoMs = performance.now()
  const tituloBase = document.title
  let cuadros = 0
  // Reutilizados por cuadro (cero allocs): matriz, vector y rayo del picking.
  const sonda = new THREE.Raycaster()
  const puntero = new THREE.Vector2()
  const aviso = document.getElementById('aviso')

  function avisarSeleccion(id: string | null): void {
    seleccionado = id
    seguido = id
    window.dispatchEvent(new CustomEvent('fractal-seleccion', { detail: { id } }))
  }

  function cuerpoBajoCursor(e: MouseEvent): string | null {
    const rect = lienzo.getBoundingClientRect()
    puntero.x = ((e.clientX - rect.left) / (rect.width || 1)) * 2 - 1
    puntero.y = -((e.clientY - rect.top) / (rect.height || 1)) * 2 + 1
    sonda.setFromCamera(puntero, camara)
    const impactos = sonda.intersectObjects(mallas, false)
    if (impactos.length === 0) return null
    const objeto = impactos[0].object
    const id = (objeto.userData as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }

  let downX = 0
  let downY = 0
  const alDown = (e: PointerEvent): void => {
    downX = e.clientX
    downY = e.clientY
  }
  const alClick = (e: MouseEvent): void => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return
    avisarSeleccion(cuerpoBajoCursor(e))
  }
  const alTecla = (e: KeyboardEvent): void => {
    if (e.key === 'r' || e.key === 'R') seguido = null
  }
  lienzo.addEventListener('pointerdown', alDown)
  lienzo.addEventListener('click', alClick)
  window.addEventListener('keydown', alTecla)

  function cuadro(): void {
    if (!vivo) return
    requestAnimationFrame(cuadro)
    const ahora = performance.now()
    const dtS = Math.min((ahora - ultimoMs) / 1000, 0.1)
    ultimoMs = ahora
    const w = lienzo.clientWidth || 800
    const h = lienzo.clientHeight || 600
    if (lienzo.width !== w || lienzo.height !== h) {
      render.setSize(w, h, false)
    }
    camara.aspect = (lienzo.width || w) / (lienzo.height || h)
    camara.updateProjectionMatrix()

    const estado = nucleo.avanzarCuadro(dtS, velocidad, pausado)
    const centros = nucleo.centros
    nucleo.medidor.sumarBytes(centros.byteLength)

    // Planetas: solo mover + girar (la geometría y el material no se tocan).
    if (!pausado) relojRotacion += dtS * VELOCIDAD_ROTACION
    visuales.forEach((c, i) => {
      const malla = mallas[i]
      malla.position.set(centros[i * 4], centros[i * 4 + 1], centros[i * 4 + 2])
      malla.rotation.y = anguloRotacion(c, relojRotacion)
    })

    // Explosiones por proximidad (radios visuales) con cooldown.
    if (!pausado) {
      const mundo: Array<[number, number, number]> = visuales.map((_v, i) => [
        centros[i * 4],
        centros[i * 4 + 1],
        centros[i * 4 + 2],
      ])
      const ahoraMs = performance.now()
      for (const golpe of detectarImpactos(mundo, visuales.map((v) => v.radioVisual))) {
        const clave = `${Math.min(golpe.a, golpe.b)}-${Math.max(golpe.a, golpe.b)}`
        if (puedeExplotar(ultimasChispas, clave, ahoraMs, 3000)) {
          explotar(chispas, golpe.punto, 150, 6)
        }
      }
      actualizar(chispas, Math.min(dtS, 0.1))
    }
    {
      const arr = aIntercalado(chispas)
      const nChispas = Math.min(arr.length / 7, maxChispas)
      for (let k = 0; k < nChispas; k++) {
        posChispa[k * 3] = arr[k * 7]
        posChispa[k * 3 + 1] = arr[k * 7 + 1]
        posChispa[k * 3 + 2] = arr[k * 7 + 2]
        const b = arr[k * 7 + 3]
        colChispa[k * 3] = arr[k * 7 + 4] * b
        colChispa[k * 3 + 1] = arr[k * 7 + 5] * b
        colChispa[k * 3 + 2] = arr[k * 7 + 6] * b
      }
      geoChispa.setDrawRange(0, nChispas)
      attrPosChispa.needsUpdate = true
      attrColChispa.needsUpdate = true
    }

    // Estelas: solo con fuente viva, muestreadas en tiempo SIM con paso fijo.
    if (!pausado && estado === 'vivo') {
      const tFuente = nucleo.tiempo
      visuales.forEach((_v, i) => {
        registroEstela.registrar(estelas[i], tFuente, epoca, (t) =>
          nucleo.posicionEn(t, i, raspaPos) ? raspaPos : null,
        )
      })
    }
    {
      let v = 0
      visuales.forEach((c, i) => {
        const e = estelas[i]
        if (!e || e.cantidad < 2) return
        const segs = raspaSegs[i]
        segs.length = 0
        aSegmentos(e, c.color, estado === 'vivo' ? PASO_ESTELA_SIM : 0, segs)
        for (let k = 0; k + 6 < segs.length && v < maxVertsEstela; k += 7) {
          const alpha = segs[k + 6]
          posEstela[v * 3] = segs[k]
          posEstela[v * 3 + 1] = segs[k + 1]
          posEstela[v * 3 + 2] = segs[k + 2]
          colEstela[v * 3] = segs[k + 3] * alpha
          colEstela[v * 3 + 1] = segs[k + 4] * alpha
          colEstela[v * 3 + 2] = segs[k + 5] * alpha
          v++
        }
      })
      geoEstela.setDrawRange(0, v)
      attrPosEstela.needsUpdate = true
      attrColEstela.needsUpdate = true
      nucleo.medidor.sumarBytes(v * 6 * 4)
    }

    // Seguimiento + cámara propia (idéntica a los otros perfiles).
    if (seguido !== null) {
      const i = visuales.findIndex((v) => v.id === seguido)
      if (i >= 0) {
        cam.objetivo = [centros[i * 4], centros[i * 4 + 1], centros[i * 4 + 2]]
      } else {
        seguido = null
      }
    }
    {
      const ojo = ojoDeCamara(cam)
      camara.position.set(ojo[0], ojo[1], ojo[2])
      camara.lookAt(cam.objetivo[0], cam.objetivo[1], cam.objetivo[2])
    }

    render.render(escena, camara)
    cuadros += 1
    nucleo.medidor.marco(performance.now() - ahora)
    if (cuadros === 30 && aviso && !aviso.dataset.error) {
      document.title = `${tituloBase} · MOTOR OK`
    }
  }
  requestAnimationFrame(cuadro)

  return {
    alternarPausa: () => { pausado = !pausado },
    fijarVelocidad: (v: number) => { velocidad = v },
    fijarRitmo: (r: number) => nucleo.fijarRitmo(r),
    leerRitmo: () => nucleo.leerRitmo(),
    seleccionar: (id: string | null) => { seleccionado = id },
    leerSeleccion: () => seleccionado,
    fijarFuente: (f: FuenteEstados | null, limpiar = true) => {
      nucleo.fijarFuente(f)
      registroEstela.reiniciar()
      if (limpiar) {
        for (const e of estelas) limpiarEstela(e)
      } else {
        epoca += 1
      }
    },
    leerTiempo: () => nucleo.leerTiempo(),
    leerBloqueActual: () => nucleo.leerBloqueActual(),
    leerMedicion: () => nucleo.medir(),
    anexarBloques: (nuevos: Float32Array[]) => { nucleo.anexarBloques(nuevos) },
    podar: (mantenerDesde: number) => { nucleo.podar(mantenerDesde) },
    leerPosicionesActuales: () => {
      const salida = nucleo.leerPosicionesSI(escalaMundo(visuales))
      return salida ? [...salida] : null
    },
    destruir: () => {
      vivo = false
      desconectar()
      lienzo.removeEventListener('pointerdown', alDown)
      lienzo.removeEventListener('click', alClick)
      window.removeEventListener('keydown', alTecla)
      escena.traverse((objeto) => {
        const malla = objeto as THREE.Mesh
        const material = malla.material as THREE.Material | undefined
        if (material) {
          const conMapa = material as THREE.MeshStandardMaterial
          conMapa.map?.dispose()
          material.dispose()
        }
        const geometria = (malla as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
        geometria?.dispose()
      })
      geoEsfera.dispose()
      render.dispose()
    },
  }
}

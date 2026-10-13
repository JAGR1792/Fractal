# Guía de Contribución — Fractal

¡Gracias por tu interés en contribuir! Esta guía explica cómo está organizado el proyecto, cómo escribir código que aceptemos, y cómo navegar la documentación.

## Índice

1. [Estructura del repositorio](#estructura-del-repositorio)
2. [Cómo empezar a contribuir](#cómo-empezar-a-contribuir)
3. [Estándares de código](#estándares-de-código)
4. [Documentación obligatoria](#documentación-obligatoria)
5. [Tests](#tests)
6. [Convención de commits](#convención-de-commits)
7. [Proceso de revisión](#proceso-de-revisión)
8. [Recursos para entender el proyecto](#recursos-para-entender-el-proyecto)

---

## Estructura del repositorio

```
Fractal/
├── codigo/                  ← Código fuente y sus tests (era `src/` en el plan inicial)
│   ├── fisica/              ← Motor gravitacional (biblioteca pura)
│   │   ├── src/             ← Vec3, cuerpo, gravedad, integrador, estado, métricas
│   │   ├── tests/           ← Tests científicos de física
│   │   └── benches/         ← Benchmarks (criterion)
│   ├── renderizado/         ← Interpolación y culling en Rust (WASM para ULTRA)
│   └── api/                 ← Servidor Axum
│       ├── src/             ← Rutas, modelos, almacén, binario, sesión
│       └── tests/           ← Tests de integración del API
├── aplicaciones/
│   └── web/                 ← Frontend TypeScript + Vite (sin framework de escena)
│       ├── src/             ← ULTRA (`ultra/`), LITE (`lite/`), sandbox, cámara
│       ├── src/**/*.test.ts ← Tests unitarios (vitest)
│       └── public/          ← Texturas NASA y copia servible de los escenarios
├── datos/
│   └── escenarios/          ← Escenarios JSON de referencia (fuente de verdad)
├── documentacion/
│   ├── cientifico/          ← Física, integración numérica, validación
│   ├── arquitectura/        ← Decisiones de diseño, ADRs, renderizador
│   ├── comportamientos_mejorables.md ← Lo que hoy se ve mal, con causa y arreglo
│   └── pasos_siguientes.md  ← Mapa vivo del proyecto
└── Cargo.toml               ← Workspace Rust (fisica, renderizado, api)
```

**Regla de oro:** el motor físico (`codigo/fisica/`) NO puede depender de Axum, Tokio, WebGPU, WebGL ni de ningún framework. Debe compilar y testearse solo.

---

## Cómo empezar a contribuir

### Si eres nuevo en Rust

1. Leer [The Rust Book](https://doc.rust-lang.org/book/) — capítulos 1-10
2. Entender `ownership`, `borrowing` y `lifetimes`
3. Familiarizarse con `Result<T, E>` y `Option<T>`

### Si eres nuevo en el proyecto

1. Leer `README.md` — visión general
2. Leer `documentacion/cientifico/modelo_gravitatorio.md` — qué simulamos
3. Leer `documentacion/cientifico/integrador_verlet.md` — cómo integramos
4. Correr los tests: `cargo test`

### Flujo de trabajo

```bash
# 1. Forkear y clonar
git clone https://github.com/JAGR1792/Fractal.git

# 2. Crear rama
git checkout -b contribucion/tu-funcionalidad

# 3. Hacer cambios + tests

# 4. Verificar calidad — Rust (mismos comandos que el CI)
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features

# 4b. Verificar calidad — Web (desde aplicaciones/web)
cd aplicaciones/web
npm run tipo      # tsc --noEmit
npm run lint      # eslint
npm test          # vitest run
npm run build     # tsc + vite build

# 5. Commit
git commit -m "tipo(alcance): descripcion corta"

# 6. Push y Pull Request
git push origin contribucion/tu-funcionalidad
```

> El CI corre **lo mismo** que esta lista. Si pasa en local con estos comandos,
> pasa en CI: no hay verificación oculta.

---

## Estándares de código

### Rust

| Herramienta | Comando | Qué verifica |
|-------------|---------|--------------|
| `rustfmt` | `cargo fmt --check` | Formato consistente |
| `clippy` | `cargo clippy -- -D warnings` | Buenas prácticas |
| `cargo test` | `cargo test` | Tests unitarios e integración |
| `cargo doc` | `cargo doc --no-deps` | Documentación compilable |

**Reglas adicionales:**

1. **Nombres en español:** variables, funciones y módulos usan español (`cuerpos`, `calcular_aceleraciones`, `paso_verlet`)
2. **Comentarios en español:** toda la documentación de código está en español
3. **Tipos explícitos:** evitar inferencia en funciones públicas
4. **Error handling:** usar `Result` o `Option`, nunca `unwrap()` en producción
5. **Sin `panic!`:** en código de biblioteca, retornar `Result` con error descriptivo

### TypeScript / Frontend

| Herramienta | Comando | Qué verifica |
|-------------|---------|--------------|
| `tsc` | `npm run tipo` | Tipos TypeScript |
| `eslint` | `npm run lint` | Estilo de código (config plana en `eslint.config.js`) |
| `vitest` | `npm test` | Tests unitarios |
| `vite` | `npm run build` | Que el bundle de producción se construye |

Todos se ejecutan desde `aplicaciones/web/`. El frontend es **TypeScript puro**
sobre DOM + WebGPU/WebGL2: no hay SFC, ni runtime de framework, ni plugin de
framework en `vite.config.ts`. Si necesitas estado reactivo, hazlo con funciones
y eventos explícitos, no añadiendo un framework (el render es el que manda).

### JSON (escenarios)

- Campos en español (`nombre`, `masa`, `posicion`, `velocidad`)
- Unidades SI siempre
- Comentarios en `nota` o `descripcion` del escenario

---

## Documentación obligatoria

Todo código nuevo DEBE incluir:

1. **Doc comment en la función:**

```rust
/// Calcula la aceleración gravitacional de cada cuerpo del sistema.
///
/// Implementa la sumatoria O(N²) directa:
/// a_i = Σ_{j≠i} G * m_j / |r_ij|³ * r_ij
///
/// # Argumentos
/// * `cuerpos` — slice de cuerpos con masa, posición y velocidad
///
/// # Retorna
/// * `Vec<Vec3>` — aceleración de cada cuerpo en m/s²
///
/// # Ejemplo
/// ```
/// use fractal_fisica::{Cuerpo, calcular_aceleraciones};
/// let cuerpos = vec![Cuerpo::sol(), Cuerpo::tierra()];
/// let a = calcular_aceleraciones(&cuerpos);
/// assert!(a[1].norma() > 0.0);
/// ```
```

2. **Entrada en `documentacion/`** si es una decisión de diseño nueva (ADR)

3. **Test** que demuestre el comportamiento correcto

---

## Tests

### Tests científicos (obligatorios)

```rust
// codigo/fisica/tests/cientificos.rs
#[test]
fn orbita_circular_dos_cuerpos_mantiene_distancia() {
    // Tierra-Luna con velocidad circular exacta
    // Verificar que |r(t)| permanece constante
}
```

**Propósito:** verificar que la física es correcta, no solo que "corre".

### Tests de integración

```rust
// codigo/api/tests/flujo_minimo.rs
#[tokio::test]
async fn crear_simulacion_devuelve_id_y_estado() {
    // POST /api/v1/simulaciones → 202
    // GET /api/v1/simulaciones/{id} → estado: "pendiente"
}
```

### Tests web

```ts
// aplicaciones/web/src/*.test.ts (vitest, sin navegador)
```

Los tests viven junto al crate o módulo que prueban: `codigo/*/tests/` para Rust
y `aplicaciones/web/src/**/*.test.ts` para el frontend. No hay carpeta `tests/`
en la raíz.

### Tests de rendimiento

```bash
cargo bench --bench rendimiento
```

**Propósito:** detectar regresiones de rendimiento automáticamente.

---

## Convención de commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/) en español:

```
tipo(alcance): descripción corta en español
```

| Tipo | Cuándo usarlo |
|------|---------------|
| `feat` | Nueva funcionalidad |
| `fix` | corrección de bug |
| `docs` | documentación |
| `test` | tests nuevos o corregidos |
| `refactor` | reestructura sin cambio de comportamiento |
| `perf` | mejora de rendimiento |
| `ci` | configuración de CI/CD |

**Ejemplos:**

```
feat(fisica): agregar integrador velocity verlet
fix(api): corregir timeout en simulaciones largas
docs(cientifico): explicar conservacion de energia
```

---

## Proceso de revisión

1. Abres un PR con descripción clara
2. CI corre automáticamente (fmt, clippy, tests)
3. Un revisor revisa el código
4. Se aprueba o se piden cambios
5. Se mergea a `main`

**Tiempos de respuesta:** intentamos revisar en 48 horas. Si es urgente, etiquetar el PR como `urgente`.

---

## Recursos para entender el proyecto

### Documentación científica

| Documento | Qué explica |
|-----------|-------------|
| `documentacion/cientifico/modelo_gravitatorio.md` | Ley de Newton, coordenadas, constantes, limitaciones |
| `documentacion/cientifico/integrador_verlet.md` | Velocity Verlet, convergencia, errores comunes |

### Documentación de arquitectura

| Documento | Qué explica |
|-----------|-------------|
| `documentacion/arquitectura/ADRs/` | Decisiones de diseño (Architecture Decision Records) |
| `documentacion/arquitectura/renderizador.md` | ULTRA/LITE, protocolos, umbrales de perfil |

### Documentación de API

| Documento | Qué explica |
|-----------|-------------|
| `documentacion/arquitectura/ADRs/0006-api-axum-tokio.md` | Contrato de endpoints, validación y límites |
| `documentacion/arquitectura/ADRs/0007-sesiones-vivas-streaming.md` | Sesiones con cursor: por qué no hay tramos |
| `codigo/api/src/rutas.rs` | Rutas reales del servidor (fuente de verdad) |

### Para docentes

| Documento | Qué explica |
|-----------|-------------|
| `documentacion/pasos_siguientes.md` | Etapa 5: qué material educativo está planificado |

> **Nota:** las guías para docentes de `documentacion/educativo/` todavía no
> existen; están planificadas en la Etapa 5 (`pasos_siguientes.md`).

---

## Preguntas frecuentes

**¿Puedo proponer un cambio en el modelo físico?**
Sí, pero abre un issue primero con la justificación científica. Los cambios en física requieren validación con tests.

**¿Qué pasa si rompo los tests científicos?**
No pasa nada, es para eso que están. Pero no puedes mergear hasta que pasen. CI lo bloquea automáticamente.

**¿Necesito saber Rust para contribuir al frontend?**
No. `aplicaciones/web/` es TypeScript puro (DOM + WebGPU/WebGL2), completamente independiente del motor.

**¿Cómo agrego un nuevo escenario?**
1. Crea el JSON en `datos/escenarios/` (esa carpeta es la fuente de verdad).
2. Cópialo a `aplicaciones/web/public/datos/`, que es lo que el navegador puede
   servir: el frontend hace `fetch('/datos/<archivo>.json')`.
3. Añade el caso a `aplicaciones/web/src/escenario.test.ts` para que la carga
   quede verificada.

> **Deuda conocida:** los escenarios viven duplicados (`datos/escenarios/` y
> `aplicaciones/web/public/datos/`) y hoy nada obliga a que coincidan. Si los
> editas, edita las dos copias; el test de escenarios es la red de seguridad.

---

¡Gracias por contribuir a Fractal! Cualquier duda, abre un issue o pregunta en las discusiones del repositorio.

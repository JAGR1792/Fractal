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
├── docs/
│   ├── cientifico/          ← Física, integración numérica, validación
│   ├── arquitectura/        ← Decisiones de diseño, ADRs
│   ├── api/                 ← Especificación de endpoints
│   └── educativo/           ← Guías para docentes y estudiantes
├── datos/
│   └── escenarios/          ← Escenarios JSON de referencia
├── codigo/                  ← Código fuente (Etapa 1+)
│   ├── fisica/              ← Motor gravitacional (biblioteca pura)
│   ├── renderizado/         ← Interpolación y culling en Rust (WASM para ULTRA)
│   ├── escenarios/          ← Carga y validación de escenarios
│   └── api/                 ← Servidor Axum
├── aplicaciones/
│   └── web/                 ← Frontend Vue 3 + TypeScript + Vite (ULTRA/LITE)
├── tests/
│   ├── cientificos/         ← Tests de física (sin servidor ni gráficos)
│   ├── integracion/         ← Tests de API + cliente
│   └── rendimiento/         ← Benchmarks (criterion)
└── documentacion/           ← Documentación general del proyecto
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

# 4. Verificar calidad
cargo fmt --check
cargo clippy -- -D warnings
cargo test

# 5. Commit
git commit -m "tipo(alcance): descripcion corta"

# 6. Push y Pull Request
git push origin contribucion/tu-funcionalidad
```

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

### Vue / TypeScript

| Herramienta | Comando | Qué verifica |
|-------------|---------|--------------|
| `vue-tsc` | `npx vue-tsc --noEmit` | Tipos TypeScript |
| `eslint` | `npx eslint .` | Estilo de código |
| `vitest` | `npx vitest run` | Tests unitarios |

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
// tests/cientificos/orbita_circular.rs
#[test]
fn orbita_circular_dos_cuerpos_conradio_constante() {
    // Tierra-Luna con velocidad circular exacta
    // Verificar que |r(t)| permanece constante
}
```

**Propósito:** verificar que la física es correcta, no solo que "corre".

### Tests de integración

```bash
# tests/api/simulacion.rs
#[tokio::test]
async fn crear_simulacion_devuelve_id_y_estado() {
    // POST /api/v1/simulations → 202
    // GET /api/v1/simulations/{id} → status: "pending"
}
```

### Tests de rendimiento

```bash
cargo bench --bench sistema_solar
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
| `documentacion/arquitectura/modulos.md` | Separación de responsabilidades |

### Para docentes

| Documento | Qué explica |
|-----------|-------------|
| `documentacion/educativo/guia.md` | Cómo usar Fractal en clase |
| `documentacion/educativo/experimentos.md` | Experimentos sugeridos |

---

## Preguntas frecuentes

**¿Puedo proponer un cambio en el modelo físico?**
Sí, pero abre un issue primero con la justificación científica. Los cambios en física requieren validación con tests.

**¿Qué pasa si rompo los tests científicos?**
No pasa nada, es para eso que están. Pero no puedes mergear hasta que pasen. CI lo bloquea automáticamente.

**¿Necesito saber Rust para contribuir al frontend?**
No. `apps/web/` es Vue + TypeScript, completamente independiente del motor.

**¿Cómo agrego un nuevo escenario?**
Crea un JSON en `datos/escenarios/` con el formato documentado y un test que verifique que carga correctamente.

---

¡Gracias por contribuir a Fractal! Cualquier duda, abre un issue o pregunta en las discusiones del repositorio.

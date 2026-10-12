//! Rutas Axum de la Etapa 3: salud + CRUD mínimo de simulaciones.
//!
//! El cálculo pesado (`simular`) corre en `spawn_blocking` para no bloquear
//! el loop async. Los handlers nunca usan `unwrap` en producción:
//! todo fallo se convierte en JSON con mensaje en español.

use crate::{
    almacen::Almacen,
    binario::{VERSION_BINARIO, codificar},
    modelos::{
        ErrorApi, EstadoSimulacion, InfoSalud, PeticionSimulacion, RespuestaCreacion,
        RespuestaEstados,
    },
    sesion::{CambiosSesion, Sesiones},
};
use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, patch, post},
};
use fractal_fisica::estado::simular_con;
use serde::Deserialize;
use uuid::Uuid;

/// Error de la API convertido a JSON + status correcto.
struct FalloApi {
    /// Código HTTP a devolver.
    codigo: StatusCode,
    /// Mensaje en español para el frontend.
    mensaje: String,
}

impl IntoResponse for FalloApi {
    fn into_response(self) -> Response {
        let cuerpo = Json(ErrorApi { error: self.mensaje });
        (self.codigo, cuerpo).into_response()
    }
}

/// Parámetros de paginación para `GET /:id/estados`.
#[derive(Debug, Deserialize)]
struct Paginacion {
    /// Índice inicial (0 por defecto).
    #[serde(default)]
    desde: usize,
    /// Cuántos estados devolver (100 por defecto, máx 10 000).
    #[serde(default = "limite_por_defecto")]
    limite: usize,
}

/// Valor por defecto de `limite` en la query.
fn limite_por_defecto() -> usize {
    100
}

/// Estado compartido del servidor (jobs finitos + sesiones vivas).
#[derive(Debug, Clone)]
struct EstadoApp {
    almacen: Almacen,
    sesiones: Sesiones,
}

/// Crea el router con los almacenes compartidos.
pub fn crear_app(almacen: Almacen, sesiones: Sesiones) -> Router {
    let estado = EstadoApp { almacen, sesiones };
    Router::new()
        .route("/salud", get(salud))
        .route("/api/v1/simulaciones", post(crear_simulacion))
        .route("/api/v1/simulaciones/:id", get(leer_simulacion))
        .route("/api/v1/simulaciones/:id/estados", get(leer_estados))
        .route("/api/v1/simulaciones/:id/binario", get(leer_binario))
        .route("/api/v1/sesiones", post(crear_sesion))
        .route("/api/v1/sesiones/:id", patch(actualizar_sesion).delete(cerrar_sesion))
        .route("/api/v1/sesiones/:id/estados", get(leer_sesion))
        .with_state(estado)
}

/// `GET /salud` — chequeo de vida para el frontend y el CI.
async fn salud() -> Json<InfoSalud> {
    Json(InfoSalud { estado: "bien".to_string(), version: env!("CARGO_PKG_VERSION").to_string() })
}

/// `POST /api/v1/simulaciones` — valida, reserva id y lanza background (202).
async fn crear_simulacion(
    State(estado): State<EstadoApp>,
    Json(peticion): Json<PeticionSimulacion>,
) -> Result<impl IntoResponse, FalloApi> {
    peticion.validar().map_err(|mensaje| FalloApi { codigo: StatusCode::BAD_REQUEST, mensaje })?;

    let id = estado.almacen.reservar(peticion.clone()).await;
    lanzar_calculo(estado.almacen.clone(), id, peticion);

    let respuesta = Json(RespuestaCreacion { id, estado: EstadoSimulacion::Pendiente });
    Ok((StatusCode::ACCEPTED, respuesta))
}

/// Dispara el cálculo en background sin bloquear la respuesta 202.
fn lanzar_calculo(almacen: Almacen, id: Uuid, peticion: PeticionSimulacion) {
    tokio::spawn(async move {
        almacen.marcar_corriendo(&id).await;
        let cuerpos = peticion.cuerpos.clone();
        let (dt, pasos, cada_n, suavizado) =
            (peticion.dt, peticion.pasos, peticion.cada_n, peticion.suavizado);
        let resultado = tokio::task::spawn_blocking(move || {
            simular_con(&cuerpos, dt, pasos, cada_n, suavizado)
        })
        .await;
        match resultado {
            Ok(historial) => almacen.completar(&id, historial).await,
            Err(fallo) => almacen.fallar(&id, &format!("el cálculo fue cancelado: {fallo}")).await,
        }
    });
}

/// `GET /api/v1/simulaciones/:id` — ficha con estado y progreso.
async fn leer_simulacion(
    State(estado): State<EstadoApp>,
    Path(id): Path<Uuid>,
) -> Result<Json<crate::modelos::InfoSimulacion>, FalloApi> {
    estado.almacen.info(&id).await.map(Json).ok_or(FalloApi {
        codigo: StatusCode::NOT_FOUND,
        mensaje: "simulación no encontrada".to_string(),
    })
}

/// `GET /api/v1/simulaciones/:id/estados?desde=&limite=` — historial paginado.
async fn leer_estados(
    State(estado): State<EstadoApp>,
    Path(id): Path<Uuid>,
    Query(paginacion): Query<Paginacion>,
) -> Result<Json<RespuestaEstados>, FalloApi> {
    match estado.almacen.estados(&id, paginacion.desde, paginacion.limite).await {
        Some((estado, estados)) => {
            Ok(Json(RespuestaEstados { id, estado, desde: paginacion.desde, estados }))
        }
        None => Err(FalloApi {
            codigo: StatusCode::NOT_FOUND,
            mensaje: "simulación no encontrada".to_string(),
        }),
    }
}

/// `GET /api/v1/simulaciones/:id/binario?desde=&limite=` — bloques f32 LE.
///
/// Cuerpo: bloques concatenados `[t, x,y,z,vx,vy,vz × N]` en little-endian.
/// Cabeceras `x-fractal-*` describen el layout para `binario.ts`.
async fn leer_binario(
    State(estado): State<EstadoApp>,
    Path(id): Path<Uuid>,
    Query(paginacion): Query<Paginacion>,
) -> Result<Response, FalloApi> {
    let Some((_, n_cuerpos, bloques)) =
        estado.almacen.rango(&id, paginacion.desde, paginacion.limite).await
    else {
        return Err(FalloApi {
            codigo: StatusCode::NOT_FOUND,
            mensaje: "simulación no encontrada".to_string(),
        });
    };
    let cuerpo = codificar(&bloques, n_cuerpos);
    Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/octet-stream")
        .header("x-fractal-version", VERSION_BINARIO.to_string())
        .header("x-fractal-cuerpos", n_cuerpos.to_string())
        .header("x-fractal-bloques", bloques.len().to_string())
        .header("x-fractal-desde", paginacion.desde.to_string())
        .body(Body::from(cuerpo))
        .map_err(|_| FalloApi {
            codigo: StatusCode::INTERNAL_SERVER_ERROR,
            mensaje: "no se pudo armar la respuesta binaria".to_string(),
        })
}

/// Parámetros de cursor para `GET /sesiones/:id/estados`.
#[derive(Debug, Deserialize)]
struct Cursor {
    /// Tiempo simulado desde el que se quiere leer (0 por defecto).
    #[serde(default)]
    desde: f64,
    /// Cuántos bloques como máximo (200 por defecto, máx 2000).
    #[serde(default = "limite_sesion_por_defecto")]
    limite: usize,
}

/// Valor por defecto de `limite` en sesiones.
fn limite_sesion_por_defecto() -> usize {
    200
}

/// `POST /api/v1/sesiones` — crea una sesión viva (201).
async fn crear_sesion(
    State(estado): State<EstadoApp>,
    Json(peticion): Json<PeticionSimulacion>,
) -> Result<impl IntoResponse, FalloApi> {
    peticion.validar().map_err(|mensaje| FalloApi { codigo: StatusCode::BAD_REQUEST, mensaje })?;
    let n = peticion.cuerpos.len();
    let id = estado.sesiones.crear(peticion).await;
    let respuesta = Json(serde_json::json!({ "id": id, "cuerpos": n }));
    Ok((StatusCode::CREATED, respuesta))
}

/// `GET /api/v1/sesiones/:id/estados?desde=&limite=` — binario desde el cursor.
///
/// Integra bajo demanda lo que falte. Cabecera `x-fractal-hasta` con el
/// último tiempo disponible (el cursor del próximo poll).
async fn leer_sesion(
    State(estado): State<EstadoApp>,
    Path(id): Path<Uuid>,
    Query(cursor): Query<Cursor>,
) -> Result<Response, FalloApi> {
    if !cursor.desde.is_finite() || cursor.desde < 0.0 {
        return Err(FalloApi {
            codigo: StatusCode::BAD_REQUEST,
            mensaje: "desde debe ser ≥ 0 y finito".to_string(),
        });
    }
    match estado.sesiones.leer_desde(&id, cursor.desde, cursor.limite).await {
        Some((bloques, hasta)) => {
            let n = bloques.first().map(|e| e.cuerpos.len()).unwrap_or(0);
            let cuerpo = codificar(&bloques, n);
            Response::builder()
                .status(StatusCode::OK)
                .header("content-type", "application/octet-stream")
                .header("x-fractal-version", VERSION_BINARIO.to_string())
                .header("x-fractal-cuerpos", n.to_string())
                .header("x-fractal-bloques", bloques.len().to_string())
                .header("x-fractal-hasta", hasta.to_string())
                .body(Body::from(cuerpo))
                .map_err(|_| FalloApi {
                    codigo: StatusCode::INTERNAL_SERVER_ERROR,
                    mensaje: "no se pudo armar la respuesta binaria".to_string(),
                })
        }
        None => Err(FalloApi {
            codigo: StatusCode::NOT_FOUND,
            mensaje: "sesión no encontrada o caducada".to_string(),
        }),
    }
}

/// `PATCH /api/v1/sesiones/:id` — cambia masas/dt/suavizado en caliente.
async fn actualizar_sesion(
    State(estado): State<EstadoApp>,
    Path(id): Path<Uuid>,
    Json(cambios): Json<CambiosSesion>,
) -> Result<impl IntoResponse, FalloApi> {
    cambios.validar().map_err(|mensaje| FalloApi { codigo: StatusCode::BAD_REQUEST, mensaje })?;
    match estado.sesiones.actualizar(&id, &cambios).await {
        Some(()) => Ok(Json(serde_json::json!({ "id": id }))),
        None => Err(FalloApi {
            codigo: StatusCode::NOT_FOUND,
            mensaje: "sesión no encontrada o caducada".to_string(),
        }),
    }
}

/// `DELETE /api/v1/sesiones/:id` — cierra la sesión (204).
async fn cerrar_sesion(
    State(estado): State<EstadoApp>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, FalloApi> {
    if estado.sesiones.cerrar(&id).await {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(FalloApi {
            codigo: StatusCode::NOT_FOUND,
            mensaje: "sesión no encontrada o caducada".to_string(),
        })
    }
}

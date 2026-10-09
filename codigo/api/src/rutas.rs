//! Rutas Axum de la Etapa 3: salud + CRUD mínimo de simulaciones.
//!
//! El cálculo pesado (`simular`) corre en `spawn_blocking` para no bloquear
//! el loop async. Los handlers nunca usan `unwrap` en producción:
//! todo fallo se convierte en JSON con mensaje en español.

use crate::{
    almacen::Almacen,
    modelos::{
        ErrorApi, EstadoSimulacion, InfoSalud, PeticionSimulacion, RespuestaCreacion,
        RespuestaEstados,
    },
};
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use fractal_fisica::estado::simular;
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

/// Crea el router con el almacén compartido.
pub fn crear_app(almacen: Almacen) -> Router {
    Router::new()
        .route("/salud", get(salud))
        .route("/api/v1/simulaciones", post(crear_simulacion))
        .route("/api/v1/simulaciones/:id", get(leer_simulacion))
        .route("/api/v1/simulaciones/:id/estados", get(leer_estados))
        .with_state(almacen)
}

/// `GET /salud` — chequeo de vida para el frontend y el CI.
async fn salud() -> Json<InfoSalud> {
    Json(InfoSalud { estado: "bien".to_string(), version: env!("CARGO_PKG_VERSION").to_string() })
}

/// `POST /api/v1/simulaciones` — valida, reserva id y lanza background (202).
async fn crear_simulacion(
    State(almacen): State<Almacen>,
    Json(peticion): Json<PeticionSimulacion>,
) -> Result<impl IntoResponse, FalloApi> {
    peticion.validar().map_err(|mensaje| FalloApi { codigo: StatusCode::BAD_REQUEST, mensaje })?;

    let id = almacen.reservar(peticion.clone()).await;
    lanzar_calculo(almacen.clone(), id, peticion);

    let respuesta = Json(RespuestaCreacion { id, estado: EstadoSimulacion::Pendiente });
    Ok((StatusCode::ACCEPTED, respuesta))
}

/// Dispara el cálculo en background sin bloquear la respuesta 202.
fn lanzar_calculo(almacen: Almacen, id: Uuid, peticion: PeticionSimulacion) {
    tokio::spawn(async move {
        almacen.marcar_corriendo(&id).await;
        let cuerpos = peticion.cuerpos.clone();
        let (dt, pasos, cada_n) = (peticion.dt, peticion.pasos, peticion.cada_n);
        let resultado =
            tokio::task::spawn_blocking(move || simular(&cuerpos, dt, pasos, cada_n)).await;
        match resultado {
            Ok(historial) => almacen.completar(&id, historial).await,
            Err(fallo) => almacen.fallar(&id, &format!("el cálculo fue cancelado: {fallo}")).await,
        }
    });
}

/// `GET /api/v1/simulaciones/:id` — ficha con estado y progreso.
async fn leer_simulacion(
    State(almacen): State<Almacen>,
    Path(id): Path<Uuid>,
) -> Result<Json<crate::modelos::InfoSimulacion>, FalloApi> {
    almacen.info(&id).await.map(Json).ok_or(FalloApi {
        codigo: StatusCode::NOT_FOUND,
        mensaje: "simulación no encontrada".to_string(),
    })
}

/// `GET /api/v1/simulaciones/:id/estados?desde=&limite=` — historial paginado.
async fn leer_estados(
    State(almacen): State<Almacen>,
    Path(id): Path<Uuid>,
    Query(paginacion): Query<Paginacion>,
) -> Result<Json<RespuestaEstados>, FalloApi> {
    match almacen.estados(&id, paginacion.desde, paginacion.limite).await {
        Some((estado, estados)) => {
            Ok(Json(RespuestaEstados { id, estado, desde: paginacion.desde, estados }))
        }
        None => Err(FalloApi {
            codigo: StatusCode::NOT_FOUND,
            mensaje: "simulación no encontrada".to_string(),
        }),
    }
}

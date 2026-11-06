//! Binario worker para cómputo distribuido.

use axum::{
    Json, Router,
    routing::{get, post},
};
use tower_http::cors::CorsLayer;

#[derive(Clone, Default)]
struct EstadoWorker {}

async fn salud() -> Json<serde_json::Value> {
    Json(serde_json::json!({"estado": "bien", "rol": "worker"}))
}

#[derive(serde::Deserialize)]
struct PeticionFuerzas {
    cuerpos: Vec<fractal_fisica::cuerpo::Cuerpo>,
    indices: Vec<usize>,
    #[serde(default)]
    suavizado: f64,
}

#[derive(serde::Serialize)]
struct RespuestaFuerzas {
    aceleraciones: Vec<[f64; 3]>,
}

async fn fuerzas(Json(peticion): Json<PeticionFuerzas>) -> Json<RespuestaFuerzas> {
    let todas = fractal_fisica::gravedad::calcular_aceleraciones_suavizadas(
        &peticion.cuerpos,
        peticion.suavizado,
    );
    let resultado: Vec<[f64; 3]> = peticion
        .indices
        .iter()
        .map(|&i| {
            let a = todas[i];
            [a.x, a.y, a.z]
        })
        .collect();
    Json(RespuestaFuerzas { aceleraciones: resultado })
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/salud", get(salud))
        .route("/fuerzas", post(fuerzas))
        .layer(CorsLayer::permissive())
        .with_state(EstadoWorker::default());

    let puerto: u16 = std::env::var("PUERTO").ok().and_then(|t| t.parse().ok()).unwrap_or(3001);
    let direccion = format!("127.0.0.1:{puerto}");
    let oyente = tokio::net::TcpListener::bind(&direccion).await.unwrap();
    println!("fractal-worker escuchando en http://{direccion}");
    axum::serve(oyente, app).await.unwrap();
}

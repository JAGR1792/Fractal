//! Binario del servidor Fractal (Etapa 3).
//!
//! Escucha en `127.0.0.1:3000` por defecto (`PUERTO` lo cambia).
//! Permite CORS abierto para que Vite (`:5173`) llame en desarrollo.

use fractal_api::{almacen::Almacen, crear_app};
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().with_env_filter("fractal_api=debug,tower_http=info").init();

    let almacen = Almacen::nuevo();
    let app = crear_app(almacen).layer(CorsLayer::permissive());

    let puerto: u16 =
        std::env::var("PUERTO").ok().and_then(|texto| texto.parse().ok()).unwrap_or(3000);
    let direccion = format!("127.0.0.1:{puerto}");
    let oyente = tokio::net::TcpListener::bind(&direccion).await?;
    tracing::info!("fractal-api escuchando en http://{direccion}");
    axum::serve(oyente, app).await?;
    Ok(())
}

//! Flujo mínimo de la Etapa 3: salud → crear → leer → estados.
//!
//! Usa `axum-test` contra el router en memoria (sin puerto real).

use axum_test::TestServer;
use fractal_api::{almacen::Almacen, crear_app, modelos::PeticionSimulacion};
use fractal_fisica::{cuerpo::Cuerpo, vector::Vec3};
use serde_json::Value;

fn peticion_dos_cuerpos() -> PeticionSimulacion {
    PeticionSimulacion {
        cuerpos: vec![
            Cuerpo::nuevo("tierra", "Tierra", 5.972e24, 6.371e6, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo(
                "luna",
                "Luna",
                7.342e22,
                1.737e6,
                Vec3::new(3.844e8, 0.0, 0.0),
                Vec3::new(0.0, 1022.0, 0.0),
            ),
        ],
        dt: 600.0,
        pasos: 12,
        cada_n: 6,
    }
}

#[tokio::test]
async fn salud_responde_bien() {
    let servidor = TestServer::new(crear_app(Almacen::nuevo())).unwrap();
    let respuesta = servidor.get("/salud").await;
    respuesta.assert_status_ok();
    let cuerpo: Value = respuesta.json();
    assert_eq!(cuerpo["estado"], "bien");
}

#[tokio::test]
async fn crear_y_leer_simulacion() {
    let servidor = TestServer::new(crear_app(Almacen::nuevo())).unwrap();

    let crear = servidor.post("/api/v1/simulaciones").json(&peticion_dos_cuerpos()).await;
    crear.assert_status(axum::http::StatusCode::ACCEPTED);
    let creada: Value = crear.json();
    let id = creada["id"].as_str().unwrap().to_string();

    // Esperar a que el background termine (cálculo tiny: 12 pasos).
    let mut intentos = 0;
    let info: Value = loop {
        intentos += 1;
        let respuesta = servidor.get(&format!("/api/v1/simulaciones/{id}")).await;
        respuesta.assert_status_ok();
        let info: Value = respuesta.json();
        if info["estado"] == "completada" || intentos >= 50 {
            break info;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    };
    assert_eq!(info["estado"], "completada");
    assert!(info["total_estados"].as_u64().unwrap() >= 3);

    let estados =
        servidor.get(&format!("/api/v1/simulaciones/{id}/estados?desde=0&limite=10")).await;
    estados.assert_status_ok();
    let pagina: Value = estados.json();
    assert_eq!(pagina["estados"].as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn rechaza_peticion_invalida() {
    let servidor = TestServer::new(crear_app(Almacen::nuevo())).unwrap();
    let mala = PeticionSimulacion { cuerpos: vec![], dt: -1.0, pasos: 0, cada_n: 0 };
    servidor.post("/api/v1/simulaciones").json(&mala).await.assert_status_bad_request();
}

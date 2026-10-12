//! Flujo mínimo de la Etapa 3: salud → crear → leer → estados.
//!
//! Usa `axum-test` contra el router en memoria (sin puerto real).

use axum_test::TestServer;
use fractal_api::{almacen::Almacen, crear_app, modelos::PeticionSimulacion, sesion::Sesiones};
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
        suavizado: 0.0,
    }
}

#[tokio::test]
async fn salud_responde_bien() {
    let servidor = TestServer::new(crear_app(Almacen::nuevo(), Sesiones::nuevo())).unwrap();
    let respuesta = servidor.get("/salud").await;
    respuesta.assert_status_ok();
    let cuerpo: Value = respuesta.json();
    assert_eq!(cuerpo["estado"], "bien");
}

#[tokio::test]
async fn crear_y_leer_simulacion() {
    let servidor = TestServer::new(crear_app(Almacen::nuevo(), Sesiones::nuevo())).unwrap();

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

    // Binario: 3 bloques × (1 + 2×6) f32 × 4 bytes, con cabeceras del protocolo.
    let bin = servidor.get(&format!("/api/v1/simulaciones/{id}/binario?desde=0&limite=10")).await;
    bin.assert_status_ok();
    let cabeceras = bin.headers();
    let texto = |nombre: &str| cabeceras[nombre].to_str().unwrap().to_string();
    assert_eq!(texto("content-type"), "application/octet-stream");
    assert_eq!(texto("x-fractal-version"), "1");
    assert_eq!(texto("x-fractal-cuerpos"), "2");
    assert_eq!(texto("x-fractal-bloques"), "3");
    assert_eq!(texto("content-length"), (3 * (1 + 2 * 6) * 4).to_string());
}

#[tokio::test]
async fn rechaza_peticion_invalida() {
    let servidor = TestServer::new(crear_app(Almacen::nuevo(), Sesiones::nuevo())).unwrap();
    let mala =
        PeticionSimulacion { cuerpos: vec![], dt: -1.0, pasos: 0, cada_n: 0, suavizado: 0.0 };
    servidor.post("/api/v1/simulaciones").json(&mala).await.assert_status_bad_request();
}

#[tokio::test]
async fn sesion_viva_con_cursor_y_patch() {
    let servidor = TestServer::new(crear_app(Almacen::nuevo(), Sesiones::nuevo())).unwrap();

    let crear = servidor.post("/api/v1/sesiones").json(&peticion_dos_cuerpos()).await;
    crear.assert_status(axum::http::StatusCode::CREATED);
    let creada: Value = crear.json();
    let id = creada["id"].as_str().unwrap().to_string();
    assert_eq!(creada["cuerpos"], 2);

    // Primera lectura desde t=0 (integra bajo demanda).
    let leer1 = servidor.get(&format!("/api/v1/sesiones/{id}/estados?desde=0&limite=50")).await;
    leer1.assert_status_ok();
    let hasta1: f64 = leer1.headers()["x-fractal-hasta"].to_str().unwrap().parse().unwrap();
    assert!(hasta1 > 0.0);

    // Segunda lectura desde el cursor: solo lo nuevo, sin repetir.
    let leer2 =
        servidor.get(&format!("/api/v1/sesiones/{id}/estados?desde={hasta1}&limite=50")).await;
    leer2.assert_status_ok();
    let hasta2: f64 = leer2.headers()["x-fractal-hasta"].to_str().unwrap().parse().unwrap();
    assert!(hasta2 >= hasta1);

    // PATCH en caliente + DELETE.
    servidor
        .patch(&format!("/api/v1/sesiones/{id}"))
        .json(&serde_json::json!({ "dt": 300.0 }))
        .await
        .assert_status_ok();
    servidor
        .patch(&format!("/api/v1/sesiones/{id}"))
        .json(&serde_json::json!({ "masas": { "luna": -5.0 } }))
        .await
        .assert_status_bad_request();
    servidor
        .delete(&format!("/api/v1/sesiones/{id}"))
        .await
        .assert_status(axum::http::StatusCode::NO_CONTENT);
    servidor.get(&format!("/api/v1/sesiones/{id}/estados?desde=0")).await.assert_status_not_found();
}

//! Cliente distribuido: comunicación con nodos worker por HTTP.
//!
//! Implementa scatter/gather sobre HTTP/1.1 usando `hyper`. Si no hay
//! workers configurados, el coordinador ejecuta localmente.

use fractal_fisica::cuerpo::Cuerpo;
use fractal_fisica::vector::Vec3;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct Nodo {
    pub url: String,
}

impl Nodo {
    pub fn nuevo(url: String) -> Self {
        Self { url: url.trim_end_matches('/').to_string() }
    }
}

#[derive(Serialize)]
struct PeticionFuerzas<'a> {
    cuerpos: &'a [Cuerpo],
    indices: &'a [usize],
    suavizado: f64,
}

#[derive(Deserialize)]
struct RespuestaFuerzas {
    aceleraciones: Vec<[f64; 3]>,
}

/// Parsea la lista de nodos desde una variable de entorno separada por comas.
pub fn nodos_desde_env(var: &str) -> Vec<Nodo> {
    std::env::var(var)
        .ok()
        .map(|v| {
            v.split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| Nodo::nuevo(s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// Envía un subconjunto de índices a un nodo y recibe sus aceleraciones.
pub async fn fuerzas_remotas(
    nodo: &Nodo,
    cuerpos: &[Cuerpo],
    indices: &[usize],
    suavizado: f64,
) -> Result<Vec<Vec3>, String> {
    use http_body_util::BodyExt;
    use hyper::body::Bytes;
    use hyper_util::client::legacy::Client;
    use hyper_util::rt::TokioExecutor;

    let client: Client<_, _> = Client::builder(TokioExecutor::new()).build_http();

    let body = serde_json::to_vec(&PeticionFuerzas { cuerpos, indices, suavizado })
        .map_err(|e| format!("serialización: {e}"))?;

    let req = hyper::Request::builder()
        .method("POST")
        .uri(format!("{}/fuerzas", nodo.url))
        .header("content-type", "application/json")
        .body(http_body_util::Full::new(Bytes::from(body)))
        .map_err(|e| format!("request: {e}"))?;

    let resp = tokio::time::timeout(Duration::from_secs(10), client.request(req))
        .await
        .map_err(|_| "timeout".to_string())?
        .map_err(|e| format!("conexión: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("nodo {} respondió {}", nodo.url, resp.status()));
    }

    let bytes = resp
        .collect()
        .await
        .map_err(|e| format!("lectura: {e}"))?
        .to_bytes();
    let parsed: RespuestaFuerzas =
        serde_json::from_slice(&bytes).map_err(|e| format!("json: {e}"))?;

    Ok(parsed.aceleraciones.into_iter().map(|a| Vec3::new(a[0], a[1], a[2])).collect())
}

/// Calcula aceleraciones distribuyendo por filas entre nodos.
/// Si no hay nodos, devuelve None para que el caller use modo local.
pub async fn fuerzas_distribuidas(
    nodos: &[Nodo],
    cuerpos: &[Cuerpo],
    suavizado: f64,
) -> Option<Vec<Vec3>> {
    if nodos.is_empty() {
        return None;
    }
    let n = cuerpos.len();
    // particionar índices entre nodos
    let mut chunks: Vec<Vec<usize>> = vec![Vec::new(); nodos.len()];
    for i in 0..n {
        chunks[i % nodos.len()].push(i);
    }

    // scatter
    let mut handles = Vec::new();
    for (idx, nodo) in nodos.iter().enumerate() {
        let indices = chunks[idx].clone();
        if indices.is_empty() {
            continue;
        }
        let cuerpos = cuerpos.to_vec();
        let nodo = nodo.clone();
        handles.push(tokio::spawn(async move {
            let res = fuerzas_remotas(&nodo, &cuerpos, &indices, suavizado).await;
            (indices, res)
        }));
    }

    // gather
    let mut aceleraciones = vec![Vec3::cero(); n];
    for h in handles {
        match h.await {
            Ok((indices, Ok(vals))) => {
                for (i, a) in indices.iter().copied().zip(vals) {
                    aceleraciones[i] = a;
                }
            }
            Ok((_, Err(e))) => {
                tracing::warn!("worker falló: {e}");
                return None; // fallback local
            }
            Err(e) => {
                tracing::warn!("join error: {e}");
                return None;
            }
        }
    }
    Some(aceleraciones)
}

// Necesitamos Clone en Nodo (ya derivado) y tracing.
use tracing;
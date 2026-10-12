//! Sesiones vivas: integración continua con cursor (streaming).
//!
//! A diferencia de los jobs finitos (`almacen`), una sesión nunca termina:
//! el servidor integra por tandas bajo demanda y el frontend avanza un
//! cursor temporal. Sin ventanas, sin resembrados, sin empalmes: la verdad
//! vive en el servidor y el cliente solo la lee.

use crate::modelos::PeticionSimulacion;
use fractal_fisica::{
    cuerpo::Cuerpo,
    estado::{Estado, simular_con},
};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use uuid::Uuid;

/// Sesiones máximas simultáneas (LRU por último acceso).
pub const MAX_SESIONES: usize = 64;
/// Estados máximos guardados por sesión (~2 MB con 2 cuerpos).
pub const MAX_HISTORIAL: usize = 20_000;
/// Caducidad sin lecturas.
pub const TTL_SESION: Duration = Duration::from_secs(600);
/// Bloques nuevos por tanda de integración.
const BLOQUES_POR_TANDA: usize = 400;
/// Pasos máximos por tanda (para `cada_n` enormes).
const MAX_PASOS_TANDA: usize = 20_000;

/// Sesión viva: parámetros + estado actual + historial con tope.
#[derive(Debug)]
struct Sesion {
    /// Parámetros vigentes (PATCH los cambia en caliente).
    parametros: PeticionSimulacion,
    /// Cuerpos en el instante `tiempo` (verdad del servidor).
    actual: Vec<Cuerpo>,
    /// Tiempo simulado del último estado.
    tiempo: f64,
    /// Historial viejo→nuevo (con tope, se podan los viejos).
    historial: Vec<Estado>,
    /// Última lectura (TTL y LRU).
    ultimo_acceso: Instant,
}

/// Cambios en caliente sobre una sesión viva.
#[derive(Debug, Clone, Default, serde::Deserialize)]
pub struct CambiosSesion {
    /// Masas nuevas por id de cuerpo (deben ser > 0).
    pub masas: Option<HashMap<String, f64>>,
    /// Paso temporal futuro en segundos (> 0).
    pub dt: Option<f64>,
    /// Suavizado futuro en metros (0..=1e9).
    pub suavizado: Option<f64>,
}

impl CambiosSesion {
    /// Valida en español; `Ok(())` si no hay nada que objetar.
    pub fn validar(&self) -> Result<(), String> {
        if let Some(masas) = &self.masas {
            if masas.is_empty() {
                return Err("masas no puede estar vacío".to_string());
            }
            for (id, m) in masas {
                if !m.is_finite() || *m <= 0.0 {
                    return Err(format!("masa de '{id}' debe ser positiva y finita"));
                }
            }
        }
        if let Some(dt) = self.dt
            && (!dt.is_finite() || dt <= 0.0)
        {
            return Err("dt debe ser positivo y finito".to_string());
        }
        if let Some(s) = self.suavizado
            && (!s.is_finite() || s < 0.0 || s > 1e9)
        {
            return Err("suavizado debe estar entre 0 y 1e9 metros".to_string());
        }
        Ok(())
    }
}

/// Almacén compartido de sesiones (`Clone` barato por `Arc`).
#[derive(Debug, Clone, Default)]
pub struct Sesiones {
    /// Mapa id → sesión detrás de lock asíncrono.
    interno: Arc<RwLock<HashMap<Uuid, Sesion>>>,
}

impl Sesiones {
    /// Crea un almacén vacío (sin recolector; ver [`lanzar_recolector`]).
    pub fn nuevo() -> Self {
        Self { interno: Arc::new(RwLock::new(HashMap::new())) }
    }

    /// Crea una sesión con el estado inicial (el handler valida antes).
    pub async fn crear(&self, peticion: PeticionSimulacion) -> Uuid {
        self.evictar_si_lleno().await;
        let id = Uuid::new_v4();
        let actual = peticion.cuerpos.clone();
        let inicial = Estado::nuevo(0.0, &actual);
        self.interno.write().await.insert(
            id,
            Sesion {
                parametros: peticion,
                actual,
                tiempo: 0.0,
                historial: vec![inicial],
                ultimo_acceso: Instant::now(),
            },
        );
        id
    }

    /// Lee bloques con `t > desde_t` (hasta `limite`), integrando lo que falte.
    ///
    /// Devuelve `(bloques, hasta_t)`. Si el cursor quedó atrás de lo podado,
    /// devuelve desde lo más viejo disponible (el cliente se resincroniza).
    pub async fn leer_desde(
        &self,
        id: &Uuid,
        desde_t: f64,
        limite: usize,
    ) -> Option<(Vec<Estado>, f64)> {
        let mut mapa = self.interno.write().await;
        let sesion = mapa.get_mut(id)?;
        sesion.ultimo_acceso = Instant::now();
        let limite_sano = limite.clamp(1, 2000);
        let dt = sesion.parametros.dt;
        let cada_n = sesion.parametros.cada_n.max(1);
        let suavizado = sesion.parametros.suavizado;
        // Integrar por tandas hasta cubrir el cursor más una ventana.
        let ventana = BLOQUES_POR_TANDA as f64 * cada_n as f64 * dt;
        let mut guardias = 0;
        while sesion.tiempo < desde_t + ventana && guardias < 50 {
            guardias += 1;
            let pasos = (BLOQUES_POR_TANDA * cada_n).clamp(cada_n, MAX_PASOS_TANDA);
            let nuevos = simular_con(&sesion.actual, dt, pasos, cada_n, suavizado);
            let base_t = sesion.tiempo;
            let mut primero = true;
            for mut estado in nuevos {
                if primero {
                    primero = false; // duplica el estado actual
                    continue;
                }
                estado.tiempo += base_t;
                sesion.actual = estado.cuerpos.clone();
                sesion.tiempo = estado.tiempo;
                sesion.historial.push(estado);
            }
            let exceso = sesion.historial.len().saturating_sub(MAX_HISTORIAL);
            if exceso > 0 {
                sesion.historial.drain(..exceso);
            }
        }
        let hasta = sesion.historial.last().map(|e| e.tiempo).unwrap_or(desde_t);
        let bloques: Vec<Estado> = sesion
            .historial
            .iter()
            .filter(|e| e.tiempo > desde_t)
            .take(limite_sano)
            .cloned()
            .collect();
        Some((bloques, hasta))
    }

    /// Aplica cambios en caliente; `None` si no existe la sesión.
    pub async fn actualizar(&self, id: &Uuid, cambios: &CambiosSesion) -> Option<()> {
        let mut mapa = self.interno.write().await;
        let sesion = mapa.get_mut(id)?;
        sesion.ultimo_acceso = Instant::now();
        if let Some(masas) = &cambios.masas {
            for cuerpo in sesion.actual.iter_mut() {
                if let Some(m) = masas.get(&cuerpo.id) {
                    cuerpo.masa = *m;
                }
            }
            for cuerpo in sesion.parametros.cuerpos.iter_mut() {
                if let Some(m) = masas.get(&cuerpo.id) {
                    cuerpo.masa = *m;
                }
            }
        }
        if let Some(dt) = cambios.dt {
            sesion.parametros.dt = dt;
        }
        if let Some(s) = cambios.suavizado {
            sesion.parametros.suavizado = s;
        }
        Some(())
    }

    /// Cierra una sesión; `false` si no existía.
    pub async fn cerrar(&self, id: &Uuid) -> bool {
        self.interno.write().await.remove(id).is_some()
    }

    /// ¿Existe la sesión? (para 404 honestos sin tocar el acceso).
    pub async fn existe(&self, id: &Uuid) -> bool {
        self.interno.read().await.contains_key(id)
    }

    /// Si hay cupo lleno, expulsa la menos leída (LRU).
    async fn evictar_si_lleno(&self) {
        let mut mapa = self.interno.write().await;
        if mapa.len() < MAX_SESIONES {
            return;
        }
        let vieja =
            mapa.iter().min_by(|a, b| a.1.ultimo_acceso.cmp(&b.1.ultimo_acceso)).map(|(id, _)| *id);
        if let Some(id) = vieja {
            mapa.remove(&id);
        }
    }
}

/// Lanza el recolector periódico (TTL + tope duro). Llamar una vez en `main`.
pub fn lanzar_recolector(sesiones: Sesiones) {
    tokio::spawn(async move {
        let mut cada_minuto = tokio::time::interval(Duration::from_secs(60));
        loop {
            cada_minuto.tick().await;
            let mut mapa = sesiones.interno.write().await;
            mapa.retain(|_, s| s.ultimo_acceso.elapsed() < TTL_SESION);
            while mapa.len() > MAX_SESIONES {
                let vieja = mapa
                    .iter()
                    .min_by(|a, b| a.1.ultimo_acceso.cmp(&b.1.ultimo_acceso))
                    .map(|(id, _)| *id);
                match vieja {
                    Some(id) => {
                        mapa.remove(&id);
                    }
                    None => break,
                }
            }
        }
    });
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::modelos::PeticionSimulacion;
    use fractal_fisica::{cuerpo::Cuerpo, estado::simular_con, vector::Vec3};

    fn peticion() -> PeticionSimulacion {
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
            pasos: 120,
            cada_n: 12,
            suavizado: 0.0,
        }
    }

    #[tokio::test]
    async fn sesion_coincide_con_simular() {
        // La verdad contra la verdad: la sesión debe dar lo mismo que el motor.
        let ss = Sesiones::nuevo();
        let pet = peticion();
        let id = ss.crear(pet.clone()).await;
        let (bloques, _) = ss.leer_desde(&id, -1.0, 500).await.unwrap();
        let esperados = simular_con(&pet.cuerpos, pet.dt, pet.pasos, pet.cada_n, pet.suavizado);
        // La sesión integra por tandas; los primeros bloques deben coincidir
        // exactamente con el motor directo.
        assert!(!bloques.is_empty());
        assert!(esperados.len() >= 2);
        for (a, b) in bloques.iter().zip(esperados.iter()) {
            assert!((a.tiempo - b.tiempo).abs() < 1e-9);
            assert_eq!(a.cuerpos.len(), b.cuerpos.len());
            for (ca, cb) in a.cuerpos.iter().zip(b.cuerpos.iter()) {
                assert!((ca.posicion.x - cb.posicion.x).abs() < 1e-9);
            }
        }
    }

    #[tokio::test]
    async fn patch_de_masa_cambia_el_futuro() {
        let ss = Sesiones::nuevo();
        let id = ss.crear(peticion()).await;
        let (antes, _) = ss.leer_desde(&id, -1.0, 5).await.unwrap();
        ss.actualizar(
            &id,
            &CambiosSesion {
                masas: Some(HashMap::from([("luna".to_string(), 1e25)])),
                dt: None,
                suavizado: None,
            },
        )
        .await
        .unwrap();
        let (despues, _) = ss.leer_desde(&id, antes.last().unwrap().tiempo, 5).await.unwrap();
        assert!(!despues.is_empty());
    }

    #[tokio::test]
    async fn cerrar_y_404() {
        let ss = Sesiones::nuevo();
        let id = ss.crear(peticion()).await;
        assert!(ss.existe(&id).await);
        assert!(ss.cerrar(&id).await);
        assert!(!ss.existe(&id).await);
        assert!(ss.leer_desde(&id, 0.0, 10).await.is_none());
    }
}

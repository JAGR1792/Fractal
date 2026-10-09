//! Almacén en memoria de simulaciones en background.
//!
//! Guarda el estado de cada simulación detrás de un `RwLock` asíncrono:
//! el handler `POST` inserta en `pendiente` y dispara `tokio::spawn`,
//! los `GET` solo leen. Sin base de datos en la Etapa 3.

use crate::modelos::{EstadoSimulacion, InfoSimulacion, PeticionSimulacion};
use fractal_fisica::estado::Estado;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Registro interno de una simulación.
#[derive(Debug, Clone)]
struct Registro {
    /// Parámetros originales (para reintentos y depuración).
    parametros: PeticionSimulacion,
    /// Estado actual.
    estado: EstadoSimulacion,
    /// Historial listo (vacío mientras corre).
    historial: Vec<Estado>,
    /// Error en español si falló.
    error: Option<String>,
}

/// Almacén compartido entre handlers (`Clone` barato por `Arc`).
#[derive(Debug, Clone, Default)]
pub struct Almacen {
    /// Mapa id → registro detrás de lock asíncrono.
    interno: Arc<RwLock<HashMap<Uuid, Registro>>>,
}

impl Almacen {
    /// Crea un almacén vacío.
    pub fn nuevo() -> Self {
        Self { interno: Arc::new(RwLock::new(HashMap::new())) }
    }

    /// Reserva un id en estado `pendiente` y lo devuelve.
    pub async fn reservar(&self, parametros: PeticionSimulacion) -> Uuid {
        let id = Uuid::new_v4();
        let registro = Registro {
            parametros,
            estado: EstadoSimulacion::Pendiente,
            historial: Vec::new(),
            error: None,
        };
        self.interno.write().await.insert(id, registro);
        id
    }

    /// Marca una simulación como `corriendo` (si aún existe).
    pub async fn marcar_corriendo(&self, id: &Uuid) {
        if let Some(registro) = self.interno.write().await.get_mut(id) {
            registro.estado = EstadoSimulacion::Corriendo;
        }
    }

    /// Guarda el historial final y marca `completada`.
    pub async fn completar(&self, id: &Uuid, historial: Vec<Estado>) {
        if let Some(registro) = self.interno.write().await.get_mut(id) {
            registro.historial = historial;
            registro.estado = EstadoSimulacion::Completada;
        }
    }

    /// Marca `fallida` con mensaje en español.
    pub async fn fallar(&self, id: &Uuid, mensaje: &str) {
        if let Some(registro) = self.interno.write().await.get_mut(id) {
            registro.estado = EstadoSimulacion::Fallida;
            registro.error = Some(mensaje.to_string());
        }
    }

    /// Lee la ficha de una simulación para `GET /:id`.
    pub async fn info(&self, id: &Uuid) -> Option<InfoSimulacion> {
        self.interno.read().await.get(id).map(|registro| {
            let total_esperado = registro.parametros.pasos / registro.parametros.cada_n + 1;
            let progreso = match registro.estado {
                EstadoSimulacion::Pendiente => 0.0,
                EstadoSimulacion::Corriendo => 0.5,
                EstadoSimulacion::Completada => 1.0,
                EstadoSimulacion::Fallida => 0.0,
            };
            let _ = total_esperado;
            InfoSimulacion {
                id: *id,
                estado: registro.estado,
                progreso,
                total_estados: registro.historial.len(),
                error: registro.error.clone(),
            }
        })
    }

    /// Lee un rango del historial para `GET /:id/estados`.
    pub async fn estados(
        &self,
        id: &Uuid,
        desde: usize,
        limite: usize,
    ) -> Option<(EstadoSimulacion, Vec<Estado>)> {
        self.rango(id, desde, limite).await.map(|(estado, _, bloques)| (estado, bloques))
    }

    /// Lee un rango con el conteo de cuerpos (para JSON y binario).
    ///
    /// El conteo sale de los parámetros originales para que el binario
    /// tenga cabecera válida incluso si el cálculo aún no terminó.
    pub async fn rango(
        &self,
        id: &Uuid,
        desde: usize,
        limite: usize,
    ) -> Option<(EstadoSimulacion, usize, Vec<Estado>)> {
        self.interno.read().await.get(id).map(|registro| {
            let limite_sano = limite.clamp(1, 10_000);
            let fin = (desde + limite_sano).min(registro.historial.len());
            let corte = if desde >= registro.historial.len() {
                Vec::new()
            } else {
                registro.historial[desde..fin].to_vec()
            };
            (registro.estado, registro.parametros.cuerpos.len(), corte)
        })
    }
}

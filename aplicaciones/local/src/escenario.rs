//! Escenarios iniciales para la app local.
//!
//! Carga JSON de `datos/escenarios/*.json` (contrato del repo: posiciones y
//! velocidades como arrays `[x,y,z]`). Si no hay ficheros, cae al figure-8
//! embebido (Chenciner–Montgomery escalado a SI).

use fractal_fisica::prelude::*;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Escala de longitud del figure-8 embebido (metros).
const ESCALA_L: f64 = 1.0e9;
/// Masa de cada cuerpo del figure-8 (kg).
const MASA: f64 = 1.0e24;
/// Radio visual / físico (m).
const RADIO: f64 = ESCALA_L * 0.04;

const X1: f64 = 0.970_004_36;
const Y1: f64 = -0.243_087_53;
const VX1: f64 = 0.466_203_685_0;
const VY1: f64 = 0.432_365_730_0;

/// Metadatos de un escenario descubierto en disco (o el embebido).
#[derive(Debug, Clone)]
pub struct EscenarioMeta {
    pub id: String,
    pub nombre: String,
    pub ruta: Option<PathBuf>,
}

/// Escenario cargado listo para simular.
#[derive(Debug, Clone)]
pub struct EscenarioCargado {
    pub id: String,
    pub nombre: String,
    pub cuerpos: Vec<Cuerpo>,
    pub dt: f64,
    pub escala: f64,
}

#[derive(Debug, Deserialize)]
struct EscenarioJson {
    id: String,
    nombre: String,
    #[serde(default)]
    cuerpos: Vec<CuerpoJson>,
    #[serde(default)]
    parametros: ParametrosJson,
}

#[derive(Debug, Deserialize)]
struct CuerpoJson {
    id: String,
    nombre: String,
    masa: f64,
    radio: f64,
    posicion: [f64; 3],
    velocidad: [f64; 3],
}

#[derive(Debug, Default, Deserialize)]
struct ParametrosJson {
    #[serde(default)]
    dt: Option<f64>,
}

fn escala_velocidad() -> f64 {
    (G * MASA / ESCALA_L).sqrt()
}

/// Tres cuerpos iguales en la coreografía figure-8 (fallback embebido).
pub fn tres_cuerpos_figure8() -> EscenarioCargado {
    let vs = escala_velocidad();
    let p1 = Vec3::new(X1 * ESCALA_L, Y1 * ESCALA_L, 0.0);
    let p2 = Vec3::new(-X1 * ESCALA_L, -Y1 * ESCALA_L, 0.0);
    let p3 = Vec3::cero();
    let v1 = Vec3::new(VX1 * vs, VY1 * vs, 0.0);
    let v2 = Vec3::new(VX1 * vs, VY1 * vs, 0.0);
    let v3 = Vec3::new(-2.0 * VX1 * vs, -2.0 * VY1 * vs, 0.0);

    let cuerpos = vec![
        Cuerpo::nuevo("a", "A", MASA, RADIO, p1, v1),
        Cuerpo::nuevo("b", "B", MASA, RADIO, p2, v2),
        Cuerpo::nuevo("c", "C", MASA, RADIO, p3, v3),
    ];
    EscenarioCargado {
        id: "tres_cuerpos".into(),
        nombre: "Figure-8 (tres cuerpos)".into(),
        dt: dt_recomendado_figure8(),
        escala: escala_desde_cuerpos(&cuerpos).max(ESCALA_L),
        cuerpos,
    }
}

fn dt_recomendado_figure8() -> f64 {
    let tau = (ESCALA_L * ESCALA_L * ESCALA_L / (G * MASA)).sqrt();
    tau / 400.0
}

/// Escala espacial a partir del alcance de las posiciones.
pub fn escala_desde_cuerpos(cuerpos: &[Cuerpo]) -> f64 {
    let mut max_r = 0.0_f64;
    for c in cuerpos {
        let r = (c.posicion.x * c.posicion.x + c.posicion.y * c.posicion.y).sqrt();
        if r > max_r {
            max_r = r;
        }
    }
    if max_r < 1.0 {
        1.0
    } else {
        max_r
    }
}

/// Directorio `datos/escenarios` relativo al crate o al cwd.
pub fn directorio_escenarios() -> PathBuf {
    let desde_crate =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../datos/escenarios");
    if desde_crate.is_dir() {
        return desde_crate;
    }
    let desde_cwd = PathBuf::from("datos/escenarios");
    if desde_cwd.is_dir() {
        return desde_cwd;
    }
    PathBuf::from("../datos/escenarios")
}

/// Lista escenarios JSON + asegura entrada figure-8 si falta `tres_cuerpos`.
pub fn listar_escenarios() -> Vec<EscenarioMeta> {
    let dir = directorio_escenarios();
    let mut metas = Vec::new();
    let mut tiene_tres = false;

    if let Ok(entradas) = fs::read_dir(&dir) {
        let mut rutas: Vec<PathBuf> = entradas
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
            .collect();
        rutas.sort();

        for ruta in rutas {
            match cargar_json(&ruta) {
                Ok(esc) => {
                    if esc.id == "tres_cuerpos" {
                        tiene_tres = true;
                    }
                    metas.push(EscenarioMeta {
                        id: esc.id,
                        nombre: esc.nombre,
                        ruta: Some(ruta),
                    });
                }
                Err(err) => {
                    eprintln!("aviso: no se pudo leer {}: {err}", ruta.display());
                }
            }
        }
    }

    if !tiene_tres {
        metas.insert(
            0,
            EscenarioMeta {
                id: "tres_cuerpos".into(),
                nombre: "Figure-8 (tres cuerpos)".into(),
                ruta: None,
            },
        );
    }

    // Preferir tres_cuerpos / dos_cuerpos al frente si existen.
    metas.sort_by(|a, b| {
        let rank = |id: &str| match id {
            "tres_cuerpos" => 0,
            "dos_cuerpos" => 1,
            _ => 10,
        };
        rank(&a.id)
            .cmp(&rank(&b.id))
            .then_with(|| a.nombre.cmp(&b.nombre))
    });

    metas
}

/// Carga un escenario por id (ruta del catálogo o figure-8 embebido).
pub fn cargar_por_id(id: &str, catalogo: &[EscenarioMeta]) -> Result<EscenarioCargado, String> {
    if let Some(meta) = catalogo.iter().find(|m| m.id == id) {
        if let Some(ruta) = &meta.ruta {
            return Ok(cargar_json(ruta)?);
        }
    }
    if id == "tres_cuerpos" {
        return Ok(tres_cuerpos_figure8());
    }
    Err(format!("escenario desconocido: {id}"))
}

/// Carga y valida un fichero de escenario.
pub fn cargar_json(ruta: &Path) -> Result<EscenarioCargado, String> {
    let texto = fs::read_to_string(ruta)
        .map_err(|e| format!("lectura {}: {e}", ruta.display()))?;
    let raw: EscenarioJson = serde_json::from_str(&texto)
        .map_err(|e| format!("JSON {}: {e}", ruta.display()))?;
    if raw.cuerpos.is_empty() {
        return Err(format!("{} no tiene cuerpos", ruta.display()));
    }

    let mut cuerpos = Vec::with_capacity(raw.cuerpos.len());
    for c in &raw.cuerpos {
        if c.masa <= 0.0 || c.radio <= 0.0 {
            return Err(format!(
                "cuerpo '{}' inválido (masa/radio deben ser > 0)",
                c.id
            ));
        }
        cuerpos.push(Cuerpo::nuevo(
            &c.id,
            &c.nombre,
            c.masa,
            c.radio,
            Vec3::new(c.posicion[0], c.posicion[1], c.posicion[2]),
            Vec3::new(c.velocidad[0], c.velocidad[1], c.velocidad[2]),
        ));
    }

    let escala = escala_desde_cuerpos(&cuerpos);
    let dt = raw
        .parametros
        .dt
        .filter(|d| *d > 0.0)
        .unwrap_or_else(|| {
            // Heurística: ~1/400 del tiempo característico del par más pesado.
            let m = cuerpos.iter().map(|c| c.masa).fold(0.0_f64, f64::max);
            let tau = (escala * escala * escala / (G * m.max(1.0))).sqrt();
            tau / 400.0
        });

    Ok(EscenarioCargado {
        id: raw.id,
        nombre: raw.nombre,
        cuerpos,
        dt,
        escala,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn figure8_tiene_tres_cuerpos() {
        let e = tres_cuerpos_figure8();
        assert_eq!(e.cuerpos.len(), 3);
        assert!(e.dt > 0.0);
        assert!(e.escala > 0.0);
    }

    #[test]
    fn carga_tres_y_dos_si_existen() {
        let dir = directorio_escenarios();
        let tres = dir.join("tres_cuerpos.json");
        let dos = dir.join("dos_cuerpos.json");
        if tres.is_file() {
            let e = cargar_json(&tres).expect("tres_cuerpos");
            assert_eq!(e.id, "tres_cuerpos");
            assert_eq!(e.cuerpos.len(), 3);
        }
        if dos.is_file() {
            let e = cargar_json(&dos).expect("dos_cuerpos");
            assert_eq!(e.id, "dos_cuerpos");
            assert_eq!(e.cuerpos.len(), 2);
        }
    }
}

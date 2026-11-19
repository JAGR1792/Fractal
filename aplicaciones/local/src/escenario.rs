//! Escenarios iniciales para la app local.
//!
//! Carga JSON de `datos/escenarios/*.json` (contrato del repo: posiciones y
//! velocidades como arrays `[x,y,z]`). Si no hay ficheros, cae al figure-8
//! embebido (Chenciner–Montgomery escalado a SI) y al caos pitagórico.

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
        nombre: "Figure-8 (periódica)".into(),
        dt: dt_recomendado_figure8(),
        escala: escala_desde_cuerpos(&cuerpos).max(ESCALA_L),
        cuerpos,
    }
}

/// Problema pitagórico 3-4-5 con empujón leve — caos claro para demo.
pub fn tres_cuerpos_caos() -> EscenarioCargado {
    let l = 1.0e9;
    let cuerpos = vec![
        Cuerpo::nuevo(
            "a",
            "A (3)",
            3.0e24,
            5.0e7,
            Vec3::new(l, 3.0 * l, 0.0),
            Vec3::new(40.0, -25.0, 0.0),
        ),
        Cuerpo::nuevo(
            "b",
            "B (4)",
            4.0e24,
            5.5e7,
            Vec3::new(-2.0 * l, -l, 0.0),
            Vec3::new(-10.0, 55.0, 0.0),
        ),
        Cuerpo::nuevo(
            "c",
            "C (5)",
            5.0e24,
            6.0e7,
            Vec3::new(l, -l, 0.0),
            Vec3::new(-15.0, -20.0, 0.0),
        ),
    ];
    EscenarioCargado {
        id: "tres_cuerpos_caos".into(),
        nombre: "Tres cuerpos (caos)".into(),
        dt: 800.0,
        escala: escala_desde_cuerpos(&cuerpos).max(l * 3.0),
        cuerpos,
    }
}

fn dt_recomendado_figure8() -> f64 {
    let tau = (ESCALA_L * ESCALA_L * ESCALA_L / (G * MASA)).sqrt();
    tau / 400.0
}

/// Escala espacial a partir del alcance de las posiciones (respecto al origen).
pub fn escala_desde_cuerpos(cuerpos: &[Cuerpo]) -> f64 {
    let mut max_r = 0.0_f64;
    for c in cuerpos {
        let r = (c.posicion.x * c.posicion.x
            + c.posicion.y * c.posicion.y
            + c.posicion.z * c.posicion.z)
            .sqrt();
        if r > max_r {
            max_r = r;
        }
    }
    if max_r < 1.0 { 1.0 } else { max_r }
}

/// Baricentro del sistema.
pub fn baricentro(cuerpos: &[Cuerpo]) -> Vec3 {
    let mut masa = 0.0;
    let mut cx = 0.0;
    let mut cy = 0.0;
    let mut cz = 0.0;
    for c in cuerpos {
        masa += c.masa;
        cx += c.masa * c.posicion.x;
        cy += c.masa * c.posicion.y;
        cz += c.masa * c.posicion.z;
    }
    if masa <= 0.0 {
        return Vec3::cero();
    }
    Vec3::new(cx / masa, cy / masa, cz / masa)
}

/// Centro (baricentro) y semiextensión del sistema para encuadre / malla.
pub fn geometria_sistema(cuerpos: &[Cuerpo]) -> (Vec3, f64) {
    if cuerpos.is_empty() {
        return (Vec3::cero(), 1.0);
    }
    let centro = baricentro(cuerpos);
    let mut max_r = 0.0_f64;
    for c in cuerpos {
        let dx = c.posicion.x - centro.x;
        let dy = c.posicion.y - centro.y;
        let dz = c.posicion.z - centro.z;
        let r = (dx * dx + dy * dy + dz * dz).sqrt().max(c.radio * 4.0);
        if r > max_r {
            max_r = r;
        }
    }
    (centro, max_r.max(1.0))
}

/// Directorio `datos/escenarios` relativo al crate o al cwd.
pub fn directorio_escenarios() -> PathBuf {
    let desde_crate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../datos/escenarios");
    if desde_crate.is_dir() {
        return desde_crate;
    }
    let desde_cwd = PathBuf::from("datos/escenarios");
    if desde_cwd.is_dir() {
        return desde_cwd;
    }
    PathBuf::from("../datos/escenarios")
}

fn asegurar_embebido(metas: &mut Vec<EscenarioMeta>, id: &str, nombre: &str) {
    if !metas.iter().any(|m| m.id == id) {
        metas.push(EscenarioMeta { id: id.into(), nombre: nombre.into(), ruta: None });
    }
}

/// Lista escenarios JSON + asegura figure-8 y caos embebidos si faltan.
pub fn listar_escenarios() -> Vec<EscenarioMeta> {
    let dir = directorio_escenarios();
    let mut metas = Vec::new();

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
                    metas.push(EscenarioMeta { id: esc.id, nombre: esc.nombre, ruta: Some(ruta) });
                }
                Err(err) => {
                    eprintln!("aviso: no se pudo leer {}: {err}", ruta.display());
                }
            }
        }
    }

    asegurar_embebido(&mut metas, "tres_cuerpos", "Figure-8 (periódica)");
    asegurar_embebido(&mut metas, "tres_cuerpos_caos", "Tres cuerpos (caos)");

    metas.sort_by(|a, b| {
        let rank = |id: &str| match id {
            "tres_cuerpos_caos" => 0,
            "tres_cuerpos" => 1,
            "dos_cuerpos" => 2,
            "sistema_solar" => 3,
            _ => 10,
        };
        rank(&a.id).cmp(&rank(&b.id)).then_with(|| a.nombre.cmp(&b.nombre))
    });

    metas
}

/// Carga un escenario por id (ruta del catálogo o embebidos).
pub fn cargar_por_id(id: &str, catalogo: &[EscenarioMeta]) -> Result<EscenarioCargado, String> {
    if let Some(meta) = catalogo.iter().find(|m| m.id == id)
        && let Some(ruta) = &meta.ruta
    {
        return cargar_json(ruta);
    }
    match id {
        "tres_cuerpos" => Ok(tres_cuerpos_figure8()),
        "tres_cuerpos_caos" => Ok(tres_cuerpos_caos()),
        _ => Err(format!("escenario desconocido: {id}")),
    }
}

/// Carga y valida un fichero de escenario.
pub fn cargar_json(ruta: &Path) -> Result<EscenarioCargado, String> {
    let texto = fs::read_to_string(ruta).map_err(|e| format!("lectura {}: {e}", ruta.display()))?;
    let raw: EscenarioJson =
        serde_json::from_str(&texto).map_err(|e| format!("JSON {}: {e}", ruta.display()))?;
    if raw.cuerpos.is_empty() {
        return Err(format!("{} no tiene cuerpos", ruta.display()));
    }

    let mut cuerpos = Vec::with_capacity(raw.cuerpos.len());
    for c in &raw.cuerpos {
        if c.masa <= 0.0 || c.radio <= 0.0 {
            return Err(format!("cuerpo '{}' inválido (masa/radio deben ser > 0)", c.id));
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
    let dt = raw.parametros.dt.filter(|d| *d > 0.0).unwrap_or_else(|| {
        let m = cuerpos.iter().map(|c| c.masa).fold(0.0_f64, f64::max);
        let tau = (escala * escala * escala / (G * m.max(1.0))).sqrt();
        tau / 400.0
    });

    Ok(EscenarioCargado { id: raw.id, nombre: raw.nombre, cuerpos, dt, escala })
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
    fn caos_tiene_tres_cuerpos_desiguales() {
        let e = tres_cuerpos_caos();
        assert_eq!(e.cuerpos.len(), 3);
        assert_ne!(e.cuerpos[0].masa, e.cuerpos[1].masa);
        let (c, span) = geometria_sistema(&e.cuerpos);
        assert!(span > 0.0);
        assert!(c.norma() >= 0.0);
    }

    #[test]
    fn carga_tres_y_dos_si_existen() {
        let dir = directorio_escenarios();
        let tres = dir.join("tres_cuerpos.json");
        let dos = dir.join("dos_cuerpos.json");
        let caos = dir.join("tres_cuerpos_caos.json");
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
        if caos.is_file() {
            let e = cargar_json(&caos).expect("tres_cuerpos_caos");
            assert_eq!(e.id, "tres_cuerpos_caos");
            assert_eq!(e.cuerpos.len(), 3);
        }
    }
}

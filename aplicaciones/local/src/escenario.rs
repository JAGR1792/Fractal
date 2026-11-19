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

/// Una muestra de coreografía periódica (posiciones relativas al origen natural).
#[derive(Debug, Clone)]
pub struct MuestraTrayectoria {
    /// Tiempo natural ∈ [0, T].
    pub t: f64,
    /// Posiciones SI de los 3 cuerpos: [(x,y), ...].
    pub xy: [(f64, f64); 3],
}

/// Trayectoria de un período (Cash-Karp / Observable) para repetir en bucle.
///
/// Las órbitas periódicas planas distintas del figure-8 son inestables: la
/// integración en vivo diverge; el notebook de Observable tabula un período y
/// lo repite. Hacemos lo mismo aquí.
#[derive(Debug, Clone)]
pub struct TrayectoriaPeriodica {
    pub periodo_natural: f64,
    /// Período en segundos SI.
    pub periodo_si: f64,
    pub muestras: Vec<MuestraTrayectoria>,
}

/// Escenario cargado listo para simular.
#[derive(Debug, Clone)]
pub struct EscenarioCargado {
    pub id: String,
    pub nombre: String,
    pub cuerpos: Vec<Cuerpo>,
    pub dt: f64,
    pub escala: f64,
    /// Si hay trayectoria precomputada, la app puede reproducir la figura.
    pub trayectoria: Option<TrayectoriaPeriodica>,
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
struct TrayectoriaJson {
    #[serde(default)]
    periodo_natural: f64,
    t: Vec<f64>,
    /// Cada muestra: [x0, y0, x1, y1, x2, y2] en unidades G=m=1.
    xy: Vec<Vec<f64>>,
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
        Cuerpo::nuevo("marte", "A · Marte", MASA, RADIO, p1, v1),
        Cuerpo::nuevo("jupiter", "B · Júpiter", MASA, RADIO * 1.15, p2, v2),
        Cuerpo::nuevo("neptuno", "C · Neptuno", MASA, RADIO, p3, v3),
    ];
    EscenarioCargado {
        id: "tres_cuerpos".into(),
        nombre: "Figure-8 Moore (periódica)".into(),
        dt: dt_recomendado_figure8(),
        escala: escala_desde_cuerpos(&cuerpos).max(ESCALA_L),
        cuerpos,
        trayectoria: None,
    }
}

/// Caos acotado: figure-8 con masas desiguales + perturbación (~2 %).
///
/// El pitagórico 3-4-5 clásico eyecta un cuerpo a ~km/s y la cámara “congela”
/// el resto; aquí el sistema sigue ligado lo bastante como para ver sensibilidad
/// a condiciones iniciales sin salir disparado en segundos.
pub fn tres_cuerpos_caos() -> EscenarioCargado {
    let vs = escala_velocidad();
    let m1 = 1.15 * MASA;
    let m2 = 0.90 * MASA;
    let m3 = 0.95 * MASA;
    let p1 = Vec3::new(X1 * ESCALA_L * 1.01, Y1 * ESCALA_L, 0.0);
    let p2 = Vec3::new(-X1 * ESCALA_L, -Y1 * ESCALA_L * 0.99, 0.0);
    let p3 = Vec3::new(0.02 * ESCALA_L, 0.01 * ESCALA_L, 0.0);
    let v1 = Vec3::new(VX1 * vs * 1.02, VY1 * vs * 0.98, 0.0);
    let v2 = Vec3::new(VX1 * vs * 0.97, VY1 * vs * 1.03, 0.0);
    let v3 = Vec3::new(-2.0 * VX1 * vs * 1.01, -2.0 * VY1 * vs * 0.99, 0.0);

    // Ids de planeta → texturas reales en `public/texturas/`.
    let cuerpos = vec![
        Cuerpo::nuevo("marte", "A · Marte", m1, RADIO * 0.9, p1, v1),
        Cuerpo::nuevo("jupiter", "B · Júpiter", m2, RADIO * 1.1, p2, v2),
        Cuerpo::nuevo("neptuno", "C · Neptuno", m3, RADIO, p3, v3),
    ];
    EscenarioCargado {
        id: "tres_cuerpos_caos".into(),
        nombre: "Tres cuerpos (caos)".into(),
        dt: dt_recomendado_figure8() * 0.5,
        escala: escala_desde_cuerpos(&cuerpos).max(ESCALA_L),
        cuerpos,
        trayectoria: None,
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

/// Encuadre robusto: ignora eyecciones lejanas para que la cámara no “congele”.
///
/// Devuelve `(centro_local, span, indices_escapados)`.
pub fn geometria_robusta(cuerpos: &[Cuerpo]) -> (Vec3, f64, Vec<usize>) {
    if cuerpos.is_empty() {
        return (Vec3::cero(), 1.0, Vec::new());
    }
    let cm = baricentro(cuerpos);
    let mut radios: Vec<(usize, f64)> = cuerpos
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let dx = c.posicion.x - cm.x;
            let dy = c.posicion.y - cm.y;
            let dz = c.posicion.z - cm.z;
            (i, (dx * dx + dy * dy + dz * dz).sqrt())
        })
        .collect();
    radios.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    let med = radios[radios.len() / 2].1.max(1.0);
    let umbral = (med * 4.5).max(med + 1.0);
    let mut escapados = Vec::new();
    let mut nucleos = Vec::new();
    for &(i, r) in &radios {
        if r > umbral && cuerpos.len() >= 3 {
            escapados.push(i);
        } else {
            nucleos.push(i);
        }
    }
    if nucleos.is_empty() {
        nucleos = (0..cuerpos.len()).collect();
        escapados.clear();
    }
    let sub: Vec<Cuerpo> = nucleos.iter().map(|&i| cuerpos[i].clone()).collect();
    let (centro, span) = geometria_sistema(&sub);
    (centro, span.max(med * 1.2), escapados)
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
            let nombre = ruta.file_name().and_then(|n| n.to_str()).unwrap_or("");
            // Las trayectorias precomputadas van junto a los escenarios, no son escenarios.
            if nombre.contains(".trayectoria.") {
                continue;
            }
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

    asegurar_embebido(&mut metas, "tres_cuerpos", "Figure-8 Moore (periódica)");
    asegurar_embebido(&mut metas, "tres_cuerpos_caos", "Tres cuerpos (caos)");

    metas.sort_by(|a, b| {
        let rank = |id: &str| match id {
            "tres_cuerpos" => 0,
            "orbit_figure8_ipb" => 1,
            "orbit_butterfly" => 2,
            "orbit_dragonfly" => 3,
            "orbit_yin_yang" => 4,
            "orbit_yarn" => 5,
            "orbit_moth" => 6,
            "orbit_broucke" => 7,
            "tres_cuerpos_caos" => 8,
            "dos_cuerpos" => 9,
            "sistema_solar" => 10,
            _ => 20,
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

/// Carga trayectoria precomputada (unidades naturales G=m=1 → SI).
pub fn cargar_trayectoria(ruta: &Path) -> Result<TrayectoriaPeriodica, String> {
    let texto = fs::read_to_string(ruta).map_err(|e| format!("lectura {}: {e}", ruta.display()))?;
    let raw: TrayectoriaJson = serde_json::from_str(&texto)
        .map_err(|e| format!("JSON trayectoria {}: {e}", ruta.display()))?;
    if raw.t.is_empty() || raw.xy.len() != raw.t.len() {
        return Err(format!("{} trayectoria vacía o t/xy desalineados", ruta.display()));
    }
    let t_fin = *raw.t.last().unwrap_or(&raw.periodo_natural);
    let periodo_natural = if raw.periodo_natural > 0.0 { raw.periodo_natural } else { t_fin };
    let tau = (ESCALA_L * ESCALA_L * ESCALA_L / (G * MASA)).sqrt();
    let mut muestras = Vec::with_capacity(raw.t.len());
    for (t, fila) in raw.t.iter().zip(raw.xy.iter()) {
        if fila.len() < 6 {
            return Err(format!("{} muestra con <6 coords", ruta.display()));
        }
        muestras.push(MuestraTrayectoria {
            t: *t,
            xy: [
                (fila[0] * ESCALA_L, fila[1] * ESCALA_L),
                (fila[2] * ESCALA_L, fila[3] * ESCALA_L),
                (fila[4] * ESCALA_L, fila[5] * ESCALA_L),
            ],
        });
    }
    Ok(TrayectoriaPeriodica { periodo_natural, periodo_si: periodo_natural * tau, muestras })
}

fn trayectoria_junto_a(ruta_escenario: &Path) -> Option<PathBuf> {
    let stem = ruta_escenario.file_stem()?.to_str()?;
    let dir = ruta_escenario.parent()?;
    let cand = dir.join(format!("{stem}.trayectoria.json"));
    if cand.is_file() { Some(cand) } else { None }
}

/// Interpola posiciones (y velocidades aproximadas) en la fase φ ∈ [0, 1).
pub fn muestrear_trayectoria(tray: &TrayectoriaPeriodica, fase: f64, cuerpos: &mut [Cuerpo]) {
    if tray.muestras.len() < 2 || cuerpos.is_empty() {
        return;
    }
    let fase = fase.rem_euclid(1.0);
    let t = fase * tray.periodo_natural;
    let n = tray.muestras.len();
    let mut i1 = 0usize;
    while i1 + 1 < n && tray.muestras[i1 + 1].t < t {
        i1 += 1;
    }
    let i2 = (i1 + 1) % n;
    let a = &tray.muestras[i1];
    let b = &tray.muestras[i2];
    let dt = if i2 > i1 {
        (b.t - a.t).max(1e-12)
    } else {
        (tray.periodo_natural - a.t + b.t).max(1e-12)
    };
    let u = if i2 > i1 {
        ((t - a.t) / dt).clamp(0.0, 1.0)
    } else {
        // wrap al final del período
        let t_lin = if t >= a.t { t - a.t } else { tray.periodo_natural - a.t + t };
        (t_lin / dt).clamp(0.0, 1.0)
    };
    let tau = tray.periodo_si / tray.periodo_natural.max(1e-12);
    let n_c = cuerpos.len().min(3);
    for i in 0..n_c {
        let (x0, y0) = a.xy[i];
        let (x1, y1) = b.xy[i];
        let x = x0 + (x1 - x0) * u;
        let y = y0 + (y1 - y0) * u;
        // v ≈ Δx / Δt_si
        let vx = (x1 - x0) / (dt * tau);
        let vy = (y1 - y0) / (dt * tau);
        cuerpos[i].posicion = Vec3::new(x, y, 0.0);
        cuerpos[i].velocidad = Vec3::new(vx, vy, 0.0);
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

    let trayectoria = trayectoria_junto_a(ruta).and_then(|p| match cargar_trayectoria(&p) {
        Ok(t) => Some(t),
        Err(err) => {
            eprintln!("aviso: trayectoria {}: {err}", p.display());
            None
        }
    });

    Ok(EscenarioCargado { id: raw.id, nombre: raw.nombre, cuerpos, dt, escala, trayectoria })
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

    #[test]
    fn orbitas_periodicas_tienen_trayectoria() {
        let dir = directorio_escenarios();
        let butterfly = dir.join("orbit_butterfly.json");
        if !butterfly.is_file() {
            return;
        }
        let e = cargar_json(&butterfly).expect("orbit_butterfly");
        let tray = e.trayectoria.expect("trayectoria butterfly");
        assert!(tray.muestras.len() > 10);
        assert!(tray.periodo_si > 0.0);
        let mut cuerpos = e.cuerpos;
        muestrear_trayectoria(&tray, 0.25, &mut cuerpos);
        let (_, span) = geometria_sistema(&cuerpos);
        assert!(span > ESCALA_L * 0.1);
        assert!(span < ESCALA_L * 5.0);
    }

    #[test]
    fn catalogo_ignora_ficheros_trayectoria() {
        let metas = listar_escenarios();
        assert!(metas.iter().all(|m| !m.id.contains("trayectoria")));
    }
}

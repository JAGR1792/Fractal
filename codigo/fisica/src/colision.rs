//! Colisiones inelásticas → fragmentos ardientes (estilo Universe Sandbox).
//!
//! Si dos esferas físicas se solapan (`dist < r_i + r_j`):
//! * el cuerpo menor (o ambos si son comparables) se destroza en escombros
//! * los escombros salen con Δv radial, `calor` alto, y se enfrían hasta desaparecer

use crate::cuerpo::Cuerpo;
use crate::vector::Vec3;

/// Densidad rocosa de referencia para estimar radio a partir de masa (kg/m³).
const DENSIDAD_ROCA: f64 = 3_000.0;
/// Densidad típica de escombro fundido (un poco menor).
const DENSIDAD_ESCOMBRO: f64 = 2_200.0;

/// Radio de una esfera uniforme con masa y densidad dadas.
pub fn radio_desde_masa(masa: f64, densidad: f64) -> f64 {
    let vol = masa / densidad.max(1.0);
    (vol * 3.0 / (4.0 * std::f64::consts::PI)).cbrt().max(1.0)
}

fn densidad_estimada(c: &Cuerpo) -> f64 {
    let vol = 4.0 / 3.0 * std::f64::consts::PI * c.radio.powi(3);
    if vol <= 0.0 {
        return DENSIDAD_ROCA;
    }
    (c.masa / vol).clamp(200.0, 20_000.0)
}

/// Detecta pares solapados y sustituye por fragmentos.
///
/// Devuelve cuántas colisiones se resolvieron en esta pasada.
pub fn resolver_colisiones(cuerpos: &mut Vec<Cuerpo>) -> usize {
    if cuerpos.len() < 2 {
        return 0;
    }
    let n = cuerpos.len();
    let mut impacto: Option<(usize, usize)> = None;
    'outer: for i in 0..n {
        for j in (i + 1)..n {
            let d = cuerpos[i].posicion.distancia(&cuerpos[j].posicion);
            let limite = cuerpos[i].radio + cuerpos[j].radio;
            if d < limite && d > 0.0 {
                impacto = Some((i, j));
                break 'outer;
            }
            // Solape exacto en el origen
            if d <= 0.0 && limite > 0.0 {
                impacto = Some((i, j));
                break 'outer;
            }
        }
    }
    let Some((i, j)) = impacto else {
        return 0;
    };
    // Ordenar: a = más masivo, b = menor.
    let (ia, ib) = if cuerpos[i].masa >= cuerpos[j].masa { (i, j) } else { (j, i) };
    let mayor = cuerpos[ia].clone();
    let menor = cuerpos[ib].clone();

    let mut nuevos: Vec<Cuerpo> = Vec::new();
    for (k, c) in cuerpos.iter().enumerate() {
        if k != ia && k != ib {
            nuevos.push(c.clone());
        }
    }

    let razon = mayor.masa / menor.masa.max(1.0);
    let punto = mayor
        .posicion
        .escalar(menor.masa)
        .sumar(&menor.posicion.escalar(mayor.masa))
        .escalar(1.0 / (mayor.masa + menor.masa));
    let v_cm = mayor
        .velocidad
        .escalar(mayor.masa)
        .sumar(&menor.velocidad.escalar(menor.masa))
        .escalar(1.0 / (mayor.masa + menor.masa));

    let dir = {
        let d = menor.posicion.restar(&mayor.posicion);
        d.normalizar().unwrap_or(Vec3::new(1.0, 0.0, 0.0))
    };
    let v_rel = menor.velocidad.restar(&mayor.velocidad).norma().max(100.0);

    if razon > 40.0 {
        // Impacto contra gigante (p. ej. planeta → Sol): el mayor sobrevive y
        // engulle ~65 % de la masa; el resto sale como escombros ardientes.
        let absorbida = menor.masa * 0.65;
        let escombro_masa = menor.masa - absorbida;
        let dens = densidad_estimada(&mayor);
        let mut sobreviviente = mayor;
        sobreviviente.masa += absorbida;
        sobreviviente.radio = radio_desde_masa(sobreviviente.masa, dens);
        // Empujón leve al gigante (conservación aproximada).
        let impulso = dir.escalar(v_rel * 0.02 * (menor.masa / sobreviviente.masa));
        sobreviviente.velocidad += impulso;
        nuevos.push(sobreviviente);
        spawn_escombros(&mut nuevos, punto, v_cm, dir, escombro_masa, v_rel, 10, &menor.id);
    } else {
        // Destrucción mutua → nube de escombros.
        let masa_total = mayor.masa + menor.masa;
        spawn_escombros(&mut nuevos, punto, v_cm, dir, masa_total, v_rel, 14, "impacto");
    }

    *cuerpos = nuevos;
    1
}

#[allow(clippy::too_many_arguments)]
fn spawn_escombros(
    out: &mut Vec<Cuerpo>,
    origen: Vec3,
    v_cm: Vec3,
    eje: Vec3,
    masa_total: f64,
    v_rel: f64,
    n: usize,
    etiqueta: &str,
) {
    let n = n.max(4);
    let masa_frag = (masa_total / n as f64).max(1.0);
    let radio = radio_desde_masa(masa_frag, DENSIDAD_ESCOMBRO);
    let kick = (v_rel * 0.35 + 500.0).min(25_000.0);
    for k in 0..n {
        let t = (k as f64) / (n as f64) * std::f64::consts::TAU;
        // Disco de eyección ± eje + componente aleatoria determinista.
        let ort = eje.cruz(&Vec3::new(0.0, 0.0, 1.0));
        let ort = ort.normalizar().unwrap_or_else(|| {
            eje.cruz(&Vec3::new(0.0, 1.0, 0.0)).normalizar().unwrap_or(Vec3::new(0.0, 1.0, 0.0))
        });
        let bin = eje.cruz(&ort);
        let radial = ort.escalar(t.cos()).sumar(&bin.escalar(t.sin())).sumar(&eje.escalar(0.15));
        let radial = radial.normalizar().unwrap_or(ort);
        let jitter = (((k * 17 + 3) % 10) as f64 / 10.0) * 0.4 + 0.8;
        let v = v_cm.sumar(&radial.escalar(kick * jitter));
        let offset = radial.escalar(radio * (2.0 + k as f64 * 0.3));
        let id = format!("frag_{etiqueta}_{k}");
        let mut c = Cuerpo::nuevo(&id, "Escombro", masa_frag, radio, origen.sumar(&offset), v);
        c.calor = 1.0;
        out.push(c);
    }
}

/// Enfría fragmentos y elimina los que se apagaron (masa sale del sistema).
///
/// `dt` en segundos de simulación. Devuelve cuántos se borraron.
pub fn enfriar_y_purgar(cuerpos: &mut Vec<Cuerpo>, dt: f64) -> usize {
    // Vida típica del resplandor ~ 1–2 días de simulación.
    let tau = 80_000.0_f64;
    for c in cuerpos.iter_mut() {
        if c.calor > 0.0 {
            c.calor = (c.calor - dt / tau).max(0.0);
            // Se va evaporando: pierde masa al enfriar.
            let factor = (1.0 - 0.35 * (dt / tau).clamp(0.0, 0.5)).clamp(0.5, 1.0);
            c.masa = (c.masa * factor).max(1.0);
            c.radio = radio_desde_masa(c.masa, DENSIDAD_ESCOMBRO);
        }
    }
    let antes = cuerpos.len();
    cuerpos.retain(|c| c.calor == 0.0 || c.calor > 0.04);
    // Los que llegaron a calor≈0 siendo fragmentos: fuera.
    cuerpos.retain(|c| !(c.id.starts_with("frag_") && c.calor <= 0.04));
    antes.saturating_sub(cuerpos.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn planeta_contra_sol_genera_escombros() {
        let mut cuerpos = vec![
            Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo(
                "tierra",
                "Tierra",
                5.972e24,
                6.371e6,
                Vec3::new(1.0e8, 0.0, 0.0), // dentro del Sol
                Vec3::new(0.0, 1_000.0, 0.0),
            ),
        ];
        let n = resolver_colisiones(&mut cuerpos);
        assert_eq!(n, 1);
        assert!(cuerpos.iter().any(|c| c.id == "sol" || c.nombre == "Sol"));
        assert!(cuerpos.iter().any(|c| c.id.starts_with("frag_")));
        assert!(cuerpos.iter().any(|c| c.calor > 0.5));
    }

    #[test]
    fn dos_iguales_se_destrozan() {
        let mut cuerpos = vec![
            Cuerpo::nuevo(
                "a",
                "A",
                1e22,
                1e6,
                Vec3::new(-5e5, 0.0, 0.0),
                Vec3::new(100.0, 0.0, 0.0),
            ),
            Cuerpo::nuevo(
                "b",
                "B",
                1e22,
                1e6,
                Vec3::new(5e5, 0.0, 0.0),
                Vec3::new(-100.0, 0.0, 0.0),
            ),
        ];
        assert_eq!(resolver_colisiones(&mut cuerpos), 1);
        assert!(cuerpos.iter().all(|c| c.id.starts_with("frag_")));
        assert!(cuerpos.len() >= 8);
    }

    #[test]
    fn enfriar_elimina_escombros() {
        let mut c = Cuerpo::nuevo("frag_x_0", "Escombro", 1e10, 100.0, Vec3::cero(), Vec3::cero());
        c.calor = 0.05;
        let mut cuerpos = vec![c];
        enfriar_y_purgar(&mut cuerpos, 200_000.0);
        assert!(cuerpos.is_empty());
    }
}

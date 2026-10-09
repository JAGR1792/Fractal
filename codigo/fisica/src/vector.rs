//! Vector tridimensional minimalista para el motor físico.
//!
//! # ¿Por qué un Vec3 propio?
//!
//! El motor físico no debe depender de `nalgebra` o `glam` por diseño
//! (ver ADR-0001). Un vector de 3 `f64` es lo único que necesitamos para
//! mecánica newtoniana, y reimplementarlo cuesta 20 líneas.
//!
//! # Operaciones soportadas
//!
//! * Suma, resta, multiplicación por escalar
//! * Producto punto y producto cruz
//! * Norma (magnitud) y distancia entre vectores
//! * Interpolación lineal (útil para interpolación visual)

/// Vector tridimensional en metros (o m/s, o m/s² según contexto).
///
/// # Ejemplo
/// ```
/// use fractal_fisica::vector::Vec3;
///
/// let posicion = Vec3::new(1.0, 2.0, 3.0);
/// let velocidad = Vec3::new(0.0, 1.0, 0.0);
/// assert_eq!(posicion.norma(), 14f64.sqrt());
/// ```
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Vec3 {
    /// Componente X en metros
    pub x: f64,
    /// Componente Y en metros
    pub y: f64,
    /// Componente Z en metros
    pub z: f64,
}

impl Vec3 {
    /// Crea un vector nuevo con componentes dadas.
    ///
    /// # Parámetros
    /// * `x` — componente en el eje X
    /// * `y` — componente en el eje Y
    /// * `z` — componente en el eje Z
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    /// Vector cero (0, 0, 0).
    pub const fn cero() -> Self {
        Self::new(0.0, 0.0, 0.0)
    }

    /// Suma componente a componente.
    pub const fn sumar(&self, otro: &Vec3) -> Vec3 {
        Vec3::new(self.x + otro.x, self.y + otro.y, self.z + otro.z)
    }

    /// Resta componente a componente.
    pub const fn restar(&self, otro: &Vec3) -> Vec3 {
        Vec3::new(self.x - otro.x, self.y - otro.y, self.z - otro.z)
    }

    /// Multiplica cada componente por un escalar.
    pub const fn escalar(&self, factor: f64) -> Vec3 {
        Vec3::new(self.x * factor, self.y * factor, self.z * factor)
    }

    /// Producto punto (escalar) entre dos vectores.
    pub const fn punto(&self, otro: &Vec3) -> f64 {
        self.x * otro.x + self.y * otro.y + self.z * otro.z
    }

    /// Producto cruz (vector perpendicular).
    pub const fn cruz(&self, otro: &Vec3) -> Vec3 {
        Vec3::new(
            self.y * otro.z - self.z * otro.y,
            self.z * otro.x - self.x * otro.z,
            self.x * otro.y - self.y * otro.x,
        )
    }

    /// Norma euclidiana (magnitud) del vector.
    pub fn norma(&self) -> f64 {
        self.punto(self).sqrt()
    }

    /// Distancia entre dos puntos representados por vectores.
    pub fn distancia(&self, otro: &Vec3) -> f64 {
        self.restar(otro).norma()
    }

    /// Vector unitario en la misma dirección.
    ///
    /// Retorna `None` si el vector es cero (no se puede normalizar).
    pub fn normalizar(&self) -> Option<Vec3> {
        let n = self.norma();
        if n == 0.0 { None } else { Some(self.escalar(1.0 / n)) }
    }

    /// Interpolación lineal entre dos vectores.
    ///
    /// `t = 0` devuelve `self`, `t = 1` devuelve `otro`.
    pub fn interpolar(&self, otro: &Vec3, t: f64) -> Vec3 {
        self.escalar(1.0 - t).sumar(&otro.escalar(t))
    }
}

impl std::ops::Add for Vec3 {
    type Output = Vec3;
    fn add(self, otro: Vec3) -> Vec3 {
        self.sumar(&otro)
    }
}

impl std::ops::Sub for Vec3 {
    type Output = Vec3;
    fn sub(self, otro: Vec3) -> Vec3 {
        self.restar(&otro)
    }
}

impl std::ops::Mul<f64> for Vec3 {
    type Output = Vec3;
    fn mul(self, factor: f64) -> Vec3 {
        self.escalar(factor)
    }
}

impl std::ops::AddAssign for Vec3 {
    fn add_assign(&mut self, otro: Vec3) {
        self.x += otro.x;
        self.y += otro.y;
        self.z += otro.z;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suma_basica() {
        let a = Vec3::new(1.0, 2.0, 3.0);
        let b = Vec3::new(4.0, 5.0, 6.0);
        assert_eq!(a + b, Vec3::new(5.0, 7.0, 9.0));
    }

    #[test]
    fn norma_de_vector_unitario() {
        let v = Vec3::new(1.0, 0.0, 0.0);
        assert!((v.norma() - 1.0).abs() < 1e-15);
    }

    #[test]
    fn distancia_entre_puntos() {
        let a = Vec3::new(0.0, 0.0, 0.0);
        let b = Vec3::new(3.0, 4.0, 0.0);
        assert!((a.distancia(&b) - 5.0).abs() < 1e-15);
    }

    #[test]
    fn producto_cruz_ortogonal() {
        let i = Vec3::new(1.0, 0.0, 0.0);
        let j = Vec3::new(0.0, 1.0, 0.0);
        let k = i.cruz(&j);
        assert_eq!(k, Vec3::new(0.0, 0.0, 1.0));
    }

    #[test]
    fn interpolacion_lineal() {
        let a = Vec3::new(0.0, 0.0, 0.0);
        let b = Vec3::new(10.0, 0.0, 0.0);
        let medio = a.interpolar(&b, 0.5);
        assert!((medio.x - 5.0).abs() < 1e-15);
    }
}

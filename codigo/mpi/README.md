# fractal-mpi

Demostración de **computación distribuida con MPI (MS-MPI)** para Fractal.

Cada proceso calcula la aceleración gravitacional de un subconjunto de cuerpos
y el proceso 0 reduce (recolecta) los resultados, validándolos contra el cálculo
serial del motor.

## Requisitos

- MS-MPI runtime + SDK (instalado en `C:\Program Files\Microsoft MPI`).
- Rust (toolchain GNU).

## Compilar y ejecutar

```powershell
mpiexec -n 4 cargo run --manifest-path codigo/mpi/Cargo.toml
```

Salida esperada: aceleraciones idénticas al cálculo serial (error ~0).
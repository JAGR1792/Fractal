# Decisiones de Arquitectura (ADRs)

Este directorio contiene las decisiones de diseño del proyecto, documentadas con el formato Architecture Decision Record (ADR).

## Qué es un ADR

Un ADR es un documento breve que captura una decisión de diseño importante, su contexto y sus consecuencias. Nos ayuda a recordar **por qué** tomamos cierta decisión meses después.

## Formato

```markdown
# ADR-NNN: Título corto

## Estado
Propuesto | Aceptado | Rechazado | Deprecado | Superseded por ADR-NNN

## Contexto
¿Qué situación nos obliga a tomar esta decisión? ¿Qué alternativas existían?

## Decisión
¿Qué decidimos? Sé específico.

## Consecuencias
¿Qué ganamos? ¿Qué perdemos? ¿Qué se vuelve más difícil?
```

## Índice de ADRs

| ADR | Título | Estado |
|-----|--------|--------|
| [ADR-0001](ADRs/0001-motor-fisico-sin-dependencias.md) | Motor físico sin dependencias externas | Aceptado |
| [ADR-0002](ADRs/0002-velocity-verlet-sobre-rk4.md) | Velocity Verlet sobre Runge-Kutta 4 | Aceptado |
| [ADR-0003](ADRs/0003-unidades-si-internas.md) | Unidades SI internas con conversión en bordes | Aceptado |
| [ADR-0004](ADRs/0004-codigo-y-documentacion-en-espanol.md) | Código y documentación en español | Aceptado |

## Cómo proponer un nuevo ADR

1. Crear un archivo número secuencial en `ADRs/`
2. Llenar el formato completo
3. Referenciarlo desde el README o la documentación relevante
4. Enviar PR para revisión

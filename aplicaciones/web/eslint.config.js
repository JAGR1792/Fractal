// Configuración ESLint en formato plano (ESLint 9).
//
// El frontend es TypeScript puro sobre DOM + WebGPU/WebGL2, sin framework:
// por eso basta el preset de TS con globals de navegador y WebWorker para los
// tests. `npm run lint` es exactamente lo que corre el CI, así que este archivo
// es la única fuente de verdad del lint web.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.worker },
    },
    rules: {
      // El motor y la API usan nombres en español: no forzamos nada de estilo.
      // Sí exigimos que lo no usado se declare como `_` para que sea intencional.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `any` puntual está permitido donde se habla con la GPU, pero avisado.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
)

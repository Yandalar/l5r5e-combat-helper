# Scaffolding: Vite + TypeScript + Livereload

**Date:** 2026-06-04  
**Status:** Approved

## Objetivo

Migrar el módulo Foundry VTT `l5r5e-combat-helper` de archivos JS planos a un proyecto TypeScript con Vite como herramienta de build y livereload automático durante el desarrollo. El resultado elimina la necesidad de mantener el orden de `esmodules` en `module.json` y provee un workflow donde guardar un `.ts` recarga Foundry automáticamente.

---

## Estructura de directorios

```
l5r5e-combat-helper/
├── src/
│   ├── core/
│   │   ├── actor-utils.ts
│   │   ├── damage-calculator.ts
│   │   └── compat-utils.ts
│   ├── critical/
│   │   ├── critical-effects-table.ts
│   │   ├── critical-effects-application.ts
│   │   ├── critical-mitigation.ts
│   │   └── critical-strike-roll.ts
│   ├── reactions/
│   │   ├── void-defense.ts
│   │   ├── shattering-parry.ts
│   │   └── opportunity-critical.ts
│   ├── ui/
│   │   ├── chat-messages.ts
│   │   └── custom-critical-config.ts
│   ├── helpers/
│   │   └── handlebars.ts
│   ├── combat-handler.ts
│   ├── target-assignment.ts
│   └── main.ts
├── dist/                   ← generado por Vite (gitignored)
├── lang/
├── styles/
├── docs/
├── module.json             ← solo lista "dist/bundle.js"
├── vite.config.ts
├── tsconfig.json
└── package.json
```

`src/main.ts` es el único entry point. Todo el resto del código es importado desde ahí (directa o transitivamente). Agregar un nuevo feature = crear el `.ts` en la carpeta correspondiente + importarlo desde `main.ts`. No se toca `module.json`.

---

## Herramientas de build

### Dependencias

```json
{
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^5.x",
    "browser-sync": "^3.x",
    "concurrently": "^9.x",
    "@league-of-foundry-developers/foundry-vtt-types": "latest"
  }
}
```

### Scripts (`package.json`)

```json
{
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "link:linux": "ln -sf $(pwd) ~/.local/share/FoundryVTT/Data/modules/l5r5e-combat-helper",
    "dev": "concurrently \"vite build --watch\" \"browser-sync start --proxy localhost:30000 --files 'dist/bundle.js' --no-open --no-ghost-mode --ws\"",
    "link:mac": "ln -sf $(pwd)/dist ~/Library/Application\\ Support/FoundryVTT/Data/modules/l5r5e-combat-helper"
  }
}
```

- `npm run link:mac` o `npm run link:linux` — se corre **una sola vez** para crear el symlink de `dist/` al directorio de módulos de Foundry según el OS.
- `npm run dev` — workflow diario: Vite watch + livereload.
- `npm run build` — build de producción para releases.

### `vite.config.ts`

```ts
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      name: "l5r5e-combat-helper",
      fileName: () => "bundle.js",
      formats: ["es"],
    },
    outDir: "dist",
    sourcemap: true,
    minify: false,
  },
});
```

El livereload lo maneja `browser-sync` (ver script `dev`), no un plugin de Vite.

El output es un único `dist/bundle.js` en formato ES module. `sourcemap: true` hace que los errores en la consola de Foundry apunten a los archivos `.ts` originales.

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["ES2022", "DOM"],
    "types": ["@league-of-foundry-developers/foundry-vtt-types"]
  },
  "include": ["src"]
}
```

### `module.json` — cambio en `esmodules`

```json
{
  "esmodules": ["dist/bundle.js"]
}
```

Un solo archivo. El orden de carga ya no es responsabilidad de `module.json` sino del grafo de imports de TypeScript.

---

## Livereload

El flujo completo al guardar un `.ts`:

```
Guardás .ts  →  Vite recompila dist/bundle.js (~500ms)
→  browser-sync detecta el cambio en dist/bundle.js
→  envía señal al browser vía WebSocket
→  Foundry recarga la página automáticamente
```

`browser-sync` actúa como proxy de Foundry. En desarrollo accedés a Foundry en `localhost:3001` en lugar de `localhost:30000`. No requiere extensiones del browser ni cambios en la configuración de Foundry.

**Advertencia:** la recarga desconecta a todos los jugadores conectados. En un contexto de desarrollo (trabajo en solitario) esto es aceptable.

---

## Estrategia de migración

### Fase 1 — Setup sin tocar lógica

1. Crear `package.json`, `vite.config.ts`, `tsconfig.json`.
2. Instalar dependencias de desarrollo.
3. Crear la estructura `src/` renombrando los `.js` actuales a `.ts` (sin reescribir lógica).
4. Mover los helpers de Handlebars de `main.ts` a `src/helpers/handlebars.ts`.
5. Correr `npm run build` — verificar que compila sin errores críticos.
6. Actualizar `module.json`: reemplazar lista de `esmodules` por `["dist/bundle.js"]`.
7. Correr `npm run link:mac` (macOS) o `npm run link:linux` para crear el symlink.
8. Verificar que Foundry carga el módulo correctamente desde `dist/`.

### Fase 2 — Tipado gradual

Una vez que la Fase 1 funciona:

1. Tipar `src/core/` primero (funciones puras, más fácil).
2. Luego `src/critical/`.
3. Luego `src/reactions/` y `src/ui/`.
4. Usar `any` temporalmente donde el tipado del API de Foundry sea complejo — no bloquear la fase.

---

## `.gitignore` — agregar

```
node_modules/
dist/
```

---

## Criterios de éxito

- `npm run build` produce `dist/bundle.js` sin errores.
- `npm run dev` + guardar un `.ts` recarga Foundry automáticamente en el browser.
- Toda la funcionalidad existente (damage, criticals, reactions) sigue funcionando tras la migración.
- `module.json` lista únicamente `dist/bundle.js`.
- Agregar un nuevo feature no requiere modificar `module.json`.

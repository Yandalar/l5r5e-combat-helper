# Vite + TypeScript + Livereload Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate el módulo de archivos JS planos a TypeScript con Vite como build tool y livereload automático, eliminando la necesidad de mantener el orden de `esmodules` en `module.json`.

**Architecture:** Vite en modo librería compila `src/main.ts` en un único `dist/bundle.js` que Foundry carga. Un symlink enlaza `dist/` al directorio de módulos de Foundry. `browser-sync` actúa como proxy de Foundry e inyecta livereload: cuando `vite build --watch` regenera `dist/bundle.js`, el browser recarga Foundry solo.

**Tech Stack:** TypeScript 5, Vite 5, browser-sync 3, concurrently 9, @league-of-foundry-developers/foundry-vtt-types

---

## Mapa de archivos

### Archivos nuevos

| Archivo | Propósito |
|---------|-----------|
| `package.json` | Scripts de build y dependencias de desarrollo |
| `tsconfig.json` | Configuración TypeScript |
| `vite.config.ts` | Configuración de Vite (lib mode, browser-sync) |
| `src/helpers/handlebars.ts` | Helpers de Handlebars extraídos de main.js |

### Archivos movidos (renombrado + nueva ubicación)

| Origen | Destino |
|--------|---------|
| `scripts/actor-utils.js` | `src/core/actor-utils.ts` |
| `scripts/damage-calculator.js` | `src/core/damage-calculator.ts` |
| `scripts/compat-utils.js` | `src/core/compat-utils.ts` |
| `scripts/critical-effects-table.js` | `src/critical/critical-effects-table.ts` |
| `scripts/critical-effects-application.js` | `src/critical/critical-effects-application.ts` |
| `scripts/critical-mitigation.js` | `src/critical/critical-mitigation.ts` |
| `scripts/critical-strike-roll.js` | `src/critical/critical-strike-roll.ts` |
| `scripts/void-defense.js` | `src/reactions/void-defense.ts` |
| `scripts/shattering-parry.js` | `src/reactions/shattering-parry.ts` |
| `scripts/opportunity-critical.js` | `src/reactions/opportunity-critical.ts` |
| `scripts/chat-messages.js` | `src/ui/chat-messages.ts` |
| `scripts/custom-critical-config.js` | `src/ui/custom-critical-config.ts` |
| `scripts/combat-handler.js` | `src/combat-handler.ts` |
| `scripts/target-assignment.js` | `src/target-assignment.ts` |
| `scripts/main.js` | `src/main.ts` |

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `module.json` | `esmodules` pasa de 14 entradas a `["dist/bundle.js"]` |
| `.gitignore` | Agregar `dist/` |

### Archivos eliminados

`scripts/` completo (todos los `.js` se movieron a `src/`).

---

## Task 1: Inicializar proyecto npm

**Files:**
- Create: `package.json`

- [ ] **Step 1: Crear package.json**

```json
{
  "name": "l5r5e-combat-helper",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "concurrently \"vite build --watch\" \"browser-sync start --proxy localhost:30000 --files 'dist/bundle.js' --no-open --no-ghost-mode\"",
    "build": "vite build",
    "link:mac": "ln -sf $(pwd)/dist ~/Library/Application\\ Support/FoundryVTT/Data/modules/l5r5e-combat-helper",
    "link:linux": "ln -sf $(pwd)/dist ~/.local/share/FoundryVTT/Data/modules/l5r5e-combat-helper"
  },
  "devDependencies": {
    "@league-of-foundry-developers/foundry-vtt-types": "latest",
    "browser-sync": "^3.0.0",
    "concurrently": "^9.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 2: Instalar dependencias**

```bash
npm install
```

Expected: carpeta `node_modules/` creada, `package-lock.json` generado.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: initialize npm project with vite and typescript"
```

---

## Task 2: Configuración TypeScript

**Files:**
- Create: `tsconfig.json`

- [ ] **Step 1: Crear tsconfig.json**

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
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 2: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add typescript configuration"
```

---

## Task 3: Configuración Vite

**Files:**
- Create: `vite.config.ts`

- [ ] **Step 1: Crear vite.config.ts**

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

Nota: `minify: false` mantiene el bundle legible durante desarrollo; activarlo para releases de producción si se desea.

- [ ] **Step 2: Verificar que Vite puede leer la config**

```bash
npx vite build --config vite.config.ts 2>&1 | head -5
```

Expected: error `Cannot find module 'src/main.ts'` (normal — el archivo no existe todavía). Si el error menciona `vite.config.ts`, revisar la sintaxis.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "chore: add vite build configuration"
```

---

## Task 4: Crear estructura src/ y mover archivos

**Files:**
- Create: `src/core/`, `src/critical/`, `src/reactions/`, `src/ui/`, `src/helpers/`
- Move: todos los archivos de `scripts/` a sus nuevas ubicaciones en `src/`

- [ ] **Step 1: Crear directorios**

```bash
mkdir -p src/core src/critical src/reactions src/ui src/helpers
```

- [ ] **Step 2: Mover archivos con git mv**

```bash
git mv scripts/actor-utils.js src/core/actor-utils.ts
git mv scripts/damage-calculator.js src/core/damage-calculator.ts
git mv scripts/compat-utils.js src/core/compat-utils.ts
git mv scripts/critical-effects-table.js src/critical/critical-effects-table.ts
git mv scripts/critical-effects-application.js src/critical/critical-effects-application.ts
git mv scripts/critical-mitigation.js src/critical/critical-mitigation.ts
git mv scripts/critical-strike-roll.js src/critical/critical-strike-roll.ts
git mv scripts/void-defense.js src/reactions/void-defense.ts
git mv scripts/shattering-parry.js src/reactions/shattering-parry.ts
git mv scripts/opportunity-critical.js src/reactions/opportunity-critical.ts
git mv scripts/chat-messages.js src/ui/chat-messages.ts
git mv scripts/custom-critical-config.js src/ui/custom-critical-config.ts
git mv scripts/combat-handler.js src/combat-handler.ts
git mv scripts/target-assignment.js src/target-assignment.ts
git mv scripts/main.js src/main.ts
```

- [ ] **Step 3: Agregar `// @ts-nocheck` al tope de cada archivo movido**

Esto suprime los errores de TypeScript durante la Phase 1. Se eliminará archivo por archivo en la Phase 2 (tipado gradual).

Agregar `// @ts-nocheck` como primera línea en cada uno de los 15 archivos listados en el mapa de archivos. Ejemplo para `src/core/actor-utils.ts`:

```ts
// @ts-nocheck
/**
 * Actor utility helpers...
 * (resto del archivo sin cambios)
 */
```

Repetir para los 14 archivos restantes.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: migrate scripts to src/ as TypeScript files (no-check phase)"
```

---

## Task 5: Actualizar paths de import

Los archivos que importan de otros scripts necesitan actualizar sus paths relativos ahora que están en subdirectorios distintos.

**Files:**
- Modify: `src/critical/critical-effects-application.ts`
- Modify: `src/critical/critical-mitigation.ts`
- Modify: `src/ui/custom-critical-config.ts`
- Modify: `src/reactions/void-defense.ts`
- Modify: `src/reactions/shattering-parry.ts`
- Modify: `src/reactions/opportunity-critical.ts`
- Modify: `src/combat-handler.ts`
- Modify: `src/target-assignment.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Actualizar `src/critical/critical-effects-application.ts`**

Cambiar:
```ts
} from "./critical-effects-table.js";
```
Por:
```ts
} from "./critical-effects-table";
```

- [ ] **Step 2: Actualizar `src/critical/critical-mitigation.ts`**

Cambiar:
```ts
import { applyCriticalEffect } from "./critical-effects-application.js";
```
Por:
```ts
import { applyCriticalEffect } from "./critical-effects-application";
```

- [ ] **Step 3: Actualizar `src/ui/custom-critical-config.ts`**

Cambiar:
```ts
import { DEFAULT_SCAR_CONFIG } from "./critical-effects-table.js";
import { confirmDialog } from "./compat-utils.js";
```
Por:
```ts
import { DEFAULT_SCAR_CONFIG } from "../critical/critical-effects-table";
import { confirmDialog } from "../core/compat-utils";
```

- [ ] **Step 4: Actualizar `src/reactions/void-defense.ts`**

Cambiar:
```ts
} from "./actor-utils.js";
import { createVoidCriticalStrikeMessage } from "./chat-messages.js";
import { confirmDialog } from "./compat-utils.js";
```
Por:
```ts
} from "../core/actor-utils";
import { createVoidCriticalStrikeMessage } from "../ui/chat-messages";
import { confirmDialog } from "../core/compat-utils";
```

- [ ] **Step 5: Actualizar `src/reactions/shattering-parry.ts`**

Cambiar:
```ts
import { reverseCriticalEffect } from "./critical-effects-application.js";
import { confirmDialog, resolveMessageId } from "./compat-utils.js";
```
Por:
```ts
import { reverseCriticalEffect } from "../critical/critical-effects-application";
import { confirmDialog, resolveMessageId } from "../core/compat-utils";
```

- [ ] **Step 6: Actualizar `src/reactions/opportunity-critical.ts`**

Cambiar:
```ts
import { createCriticalStrikeMessage } from "./chat-messages.js";
```
Por:
```ts
import { createCriticalStrikeMessage } from "../ui/chat-messages";
```

- [ ] **Step 7: Actualizar `src/combat-handler.ts`**

Cambiar:
```ts
} from "./actor-utils.js";
```
Por:
```ts
} from "./core/actor-utils";
```

Cambiar:
```ts
} from "./damage-calculator.js";
```
Por:
```ts
} from "./core/damage-calculator";
```

Cambiar:
```ts
} from "./chat-messages.js";
```
Por:
```ts
} from "./ui/chat-messages";
```

- [ ] **Step 8: Actualizar `src/target-assignment.ts`**

Cambiar:
```ts
import { resolveMessageId, confirmDialog } from "./compat-utils.js";
import { revertFatigueDamage } from "./actor-utils.js";
```
Por:
```ts
import { resolveMessageId, confirmDialog } from "./core/compat-utils";
import { revertFatigueDamage } from "./core/actor-utils";
```

Cambiar:
```ts
} from "./damage-calculator.js";
```
Por:
```ts
} from "./core/damage-calculator";
```

Cambiar:
```ts
import { processAttack } from "./combat-handler.js";
```
Por:
```ts
import { processAttack } from "./combat-handler";
```

- [ ] **Step 9: Actualizar `src/main.ts`**

Cambiar todos los imports de la forma `"./nombre.js"` a la nueva estructura:

```ts
import { registerCombatHandler } from "./combat-handler";
import { registerVoidDefenseHook } from "./reactions/void-defense";
import { registerCriticalStrikeRollHandler } from "./critical/critical-strike-roll";
import { registerCriticalMitigationHandler } from "./critical/critical-mitigation";
import { registerShatteringParryHook } from "./reactions/shattering-parry";
import { registerOpportunityCriticalHandler } from "./reactions/opportunity-critical";
import { CustomCriticalConfig } from "./ui/custom-critical-config";
import { registerTargetAssignmentMenu } from "./target-assignment";
```

- [ ] **Step 10: Commit**

```bash
git add src/
git commit -m "refactor: update import paths after moving to feature subdirectories"
```

---

## Task 6: Extraer helpers de Handlebars

**Files:**
- Create: `src/helpers/handlebars.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Crear `src/helpers/handlebars.ts`**

Extraer los tres helpers que actualmente están dentro del callback de `Hooks.once("init", ...)` en `src/main.ts`:

```ts
// @ts-nocheck
export function registerHandlebarsHelpers(): void {
  Handlebars.registerHelper("join", (array, separator) => {
    if (!Array.isArray(array)) return "";
    return array.join(typeof separator === "string" ? separator : ", ");
  });

  Handlebars.registerHelper("or", (a, b) => a || b);

  Handlebars.registerHelper("concat", (...args) => {
    return args.slice(0, -1).join("");
  });
}
```

- [ ] **Step 2: Actualizar `src/main.ts`**

Agregar el import al tope (después de `// @ts-nocheck`):

```ts
import { registerHandlebarsHelpers } from "./helpers/handlebars";
```

Dentro del callback de `Hooks.once("init", ...)`, reemplazar los tres bloques `Handlebars.registerHelper(...)` por:

```ts
registerHandlebarsHelpers();
```

- [ ] **Step 3: Commit**

```bash
git add src/helpers/handlebars.ts src/main.ts
git commit -m "refactor: extract Handlebars helpers to src/helpers/handlebars.ts"
```

---

## Task 7: Primer build de verificación

- [ ] **Step 1: Correr el build**

```bash
npm run build
```

Expected:
```
vite v5.x.x building for production...
✓ N modules transformed.
dist/bundle.js   XX.XX kB
dist/bundle.js.map   XX.XX kB
✓ built in XXXms
```

- [ ] **Step 2: Si hay errores, revisarlos**

Los únicos errores esperados en esta fase son de **imports no encontrados** (si algún path quedó mal actualizado en Task 5). No deberían aparecer errores de tipos porque todos los archivos tienen `// @ts-nocheck`.

Para cada error de "Cannot find module", revisar el archivo reportado y corregir el path del import. Los `// @ts-nocheck` suprimen errores de tipos; si aparece un error de tipo a pesar del `// @ts-nocheck`, verificar que la línea esté **en la primera línea del archivo** (no después de comentarios o imports).

- [ ] **Step 3: Verificar que dist/bundle.js existe y tiene contenido**

```bash
wc -l dist/bundle.js
```

Expected: número mayor a 100 (el bundle contiene todos los módulos).

- [ ] **Step 4: Commit si hubo correcciones de paths**

```bash
git add src/
git commit -m "fix: correct remaining import paths after first build"
```

(Omitir este step si el build pasó sin cambios.)

---

## Task 8: Actualizar module.json y .gitignore

**Files:**
- Modify: `module.json`
- Modify: `.gitignore`

- [ ] **Step 1: Actualizar `esmodules` en module.json**

Reemplazar la lista completa de `esmodules` (que actualmente tiene 14 entradas) por:

```json
"esmodules": ["dist/bundle.js"],
```

El archivo `module.json` completo en la sección `esmodules` debe quedar:

```json
  "esmodules": [
    "dist/bundle.js"
  ],
```

- [ ] **Step 2: Agregar `dist/` a .gitignore**

Agregar al final de `.gitignore`:

```
dist/
```

- [ ] **Step 3: Commit**

```bash
git add module.json .gitignore
git commit -m "chore: point module.json to dist/bundle.js, gitignore dist/"
```

---

## Task 9: Symlink y verificación en Foundry

- [ ] **Step 1: Eliminar la carpeta `scripts/` del repo**

La carpeta `scripts/` ya no es necesaria (todos los archivos se movieron a `src/` en Task 4). Verificar que está vacía:

```bash
ls scripts/
```

Si está vacía, eliminarla:

```bash
git rm -r scripts/
git commit -m "chore: remove empty scripts/ directory"
```

Si por algún motivo quedó algún archivo, revisarlo — probablemente olvidamos moverlo.

- [ ] **Step 2: Crear el symlink a Foundry**

En macOS:
```bash
npm run link:mac
```

En Linux:
```bash
npm run link:linux
```

Expected: no output (el comando `ln -sf` es silencioso en caso de éxito).

- [ ] **Step 3: Verificar que el symlink apunta a los archivos correctos**

```bash
ls ~/Library/Application\ Support/FoundryVTT/Data/modules/l5r5e-combat-helper/
```

Expected: ver `bundle.js`, `bundle.js.map` y los otros archivos del módulo (lang/, styles/, module.json).

- [ ] **Step 4: Lanzar el modo dev**

```bash
npm run dev
```

Expected: dos procesos arrancando en paralelo:
```
[0] vite v5.x.x building for production...
[0] ✓ built in XXXms
[0] watching for file changes...
[1] [Browsersync] Proxying: http://localhost:30000
[1] [Browsersync] Access URLs:
[1]  Local: https://localhost:3001
```

- [ ] **Step 5: Verificar en Foundry**

1. Abrir Foundry VTT en el browser usando `http://localhost:3001` (el puerto de browser-sync, **no** `localhost:30000`).
2. Cargar un mundo con el sistema `l5r5e`.
3. Verificar en la consola del browser (F12) que no hay errores del módulo.
4. Verificar que la feature más básica funciona: hacer un ataque en combate y confirmar que el módulo calcula el daño.

- [ ] **Step 6: Verificar el livereload**

1. Con Foundry abierto en `localhost:3001`, editar cualquier `.ts` en `src/` (por ejemplo, agregar un `console.log("livereload test")` en `src/main.ts`).
2. Guardar el archivo.
3. Observar en la terminal: Vite debe recompilar en < 1 segundo.
4. El browser debe recargar Foundry automáticamente.
5. En la consola de Foundry, confirmar que aparece `"livereload test"`.
6. Remover el `console.log` y guardar nuevamente.

---

## Notas post-migración

**Para agregar un nuevo feature a partir de ahora:**
1. Crear `src/<carpeta>/<nombre>.ts` con `// @ts-nocheck` en la primera línea.
2. Importarlo desde `src/main.ts`.
3. No tocar `module.json`.

**Phase 2 — Tipado gradual (trabajo futuro, no en este plan):**
- Remover `// @ts-nocheck` de un archivo a la vez, empezando por `src/core/`.
- Agregar tipos explícitos a los parámetros y retornos de funciones.
- Usar los tipos de `@league-of-foundry-developers/foundry-vtt-types` para tipar `game`, `Hooks`, `Actor`, `ChatMessage`, etc.
- Para flags de Foundry con estructura custom, usar el patrón `(doc.flags as Record<string, unknown>)["l5r5e-combat-helper"]`.

**Para builds de release:**
```bash
npm run build
```
El output en `dist/` se incluye en el ZIP de la release (junto con `lang/`, `styles/`, `module.json`).

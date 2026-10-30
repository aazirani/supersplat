# Museum Authoring in the Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author annotations (with links), video screens and rooms with doors in the SuperSplat editor, save them in the `.ssproj`, and export an experience the forked viewer plays.

**Architecture:** One editor-side store (`src/experience/`) keyed by splat layer, with pure modules for settings composition, document round trip, screen fitting and edit operations, all under `node --test`. The UI is a floating Experience panel, three viewport tools and a `ToolOverlay`-based overlay. A new "experience" export composes one settings file per room, validates each with the fork's `validateSettings`, and writes the fork's viewer files next to per-room `.sog` content.

**Tech Stack:** TypeScript 6 (erasable syntax in pure modules), PlayCanvas 2.23, PCUI 6.1, rollup, i18next, `@playcanvas/splat-transform` 3.9, `@playcanvas/supersplat-viewer` (the fork at `../supersplat-viewer`, branch `feature/museum-integration`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-20-museum-authoring-design.md`

## Global Constraints

- Editor world equals viewer world: every stored position is editor world, passed through unchanged at export.
- Multi-room experiences are one project with one splat layer per room.
- Every new locale key goes into all nine files in `static/locales/` in the same position (`npm run lint:locales` demands identical key order). Append new keys at the end of each file, English text in every file.
- Pure modules (`src/experience/types.ts`, `experience-settings.ts`, `experience-doc.ts`, `screen-fit.ts`, `experience-ops.ts`) use erasable TypeScript only (no `enum`, no parameter properties, no namespaces) and import each other with explicit `.ts` extensions, because Node runs them unbundled in tests.
- CI gate for every task: `npm run build`, `npm run lint`, `npm run lint:locales`, `npm test`.
- Defaults from the viewer's format: screen `offset` 0.01, `loop` true, `playDistance` 20, sound `{ volume: 1, refDistance: 1, fadeDistance: 12 }`; door `preloadRadius` 8, new door box 1.4 × 2.6 × 1 m placed 2 m in front of the camera.
- The existing single-file HTML viewer export stays as it is and is refused when the experience has rooms or screens.
- Store commands: one generic `experience.edit(name, fn)` command replaces the spec's per-kind `experience.add*/update*/remove*` events; the per-kind logic lives in the pure `experience-ops.ts`. Queries are `experience.get` and `experience.layers`.
- The experience export always writes a `.zip` (as the existing package viewer export does); the spec's "folder" option is dropped. Export problems are checked before the export dialog opens.
- Layer deletion in this editor is not undoable (the editor prunes history on `scene.elementDestroyed`), so the spec's cascade on layer removal runs on `scene.elementDestroyed` and is not an undo op. Data for a layer that merely leaves the scene (an `AddSplatOp` undo) stays in the store, keyed by the layer's uid.

## Review Focus

1. Two layers with the same name both marked as rooms must get distinct room ids (`hall`, `hall-2`). Test: Task 5, `uniqueRoomId`.
2. Renaming a layer after it became a room must not change its room id or break doors pointing at it. Test: Task 5, `room id survives a layer rename`.
3. A door whose destination layer is later un-marked as a room must be reported by `exportProblems`, not silently dropped. Test: Task 3.
4. A picked video file with spaces or unicode in its name must land in the project as `media/<screen id>.<ext>` with a safe extension. Test: Task 3, `a file screen becomes media/<id>.<ext>` (name `My Clip.MP4`).
5. Opening a `.ssproj` saved before this feature must load an empty experience without an error. Test: Task 4, `deserializeExperience(undefined, …)`.

---

### Task 1: Test harness, fork dependency and the experience types

**Files:**
- Modify: `package.json` (devDependency, `test` script)
- Modify: `tsconfig.json` (add `"rewriteRelativeImportExtensions": true` under `compilerOptions`, as the viewer fork does)
- Create: `src/experience/types.ts`
- Test: `test/types.test.mjs`

**Interfaces:**
- Produces (in `src/experience/types.ts`):

```ts
type Vec3T = [number, number, number];
type PoseT = { position: Vec3T; target: Vec3T; fov: number };
type LayerPose = { position: Vec3T; rotation: [number, number, number, number]; scale: Vec3T };
type ExperienceAnnotation = { id: string; layer: number; position: Vec3T; title: string; text: string; camera: PoseT; layerPose: LayerPose };
type ScreenSource = { kind: 'url'; url: string } | { kind: 'file'; name: string; blob: Blob };
type SoundSettings = { volume: number; refDistance: number; fadeDistance: number };
type ExperienceScreen = { id: string; layer: number; corners: [Vec3T, Vec3T, Vec3T, Vec3T]; source: ScreenSource | null; offset: number; loop: boolean; playDistance: number; sound: SoundSettings | null; layerPose: LayerPose };
type ExperienceDoor = { id: string; to: number; label: string; center: Vec3T; size: Vec3T; preloadRadius: number; arrival: { position: Vec3T; target: Vec3T } | null };
type ExperienceRoom = { layer: number; id: string; doors: ExperienceDoor[] };
type Experience = { annotations: ExperienceAnnotation[]; screens: ExperienceScreen[]; rooms: ExperienceRoom[]; firstRoom: number | null; nextId: number };
type LayerInfo = { uid: number; name: string; visible: boolean; pose: LayerPose };
const DEFAULT_SOUND: SoundSettings = { volume: 1, refDistance: 1, fadeDistance: 12 };
const SCREEN_DEFAULTS = { offset: 0.01, loop: true, playDistance: 20 };
const DOOR_DEFAULTS = { preloadRadius: 8, size: [1.4, 2.6, 1] as Vec3T, distance: 2 };
const emptyExperience = (): Experience => ({ annotations: [], screens: [], rooms: [], firstRoom: null, nextId: 1 });
```

`layer` and `to` are the splat's runtime `uid` (`Element.uid`); `ExperienceDoor.to` names the destination room's layer. `firstRoom` is a layer uid or null (null: `rooms[0]`). `nextId` feeds `a1`, `s1`, `d1` style ids (prefix by kind, see Task 5).

- [ ] **Step 1: Add the dependency and test script**

In `package.json` devDependencies add `"@playcanvas/supersplat-viewer": "file:../supersplat-viewer"`; in scripts add `"test": "node --test test/"`. Run `npm install`.

- [ ] **Step 2: Write the failing test**

`test/types.test.mjs`:

```js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SOUND, DOOR_DEFAULTS, SCREEN_DEFAULTS, emptyExperience } from '../src/experience/types.ts';

describe('experience defaults', () => {
    it('match the viewer format', () => {
        assert.deepEqual(DEFAULT_SOUND, { volume: 1, refDistance: 1, fadeDistance: 12 });
        assert.deepEqual(SCREEN_DEFAULTS, { offset: 0.01, loop: true, playDistance: 20 });
        assert.equal(DOOR_DEFAULTS.preloadRadius, 8);
        assert.deepEqual(DOOR_DEFAULTS.size, [1.4, 2.6, 1]);
    });
    it('starts empty with no first room', () => {
        assert.deepEqual(emptyExperience(), { annotations: [], screens: [], rooms: [], firstRoom: null, nextId: 1 });
    });
});
```

- [ ] **Step 3: Run it**

Run: `npm test`
Expected: FAIL, cannot find module `src/experience/types.ts`

- [ ] **Step 4: Create `src/experience/types.ts`** with the Interfaces block above, exporting every type and constant.

- [ ] **Step 5: Run the tests and the build**

Run: `npm test && npm run build && npm run lint`
Expected: tests PASS 2/2; build and lint clean (the tsconfig flags accept `.ts` imports).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/experience/types.ts test/types.test.mjs
git commit -m "Experience authoring: types, test runner and the viewer fork dependency"
```

---

### Task 2: Screen fit (port of the viewer's fitScreenCorners)

**Files:**
- Create: `src/experience/screen-fit.ts`
- Test: `test/screen-fit.test.mjs`
- Reference: `../supersplat-viewer/src/video/fit-screen.ts` and its test `../supersplat-viewer/test/fit-screen.test.mjs`

**Interfaces:**
- Produces: `fitScreenCorners(points: Vec3T[]): { corners: [Vec3T, Vec3T, Vec3T, Vec3T]; center: Vec3T; width: number; height: number } | null` — same algorithm and same results as the viewer's: fits a plane through the four picked points (order TL, TR, BR, BL), projects them, returns the fitted rectangle; null when degenerate (collinear or coincident points).

- [ ] **Step 1: Write the failing test** — copy the viewer's `test/fit-screen.test.mjs` cases (the museum corners from `../supersplat-viewer/test/videos-settings.test.mjs`, expected width ≈ 0.74 and height ≈ 0.41 within 0.02, the degenerate case returning null), importing from `../src/experience/screen-fit.ts`.

- [ ] **Step 2: Run it**

Run: `node --test test/screen-fit.test.mjs`
Expected: FAIL, module not found

- [ ] **Step 3: Port the viewer's `fit-screen.ts`** into `src/experience/screen-fit.ts`, on `Vec3T` tuples, no PlayCanvas import.

- [ ] **Step 4: Run it**

Run: `node --test test/screen-fit.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/experience/screen-fit.ts test/screen-fit.test.mjs
git commit -m "Experience: fit a screen rectangle from four picked corners"
```

---

### Task 3: Settings composition and export problems

**Files:**
- Create: `src/experience/experience-settings.ts`
- Test: `test/experience-settings.test.mjs`

**Interfaces:**
- Consumes: `Experience`, `LayerInfo`, `Vec3T` from `./types.ts`; `validateSettings` and type `ExperienceSettings` from `@playcanvas/supersplat-viewer/settings`.
- Produces:

```ts
type ComposedPage = { layer: number | null; path: string; settings: ExperienceSettings };
//   layer: the room's layer uid, or null for the "all visible layers" page when there are no rooms
//   path: '' for the first room (the page), 'rooms/<id>/' for the others
type ComposedMedia = { path: string; screen: ExperienceScreen };   // path 'media/<id>.<ext>'
type ComposeResult = { pages: ComposedPage[]; media: ComposedMedia[]; warnings: string[] };
const exportProblems = (experience: Experience, layers: LayerInfo[]): string[];
const composeExperience = (experience: Experience, layers: LayerInfo[], base: ExperienceSettings): ComposeResult;
const mediaFileName = (screen: ExperienceScreen): string | null;   // 'media/s3.mp4' for a file source, null for a url
```

Rules (from the spec):
- `exportProblems` returns one line per: a door without an arrival; a door whose `to` is not a room layer; a screen without a source; a room layer that is hidden; a room id that is not a slug (`/^[a-z0-9]+(-[a-z0-9]+)*$/`) or not unique. Empty array means export may proceed. `composeExperience` throws `new Error(problems.join('\n'))` when it is not empty.
- Without rooms: one page, `layer: null`, `path: ''`, settings = `base` plus `annotations` and `videos` of every visible layer; annotations and screens on hidden layers are skipped with a warning naming the layer.
- With rooms: the first room is `experience.firstRoom ?? rooms[0].layer`. Its page gets `base` plus its annotations and videos plus `rooms`: the first entry `{ id, doors }`, every other `{ id, contentUrl: 'rooms/<id>/scene.sog', settingsUrl: 'rooms/<id>/settings.json', doors }`, doors as `{ to: <room id of the layer>, label, center, size, preloadRadius, arrival }`. Every other room gets `base` with `animTracks: []` and `startMode: 'default'`, its own annotations and videos, no `rooms`. A visible non-room layer is ignored with a warning.
- Annotation → `{ position, title, text, camera: { initial: camera } }`. Screen → `{ src: mediaFileName(screen) ?? source.url, corners, offset, loop, playDistance, sound: sound ?? false }`.
- Every page's settings pass `validateSettings(settings, { limits: true })`; a thrown message is rethrown prefixed with the page path.

- [ ] **Step 1: Write the failing tests** in `test/experience-settings.test.mjs`. Fixtures: `hall` (uid 1), `tunnel` (uid 2), `attic` (uid 3, hidden) layers; `base` from the fork's `defaultSettings()` (`@playcanvas/supersplat-viewer/settings`). Cases:
  - `no rooms: one page with the visible layers' annotations and videos` (annotation on uid 1 and screen on uid 2 both present; an annotation on hidden uid 3 produces one warning naming `attic` and is absent)
  - `rooms: first room carries the rooms list and the others their own settings` (rooms hall+tunnel, door hall→tunnel with arrival; expect pages `['', 'rooms/tunnel/']`, `pages[0].settings.rooms[1].contentUrl === 'rooms/tunnel/scene.sog'`, `rooms[0].doors[0].to === 'tunnel'`, `pages[1].settings.rooms === undefined`, `pages[1].settings.animTracks` empty)
  - `firstRoom picks the page` (firstRoom = 2 → pages[0].layer === 2)
  - `a file screen becomes media/<id>.<ext>` (source `{ kind: 'file', name: 'My Clip.MP4', blob }` → `media[0].path === 'media/s1.mp4'` and `videos[0].src === 'media/s1.mp4'`; a url source gives `src` = the url and no media entry)
  - `sound null exports as false`
  - `exportProblems lists a door without arrival, a door to a non-room, a screen without source, a hidden room layer, a duplicate room id`
  - `composeExperience throws with the problems`
  - `every page validates against the fork` (spy: the composed pages pass `validateSettings(settings, { limits: true })` without throwing; and a title longer than `ANNOTATION_LIMITS.titleMax` makes `composeExperience` throw a message containing the page path)
  Use `new Blob(['x'])` for the file blob (Node has `Blob`).

- [ ] **Step 2: Run them**

Run: `node --test test/experience-settings.test.mjs`
Expected: FAIL, module not found

- [ ] **Step 3: Implement `src/experience/experience-settings.ts`** per the rules above. `mediaFileName`: extension = lowercase text after the last `.` of `source.name`, only `[a-z0-9]`, fallback `mp4`.

- [ ] **Step 4: Run them**

Run: `node --test test/experience-settings.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/experience/experience-settings.ts test/experience-settings.test.mjs
git commit -m "Experience: compose per-room viewer settings and list export problems"
```

---

### Task 4: Document round trip

**Files:**
- Create: `src/experience/experience-doc.ts`
- Test: `test/experience-doc.test.mjs`

**Interfaces:**
- Consumes: `Experience`, `ExperienceScreen` from `./types.ts`; `mediaFileName` from `./experience-settings.ts`.
- Produces:

```ts
type ExperienceDoc = { version: 1; annotations: unknown[]; screens: unknown[]; rooms: unknown[]; firstRoom: number | null; nextId: number };
type SerializedExperience = { doc: ExperienceDoc; media: { path: string; blob: Blob }[] };
const serializeExperience = (experience: Experience, layerIndex: Map<number, number>): SerializedExperience;
const deserializeExperience = (doc: unknown, layerUids: number[], media: Map<string, Blob>): Experience;
```

Rules: layer references (`layer`, `to`, `firstRoom`) are written as the layer's index in `document.splats` (`layerIndex`) and read back through `layerUids[index]`; an item whose layer index is out of range is dropped. A file source is written as `{ kind: 'file', name, path: 'media/<id>.<ext>' }` and read back with the blob from `media.get(path)` (missing blob: source becomes null). `doc` undefined, null or with another `version` → `emptyExperience()`. `nextId` round-trips.

- [ ] **Step 1: Write the failing tests** in `test/experience-doc.test.mjs`:
  - `round-trips annotations, screens, rooms and doors through layer indices` (uids `[10, 20]` ↔ indices `[0, 1]`; deepEqual after a round trip, blobs compared by identity)
  - `writes a picked file as media/<id>.<ext> and lists it` (`media[0].path === 'media/s1.mp4'`, blob identity)
  - `a missing media file leaves the screen without a source`
  - `an old document without experience loads empty` (`deserializeExperience(undefined, [10], new Map())` deepEquals `emptyExperience()`)
  - `drops items whose layer no longer exists`

- [ ] **Step 2: Run them** — Run: `node --test test/experience-doc.test.mjs`. Expected: FAIL, module not found

- [ ] **Step 3: Implement `src/experience/experience-doc.ts`**

- [ ] **Step 4: Run them** — Run: `node --test test/experience-doc.test.mjs`. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/experience/experience-doc.ts test/experience-doc.test.mjs
git commit -m "Experience: document.json round trip with embedded media"
```

---

### Task 5: Pure edit operations

**Files:**
- Create: `src/experience/experience-ops.ts`
- Test: `test/experience-ops.test.mjs`

**Interfaces:**
- Consumes: types from `./types.ts`.
- Produces (each returns void and mutates the passed `Experience`; ids come from `nextId`):

```ts
const slugify = (name: string): string;                       // 'Hall 2 (scan)' -> 'hall-2-scan'; '' -> 'room'
const uniqueRoomId = (experience: Experience, wanted: string, except?: number): string;  // 'hall', then 'hall-2', 'hall-3'…; `except` is a layer uid whose own id does not count
const addAnnotation = (e: Experience, init: { layer: number; position: Vec3T; camera: PoseT; layerPose: LayerPose }): ExperienceAnnotation;  // id 'a<n>', title 'Annotation <n>', text ''
const addScreen = (e: Experience, init: { layer: number; corners: [Vec3T, Vec3T, Vec3T, Vec3T]; layerPose: LayerPose }): ExperienceScreen;    // id 's<n>', SCREEN_DEFAULTS, sound DEFAULT_SOUND, source null
const setRoom = (e: Experience, layer: number, isRoom: boolean, name: string): ExperienceRoom | null;  // on: adds { layer, id: uniqueRoomId(slugify(name)), doors: [] }; off: removes the room and every door of other rooms pointing at it; clears firstRoom if it was this layer
const addDoor = (e: Experience, roomLayer: number, init: { center: Vec3T }): ExperienceDoor;  // id 'd<n>', to: another room's layer if one exists else -1, label '', DOOR_DEFAULTS.size, preloadRadius 8, arrival null
const removeItem = (e: Experience, kind: 'annotation' | 'screen' | 'door', id: string): void;
const removeLayer = (e: Experience, layer: number): void;      // the cascade: its annotations, screens, room, doors leading to it, firstRoom
const find = (e: Experience, kind: 'annotation' | 'screen' | 'door', id: string): ExperienceAnnotation | ExperienceScreen | ExperienceDoor | undefined;
const layerPoseChanged = (a: LayerPose, b: LayerPose, epsilon = 1e-4): boolean;
```

- [ ] **Step 1: Write the failing tests** in `test/experience-ops.test.mjs`: slug examples above; `uniqueRoomId` gives `hall`, `hall-2` for two layers named Hall and keeps a room's own id when re-slugging it (`except`); `room id survives a layer rename` (`setRoom(e, layer, true, 'Hall')` then `setRoom(e, layer, true, 'Other name')`: still one room with id `hall`; a door pointing at `layer` is untouched); `addAnnotation` ids `a1`, `a2` and `nextId` advances; `addScreen` defaults; `setRoom off removes doors pointing at it and clears firstRoom`; `removeLayer cascades`; `addDoor targets another room when one exists`; `layerPoseChanged` false for equal, true for a moved position.

- [ ] **Step 2: Run them** — Run: `node --test test/experience-ops.test.mjs`. Expected: FAIL, module not found

- [ ] **Step 3: Implement `src/experience/experience-ops.ts`**

- [ ] **Step 4: Run them** — Run: `npm test`. Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/experience/experience-ops.ts test/experience-ops.test.mjs
git commit -m "Experience: pure edit operations with ids, slugs and the layer cascade"
```

---

### Task 6: The store, its events and undo

**Files:**
- Create: `src/experience/experience.ts`
- Modify: `src/edit-ops.ts` (export a new `ExperienceEditOp`)
- Modify: `src/main.ts:254-290` (call `registerExperienceEvents(events, scene)` after `registerDocEvents`)

**Interfaces:**
- Consumes: Task 5's ops; `Splat` (`uid`, `name`, `visible`, `entity.getPosition/getRotation/getLocalScale`), `scene.getElementsByType(ElementType.splat)`, `scene.elementDestroyed`, `scene.clear` (the file handler fires `scene.clear` before loading a document; subscribe to it), `edit.add`.
- Produces (events):
  - `events.function('experience.get')` → the live `Experience` (read only for callers).
  - `events.function('experience.layers')` → `LayerInfo[]` for every splat in the scene, in scene order (`pose` from the entity: position, rotation quaternion `[x,y,z,w]`, local scale).
  - `events.function('experience.layerPose', uid)` → `LayerPose` of that splat now.
  - `events.on('experience.edit', (name: string, fn: (e: Experience) => void))`: snapshot, run `fn`, push `new ExperienceEditOp(name, store, before, after)` with `edit.add` and `suppressOp = true`, fire `experience.changed`.
  - `events.on('experience.select', (sel: { kind: 'annotation' | 'screen' | 'door'; id: string } | null))` stores it and fires `experience.selection` with the value; `events.function('experience.selection')` returns it. A `experience.changed` whose selected id no longer exists resets the selection to null.
  - `events.function('experience.hasRoomsOrScreens')` → boolean.
  - `events.fire('experience.changed')` after every change, undo, redo, load and clear.
  - `events.function('docSerialize.experience', splats: Splat[])` → `SerializedExperience` (Task 4, `layerIndex` from the splats array order).
  - `events.function('docDeserialize.experience', doc: unknown, splats: Splat[], media: Map<string, Blob>)` replaces the store and fires `experience.changed`.
  - On `scene.elementDestroyed` of a splat: `removeLayer` (no op pushed). On `scene.clear`: store = `emptyExperience()`.
- `ExperienceEditOp` in `src/edit-ops.ts`: `{ name; do() { restore(after) } undo() { restore(before) } }` where snapshots are `structuredClone` of the experience (Blobs clone by reference semantics in structuredClone; that is fine) and `restore` is a callback the store passes in, which assigns and fires `experience.changed`.

- [ ] **Step 1: Implement `src/experience/experience.ts`** with `registerExperienceEvents(events: Events, scene: Scene)` and the op in `src/edit-ops.ts`; register in `src/main.ts`.

- [ ] **Step 2: Build and lint**

Run: `npm run build && npm run lint`
Expected: clean

- [ ] **Step 3: Browser check** (`npm run develop`, open http://localhost:3000, load any splat): in the console run

```js
scene.events.fire('experience.edit', 'test', e => { e.annotations.push({ id: 'a1', layer: scene.getElementsByType('splat')[0].uid, position: [0,0,0], title: 't', text: '', camera: { position: [0,0,1], target: [0,0,0], fov: 60 }, layerPose: scene.events.invoke('experience.layerPose', scene.getElementsByType('splat')[0].uid) }); });
scene.events.invoke('experience.get').annotations.length   // 1
scene.events.fire('edit.undo'); scene.events.invoke('experience.get').annotations.length   // 0
scene.events.fire('edit.redo'); scene.events.invoke('experience.get').annotations.length   // 1
```

Expected: 1, 0, 1.

- [ ] **Step 4: Commit**

```bash
git add src/experience/experience.ts src/edit-ops.ts src/main.ts
git commit -m "Experience: store, events and undo"
```

---

### Task 7: Persistence in the project file

**Files:**
- Modify: `src/doc.ts:140-205` (load) and `src/doc.ts:289-345` (save)

**Interfaces:**
- Consumes: `docSerialize.experience` / `docDeserialize.experience` (Task 6); `zipFs.createWriter(path)` / `zipFs.createSource(path)` as `doc.ts` already uses them.

- [ ] **Step 1: Save** — in `saveDocument`, after `splats` is computed: `const experience = events.invoke('docSerialize.experience', splats)`; add `experience: experience.doc` to `document`; after the instance files, for each `experience.media` entry write `new Uint8Array(await blob.arrayBuffer())` to `zipFs.createWriter(path)`.

- [ ] **Step 2: Load** — in `loadDocument` after the splats loop and the bound read, before `docDeserialize.timeline`: collect `media` by reading each `media/...` path named in `document.experience?.screens` (a screen's `source.path`) through `zipFs.createSource(path)` → `source.read().readAll()` → `new Blob([bytes])`; then `events.invoke('docDeserialize.experience', document.experience, loadedSplatsInDocumentOrder, media)`. A missing media entry is skipped (the deserializer leaves the source null).

- [ ] **Step 3: Build and lint** — Run: `npm run build && npm run lint`. Expected: clean

- [ ] **Step 4: Browser check** — with the console snippet of Task 6 add an annotation, add a screen with `source: { kind: 'file', name: 'sample.mp4', blob: await (await fetch('/sample.mp4')).blob() }` (serve `../supersplat-viewer/public/sample.mp4` by copying it into `dist/` for the check), save the project (File → Save), reload the page, open the project: `scene.events.invoke('experience.get')` shows the annotation and the screen with a `Blob` source of the same size. Also open a project saved before this branch: no error, empty experience.

- [ ] **Step 5: Commit**

```bash
git add src/doc.ts
git commit -m "Experience: saved in the .ssproj with embedded media"
```

---

### Task 8: Viewport overlay

**Files:**
- Create: `src/experience/experience-overlay.ts`
- Modify: `src/ui/overlays-panel.ts` (a "Experience" toggle row after Camera Info, key `panel.overlays.experience`), `src/main.ts` (construct the overlay after the tool manager)
- Modify: all nine `static/locales/*.json` (append `"panel.overlays.experience": "Experience"`)

**Interfaces:**
- Consumes: `ToolOverlay` + `OverlayWriter` (`src/tool-overlay.ts`: `provider`, `writer.dot/segment/fill`), `experience.get`, `experience.selection`, `experience.changed`, `experience.selection`, splat visibility.
- Produces: `class ExperienceOverlay { constructor(events: Events, scene: Scene) }`; events `experience.showOverlay` (function → boolean), `experience.setShowOverlay(visible)` (fires `experience.showOverlay`), default on. Drawing per frame, only for layers whose splat is visible: annotation → dot; screen → four segments around its corners; door → the twelve edges of the axis-aligned box; the selected item additionally gets a fill (screen: two triangles; door: its six faces; annotation: a small diamond of four segments 0.15 m around the dot). The overlay is added to the scene when shown and removed when hidden; `scene.forceRender = true` after any change.

- [ ] **Step 1: Implement the overlay and the panel row; append the locale key to the nine files.**

- [ ] **Step 2: Build, lint, locales** — Run: `npm run build && npm run lint && npm run lint:locales`. Expected: clean, locales in sync (key count +1)

- [ ] **Step 3: Browser check** — add an annotation via the console: a dot appears at the point; hide the layer: the dot disappears; Overlays → Experience off: nothing drawn.

- [ ] **Step 4: Commit**

```bash
git add src/experience/experience-overlay.ts src/ui/overlays-panel.ts src/main.ts static/locales
git commit -m "Experience: viewport overlay for annotations, screens and doors"
```

---

### Task 9: Experience panel with the Annotations section, and the place tool

**Files:**
- Create: `src/ui/experience-panel.ts`, `src/ui/scss/experience-panel.scss`, `src/ui/svg/experience.svg` (a pin/marker glyph, same 24×24 style as `overlays.svg`)
- Create: `src/tools/annotation-place-tool.ts`
- Modify: `src/ui/scss/style.scss` (`@use 'experience-panel.scss';`), `src/ui/right-toolbar.ts` (button `right-toolbar-experience` after `overlays`, fires `experiencePanel.toggleVisible`, active class on `experiencePanel.visible`), `src/ui/editor.ts` (construct and append the panel next to `overlaysPanel`), `src/ui/overlays-panel.ts`, `src/ui/settings-panel.ts`, `src/ui/appearance-panel.ts` (close on `experiencePanel.visible` true, like they do for each other), `src/main.ts` (register `toolManager.register('annotationPlace', …)`), nine locale files.

**Interfaces:**
- Consumes: Task 6 events; `scene.camera.intersect(x01, y01)` → `{ splat, position } | null`; `camera.getPose` → `{ position: {x,y,z}, target, fov }`; `camera.setPose` (`events.fire('camera.setPose', { position: Vec3, target: Vec3, fov }, speed)`); `tool.annotationPlace` activation; the click-vs-drag pattern of `src/tools/measure-tool.ts:287-357` (`CLICK_TOLERANCE = 4`, listeners on `canvasContainer.dom`, pointerup with capture).
- Produces:
  - Panel: `class ExperiencePanel extends Container` (`id: 'experience-panel'`, classes `panel options-panel`), events `experiencePanel.visible` / `experiencePanel.setVisible` / `experiencePanel.toggleVisible` exactly as `overlays-panel.ts:323-341`. Section headers via the same `sectionHeader` helper. The Annotations section: a list container (`.experience-list`, one `.experience-list-row` per annotation showing title and layer name, `.selected` on the selected one, click → `experience.select`), buttons *Add* and *Remove*, and for the selected annotation: `TextInput` title, `TextAreaInput` text, a hint label (`panel.experience.links-hint`), buttons *Set camera from view*, *Move point*. Field changes go through `experience.edit`. Selecting an annotation fires `camera.setPose` with its camera. A warning icon label (`panel.experience.moved-warning` as tooltip) shows on rows whose `layerPose` differs from `experience.layerPose(layer)` (`layerPoseChanged`). The panel rebuilds its lists on `experience.changed`, `experience.selection`, `splat.name`, `scene.elementAdded`, `scene.elementRemoved`.
  - Tool: `class AnnotationPlaceTool implements Tool`, constructor `(events, scene, canvasContainer: Container)`. `events.on('experience.placeAnnotation', (target: string | null) => …)` stores the target and fires `tool.annotationPlace`. On a click: `intersect`; null → nothing; hit → when `target` is null: `experience.edit('addAnnotation', e => addAnnotation(e, { layer: splat.uid, position, camera: fromGetPose(), layerPose }))` then `experience.select` the new id; when `target` is set: update that annotation's `position` and `layerPose`. Then `events.fire('tool.deactivate')`. A select-toolbar container with a hint label (`tool.experience.place-hint`) is shown while active.
- Locale keys (append in this order): `panel.experience` "Experience", `panel.experience.annotations` "Annotations", `panel.experience.screens` "Screens", `panel.experience.rooms` "Rooms", `panel.experience.add` "Add", `panel.experience.remove` "Remove", `panel.experience.title` "Title", `panel.experience.text` "Text", `panel.experience.links-hint` "Links: [label](https://…) or a bare url", `panel.experience.set-camera` "Set camera from view", `panel.experience.move-point` "Move point", `panel.experience.moved-warning` "The layer moved after this point was picked", `panel.experience.layer` "Layer", `tool.experience.place-hint` "Click a point on a splat to place the annotation".

- [ ] **Step 1: Implement the panel (Annotations section only), the tool, the toolbar button, the registrations, the scss and the locale keys.** Panel layout: fixed width like the overlays panel; list max height 160px with `overflow-y: auto`.

- [ ] **Step 2: Build, lint, locales** — Run: `npm run build && npm run lint && npm run lint:locales`. Expected: clean

- [ ] **Step 3: Browser check** — open the panel from the right toolbar; Add → click on the splat → a row appears, selected, dot in the viewport; edit the title and text (`See [the site](https://example.com)`); Set camera from view after moving the camera; select another row then this one: the camera flies to its framing; Move point → click elsewhere → dot moves; undo twice reverts the move and the text; Remove deletes it. Save, reload, reopen: the annotation is back.

- [ ] **Step 4: Commit**

```bash
git add src/ui/experience-panel.ts src/ui/scss/experience-panel.scss src/ui/scss/style.scss src/ui/svg/experience.svg src/ui/right-toolbar.ts src/ui/editor.ts src/ui/overlays-panel.ts src/ui/settings-panel.ts src/ui/appearance-panel.ts src/tools/annotation-place-tool.ts src/main.ts static/locales
git commit -m "Experience panel: annotations with links, camera framing and the place tool"
```

---

### Task 10: Screens section and the corners tool

**Files:**
- Create: `src/tools/screen-corners-tool.ts`
- Modify: `src/ui/experience-panel.ts` (Screens section), `src/main.ts` (register `screenCorners`), nine locale files

**Interfaces:**
- Consumes: `fitScreenCorners` (Task 2), `addScreen` (Task 5), the click pattern and `intersect` as in Task 9, `ToolOverlay` for the picked dots, `showPopup` (`events.invoke('showPopup', { type: 'error', header, message })`).
- Produces:
  - Tool `ScreenCornersTool implements Tool`, constructor `(events, scene, canvasContainer)`. `events.on('experience.pickScreen', (target: string | null))` → stores the target, resets the picked points, fires `tool.screenCorners`. Each hit click appends a point and the hint label shows `tool.experience.corners-hint` with `{{n}}` = points picked so far (0..3) and the corner name in order TL, TR, BR, BL (`tool.experience.corner-tl` …). After four: `fitScreenCorners`; null → `showPopup` error `tool.experience.corners-degenerate`, reset to zero points; else `experience.edit('addScreen' | 'moveScreen', …)` using the fit's `corners` and the layer of the first hit, select it, `tool.deactivate`. Escape (`keydown` on `document` while active) cancels.
  - Panel Screens section: list rows (source name or url or `panel.experience.no-source`, layer), buttons *Add* (fires `experience.pickScreen(null)`), *Remove*; for the selected: size label `panel.experience.size` showing `width × height m` from `fitScreenCorners(corners)`, button *Re-pick corners* (`experience.pickScreen(id)`), *Choose file…* (`<input type="file" accept="video/*">` created once, hidden; on change → `experience.edit('setScreenSource', …)` with `{ kind: 'file', name: file.name, blob: file }`), `TextInput` url (non-empty value sets `{ kind: 'url', url }`), `NumericInput` offset (min 0, precision 3), `BooleanInput` loop, `NumericInput` play distance (min 0.1), `BooleanInput` sound (null ↔ `DEFAULT_SOUND`), `NumericInput` volume (0..1), reference distance (min 0.01), fade distance (must be greater than reference distance: the input clamps to `refDistance + 0.01`).
- Locale keys (append): `panel.experience.re-pick` "Re-pick corners", `panel.experience.choose-file` "Choose file…", `panel.experience.url` "URL", `panel.experience.no-source` "No video", `panel.experience.size` "Size", `panel.experience.offset` "Offset", `panel.experience.loop` "Loop", `panel.experience.play-distance` "Play distance", `panel.experience.sound` "Sound", `panel.experience.volume` "Volume", `panel.experience.ref-distance` "Reference distance", `panel.experience.fade-distance` "Fade distance", `tool.experience.corners-hint` "Click corner {{n}} of 4: {{corner}}", `tool.experience.corner-tl` "top left", `tool.experience.corner-tr` "top right", `tool.experience.corner-br` "bottom right", `tool.experience.corner-bl` "bottom left", `tool.experience.corners-degenerate` "Those four points do not form a rectangle. Pick them again.".

- [ ] **Step 1: Implement the tool, the section and the keys.**

- [ ] **Step 2: Build, lint, locales** — Run: `npm run build && npm run lint && npm run lint:locales`. Expected: clean

- [ ] **Step 3: Browser check** with the museum hall scan: Add → four clicks on the screen (TL, TR, BR, BL) → a rectangle appears, size about 0.74 × 0.41 m; Choose file… `sample.mp4`; set fade distance 10; undo reverts the field; save, reload: the screen, its blob and its fields are back. Four clicks on one spot: the error popup, tool still active.

- [ ] **Step 4: Commit**

```bash
git add src/tools/screen-corners-tool.ts src/ui/experience-panel.ts src/main.ts static/locales
git commit -m "Experience panel: video screens picked from four corners"
```

---

### Task 11: Rooms section and the door box tool

**Files:**
- Create: `src/tools/door-box-tool.ts`
- Modify: `src/ui/experience-panel.ts` (Rooms section), `src/main.ts` (register `doorBox`), nine locale files

**Interfaces:**
- Consumes: `setRoom`, `addDoor`, `uniqueRoomId`, `slugify` (Task 5); `ShapeTransformGizmo` + `BoxShape` as in `src/tools/box-selection.ts:160-200` (options `rotate: false, uniformScale: false, lowerBoundScale: new Vec3(0.05, 0.05, 0.05)`); `camera.getPose`; `splat.visible` setter; `experience.layers`.
- Produces:
  - Tool `DoorBoxTool implements Tool` with `setTransformMode` (translate/scale), `getFocus` (the box bound). `events.on('experience.editDoor', (doorId: string))` → stores the id, fires `tool.doorBox`. On activate: place `box.pivot` at the door's `center`, `lenX/Y/Z` from `size`, add the box to the scene, attach the gizmo. `onTransformEnd` → `experience.edit('moveDoor', e => { door.center = …; door.size = … })`. `experience.changed` while active → re-sync the box from the store (undo/redo). Deactivate: remove the box, detach.
  - Panel Rooms section: one row per layer (`experience.layers`) with `BooleanInput` *Is a room* (`setRoom(e, uid, value, name)`), a `TextInput` room id (enabled when it is a room; a value that is not a valid slug or not unique shows `panel.experience.bad-id` under it and is not applied), a radio-like `BooleanInput` *First room* (setting one clears the others: `e.firstRoom = uid`). For the selected room (clicking a room row selects it: `experience.select({ kind: 'room', … })` is not a thing — keep a panel-local `selectedRoom: number | null`), a *Show only this room* `BooleanInput` (on: hides every other room layer by setting `splat.visible = false` and remembers which were visible; off: restores them), *Add door* (`addDoor` with `center` = camera position + forward × `DOOR_DEFAULTS.distance`, then `experience.select({ kind: 'door', id })` and `experience.editDoor(id)`), a door list (label or `panel.experience.door` + id, destination id), *Remove door* (reuses `panel.experience.remove`; `removeItem(e, 'door', id)`), and for the selected door: `SelectInput` destination (options: the other rooms' ids; value `to`), `TextInput` label, `NumericInput` preload radius, `VectorInput` centre and size (precision 2, size min 0.05; changes through `experience.edit`), button *Set arrival from view* (refused with `showPopup` info `panel.experience.arrival-hidden` when the destination layer is hidden; otherwise stores `{ position, target }` from `camera.getPose`), and a status label `panel.experience.arrival-set` / `panel.experience.arrival-missing`. Camera forward: `scene.camera.mainCamera.forward`, position `scene.camera.mainCamera.getPosition()`.
- Locale keys (append): `panel.experience.is-room` "Is a room", `panel.experience.room-id` "Room id", `panel.experience.first-room` "First room (the page)", `panel.experience.bad-id` "Use lowercase letters, digits and dashes; ids must be unique", `panel.experience.show-only` "Show only this room", `panel.experience.add-door` "Add door", `panel.experience.door` "Door", `panel.experience.destination` "Destination", `panel.experience.label` "Label", `panel.experience.preload-radius` "Preload radius", `panel.experience.center` "Centre", `panel.experience.door-size` "Size", `panel.experience.set-arrival` "Set arrival from view", `panel.experience.arrival-set` "Arrival pose captured", `panel.experience.arrival-missing` "No arrival pose yet: show the destination room, place the camera where visitors arrive, then set it", `panel.experience.arrival-hidden` "Show the destination room first, then place the camera where visitors should arrive.", `panel.experience.edit-door` "Edit box".

- [ ] **Step 1: Implement the tool, the section and the keys.**

- [ ] **Step 2: Build, lint, locales** — Run: `npm run build && npm run lint && npm run lint:locales`. Expected: clean

- [ ] **Step 3: Browser check** with two layers (hall, tunnel): mark both as rooms (ids `hall`, `tunnel`), hall first; select hall, Add door → box appears 2 m ahead with the gizmo; drag it to the doorway, scale it; destination tunnel; Show only this room on tunnel, place the camera, Set arrival from view → status "captured"; the same the other way; undo/redo a drag; rename the hall layer: its id stays `hall`; untick tunnel's Is a room: hall's door to it shows an empty destination (the export check for it comes in Task 12).

- [ ] **Step 4: Commit**

```bash
git add src/tools/door-box-tool.ts src/ui/experience-panel.ts src/main.ts static/locales
git commit -m "Experience panel: rooms, doors with a box gizmo and arrival poses"
```

---

### Task 12: The Experience export

**Files:**
- Create: `src/export-experience.ts`
- Modify: `src/export-options.ts` (`ExportType` adds `'experience'`; `buildExportOptions` case `'experience'`: `viewerExportSettings = buildViewerSettings(events, { ...choices, viewerType: 'zip' })` and `sogIterations = choices.sogIterations`), `src/ui/export-popup.ts` (`activeRows.experience = [animationRow, loopRow, colorRow, fovRow, bandsRow, iterationsRow]`, extension `.zip`, `getChoices` case `'experience'` = the viewer choices plus `sogIterations: iterationsSlider.value`), `src/file-handler.ts` (`FileType` adds `'experience'`; `exportScene` maps `'experience'` → `'experience'`; `scene.write` case `'experience'` → `exportExperience(...)`; `scene.export` for `'viewer'` with `experience.hasRoomsOrScreens()` true → `showPopup` error `popup.export.experience-only` and return; for `'experience'` with `experience.exportProblems()` non-empty → `showPopup` error listing them and return), `src/ui/menu.ts` (item `menu.file.export.experience` after the viewer item, `scene.export('experience')`), `src/experience/experience.ts` (add `events.function('experience.exportProblems')` → `exportProblems(get(), layers())`), nine locale files.

**Interfaces:**
- Consumes: `composeExperience`, `mediaFileName` (Task 3) — the splat-transform `ExperienceSettings` that `buildViewerSettings` returns is structurally the fork's type for every field used, so pass it through with a cast; `writeSplatFile(splats, serializeSettings, 'sog-bundle', 'scene.sog', { iterations }, memFs)` from `src/splat-serialize.ts` with a `MemoryFileSystem` (its `results: Map<string, Uint8Array>`); `ZipFileSystem` over `fs.createWriter('output.zip')` as `serializeViewer` does; `renderViewerHtml`, `js`, `css` from `@playcanvas/supersplat-viewer`; `createProgressRenderer`/`splatTransformLogger` as `serializeViewer` uses them (export a `withExportProgress(label, events, fn)` helper from `splat-serialize.ts` or reuse the pattern inline).
- Produces: `exportExperience(events: Events, scene: Scene, serializeSettings: SerializeSettings, options: SceneExportOptions, fs: FileSystem): Promise<void>` writing `output.zip` with:
  - `index.html` = `renderViewerHtml({ bootstrap: { settingsUrl: 'settings.json', contentUrl: 'scene.sog', contentFilename: 'scene.sog' }, backgroundColor: settings.background.color })`, `index.js` = `js`, `index.css` = `css`
  - `settings.json` = `pages[0].settings`, `scene.sog` = the SOG of `pages[0].layer` (or all visible splats when `layer` is null)
  - for each other page: `rooms/<id>/scene.sog` and `rooms/<id>/settings.json`
  - for each media entry: its blob bytes at `media/<id>.<ext>`
  Warnings from `composeExperience` go to `console.warn`. The splat for a layer uid comes from `scene.getElementsByType(ElementType.splat)`.
- Locale keys (append): `menu.file.export.experience` "Experience (.zip)", `popup.export.experience-only` "This scene has rooms or video screens. Use File → Export → Experience (.zip) for it.", `popup.export.experience-problems` "The experience is not ready to export:".

- [ ] **Step 1: Implement the export and the wiring; append the keys.**

- [ ] **Step 2: Build, lint, locales, tests** — Run: `npm run build && npm run lint && npm run lint:locales && npm test`. Expected: all clean

- [ ] **Step 3: Browser check** — with the two-room project of Task 11 and the screen of Task 10: File → Export → Viewer HTML is refused with the message; File → Export → Experience (.zip) with a door lacking an arrival is refused listing it; after fixing, export succeeds. Unzip into a folder, serve it (`npx serve <folder>`), open it: the hall loads with the forked viewer, the annotation tooltip shows "More info", the screen plays `sample.mp4` with sound after a click, the door marker leads to the tunnel and back, `?room=tunnel` opens the tunnel.

- [ ] **Step 4: Commit**

```bash
git add src/export-experience.ts src/export-options.ts src/ui/export-popup.ts src/file-handler.ts src/ui/menu.ts src/experience/experience.ts static/locales
git commit -m "Experience export: per-room content and settings with the forked viewer"
```

---

### Task 13: Documentation

**Files:**
- Modify: `README.md` (a "Museum authoring" section: what the Experience panel does, the export layout, that the viewer is the fork, how to run the tests)

- [ ] **Step 1: Write the section.**
- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Docs: museum authoring in the editor"
```

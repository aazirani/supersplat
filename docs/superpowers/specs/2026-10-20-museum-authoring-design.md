# Museum authoring in the SuperSplat editor: design

Date: 2026-10-20. Editor: SuperSplat 3.5.2 (this branch, `feature/museum-authoring`). Viewer: the
fork's `feature/museum-integration` branch, whose settings format this editor writes (see its
`docs/api.md`: annotations with links, `rooms`, `videos`).

## Goal

Everything the forked viewer can show should be authorable in the editor, without hand-editing
`settings.json`:

- **Annotations**: a point in the scan, a title, text that may carry links, and the camera
  framing the viewer flies to.
- **Video screens**: a rectangle on a scanned screen, picked from four corners, with a video file
  and its sound settings.
- **Rooms and doors**: several separately scanned rooms in one project, each a splat layer, with
  door boxes, labels, preload radius and the arrival pose in the destination room.
- **Export**: one "experience" export that writes the first room's page and every other room's
  folder, with each room's own settings, the video files, and the forked viewer, so the result
  opens as the museum does today.

Authored data is saved in the project (`.ssproj`) and survives reload, with undo.

Decided with the user: multi-room experiences are authored as **one project with one splat layer
per room**. Decisions marked **(assumed)** were taken without asking and are cheap to change.

## Data model

Authoring data lives in one editor-side store, the *experience*, keyed by splat layer. The
viewer's own types are not reused for the store: the store keeps what the editor needs to edit
(ids, layer references, picked file blobs), and a pure function composes the viewer's settings
from it at export.

```ts
type ExperienceAnnotation = {
    id: string;                 // stable, generated (`a1`, `a2`…), for undo and selection
    layer: string;              // the splat layer the point belongs to (its uid at runtime,
                                // its index in the document on save)
    position: Vec3;             // editor world (= viewer world, see Coordinates)
    title: string;
    text: string;               // may hold `[label](url)` and bare urls, as the viewer parses
    camera: { position: Vec3; target: Vec3; fov: number };
};

type ExperienceScreen = {
    id: string;
    layer: string;
    corners: [Vec3, Vec3, Vec3, Vec3];   // TL, TR, BR, BL, editor world
    source: { kind: 'url'; url: string } | { kind: 'file'; name: string; blob: Blob };
    offset: number;             // default 0.01
    loop: boolean;              // default true
    playDistance: number;       // default 20
    sound: { volume: number; refDistance: number; fadeDistance: number } | null;
};

type ExperienceDoor = {
    id: string;
    to: string;                 // destination room's layer
    label: string;
    center: Vec3;
    size: Vec3;                 // full extents, axis aligned (the viewer's door box has no rotation)
    preloadRadius: number;      // default 8
    arrival: { position: Vec3; target: Vec3 } | null;   // null until captured; export skips the door with a warning
};

type ExperienceRoom = {
    layer: string;
    id: string;                 // the room id written to settings: a slug of the layer name, editable
    doors: ExperienceDoor[];
};

type Experience = {
    annotations: ExperienceAnnotation[];
    screens: ExperienceScreen[];
    rooms: ExperienceRoom[];    // empty: the scene is one room, the page itself
    firstRoom: string | null;   // which room is the page's own scene; null: the first in the list
};
```

Rules:

- A layer that is not listed in `rooms` is part of the page's scene (today's behaviour: every
  visible layer is merged into one content file). Once any room is declared, only room layers
  export, each on its own, and a non-room layer is ignored with a warning.
- Annotations and screens belong to the layer they were picked on (the pick result says which
  splat was hit; a point picked on nothing is refused). With rooms, they export into that
  room's settings; without rooms, into the page's.
- Removing a layer removes its annotations, screens, its room and every door leading to it
  (undoable as one operation).

## Architecture

```
src/experience/
  experience.ts           store + events (experience.*), undo ops, layer removal cascade
  experience-settings.ts  PURE: compose viewer settings per room (+ warnings), slugs, validation
  experience-doc.ts       PURE: document.json <-> store (layer uid <-> index), media file names
  screen-fit.ts           PURE: four picked points -> rectangle (port of the viewer's fitScreenCorners)
  experience-overlay.ts   scene element drawing annotation points, screen rectangles, door boxes
src/tools/
  annotation-place-tool.ts  one click: a point on a splat (camera.intersect) -> new annotation
  screen-corners-tool.ts    four clicks -> screen-fit -> new screen
  door-box-tool.ts          ShapeTransformGizmo + BoxShape on the selected door (translate/scale)
src/ui/
  experience-panel.ts       floating panel (right-toolbar button): Annotations / Screens / Rooms
  experience-panel.scss
src/export-experience.ts    the "experience" export: content per room, settings, media, viewer files
```

**Events** (the editor's conventions): `experience.annotations` / `experience.screens` /
`experience.rooms` queries; `experience.add*`, `experience.update*`, `experience.remove*`
commands that push an `ExperienceEditOp` (snapshot/restore, like `AnimTrackEditOp`) onto
`edit.add`; `experience.changed` after any change; `experience.select` with `{ kind, id }` for
the panel and the overlay to agree on the highlighted item; `docSerialize.experience` /
`docDeserialize.experience`.

**Coordinates.** Editor world equals viewer world: the editor undoes each layer's PLY flip on
export, and the viewer re-applies it, so a point picked in the editor is the point the viewer
shows. Every stored position is editor world. A layer the user moves in the editor exports
moved, and its authored points move with it only if they were picked after the move; the panel
shows a warning on a layer whose transform changed after its points were picked **(assumed:**
no automatic re-basing; museum scans are not moved once annotated).

**Overlay.** One `ExperienceOverlay` element (after `ToolOverlay`'s pattern: dots and segments
in world space, depth-tested) draws every annotation as a dot, every screen as its rectangle,
every door as its box edges, in the accent colour for the selected item, dimmer for the rest,
and only for layers that are visible. A "Show experience" toggle in the Overlays panel hides it.

## UI

A floating **Experience** panel, opened from a right-toolbar button, in the style of the
Overlays panel, with three sections:

**Annotations.** A list (title, layer). Buttons: *Add* (activates the place tool: the next click
on a splat creates the annotation at that point, with the current camera as its framing, and
selects it), *Remove*. Selecting one flies the editor camera to its framing. Fields for the
selected: title (TextInput), text (TextAreaInput; a hint says links are written as
`[label](https://…)` or a bare url), *Set camera from view* (captures `camera.getPose`),
*Move point* (one click re-picks the position).

**Screens.** A list (file name, layer). *Add* activates the corners tool: four clicks on the
screen's corners (TL, TR, BR, BL, a hint in the tool toolbar counts them), then the rectangle is
fitted and the screen created; its size is shown so a pick through glass is noticed, and
*Re-pick corners* repeats the four clicks. Fields: source (a *Choose file…* button storing the
file in the project, or a url TextInput), offset, loop, play distance, sound on/off, volume,
reference distance, fade distance.

**Rooms.** A list of the scene's layers with a checkbox *Is a room*, the room id (TextInput,
slug-validated, unique), and a radio *First room (the page)*. For the selected room, its doors:
*Add door* creates a box (1.4 × 2.6 × 1 m) 2 m in front of the camera and activates the door box
tool (translate and scale gizmo, as the box selection tool's); fields: destination room (Select),
label, preload radius, centre and size (VectorInputs, live with the gizmo), and *Set arrival
from view* which stores the current camera pose and target as the arrival. Because the
destination overlaps the current room in the editor, the panel offers *Show only this room*
(hides the other room layers) and the arrival button reminds the user to show the destination
first (it refuses while the destination layer is hidden).

Everything in the panel is localized through `i18n.bindText`; every new key goes into all nine
locale files in the same position (the locale check demands identical key order).

## Persistence

`document.json` gains `experience` (version 1): the store with layer references as indices into
`document.splats`, positions as `[x, y, z]`, and screen files referenced by name. A picked video
file is written into the `.ssproj` zip as `media/<screen id>.<ext>` and read back on load into a
`Blob`. **(assumed:** videos are embedded in the project; museum clips are a few MB, and a
project that travels with its media is what an editor expects. A url source embeds nothing.)
Old documents without `experience` load with an empty store.

## Export

A new export type **Experience** in the export dialog (next to the viewer HTML and ZIP types),
always a folder or zip:

```
index.html  index.js  index.css  settings.json  scene.sog        (the first room / the page)
rooms/<id>/scene.sog  rooms/<id>/settings.json                  (each other room)
media/<screen id>.<ext>                                          (picked video files)
```

- Content per room: `writeSplatFile(…, 'sog-bundle', …)` over that room's layer only (today's
  path over the visible layers, restricted to one layer). Without rooms: all visible layers,
  as now.
- Settings per room from `experience-settings.ts`: the page's look (background, tonemapping,
  post effects, start camera, animation) comes from the current export choices for the first
  room, and the same look without animation for the others; `annotations`, `videos` and, on the
  first room's settings, `rooms` (with `contentUrl: 'rooms/<id>/scene.sog'`,
  `settingsUrl: 'rooms/<id>/settings.json'`). Video `src` is `media/<id>.<ext>` or the url.
  Every settings file is validated with the fork's `validateSettings` before anything is
  written; a failure names the field and aborts the export.
- Viewer files from the fork: `renderViewerHtml` for `index.html` (bootstrap: `settingsUrl`,
  `contentUrl`, `contentFilename`), and the fork's `js` and `css` exports written as files. The
  editor gets the dependency `@playcanvas/supersplat-viewer` pointing at the fork
  (`file:../supersplat-viewer` for development; the fork's git url for a shared build).
- The existing single-file HTML export stays as it is (upstream viewer via splat-transform) and
  is refused with a message when the experience has rooms or screens.
- Doors without an arrival, rooms without a destination, screens without a source: the export
  dialog lists them and refuses until fixed; the panel marks them.

## Behaviour notes

- Undo/redo covers every add, remove, field change and gizmo drag (one op per drag).
- Deleting or duplicating a layer: the cascade above; a duplicated layer starts with no
  experience data.
- Hidden layers still keep their data; the overlay hides it with them.
- The experience store is cleared with the scene (`scene.clear`).

## Testing

Pure modules under `node --test` (a `test` script is added; tests import the `.ts` source, so
these modules use erasable TypeScript only): settings composition (one room, several rooms, the
first room's `rooms` list, video `src` rewriting, warnings for a door without arrival),
document round trip (layer index mapping, media names, an old document without `experience`),
slug generation and uniqueness, screen fit.

In the browser: author one annotation with a link, one screen (the museum's, from the sample
video), two rooms (hall layer, tunnel layer) with a door each way and arrivals captured from the
other room; save, reload, check everything is back; export the experience; serve the folder and
walk the museum in the forked viewer: tooltip with "More info", video with sound, door
transitions both ways.

## Out of scope

- Publishing to playcanvas.com (its viewer is upstream's; unchanged).
- LOD generation for rooms (the editor exports single `.sog` files; the viewer's rooms work
  with them, readiness is immediate).
- Per-language annotation text, custom per-room looks beyond the page's.
- Rotated door boxes (the viewer's boxes are axis aligned).

# SuperSplat Editor

[![Github Release](https://img.shields.io/github/v/release/playcanvas/supersplat)](https://github.com/playcanvas/supersplat/releases)
[![License](https://img.shields.io/github/license/playcanvas/supersplat)](https://github.com/playcanvas/supersplat/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white&color=black)](https://discord.gg/T3pnhRTTAY)
[![Reddit](https://img.shields.io/badge/Reddit-FF4500?style=flat&logo=reddit&logoColor=white&color=black)](https://www.reddit.com/r/PlayCanvas)
[![X](https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white&color=black)](https://x.com/intent/follow?screen_name=playcanvas)

| [SuperSplat Editor](https://superspl.at/editor) | [User Guide](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/) | [Blog](https://blog.playcanvas.com) | [Forum](https://forum.playcanvas.com) |

The SuperSplat Editor is a free and open source tool for inspecting, editing, optimizing and publishing 3D Gaussian Splats. It is built on web technologies and runs in the browser, so there's nothing to download or install.

A live version of this tool is available at: https://superspl.at/editor

![image](https://github.com/user-attachments/assets/b6cbb5cc-d3cc-4385-8c71-ab2807fd4fba)

To learn more about using SuperSplat, please refer to the [User Guide](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/).

## Local Development

To initialize a local development environment for SuperSplat, ensure you have [Node.js](https://nodejs.org/) 20.19 or later installed. Follow these steps:

1. Clone the repository:

   ```sh
   git clone https://github.com/playcanvas/supersplat.git
   cd supersplat
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Build SuperSplat and start a local web server:

   ```sh
   npm run develop
   ```

4. Open a web browser tab and make sure network caching is disabled on the network tab and the other application caches are clear:

   - On Safari you can use `Cmd+Option+e` or Develop->Empty Caches.
5. Navigate to `http://localhost:3000`

When changes to the source are detected, SuperSplat is rebuilt automatically. Simply refresh your browser to see your changes.

## Museum Authoring

The Experience panel (the map-pin button on the right toolbar) authors everything the forked
[SuperSplat viewer](https://github.com/aazirani/supersplat-viewer/tree/feature/museum-integration) can play, so a published experience needs no hand-edited
`settings.json`:

- **Annotations** — a point picked on a splat, a title, text (links are written as
  `[label](https://…)` or a bare url) and the camera framing the viewer flies to.
- **Video screens** — a rectangle picked from four corners on a scanned screen, with a video
  file or url and its sound settings.
- **Rooms and doors** — one splat layer per room, with door boxes (translate/scale gizmo),
  labels, preload radius and the arrival pose captured in the destination room.

Everything is saved inside the `.ssproj` (picked videos are embedded as `media/<screen id>.<ext>`)
with undo/redo, and shown in the viewport as an overlay (Overlays → Experience).

**File → Export → Experience (.zip)** composes one settings file per room, validates each with
the viewer's `validateSettings`, and writes the forked viewer next to the content:

```
index.html  index.js  index.css  settings.json  scene.sog   (the first room / the page)
rooms/<id>/scene.sog  rooms/<id>/settings.json             (each other room)
media/<screen id>.<ext>                                     (picked video files)
```

Unzip and serve the folder; the experience opens in the forked viewer, and `?room=<id>` starts
in another room. Doors without an arrival pose, rooms without a destination and screens without
a source are listed and refused until fixed. Layers the export leaves out (hidden, or not a room
once rooms exist) are listed for confirmation first. The plain single-file Viewer HTML export
stays as it is and is refused while the scene has rooms or screens.

The viewer is the fork's `feature/museum-integration` branch, installed as the
`@playcanvas/supersplat-viewer` git dependency pinned to a commit; its `prepare` script builds it
on install. npm 12 refuses git dependencies by default: install with `npm install --allow-git=root`
(or put `allow-git=root` in your own, untracked `.npmrc`).
To try local viewer changes, `npm install ../supersplat-viewer` temporarily (do not commit that),
or push the viewer and update the pinned commit in `package.json`.

### Running the Tests

The experience's pure modules (settings composition, the document round trip, edit operations,
the screen fit) run under Node's built-in test runner, importing the `.ts` sources directly:

```sh
npm test
```

## Localizing the SuperSplat Editor

The currently supported languages are available here:

https://github.com/playcanvas/supersplat/tree/main/static/locales

### Adding a New Language

1. Add a new `<locale>.json` file in the `static/locales` directory.

2. Add the locale to the list here:

   https://github.com/playcanvas/supersplat/blob/main/src/ui/localization.ts

### Testing Translations

To test your translations:

1. Run the development server:

   ```sh
   npm run develop
   ```

2. Open your browser and navigate to:

   ```
   http://localhost:3000/?lng=<locale>
   ```

   Replace `<locale>` with your language code (e.g., `fr`, `de`, `es`).

## Contributors

SuperSplat is made possible by our amazing open source community:

<a href="https://github.com/playcanvas/supersplat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=playcanvas/supersplat" />
</a>

// Draws the authored experience in the viewport: annotation dots, screen rectangles and door
// boxes on the shared ToolOverlay, depth-tested against the gaussians, only for visible layers,
// with a fill on the selected item.

import { Vec3 } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';
import { ToolOverlay, OverlayWriter } from '../tool-overlay';
import type { ExperienceDoor, ExperienceScreen, LayerInfo } from './types';

// the selected annotation's marker: a small diamond on the floor around the dot
const SELECT_RADIUS = 0.15;

class ExperienceOverlay {
    constructor(events: Events, scene: Scene) {
        const overlay = new ToolOverlay();
        let shown = true;

        const v = new Vec3();
        const v0 = new Vec3();
        const v1 = new Vec3();
        const v2 = new Vec3();

        const setVec = (target: Vec3, p: [number, number, number]) => {
            target.set(p[0], p[1], p[2]);
        };

        const drawScreen = (writer: OverlayWriter, screen: ExperienceScreen, selected: boolean) => {
            const [tl, tr, br, bl] = screen.corners;
            setVec(v0, tl);
            setVec(v1, tr);
            setVec(v2, bl);
            writer.segment(v0, v1);
            setVec(v0, tr);
            setVec(v1, br);
            setVec(v2, bl);
            writer.segment(v0, v1);
            setVec(v0, br);
            setVec(v1, bl);
            writer.segment(v0, v1);
            setVec(v0, bl);
            setVec(v1, tl);
            writer.segment(v0, v1);
            if (selected) {
                // two triangles over the fitted rectangle
                setVec(v0, tl);
                setVec(v1, tr);
                setVec(v2, bl);
                writer.fill(v0, v1, v2);
                setVec(v0, tr);
                setVec(v1, br);
                setVec(v2, bl);
                writer.fill(v0, v1, v2);
            }
        };

        const drawDoor = (writer: OverlayWriter, door: ExperienceDoor, selected: boolean) => {
            const [cx, cy, cz] = door.center;
            const [sx, sy, sz] = door.size;
            const hx = sx / 2;
            const hy = sy / 2;
            const hz = sz / 2;
            // 8 corners of the axis-aligned box
            const corner = (i: number) => {
                v.set(
                    cx + ((i & 1) ? hx : -hx),
                    cy + ((i & 2) ? hy : -hy),
                    cz + ((i & 4) ? hz : -hz)
                );
                return [v.x, v.y, v.z] as [number, number, number];
            };
            const c = Array.from({ length: 8 }, (_, i) => corner(i));
            // the 12 edges
            const edges: [number, number][] = [];
            for (let i = 0; i < 8; i++) {
                for (const bit of [1, 2, 4]) {
                    const j = i | bit;
                    if (j > i) edges.push([i, j]);
                }
            }
            for (const [a, b] of edges) {
                setVec(v0, c[a]);
                setVec(v1, c[b]);
                writer.segment(v0, v1);
            }
            if (selected) {
                // six faces, two triangles each
                const quads: [number, number, number, number][] = [
                    [0, 2, 6, 4],
                    [1, 3, 7, 5],
                    [0, 1, 5, 4],
                    [2, 3, 7, 6],
                    [0, 1, 3, 2],
                    [4, 5, 7, 6]
                ];
                for (const [a, b, c2, d] of quads) {
                    setVec(v0, c[a]);
                    setVec(v1, c[b]);
                    setVec(v2, c[c2]);
                    writer.fill(v0, v1, v2);
                    setVec(v0, c[a]);
                    setVec(v1, c[c2]);
                    setVec(v2, c[d]);
                    writer.fill(v0, v1, v2);
                }
            }
        };

        overlay.provider = (writer: OverlayWriter) => {
            const experience = events.invoke('experience.get');
            if (!experience) return;
            const layers = events.invoke('experience.layers') as LayerInfo[];
            const visibleLayers = new Set(layers.filter(layer => layer.visible).map(layer => layer.uid));
            const selection = events.invoke('experience.selection') as { kind: string; id: string } | null;

            for (const annotation of experience.annotations) {
                if (!visibleLayers.has(annotation.layer)) continue;
                setVec(v, annotation.position);
                writer.dot(v);
                if (selection?.kind === 'annotation' && selection.id === annotation.id) {
                    const [x, y, z] = annotation.position;
                    const n: [number, number, number][] = [
                        [x, y, z + SELECT_RADIUS],
                        [x + SELECT_RADIUS, y, z],
                        [x, y, z - SELECT_RADIUS],
                        [x - SELECT_RADIUS, y, z]
                    ];
                    for (let i = 0; i < 4; i++) {
                        setVec(v0, n[i]);
                        setVec(v1, n[(i + 1) % 4]);
                        writer.segment(v0, v1);
                    }
                }
            }

            for (const screen of experience.screens) {
                if (!visibleLayers.has(screen.layer)) continue;
                drawScreen(writer, screen, selection?.kind === 'screen' && selection.id === screen.id);
            }

            for (const room of experience.rooms) {
                if (!visibleLayers.has(room.layer)) continue;
                for (const door of room.doors) {
                    drawDoor(writer, door, selection?.kind === 'door' && selection.id === door.id);
                }
            }
        };

        const setShow = (visible: boolean) => {
            if (visible === shown) return;
            shown = visible;
            if (shown) {
                scene.add(overlay);
            } else {
                scene.remove(overlay);
            }
            events.fire('experience.showOverlay', shown);
            scene.forceRender = true;
        };

        events.function('experience.showOverlay', () => shown);
        events.on('experience.setShowOverlay', (visible: boolean) => setShow(visible));

        // redraw when anything changes
        events.on('experience.changed', () => {
            scene.forceRender = true;
        });
        events.on('experience.selection', () => {
            scene.forceRender = true;
        });

        scene.add(overlay);
    }
}

export { ExperienceOverlay };

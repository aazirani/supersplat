// Four clicks on a scanned screen's corners fit the rectangle a video will play on: the
// authoring side of the Experience panel's Screens section.

import { Container, Label } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';
import { addScreen } from '../experience/experience-ops';
import { fitScreenCorners } from '../experience/screen-fit';
import type { Experience, ExperienceScreen, Vec3T } from '../experience/types';
import { Scene } from '../scene';
import { ToolOverlay, OverlayWriter } from '../tool-overlay';
import { i18n } from '../ui/localization';

// pointer movement below this many pixels still counts as a click
const CLICK_TOLERANCE = 4;

const CORNER_KEYS = ['tool.experience.corner-tl', 'tool.experience.corner-tr', 'tool.experience.corner-br', 'tool.experience.corner-bl'] as const;

class ScreenCornersTool {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, scene: Scene, canvasContainer: Container) {
        const hintLabel = new Label({ class: 'select-toolbar-label' });

        const selectToolbar = new Container({
            class: ['select-toolbar', 'select-toolbar-tool'],
            hidden: true
        });
        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });
        selectToolbar.append(hintLabel);
        canvasContainer.append(selectToolbar);

        // the picked corners draw as dots while the tool is active
        const overlay = new ToolOverlay();
        let active = false;
        // the screen being re-picked, or null to create a new one
        let target: string | null = null;
        let picked: Vec3T[] = [];
        let layer = -1;

        const dotPoint = new Vec3();
        overlay.provider = (writer: OverlayWriter) => {
            for (const point of picked) {
                dotPoint.set(point[0], point[1], point[2]);
                writer.dot(dotPoint);
            }
        };

        const updateHint = () => {
            hintLabel.text = i18n.t('tool.experience.corners-hint', {
                n: Math.min(picked.length + 1, 4),
                corner: i18n.t(CORNER_KEYS[Math.min(picked.length, 3)])
            });
        };

        events.on('experience.pickScreen', (screenId: string | null) => {
            target = screenId;
            picked = [];
            layer = -1;
            updateHint();
            events.fire('tool.screenCorners');
        });

        const isPrimary = (e: PointerEvent) => {
            return e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary;
        };

        const finish = (corners: [Vec3T, Vec3T, Vec3T, Vec3T]) => {
            const layerPose = events.invoke('experience.layerPose', layer);
            if (target === null) {
                let created: ExperienceScreen = null;
                events.fire('experience.edit', 'addScreen', (experience: Experience) => {
                    created = addScreen(experience, { layer, corners, layerPose });
                });
                events.fire('experience.select', { kind: 'screen', id: created.id });
            } else {
                const id = target;
                events.fire('experience.edit', 'moveScreen', (experience: Experience) => {
                    const screen = experience.screens.find(s => s.id === id);
                    if (screen) {
                        screen.corners = corners;
                        screen.layer = layer;
                        screen.layerPose = layerPose;
                    }
                });
            }
            events.fire('tool.deactivate');
        };

        const addPoint = (point: Vec3T, splatLayer: number) => {
            if (layer === -1) {
                layer = splatLayer;
            }
            picked.push(point);
            if (picked.length === 4) {
                const fit = fitScreenCorners(picked);
                if (!fit) {
                    events.invoke('showPopup', {
                        type: 'error',
                        header: i18n.t('panel.experience.screens'),
                        message: i18n.t('tool.experience.corners-degenerate')
                    });
                    picked = [];
                } else {
                    finish(fit.corners);
                    picked = [];
                }
            }
            updateHint();
        };

        let clicked = false;
        let clickX = 0;
        let clickY = 0;

        const pointerdown = (e: PointerEvent) => {
            if (!clicked && isPrimary(e)) {
                clicked = true;
                clickX = e.offsetX;
                clickY = e.offsetY;
            }
        };

        const pointermove = (e: PointerEvent) => {
            if (clicked && Math.hypot(e.offsetX - clickX, e.offsetY - clickY) > CLICK_TOLERANCE) {
                clicked = false;
            }
        };

        const pointerup = async (e: PointerEvent) => {
            if (!clicked || !isPrimary(e)) {
                return;
            }
            clicked = false;

            const x = clickX / canvasContainer.dom.clientWidth;
            const y = clickY / canvasContainer.dom.clientHeight;
            const result = await scene.camera.intersect(x, y);

            if (result && active) {
                addPoint([result.position.x, result.position.y, result.position.z], result.splat.uid);
            }

            e.preventDefault();
            e.stopPropagation();
        };

        const keydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                events.fire('tool.deactivate');
            }
        };

        this.activate = () => {
            active = true;
            clicked = false;
            canvasContainer.dom.addEventListener('pointerdown', pointerdown);
            canvasContainer.dom.addEventListener('pointermove', pointermove);
            canvasContainer.dom.addEventListener('pointerup', pointerup, true);
            document.addEventListener('keydown', keydown);
            selectToolbar.hidden = false;
            updateHint();
            scene.add(overlay);
            scene.forceRender = true;
        };

        this.deactivate = () => {
            active = false;
            picked = [];
            canvasContainer.dom.removeEventListener('pointerdown', pointerdown);
            canvasContainer.dom.removeEventListener('pointermove', pointermove);
            canvasContainer.dom.removeEventListener('pointerup', pointerup, true);
            document.removeEventListener('keydown', keydown);
            selectToolbar.hidden = true;
            scene.remove(overlay);
            scene.forceRender = true;
        };
    }
}

export { ScreenCornersTool };

// One click on a splat places (or re-picks) an annotation point: the authoring side of the
// Experience panel's Annotations section.

import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { addAnnotation } from '../experience/experience-ops';
import type { Experience, ExperienceAnnotation, PoseT } from '../experience/types';
import { Scene } from '../scene';
import { i18n } from '../ui/localization';
// pointer movement below this many pixels still counts as a click
const CLICK_TOLERANCE = 4;

class AnnotationPlaceTool {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, scene: Scene, canvasContainer: Container) {
        const hintLabel = new Label({ class: 'select-toolbar-label' });
        i18n.bindText(hintLabel, 'tool.experience.place-hint');

        const selectToolbar = new Container({
            class: ['select-toolbar', 'select-toolbar-tool'],
            hidden: true
        });
        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });
        selectToolbar.append(hintLabel);
        canvasContainer.append(selectToolbar);

        let active = false;
        // the annotation being re-picked, or null to create a new one
        let target: string | null = null;

        events.on('experience.placeAnnotation', (annotationId: string | null) => {
            target = annotationId;
            events.fire('tool.annotationPlace');
        });

        const isPrimary = (e: PointerEvent) => {
            return e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary;
        };

        const poseFromCamera = (): PoseT => {
            const pose = events.invoke('camera.getPose');
            return {
                position: [pose.position.x, pose.position.y, pose.position.z],
                target: [pose.target.x, pose.target.y, pose.target.z],
                fov: pose.fov
            };
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

            // the click may have been consumed elsewhere, or the tool switched
            // off, while the pick was in flight
            if (result && active) {
                const layer = result.splat.uid;
                const position: [number, number, number] = [result.position.x, result.position.y, result.position.z];
                const layerPose = events.invoke('experience.layerPose', layer);

                if (target === null) {
                    let created: ExperienceAnnotation = null;
                    events.fire('experience.edit', 'addAnnotation', (experience: Experience) => {
                        created = addAnnotation(experience, { layer, position, camera: poseFromCamera(), layerPose });
                    });
                    events.fire('experience.select', { kind: 'annotation', id: created.id });
                } else {
                    const id = target;
                    events.fire('experience.edit', 'moveAnnotation', (experience: Experience) => {
                        const annotation = experience.annotations.find(a => a.id === id);
                        if (annotation) {
                            annotation.position = position;
                            annotation.layerPose = layerPose;
                        }
                    });
                }

                events.fire('tool.deactivate');
            }

            e.preventDefault();
            e.stopPropagation();
        };

        this.activate = () => {
            active = true;
            clicked = false;
            canvasContainer.dom.addEventListener('pointerdown', pointerdown);
            canvasContainer.dom.addEventListener('pointermove', pointermove);
            canvasContainer.dom.addEventListener('pointerup', pointerup, true);
            selectToolbar.hidden = false;
        };

        this.deactivate = () => {
            active = false;
            canvasContainer.dom.removeEventListener('pointerdown', pointerdown);
            canvasContainer.dom.removeEventListener('pointermove', pointermove);
            canvasContainer.dom.removeEventListener('pointerup', pointerup, true);
            selectToolbar.hidden = true;
        };
    }
}

export { AnnotationPlaceTool };

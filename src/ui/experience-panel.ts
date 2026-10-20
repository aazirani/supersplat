// The Experience panel: annotations, screens and rooms authored for the exported experience.
// Opens from the right toolbar, in the style of the Overlays panel.

import { Button, Container, Label, TextAreaInput, TextInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { i18n } from './localization';
import { layerPoseChanged, removeItem, type ExperienceAnnotation } from '../experience/experience-ops';
import experienceSvg from './svg/experience.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class ExperiencePanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'experience-panel',
            class: ['panel', 'options-panel'],
            hidden: true
        };

        super(args);

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        // header

        const header = new Container({
            class: 'panel-header'
        });

        const icon = new Label({
            class: 'panel-header-icon'
        });
        icon.dom.appendChild(createSvg(experienceSvg));

        const label = new Label({
            class: 'panel-header-label'
        });
        i18n.bindText(label, 'panel.experience');

        header.append(icon);
        header.append(label);

        const sectionHeader = (key: string) => {
            const section = new Container({
                class: ['panel-header', 'options-panel-section']
            });
            const sectionLabel = new Label({
                class: 'panel-header-label'
            });
            i18n.bindText(sectionLabel, key);
            section.append(sectionLabel);
            return section;
        };

        const row = () => new Container({ class: 'settings-panel-row' });
        const rowLabel = (key: string) => {
            const l = new Label({ class: 'settings-panel-row-label' });
            i18n.bindText(l, key);
            return l;
        };

        // layer names for the list rows
        const layerName = (uid: number) => (events.invoke('experience.layers') as { uid: number, name: string }[]).find(l => l.uid === uid)?.name ?? `layer ${uid}`;

        let suppressUI = 0;

        // ------------------------------------------------------------------ annotations

        const annotationList = new Container({
            class: 'experience-list'
        });

        const annotationAddButton = new Button({ class: 'experience-button' });
        i18n.bindText(annotationAddButton, 'panel.experience.add');

        const annotationRemoveButton = new Button({ class: 'experience-button', enabled: false });
        i18n.bindText(annotationRemoveButton, 'panel.experience.remove');

        const annotationButtonsRow = new Container({ class: 'settings-panel-row' });
        annotationButtonsRow.append(annotationAddButton);
        annotationButtonsRow.append(annotationRemoveButton);

        // fields of the selected annotation

        const annotationFields = new Container({ class: 'experience-fields', hidden: true });

        const titleInput = new TextInput({ class: 'settings-panel-row-input', placeholder: '' });
        const textInput = new TextAreaInput({ class: 'text-area experience-text' });

        const titleRow = row();
        titleRow.append(rowLabel('panel.experience.title'));
        titleRow.append(titleInput);

        const textLabelRow = row();
        textLabelRow.append(rowLabel('panel.experience.text'));

        const linksHint = new Label({ class: 'settings-panel-row-label experience-hint' });
        i18n.bindText(linksHint, 'panel.experience.links-hint');

        const setCameraButton = new Button({ class: 'experience-button' });
        i18n.bindText(setCameraButton, 'panel.experience.set-camera');

        const movePointButton = new Button({ class: 'experience-button' });
        i18n.bindText(movePointButton, 'panel.experience.move-point');

        const annotationButtonRow = new Container({ class: 'settings-panel-row' });
        annotationButtonRow.append(setCameraButton);
        annotationButtonRow.append(movePointButton);

        annotationFields.append(titleRow);
        annotationFields.append(textLabelRow);
        annotationFields.append(textInput);
        annotationFields.append(linksHint);
        annotationFields.append(annotationButtonRow);

        const selectedAnnotation = (): ExperienceAnnotation | null => {
            const selection = events.invoke('experience.selection');
            const experience = events.invoke('experience.get');
            return selection?.kind === 'annotation' ? experience.annotations.find(a => a.id === selection.id) ?? null : null;
        };

        const updateAnnotationFields = () => {
            const annotation = selectedAnnotation();
            annotationFields.hidden = !annotation;
            annotationRemoveButton.enabled = !!annotation;
            if (!annotation || suppressUI > 0) {
                return;
            }
            titleInput.value = annotation.title;
            textInput.value = annotation.text;
        };

        const rebuildAnnotationList = () => {
            annotationList.clear();
            const experience = events.invoke('experience.get');
            const selection = events.invoke('experience.selection');

            for (const annotation of experience.annotations) {
                const listRow = new Container({ class: 'experience-list-row' });
                if (selection?.kind === 'annotation' && selection.id === annotation.id) {
                    listRow.class.add('selected');
                }

                const titleLabel = new Label({ class: 'experience-list-row-label' });
                titleLabel.text = annotation.title || annotation.id;

                const layerLabel = new Label({ class: 'experience-list-row-layer' });
                layerLabel.text = layerName(annotation.layer);

                // warn when the layer moved after the point was picked
                const pose = events.invoke('experience.layerPose', annotation.layer);
                if (pose && layerPoseChanged(annotation.layerPose, pose)) {
                    const warnIcon = new Label({ class: 'experience-list-row-warning' });
                    warnIcon.text = '⚠';
                    tooltips.register(warnIcon, () => i18n.t('panel.experience.moved-warning'), 'left');
                    listRow.append(warnIcon);
                }

                listRow.append(titleLabel);
                listRow.append(layerLabel);

                listRow.dom.addEventListener('click', () => {
                    events.fire('experience.select', { kind: 'annotation', id: annotation.id });
                    // fly to its framing
                    events.fire('camera.setPose', {
                        position: { x: annotation.camera.position[0], y: annotation.camera.position[1], z: annotation.camera.position[2] },
                        target: { x: annotation.camera.target[0], y: annotation.camera.target[1], z: annotation.camera.target[2] },
                        fov: annotation.camera.fov
                    });
                });

                annotationList.append(listRow);
            }
        };

        annotationAddButton.on('click', () => {
            events.fire('experience.placeAnnotation', null);
        });

        annotationRemoveButton.on('click', () => {
            const annotation = selectedAnnotation();
            if (annotation) {
                const id = annotation.id;
                events.fire('experience.edit', 'removeAnnotation', (experience) => {
                    removeItem(experience, 'annotation', id);
                });
            }
        });

        titleInput.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const annotation = selectedAnnotation();
            const value = titleInput.value;
            if (annotation && annotation.title !== value) {
                const id = annotation.id;
                suppressUI++;
                events.fire('experience.edit', 'setAnnotationTitle', (experience) => {
                    const a = experience.annotations.find(x => x.id === id);
                    if (a) {
                        a.title = value;
                    }
                });
                suppressUI--;
            }
        });

        textInput.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const annotation = selectedAnnotation();
            const value = textInput.value;
            if (annotation && annotation.text !== value) {
                const id = annotation.id;
                suppressUI++;
                events.fire('experience.edit', 'setAnnotationText', (experience) => {
                    const a = experience.annotations.find(x => x.id === id);
                    if (a) {
                        a.text = value;
                    }
                });
                suppressUI--;
            }
        });

        setCameraButton.on('click', () => {
            const annotation = selectedAnnotation();
            if (annotation) {
                const id = annotation.id;
                const pose = events.invoke('camera.getPose');
                const camera = {
                    position: [pose.position.x, pose.position.y, pose.position.z] as [number, number, number],
                    target: [pose.target.x, pose.target.y, pose.target.z] as [number, number, number],
                    fov: pose.fov
                };
                events.fire('experience.edit', 'setAnnotationCamera', (experience) => {
                    const a = experience.annotations.find(x => x.id === id);
                    if (a) {
                        a.camera = camera;
                    }
                });
            }
        });

        movePointButton.on('click', () => {
            const annotation = selectedAnnotation();
            if (annotation) {
                events.fire('experience.placeAnnotation', annotation.id);
            }
        });

        // ------------------------------------------------------------------ sections

        this.append(header);
        this.append(sectionHeader('panel.experience.annotations'));
        this.append(annotationList);
        this.append(annotationButtonsRow);
        this.append(annotationFields);

        // rebuild on every change of the data or the scene's layers
        const rebuild = () => {
            rebuildAnnotationList();
            updateAnnotationFields();
        };

        events.on('experience.changed', rebuild);
        events.on('experience.selection', rebuild);
        events.on('splat.name', rebuild);
        events.on('scene.elementAdded', rebuild);
        events.on('scene.elementRemoved', rebuild);

        // panel visibility

        const setVisible = (visible: boolean) => {
            if (visible === !this.hidden) {
                return;
            }
            this.hidden = !visible;
            events.fire('experiencePanel.visible', visible);
        };

        events.function('experiencePanel.visible', () => {
            return !this.hidden;
        });

        events.on('experiencePanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('experiencePanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('overlaysPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        events.on('settingsPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        events.on('appearancePanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        rebuild();
    }
}

export { ExperiencePanel };

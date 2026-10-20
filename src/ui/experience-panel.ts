// The Experience panel: annotations, screens and rooms authored for the exported experience.
// Opens from the right toolbar, in the style of the Overlays panel.

import { BooleanInput, Button, Container, Label, NumericInput, TextAreaInput, TextInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { i18n } from './localization';
import { layerPoseChanged, removeItem, type ExperienceAnnotation, type ExperienceScreen } from '../experience/experience-ops';
import { fitScreenCorners } from '../experience/screen-fit';
import { DEFAULT_SOUND } from '../experience/types';
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

        // ------------------------------------------------------------------ screens

        const screenList = new Container({
            class: 'experience-list'
        });

        const screenAddButton = new Button({ class: 'experience-button' });
        i18n.bindText(screenAddButton, 'panel.experience.add');

        const screenRemoveButton = new Button({ class: 'experience-button', enabled: false });
        i18n.bindText(screenRemoveButton, 'panel.experience.remove');

        const screenButtonsRow = new Container({ class: 'settings-panel-row' });
        screenButtonsRow.append(screenAddButton);
        screenButtonsRow.append(screenRemoveButton);

        // fields of the selected screen

        const screenFields = new Container({ class: 'experience-fields', hidden: true });

        const sizeLabel = new Label({ class: 'settings-panel-row-label experience-size' });
        const sizeRow = row();
        sizeRow.append(rowLabel('panel.experience.size'));
        sizeRow.append(sizeLabel);

        const repickButton = new Button({ class: 'experience-button' });
        i18n.bindText(repickButton, 'panel.experience.re-pick');

        const chooseFileButton = new Button({ class: 'experience-button' });
        i18n.bindText(chooseFileButton, 'panel.experience.choose-file');

        const screenButtonRow = new Container({ class: 'settings-panel-row' });
        screenButtonRow.append(repickButton);
        screenButtonRow.append(chooseFileButton);

        // the hidden file input, created once
        const fileInput = document.createElement('input');
        fileInput.setAttribute('type', 'file');
        fileInput.setAttribute('accept', 'video/*');
        fileInput.style.display = 'none';
        chooseFileButton.dom.appendChild(fileInput);

        const urlInput = new TextInput({ class: 'settings-panel-row-input', placeholder: 'https://…' });

        const offsetInput = new NumericInput({ class: 'settings-panel-row-input', min: 0, precision: 3, step: 0.001 });
        const loopInput = new BooleanInput({ type: 'toggle', value: true });
        const playDistanceInput = new NumericInput({ class: 'settings-panel-row-input', min: 0.1, precision: 1, step: 0.1 });
        const soundInput = new BooleanInput({ type: 'toggle', value: false });
        const volumeInput = new NumericInput({ class: 'settings-panel-row-input', min: 0, max: 1, precision: 2, step: 0.05 });
        const refDistanceInput = new NumericInput({ class: 'settings-panel-row-input', min: 0.01, precision: 2, step: 0.1 });
        const fadeDistanceInput = new NumericInput({ class: 'settings-panel-row-input', min: 0.02, precision: 2, step: 0.5 });

        const labeledRow = (key: string, control: Container) => {
            const r = row();
            r.append(rowLabel(key));
            r.append(control);
            return r;
        };

        screenFields.append(sizeRow);
        screenFields.append(screenButtonRow);
        screenFields.append(labeledRow('panel.experience.url', urlInput));
        screenFields.append(labeledRow('panel.experience.offset', offsetInput));
        screenFields.append(labeledRow('panel.experience.loop', loopInput));
        screenFields.append(labeledRow('panel.experience.play-distance', playDistanceInput));
        screenFields.append(labeledRow('panel.experience.sound', soundInput));
        screenFields.append(labeledRow('panel.experience.volume', volumeInput));
        screenFields.append(labeledRow('panel.experience.ref-distance', refDistanceInput));
        screenFields.append(labeledRow('panel.experience.fade-distance', fadeDistanceInput));

        const selectedScreen = (): ExperienceScreen | null => {
            const selection = events.invoke('experience.selection');
            const experience = events.invoke('experience.get');
            return selection?.kind === 'screen' ? experience.screens.find(s => s.id === selection.id) ?? null : null;
        };

        const screenSourceLabel = (screen: ExperienceScreen) => {
            if (screen.source?.kind === 'file') {
                return screen.source.name;
            }
            if (screen.source?.kind === 'url') {
                return screen.source.url;
            }
            return i18n.t('panel.experience.no-source');
        };

        const updateScreenFields = () => {
            const screen = selectedScreen();
            screenFields.hidden = !screen;
            screenRemoveButton.enabled = !!screen;
            if (!screen || suppressUI > 0) {
                return;
            }
            const fit = fitScreenCorners(screen.corners);
            sizeLabel.text = fit ? `${fit.width.toFixed(2)} × ${fit.height.toFixed(2)} m` : '—';
            urlInput.value = screen.source?.kind === 'url' ? screen.source.url : '';
            offsetInput.value = screen.offset;
            loopInput.value = screen.loop;
            playDistanceInput.value = screen.playDistance;
            soundInput.value = !!screen.sound;
            volumeInput.value = screen.sound?.volume ?? DEFAULT_SOUND.volume;
            refDistanceInput.value = screen.sound?.refDistance ?? DEFAULT_SOUND.refDistance;
            fadeDistanceInput.value = screen.sound?.fadeDistance ?? DEFAULT_SOUND.fadeDistance;
        };

        const rebuildScreenList = () => {
            screenList.clear();
            const experience = events.invoke('experience.get');
            const selection = events.invoke('experience.selection');

            for (const screen of experience.screens) {
                const listRow = new Container({ class: 'experience-list-row' });
                if (selection?.kind === 'screen' && selection.id === screen.id) {
                    listRow.class.add('selected');
                }

                const sourceLabel = new Label({ class: 'experience-list-row-label' });
                sourceLabel.text = screenSourceLabel(screen);

                const layerLabel = new Label({ class: 'experience-list-row-layer' });
                layerLabel.text = layerName(screen.layer);

                listRow.append(sourceLabel);
                listRow.append(layerLabel);

                listRow.dom.addEventListener('click', () => {
                    events.fire('experience.select', { kind: 'screen', id: screen.id });
                });

                screenList.append(listRow);
            }
        };

        const editScreen = (name: string, fn: (screen: NonNullable<ReturnType<typeof selectedScreen>>) => void) => {
            const screen = selectedScreen();
            if (!screen) {
                return;
            }
            const id = screen.id;
            suppressUI++;
            events.fire('experience.edit', name, (experience) => {
                const s = experience.screens.find(x => x.id === id);
                if (s) {
                    fn(s);
                }
            });
            suppressUI--;
        };

        screenAddButton.on('click', () => {
            events.fire('experience.pickScreen', null);
        });

        screenRemoveButton.on('click', () => {
            const screen = selectedScreen();
            if (screen) {
                const id = screen.id;
                events.fire('experience.edit', 'removeScreen', (experience) => {
                    removeItem(experience, 'screen', id);
                });
            }
        });

        repickButton.on('click', () => {
            const screen = selectedScreen();
            if (screen) {
                events.fire('experience.pickScreen', screen.id);
            }
        });

        chooseFileButton.on('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (file) {
                editScreen('setScreenSource', (s) => {
                    s.source = { kind: 'file', name: file.name, blob: file };
                });
            }
            // allow picking the same file again
            fileInput.value = '';
        });

        urlInput.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const value = urlInput.value.trim();
            const screen = selectedScreen();
            if (screen && value && !(screen.source?.kind === 'url' && screen.source.url === value)) {
                editScreen('setScreenSource', (s) => {
                    s.source = { kind: 'url', url: value };
                });
            }
        });

        offsetInput.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const value = offsetInput.value;
            editScreen('setScreenOffset', (s) => {
                s.offset = value;
            });
        });

        loopInput.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const value = loopInput.value;
            editScreen('setScreenLoop', (s) => {
                s.loop = value;
            });
        });

        playDistanceInput.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const value = playDistanceInput.value;
            editScreen('setScreenPlayDistance', (s) => {
                s.playDistance = value;
            });
        });

        soundInput.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const value = soundInput.value;
            editScreen('setScreenSound', (s) => {
                s.sound = value ? { ...DEFAULT_SOUND } : null;
            });
        });

        const editSoundField = (name: string, field: 'volume' | 'refDistance' | 'fadeDistance', raw: number) => {
            const screen = selectedScreen();
            if (!screen || suppressUI > 0) {
                return;
            }
            // keep the sound object alive: an edit on a silent screen switches it on
            const base = screen.sound ?? { ...DEFAULT_SOUND };
            let value = raw;
            if (field === 'fadeDistance') {
                // the fade must reach beyond the reference distance
                value = Math.max(raw, base.refDistance + 0.01);
            }
            editScreen(name, (s) => {
                s.sound = { ...base, [field]: value };
            });
            if (value !== raw) {
                suppressUI++;
                fadeDistanceInput.value = value;
                suppressUI--;
            }
        };

        volumeInput.on('change', () => editSoundField('setScreenVolume', 'volume', volumeInput.value));
        refDistanceInput.on('change', () => editSoundField('setScreenRefDistance', 'refDistance', refDistanceInput.value));
        fadeDistanceInput.on('change', () => editSoundField('setScreenFadeDistance', 'fadeDistance', fadeDistanceInput.value));

        // ------------------------------------------------------------------ sections

        this.append(header);
        this.append(sectionHeader('panel.experience.annotations'));
        this.append(annotationList);
        this.append(annotationButtonsRow);
        this.append(annotationFields);
        this.append(sectionHeader('panel.experience.screens'));
        this.append(screenList);
        this.append(screenButtonsRow);
        this.append(screenFields);

        // rebuild on every change of the data or the scene's layers
        const rebuild = () => {
            rebuildAnnotationList();
            updateAnnotationFields();
            rebuildScreenList();
            updateScreenFields();
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

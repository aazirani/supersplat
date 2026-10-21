// The Experience panel: annotations, screens and rooms authored for the exported experience.
// Opens from the right toolbar, in the style of the Overlays panel.

import { BooleanInput, Button, Container, Element, Label, NumericInput, SelectInput, TextAreaInput, TextInput, VectorInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { i18n } from './localization';
import type { ExperienceSelection } from '../experience/experience';
import { addDoor, layerPoseChanged, removeItem, setRoom, slugify } from '../experience/experience-ops';
import { fitScreenCorners } from '../experience/screen-fit';
import { DEFAULT_SOUND, DOOR_DEFAULTS, type Experience, type ExperienceAnnotation, type ExperienceRoom, type ExperienceScreen } from '../experience/types';
import experienceSvg from './svg/experience.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// a picked video past this size gets a note about project and export size
const LARGE_VIDEO_BYTES = 100 * 1024 * 1024;

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
        const textInput = new TextAreaInput({ class: ['text-area', 'experience-text'] });

        const titleRow = row();
        titleRow.append(rowLabel('panel.experience.title'));
        titleRow.append(titleInput);

        const textLabelRow = row();
        textLabelRow.append(rowLabel('panel.experience.text'));

        const linksHint = new Label({ class: ['settings-panel-row-label', 'experience-hint'] });
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
            const selection = (events.invoke('experience.selection') as ExperienceSelection);
            const experience = (events.invoke('experience.get') as Experience);
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
            const experience = (events.invoke('experience.get') as Experience);
            const selection = (events.invoke('experience.selection') as ExperienceSelection);

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
                events.fire('experience.edit', 'removeAnnotation', (experience: Experience) => {
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
                events.fire('experience.edit', 'setAnnotationTitle', (experience: Experience) => {
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
                events.fire('experience.edit', 'setAnnotationText', (experience: Experience) => {
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
                events.fire('experience.edit', 'setAnnotationCamera', (experience: Experience) => {
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

        const sizeLabel = new Label({ class: ['settings-panel-row-label', 'experience-size'] });
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

        const labeledRow = (key: string, control: Element) => {
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
            const selection = (events.invoke('experience.selection') as ExperienceSelection);
            const experience = (events.invoke('experience.get') as Experience);
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
            const experience = (events.invoke('experience.get') as Experience);
            const selection = (events.invoke('experience.selection') as ExperienceSelection);

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
            events.fire('experience.edit', name, (experience: Experience) => {
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
                events.fire('experience.edit', 'removeScreen', (experience: Experience) => {
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
                // the clip is embedded whole in the project and the export, and read into
                // memory on save, open and export: past this size, say so
                if (file.size > LARGE_VIDEO_BYTES) {
                    events.invoke('showPopup', {
                        type: 'info',
                        header: i18n.t('panel.experience.screens'),
                        message: i18n.t('panel.experience.large-video', { size: Math.round(file.size / (1024 * 1024)) })
                    });
                }
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
            if (!screen) {
                return;
            }
            if (value && !(screen.source?.kind === 'url' && screen.source.url === value)) {
                editScreen('setScreenSource', (s) => {
                    s.source = { kind: 'url', url: value };
                });
            } else if (!value && screen.source?.kind === 'url') {
                // an emptied field clears a url source (a picked file shows no url, so stays)
                editScreen('setScreenSource', (s) => {
                    s.source = null;
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

        // ------------------------------------------------------------------ rooms

        const roomsList = new Container({
            class: ['experience-list', 'experience-rooms-list']
        });

        // the room whose doors are shown (a panel-local selection: rooms are layers,
        // not experience items)
        const roomSelection = { uid: null as number | null };

        // which room layers were visible before "show only this room" hid them
        const savedVisibility = new Map<number, boolean>();
        let showOnly = false;

        const roomOf = (uid: number) => {
            const experience = (events.invoke('experience.get') as Experience);
            return experience.rooms.find(r => r.layer === uid) ?? null;
        };

        const isRoomLayerHidden = (uid: number) => {
            const layers = events.invoke('experience.layers') as { uid: number, visible: boolean }[];
            return !(layers.find(l => l.uid === uid)?.visible ?? false);
        };

        const selectedDoor = () => {
            const selection = (events.invoke('experience.selection') as ExperienceSelection);
            if (selection?.kind !== 'door') {
                return null;
            }
            const experience = (events.invoke('experience.get') as Experience);
            for (const room of experience.rooms) {
                const door = room.doors.find(d => d.id === selection.id);
                if (door) {
                    return door;
                }
            }
            return null;
        };

        // ------------------------------------------------------------------ rooms: fields

        const roomFields = new Container({ class: 'experience-fields', hidden: true });

        const showOnlyToggle = new BooleanInput({ type: 'toggle', value: false });
        const showOnlyRow = row();
        showOnlyRow.append(rowLabel('panel.experience.show-only'));
        showOnlyRow.append(showOnlyToggle);

        const addDoorButton = new Button({ class: 'experience-button' });
        i18n.bindText(addDoorButton, 'panel.experience.add-door');

        const editDoorButton = new Button({ class: 'experience-button' });
        i18n.bindText(editDoorButton, 'panel.experience.edit-door');

        const doorButtonsRow = new Container({ class: 'settings-panel-row' });
        doorButtonsRow.append(addDoorButton);
        doorButtonsRow.append(editDoorButton);

        const doorList = new Container({
            class: 'experience-list'
        });

        const removeDoorButton = new Button({ class: 'experience-button', enabled: false });
        i18n.bindText(removeDoorButton, 'panel.experience.remove');
        const removeDoorRow = new Container({ class: 'settings-panel-row' });
        removeDoorRow.append(removeDoorButton);

        roomFields.append(showOnlyRow);
        roomFields.append(doorButtonsRow);
        roomFields.append(doorList);
        roomFields.append(removeDoorRow);

        // fields of the selected door

        const doorFields = new Container({ class: 'experience-fields', hidden: true });

        const destinationSelect = new SelectInput({ class: 'settings-panel-row-input' });
        const doorLabelInput = new TextInput({ class: 'settings-panel-row-input', placeholder: '' });
        const preloadRadiusInput = new NumericInput({ class: 'settings-panel-row-input', min: 0.1, precision: 1, step: 0.5 });
        const doorCenterInput = new VectorInput({ class: 'settings-panel-row-input', precision: 2, dimensions: 3 });
        const doorSizeInput = new VectorInput({ class: 'settings-panel-row-input', precision: 2, dimensions: 3 });
        doorSizeInput.min = 0.05;

        const setArrivalButton = new Button({ class: 'experience-button' });
        i18n.bindText(setArrivalButton, 'panel.experience.set-arrival');

        const arrivalStatus = new Label({ class: ['settings-panel-row-label', 'experience-hint'] });

        doorFields.append(labeledRow('panel.experience.destination', destinationSelect));
        doorFields.append(labeledRow('panel.experience.label', doorLabelInput));
        doorFields.append(labeledRow('panel.experience.preload-radius', preloadRadiusInput));
        doorFields.append(labeledRow('panel.experience.center', doorCenterInput));
        doorFields.append(labeledRow('panel.experience.door-size', doorSizeInput));
        doorFields.append(setArrivalButton);
        doorFields.append(arrivalStatus);

        const editDoor = (name: string, fn: (door: NonNullable<ReturnType<typeof selectedDoor>>) => void) => {
            const door = selectedDoor();
            if (!door) {
                return;
            }
            const id = door.id;
            suppressUI++;
            events.fire('experience.edit', name, (experience: Experience) => {
                for (const room of experience.rooms) {
                    const d = room.doors.find(x => x.id === id);
                    if (d) {
                        fn(d);
                    }
                }
            });
            suppressUI--;
        };

        showOnlyToggle.on('change', () => {
            const splats = events.invoke('scene.allSplats') as { uid: number, visible: boolean }[];
            if (showOnlyToggle.value && !showOnly) {
                if (roomSelection.uid === null) {
                    showOnlyToggle.value = false;
                    return;
                }
                showOnly = true;
                savedVisibility.clear();
                for (const splat of splats) {
                    savedVisibility.set(splat.uid, splat.visible);
                    if (splat.uid !== roomSelection.uid) {
                        splat.visible = false;
                    }
                }
            } else if (!showOnlyToggle.value && showOnly) {
                showOnly = false;
                for (const splat of splats) {
                    const saved = savedVisibility.get(splat.uid);
                    if (saved !== undefined) {
                        splat.visible = saved;
                    }
                }
            }
        });

        // the hidden layers come back whenever the panel stops showing this room: closed,
        // another room picked, the scene cleared or an export about to check visibility
        const endShowOnly = () => {
            if (showOnly) {
                showOnlyToggle.value = false;
            }
        };

        events.on('experiencePanel.endShowOnly', endShowOnly);

        events.on('scene.clear', () => {
            showOnly = false;
            savedVisibility.clear();
            showOnlyToggle.value = false;
        });

        addDoorButton.on('click', () => {
            if (roomSelection.uid === null) {
                return;
            }
            const roomLayer = roomSelection.uid;
            // 2 m in front of the camera, along its view direction
            const pose = events.invoke('camera.getPose');
            const dx = pose.target.x - pose.position.x;
            const dy = pose.target.y - pose.position.y;
            const dz = pose.target.z - pose.position.z;
            const len = Math.hypot(dx, dy, dz) || 1;
            const center: [number, number, number] = [
                pose.position.x + (dx / len) * DOOR_DEFAULTS.distance,
                pose.position.y + (dy / len) * DOOR_DEFAULTS.distance,
                pose.position.z + (dz / len) * DOOR_DEFAULTS.distance
            ];
            let createdId: string = null;
            events.fire('experience.edit', 'addDoor', (experience: Experience) => {
                const door = addDoor(experience, roomLayer, { center });
                createdId = door?.id;
            });
            if (createdId) {
                events.fire('experience.select', { kind: 'door', id: createdId });
                events.fire('experience.editDoor', createdId);
            }
        });

        editDoorButton.on('click', () => {
            const door = selectedDoor();
            if (door) {
                events.fire('experience.editDoor', door.id);
            }
        });

        removeDoorButton.on('click', () => {
            const door = selectedDoor();
            if (door) {
                const id = door.id;
                events.fire('experience.edit', 'removeDoor', (experience: Experience) => {
                    removeItem(experience, 'door', id);
                });
            }
        });

        destinationSelect.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const to = Number(destinationSelect.value);
            editDoor('setDoorDestination', (d) => {
                d.to = to;
            });
        });

        doorLabelInput.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const value = doorLabelInput.value;
            editDoor('setDoorLabel', (d) => {
                d.label = value;
            });
        });

        preloadRadiusInput.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const value = preloadRadiusInput.value;
            editDoor('setDoorPreloadRadius', (d) => {
                d.preloadRadius = value;
            });
        });

        doorCenterInput.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const v = doorCenterInput.value;
            editDoor('setDoorCenter', (d) => {
                d.center = [v[0], v[1], v[2]];
            });
        });

        doorSizeInput.on('change', () => {
            if (suppressUI > 0) {
                return;
            }
            const v = doorSizeInput.value;
            editDoor('setDoorSize', (d) => {
                d.size = [Math.max(v[0], 0.05), Math.max(v[1], 0.05), Math.max(v[2], 0.05)];
            });
        });

        setArrivalButton.on('click', () => {
            const door = selectedDoor();
            if (!door) {
                return;
            }
            if (isRoomLayerHidden(door.to)) {
                events.invoke('showPopup', {
                    type: 'info',
                    header: i18n.t('panel.experience.set-arrival'),
                    message: i18n.t('panel.experience.arrival-hidden')
                });
                return;
            }
            const pose = events.invoke('camera.getPose');
            const arrival = {
                position: [pose.position.x, pose.position.y, pose.position.z] as [number, number, number],
                target: [pose.target.x, pose.target.y, pose.target.z] as [number, number, number]
            };
            editDoor('setDoorArrival', (d) => {
                d.arrival = arrival;
            });
        });

        // ------------------------------------------------------------------ rooms: rebuild

        const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

        const updateRoomFields = () => {
            const room = roomSelection.uid !== null ? roomOf(roomSelection.uid) : null;
            roomFields.hidden = !room;
            if (!room) {
                doorFields.hidden = true;
                return;
            }
            showOnlyToggle.enabled = true;

            const door = selectedDoor();
            doorList.hidden = room.doors.length === 0;
            removeDoorButton.enabled = !!door;
            doorFields.hidden = !door;
            if (!door || suppressUI > 0) {
                return;
            }
            const experience = (events.invoke('experience.get') as Experience);
            i18n.bindOptions(destinationSelect, () => experience.rooms
            .filter(r => r.layer !== room.layer)
            .map(r => ({ v: String(r.layer), t: r.id }))
            );
            destinationSelect.value = String(door.to);
            doorLabelInput.value = door.label;
            preloadRadiusInput.value = door.preloadRadius;
            doorCenterInput.value = [...door.center];
            doorSizeInput.value = [...door.size];
            arrivalStatus.text = i18n.t(door.arrival ? 'panel.experience.arrival-set' : 'panel.experience.arrival-missing');
        };

        const rebuildRoomsList = () => {
            roomsList.clear();
            const layers = events.invoke('experience.layers') as { uid: number, name: string, visible: boolean }[];
            const experience = (events.invoke('experience.get') as Experience);

            for (const layer of layers) {
                const room = experience.rooms.find(r => r.layer === layer.uid);
                const listRow = new Container({ class: ['experience-list-row', 'experience-room-row'] });
                if (roomSelection.uid === layer.uid) {
                    listRow.class.add('selected');
                }

                const nameLabel = new Label({ class: 'experience-list-row-label' });
                nameLabel.text = layer.name;

                // is a room
                const isRoomToggle = new BooleanInput({ type: 'toggle', value: !!room });
                isRoomToggle.on('change', () => {
                    const uid = layer.uid;
                    const value = isRoomToggle.value;
                    const name = layer.name;
                    events.fire('experience.edit', 'setRoom', (e: Experience) => {
                        setRoom(e, uid, value, name);
                    });
                });

                // the room id, editable when the layer is a room
                const idInput = new TextInput({ class: ['settings-panel-row-input', 'experience-room-id'], enabled: !!room });
                idInput.value = room?.id ?? slugify(layer.name);
                let idInvalid: Label = null;
                idInput.on('change', () => {
                    const uid = layer.uid;
                    const value = idInput.value.trim();
                    const taken = value !== '' && experience.rooms.some(r => r.layer !== uid && r.id === value);
                    const invalid = !SLUG.test(value) || taken;
                    if (idInvalid) {
                        idInvalid.hidden = !invalid;
                    }
                    if (!invalid && value) {
                        events.fire('experience.edit', 'setRoomId', (e: Experience) => {
                            const r = e.rooms.find(x => x.layer === uid);
                            if (r) {
                                r.id = value;
                            }
                        });
                    }
                });

                // first room (the page): radio-like, setting one clears the others
                const firstToggle = new BooleanInput({ type: 'toggle', value: experience.firstRoom === layer.uid });
                firstToggle.enabled = !!room;
                firstToggle.on('change', () => {
                    if (firstToggle.value) {
                        const uid = layer.uid;
                        events.fire('experience.edit', 'setFirstRoom', (e: Experience) => {
                            e.firstRoom = uid;
                        });
                    }
                });

                listRow.append(nameLabel);
                listRow.append(isRoomToggle);
                listRow.append(idInput);
                listRow.append(firstToggle);

                // a click on a control edits the store, which rebuilds this list and
                // destroys the controls before the click reaches the row, so keep
                // their nodes rather than reading .dom then
                const controlDoms = [isRoomToggle.dom, idInput.dom, firstToggle.dom];
                listRow.dom.addEventListener('click', (e) => {
                    if (e.target instanceof Node && controlDoms.some(dom => dom.contains(e.target as Node))) {
                        return;
                    }
                    if (roomSelection.uid !== layer.uid) {
                        endShowOnly();
                    }
                    roomSelection.uid = layer.uid;
                    updateRoomFields();
                    rebuildRoomsList();
                });

                roomsList.append(listRow);

                if (room) {
                    idInvalid = new Label({ class: ['settings-panel-row-label', 'experience-bad-id'], hidden: true });
                    i18n.bindText(idInvalid, 'panel.experience.bad-id');
                    roomsList.append(idInvalid);
                }
            }
        };

        const rebuildDoorList = () => {
            doorList.clear();
            const room = roomSelection.uid !== null ? roomOf(roomSelection.uid) : null;
            if (!room) {
                return;
            }
            const experience = (events.invoke('experience.get') as Experience);
            const selection = (events.invoke('experience.selection') as ExperienceSelection);

            for (const door of room.doors) {
                const listRow = new Container({ class: 'experience-list-row' });
                if (selection?.kind === 'door' && selection.id === door.id) {
                    listRow.class.add('selected');
                }

                const label = new Label({ class: 'experience-list-row-label' });
                const destination = experience.rooms.find(r => r.layer === door.to)?.id;
                label.text = `${door.label || i18n.t('panel.experience.door')} ${door.id}${destination ? ` → ${destination}` : ''}`;

                listRow.append(label);

                listRow.dom.addEventListener('click', () => {
                    events.fire('experience.select', { kind: 'door', id: door.id });
                });

                doorList.append(listRow);
            }
        };

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
        this.append(sectionHeader('panel.experience.rooms'));
        this.append(roomsList);
        this.append(roomFields);
        this.append(doorFields);

        // rebuild on every change of the data or the scene's layers
        const rebuild = () => {
            rebuildAnnotationList();
            updateAnnotationFields();
            rebuildScreenList();
            updateScreenFields();
            rebuildRoomsList();
            rebuildDoorList();
            updateRoomFields();
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
            if (!visible) {
                endShowOnly();
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

        // the first build waits for the store's first experience.changed: the editor's ui is
        // made before the scene the store needs
    }
}

export { ExperiencePanel };

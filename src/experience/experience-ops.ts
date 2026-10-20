// The experience store's edit operations: ids, room slugs and the layer-removal cascade. Pure,
// so Node can run them in tests and the store stays a thin events shell over them.

import { DEFAULT_SOUND, DOOR_DEFAULTS, SCREEN_DEFAULTS, type Experience, type ExperienceAnnotation, type ExperienceDoor, type ExperienceRoom, type ExperienceScreen, type LayerPose, type PoseT, type Vec3T } from './types.ts';

// 'Hall 2 (scan)' -> 'hall-2-scan'; anything left over collapses; empty -> 'room'
const slugify = (name: string): string => {
    const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
    return slug || 'room';
};

// 'hall', then 'hall-2', 'hall-3'...; `except` is a layer uid whose own id does not count, so
// re-slugging a room never moves its own id out from under it
const uniqueRoomId = (experience: Experience, wanted: string, except?: number): string => {
    const taken = new Set(experience.rooms.filter(room => room.layer !== except).map(room => room.id));
    if (!taken.has(wanted)) return wanted;
    let n = 2;
    while (taken.has(`${wanted}-${n}`)) n++;
    return `${wanted}-${n}`;
};

const addAnnotation = (
    e: Experience,
    init: { layer: number; position: Vec3T; camera: PoseT; layerPose: LayerPose }
): ExperienceAnnotation => {
    const n = e.nextId++;
    const annotation: ExperienceAnnotation = {
        id: `a${n}`,
        layer: init.layer,
        position: init.position,
        title: `Annotation ${n}`,
        text: '',
        camera: init.camera,
        layerPose: init.layerPose
    };
    e.annotations.push(annotation);
    return annotation;
};

const addScreen = (e: Experience, init: { layer: number; corners: [Vec3T, Vec3T, Vec3T, Vec3T]; layerPose: LayerPose }): ExperienceScreen => {
    const n = e.nextId++;
    const screen: ExperienceScreen = {
        id: `s${n}`,
        layer: init.layer,
        corners: init.corners,
        source: null,
        ...SCREEN_DEFAULTS,
        sound: { ...DEFAULT_SOUND },
        layerPose: init.layerPose
    };
    e.screens.push(screen);
    return screen;
};

// on: adds { layer, id: uniqueRoomId(slugify(name)), doors: [] }; an existing room of the layer
// keeps its id (a rename must not move it). off: removes the room and every door of other rooms
// pointing at it, and clears firstRoom if it was this layer.
const setRoom = (e: Experience, layer: number, isRoom: boolean, name: string): ExperienceRoom | null => {
    if (!isRoom) {
        e.rooms = e.rooms.filter(room => room.layer !== layer);
        for (const room of e.rooms) {
            room.doors = room.doors.filter(door => door.to !== layer);
        }
        if (e.firstRoom === layer) e.firstRoom = null;
        return null;
    }
    const existing = e.rooms.find(room => room.layer === layer);
    if (existing) return existing;
    const room: ExperienceRoom = { layer, id: uniqueRoomId(e, slugify(name)), doors: [] };
    e.rooms.push(room);
    return room;
};

const addDoor = (e: Experience, roomLayer: number, init: { center: Vec3T }): ExperienceDoor => {
    const n = e.nextId++;
    const room = e.rooms.find(r => r.layer === roomLayer);
    const to = e.rooms.find(r => r.layer !== roomLayer)?.layer ?? -1;
    const door: ExperienceDoor = {
        id: `d${n}`,
        to,
        label: '',
        center: init.center,
        size: [...DOOR_DEFAULTS.size] as Vec3T,
        preloadRadius: DOOR_DEFAULTS.preloadRadius,
        arrival: null
    };
    room?.doors.push(door);
    return door;
};

const removeItem = (e: Experience, kind: 'annotation' | 'screen' | 'door', id: string): void => {
    if (kind === 'annotation') {
        e.annotations = e.annotations.filter(a => a.id !== id);
    } else if (kind === 'screen') {
        e.screens = e.screens.filter(s => s.id !== id);
    } else {
        for (const room of e.rooms) {
            room.doors = room.doors.filter(door => door.id !== id);
        }
    }
};

// the cascade: a deleted layer's annotations, screens, its room, every door leading to it, and
// firstRoom if it pointed there
const removeLayer = (e: Experience, layer: number): void => {
    e.annotations = e.annotations.filter(a => a.layer !== layer);
    e.screens = e.screens.filter(s => s.layer !== layer);
    e.rooms = e.rooms.filter(room => room.layer !== layer);
    for (const room of e.rooms) {
        room.doors = room.doors.filter(door => door.to !== layer);
    }
    if (e.firstRoom === layer) e.firstRoom = null;
};

// removeLayer for every layer not in the scene: an undo or redo restores a whole snapshot,
// which can still hold content on layers deleted since it was taken
const keepLayers = (e: Experience, layers: number[]): void => {
    const present = new Set(layers);
    const layersInUse = [
        ...e.annotations.map(a => a.layer),
        ...e.screens.map(s => s.layer),
        ...e.rooms.flatMap(room => [room.layer, ...room.doors.map(door => door.to)]),
        ...(e.firstRoom === null ? [] : [e.firstRoom])
    ];
    for (const layer of new Set(layersInUse)) {
        if (layer !== -1 && !present.has(layer)) {
            removeLayer(e, layer);
        }
    }
};

const find = (
    e: Experience,
    kind: 'annotation' | 'screen' | 'door',
    id: string
): ExperienceAnnotation | ExperienceScreen | ExperienceDoor | undefined => {
    if (kind === 'annotation') return e.annotations.find(a => a.id === id);
    if (kind === 'screen') return e.screens.find(s => s.id === id);
    for (const room of e.rooms) {
        const door = room.doors.find(d => d.id === id);
        if (door) return door;
    }
    return undefined;
};

const layerPoseChanged = (a: LayerPose, b: LayerPose, epsilon = 1e-4): boolean => a.position.some((v, i) => Math.abs(v - b.position[i]) > epsilon) ||
    a.rotation.some((v, i) => Math.abs(v - b.rotation[i]) > epsilon) ||
    a.scale.some((v, i) => Math.abs(v - b.scale[i]) > epsilon);

export { addAnnotation, addDoor, addScreen, find, keepLayers, layerPoseChanged, removeItem, removeLayer, setRoom, slugify, uniqueRoomId };

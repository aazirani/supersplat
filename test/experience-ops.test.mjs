import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    addAnnotation,
    addDoor,
    addScreen,
    find,
    keepLayers,
    layerPoseChanged,
    removeItem,
    removeLayer,
    setRoom,
    slugify,
    uniqueRoomId
} from '../src/experience/experience-ops.ts';
import { DEFAULT_SOUND, DOOR_DEFAULTS, SCREEN_DEFAULTS, emptyExperience } from '../src/experience/types.ts';

const layerPose = () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });

describe('slugify', () => {
    it('slugifies layer names', () => {
        assert.equal(slugify('Hall 2 (scan)'), 'hall-2-scan');
        assert.equal(slugify(''), 'room');
        assert.equal(slugify('  My--Room!  '), 'my-room');
    });
});

describe('uniqueRoomId', () => {
    it('gives hall, hall-2 for two layers named Hall', () => {
        const e = emptyExperience();
        e.rooms.push({ layer: 1, id: 'hall', doors: [] });
        assert.equal(uniqueRoomId(e, 'hall'), 'hall-2');
        e.rooms.push({ layer: 2, id: 'hall-2', doors: [] });
        assert.equal(uniqueRoomId(e, 'hall'), 'hall-3');
    });

    it('keeps a room own id when re-slugging it', () => {
        const e = emptyExperience();
        e.rooms.push({ layer: 1, id: 'hall', doors: [] });
        assert.equal(uniqueRoomId(e, 'hall', 1), 'hall');
    });
});

describe('setRoom', () => {
    it('adds a room with a slug id from the layer name', () => {
        const e = emptyExperience();
        const room = setRoom(e, 7, true, 'Hall (scan)');
        assert.deepEqual(room, { layer: 7, id: 'hall-scan', doors: [] });
        assert.deepEqual(e.rooms, [room]);
    });

    it('a room id survives a layer rename', () => {
        const e = emptyExperience();
        setRoom(e, 1, true, 'Hall');
        setRoom(e, 2, true, 'Tunnel');
        e.rooms[1].doors.push({ id: 'd1', to: 1, label: '', center: [0, 0, 0], size: [1, 2, 1], preloadRadius: 8, arrival: null });

        setRoom(e, 1, true, 'Other name');
        // re-marking adds no duplicate room and keeps the id the layer was first given
        assert.equal(e.rooms.length, 2);
        assert.equal(e.rooms[0].id, 'hall');
        assert.equal(e.rooms[1].doors[0].to, 1);
    });

    it('off removes the room, doors pointing at it and clears firstRoom', () => {
        const e = emptyExperience();
        setRoom(e, 1, true, 'Hall');
        setRoom(e, 2, true, 'Tunnel');
        e.rooms[0].doors.push({ id: 'd1', to: 2, label: '', center: [0, 0, 0], size: [1, 2, 1], preloadRadius: 8, arrival: null });
        e.firstRoom = 2;

        setRoom(e, 2, false, 'Tunnel');
        assert.deepEqual(e.rooms.map((r) => r.id), ['hall']);
        assert.equal(e.rooms[0].doors.length, 0);
        assert.equal(e.firstRoom, null);
    });
});

describe('addAnnotation', () => {
    it('ids a1, a2 and advances nextId', () => {
        const e = emptyExperience();
        const a1 = addAnnotation(e, { layer: 1, position: [1, 0, 0], camera: { position: [0, 0, 1], target: [0, 0, 0], fov: 60 }, layerPose: layerPose() });
        assert.equal(a1.id, 'a1');
        assert.equal(a1.title, 'Annotation 1');
        assert.equal(a1.text, '');
        const a2 = addAnnotation(e, { layer: 1, position: [2, 0, 0], camera: a1.camera, layerPose: layerPose() });
        assert.equal(a2.id, 'a2');
        assert.equal(e.nextId, 3);
    });
});

describe('addScreen', () => {
    it('applies the viewer defaults', () => {
        const e = emptyExperience();
        const corners = [
            [0, 1, 0],
            [1, 1, 0],
            [1, 0, 0],
            [0, 0, 0]
        ];
        const s = addScreen(e, { layer: 1, corners, layerPose: layerPose() });
        assert.equal(s.id, 's1');
        assert.equal(s.source, null);
        assert.equal(s.offset, SCREEN_DEFAULTS.offset);
        assert.equal(s.loop, SCREEN_DEFAULTS.loop);
        assert.equal(s.playDistance, SCREEN_DEFAULTS.playDistance);
        assert.deepEqual(s.sound, DEFAULT_SOUND);
        assert.deepEqual(s.corners, corners);
        assert.equal(e.nextId, 2);
    });
});

describe('addDoor', () => {
    it('targets another room when one exists', () => {
        const e = emptyExperience();
        setRoom(e, 1, true, 'Hall');
        setRoom(e, 2, true, 'Tunnel');
        const door = addDoor(e, 1, { center: [1, 1, 1] });
        assert.equal(door.id, 'd1');
        assert.equal(door.to, 2);
        assert.deepEqual(door.size, DOOR_DEFAULTS.size);
        assert.equal(door.preloadRadius, DOOR_DEFAULTS.preloadRadius);
        assert.equal(door.arrival, null);
        assert.equal(e.rooms[0].doors.length, 1);
    });

    it('without another room targets -1', () => {
        const e = emptyExperience();
        setRoom(e, 1, true, 'Hall');
        const door = addDoor(e, 1, { center: [0, 0, 0] });
        assert.equal(door.to, -1);
    });
});

describe('removeItem', () => {
    it('removes annotations, screens and doors', () => {
        const e = emptyExperience();
        const annotation = addAnnotation(e, { layer: 1, position: [0, 0, 0], camera: { position: [0, 0, 1], target: [0, 0, 0], fov: 60 }, layerPose: layerPose() });
        const screen = addScreen(e, { layer: 1, corners: [
            [0, 1, 0],
            [1, 1, 0],
            [1, 0, 0],
            [0, 0, 0]
        ], layerPose: layerPose() });
        setRoom(e, 1, true, 'Hall');
        setRoom(e, 2, true, 'Tunnel');
        const door = addDoor(e, 1, { center: [0, 0, 0] });

        removeItem(e, 'annotation', annotation.id);
        removeItem(e, 'screen', screen.id);
        removeItem(e, 'door', door.id);
        assert.equal(e.annotations.length, 0);
        assert.equal(e.screens.length, 0);
        assert.equal(e.rooms[0].doors.length, 0);
    });
});

describe('removeLayer', () => {
    it('cascades to its content, its room, doors leading to it and firstRoom', () => {
        const e = emptyExperience();
        setRoom(e, 1, true, 'Hall');
        setRoom(e, 2, true, 'Tunnel');
        addAnnotation(e, { layer: 1, position: [0, 0, 0], camera: { position: [0, 0, 1], target: [0, 0, 0], fov: 60 }, layerPose: layerPose() });
        addAnnotation(e, { layer: 3, position: [0, 0, 0], camera: { position: [0, 0, 1], target: [0, 0, 0], fov: 60 }, layerPose: layerPose() });
        e.rooms[1].doors.push({ id: 'd1', to: 1, label: '', center: [0, 0, 0], size: [1, 2, 1], preloadRadius: 8, arrival: null });
        e.firstRoom = 1;

        removeLayer(e, 1);
        assert.equal(e.annotations.length, 1);
        assert.equal(e.annotations[0].layer, 3);
        assert.deepEqual(e.rooms.map((r) => r.id), ['tunnel']);
        assert.equal(e.rooms[0].doors.length, 0);
        assert.equal(e.firstRoom, null);
    });
});

describe('keepLayers', () => {
    // an undo restores a whole snapshot, which can still hold layers deleted since
    it('drops everything on layers no longer in the scene, like removeLayer for each', () => {
        const e = emptyExperience();
        setRoom(e, 1, true, 'Hall');
        setRoom(e, 2, true, 'Tunnel');
        addAnnotation(e, { layer: 1, position: [0, 0, 0], camera: { position: [0, 0, 1], target: [0, 0, 0], fov: 60 }, layerPose: layerPose() });
        addAnnotation(e, { layer: 2, position: [0, 0, 0], camera: { position: [0, 0, 1], target: [0, 0, 0], fov: 60 }, layerPose: layerPose() });
        addScreen(e, { layer: 1, corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], layerPose: layerPose() });
        e.rooms[1].doors.push({ id: 'd1', to: 1, label: '', center: [0, 0, 0], size: [1, 2, 1], preloadRadius: 8, arrival: null });
        e.rooms[1].doors.push({ id: 'd2', to: -1, label: '', center: [0, 0, 0], size: [1, 2, 1], preloadRadius: 8, arrival: null });
        e.firstRoom = 1;

        keepLayers(e, [2, 3]);
        assert.deepEqual(e.annotations.map((a) => a.layer), [2]);
        assert.equal(e.screens.length, 0);
        assert.deepEqual(e.rooms.map((r) => r.id), ['tunnel']);
        assert.deepEqual(e.rooms[0].doors.map((d) => d.id), ['d2']);
        assert.equal(e.firstRoom, null);
    });

    it('leaves an experience whose layers all exist untouched', () => {
        const e = emptyExperience();
        setRoom(e, 1, true, 'Hall');
        addAnnotation(e, { layer: 1, position: [0, 0, 0], camera: { position: [0, 0, 1], target: [0, 0, 0], fov: 60 }, layerPose: layerPose() });
        e.firstRoom = 1;
        const before = structuredClone(e);
        keepLayers(e, [1]);
        assert.deepEqual(e, before);
    });
});

describe('find', () => {
    it('finds by kind and id', () => {
        const e = emptyExperience();
        const a = addAnnotation(e, { layer: 1, position: [0, 0, 0], camera: { position: [0, 0, 1], target: [0, 0, 0], fov: 60 }, layerPose: layerPose() });
        assert.equal(find(e, 'annotation', 'a1'), a);
        assert.equal(find(e, 'annotation', 'a9'), undefined);
        assert.equal(find(e, 'screen', 'a1'), undefined);
    });
});

describe('layerPoseChanged', () => {
    it('is false for equal poses and true for a moved position', () => {
        const a = layerPose();
        assert.equal(layerPoseChanged(a, { ...a }), false);
        assert.equal(layerPoseChanged(a, { ...a, position: [0, 0.01, 0] }), true);
        assert.equal(layerPoseChanged(a, { ...a, scale: [1.1, 1, 1] }), true);
        assert.equal(layerPoseChanged(a, { ...a, rotation: [0.1, 0, 0, 1] }), true);
    });
});

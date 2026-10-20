import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deserializeExperience, serializeExperience } from '../src/experience/experience-doc.ts';
import { DEFAULT_SOUND, SCREEN_DEFAULTS, emptyExperience } from '../src/experience/types.ts';

const layerPose = () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });

const annotation = (layer, id = 'a1') => ({
    id,
    layer,
    position: [1, 2, 3],
    title: 'Vase',
    text: 'A [link](https://example.com).',
    camera: { position: [4, 5, 6], target: [1, 2, 3], fov: 60 },
    layerPose: layerPose()
});

const screen = (layer, source = null, id = 's1') => ({
    id,
    layer,
    corners: [
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0],
        [0, 0, 0]
    ],
    source,
    offset: SCREEN_DEFAULTS.offset,
    loop: SCREEN_DEFAULTS.loop,
    playDistance: SCREEN_DEFAULTS.playDistance,
    sound: DEFAULT_SOUND,
    layerPose: layerPose()
});

describe('serializeExperience', () => {
    it('round-trips annotations, screens, rooms and doors through layer indices', () => {
        const blob = new Blob(['x']);
        const experience = emptyExperience();
        experience.annotations.push(annotation(10), annotation(20, 'a2'));
        experience.screens.push(screen(10, { kind: 'file', name: 'My Clip.MP4', blob }));
        experience.rooms.push({
            layer: 10,
            id: 'hall',
            doors: [{ id: 'd1', to: 20, label: 'Tunnel', center: [1, 1, 1], size: [1.4, 2.6, 1], preloadRadius: 8, arrival: { position: [0, 0, 0], target: [1, 1, 1] } }]
        });
        experience.rooms.push({ layer: 20, id: 'tunnel', doors: [] });
        experience.firstRoom = 20;

        // uids [10, 20] <-> indices [0, 1]
        const layerIndex = new Map([
            [10, 0],
            [20, 1]
        ]);
        const { doc, media } = serializeExperience(experience, layerIndex);
        assert.equal(doc.version, 1);
        assert.equal(doc.annotations[0].layer, 0);
        assert.equal(doc.annotations[1].layer, 1);
        assert.equal(doc.screens[0].layer, 0);
        assert.equal(doc.rooms[0].layer, 0);
        assert.equal(doc.rooms[0].doors[0].to, 1);
        assert.equal(doc.rooms[1].layer, 1);
        assert.equal(doc.firstRoom, 1);
        assert.equal(media.length, 1);

        const back = deserializeExperience(doc, [10, 20], new Map(media.map((m) => [m.path, m.blob])));
        assert.deepEqual(back.annotations, experience.annotations);
        assert.deepEqual(back.screens, experience.screens);
        // blob identity survives the round trip
        assert.equal(back.screens[0].source.blob, blob);
        assert.deepEqual(back.rooms, experience.rooms);
        assert.equal(back.firstRoom, 20);
        assert.equal(back.nextId, experience.nextId);
    });

    it('writes a picked file as media/<id>.<ext> and lists it', () => {
        const experience = emptyExperience();
        experience.screens.push(screen(10, { kind: 'file', name: 'clip.mov', blob: new Blob(['y']) }));
        const { media } = serializeExperience(experience, new Map([[10, 0]]));
        assert.equal(media[0].path, 'media/s1.mov');
        assert.equal(media[0].blob, experience.screens[0].source.blob);
    });
});

describe('deserializeExperience', () => {
    it('a missing media file leaves the screen without a source', () => {
        const experience = emptyExperience();
        experience.screens.push(screen(10, { kind: 'file', name: 'clip.mp4', blob: new Blob(['x']) }));
        const { doc } = serializeExperience(experience, new Map([[10, 0]]));
        const back = deserializeExperience(doc, [10], new Map());
        assert.equal(back.screens[0].source, null);
    });

    it('an old document without experience loads empty', () => {
        assert.deepEqual(deserializeExperience(undefined, [10], new Map()), emptyExperience());
        assert.deepEqual(deserializeExperience(null, [10], new Map()), emptyExperience());
        assert.deepEqual(deserializeExperience({ version: 99 }, [10], new Map()), emptyExperience());
    });

    it('drops items whose layer no longer exists', () => {
        const experience = emptyExperience();
        experience.annotations.push(annotation(10), annotation(30, 'a2'));
        experience.screens.push(screen(30));
        experience.rooms.push({ layer: 10, id: 'hall', doors: [{ id: 'd1', to: 30, label: '', center: [0, 0, 0], size: [1, 2, 1], preloadRadius: 8, arrival: null }] });
        const { doc } = serializeExperience(experience, new Map([[10, 0], [30, 1]]));
        // only layer 10 survives the reload
        const back = deserializeExperience(doc, [10], new Map());
        assert.equal(back.annotations.length, 1);
        assert.equal(back.annotations[0].layer, 10);
        assert.equal(back.screens.length, 0);
        assert.equal(back.rooms.length, 1);
        // the door to the vanished room is dropped
        assert.equal(back.rooms[0].doors.length, 0);
    });

    it('drops a firstRoom whose layer no longer exists', () => {
        const experience = emptyExperience();
        experience.rooms.push({ layer: 10, id: 'hall', doors: [] });
        experience.firstRoom = 30;
        const { doc } = serializeExperience(experience, new Map([[10, 0], [30, 1]]));
        const back = deserializeExperience(doc, [10], new Map());
        assert.equal(back.firstRoom, null);
    });

    it('nextId round-trips', () => {
        const experience = emptyExperience();
        experience.nextId = 7;
        const { doc } = serializeExperience(experience, new Map());
        assert.equal(deserializeExperience(doc, [], new Map()).nextId, 7);
    });
});

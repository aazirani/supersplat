import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defaultSettings, validateSettings, ANNOTATION_LIMITS } from '@playcanvas/supersplat-viewer/settings';
import { composeExperience, exportProblems, mediaFileName } from '../src/experience/experience-settings.ts';
import { DEFAULT_SOUND, SCREEN_DEFAULTS, emptyExperience } from '../src/experience/types.ts';

const layerPose = () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });

const layers = () => [
    { uid: 1, name: 'hall', visible: true, pose: layerPose() },
    { uid: 2, name: 'tunnel', visible: true, pose: layerPose() },
    { uid: 3, name: 'attic', visible: false, pose: layerPose() }
];

const annotation = (layer, title = 'Vase') => ({
    id: 'a1',
    layer,
    position: [1, 2, 3],
    title,
    text: 'A vase.',
    camera: { position: [4, 5, 6], target: [1, 2, 3], fov: 60 },
    layerPose: layerPose()
});

const screen = (layer, source = null) => ({
    id: 's1',
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

const base = () => defaultSettings();

describe('composeExperience without rooms', () => {
    it('makes one page with the visible layers annotations and videos', () => {
        const experience = emptyExperience();
        experience.annotations.push(annotation(1), { ...annotation(3), id: 'a2' });
        experience.screens.push(screen(2, { kind: 'url', url: 'https://example.com/v.mp4' }));

        const { pages, media, warnings } = composeExperience(experience, layers(), base());
        assert.equal(pages.length, 1);
        assert.equal(pages[0].layer, null);
        assert.equal(pages[0].path, '');
        assert.equal(pages[0].settings.annotations.length, 1);
        assert.deepEqual(pages[0].settings.annotations[0], {
            position: [1, 2, 3],
            title: 'Vase',
            text: 'A vase.',
            camera: { initial: { position: [4, 5, 6], target: [1, 2, 3], fov: 60 } }
        });
        assert.equal(pages[0].settings.videos.length, 1);
        assert.deepEqual(pages[0].settings.videos[0].corners, screen(2).corners);
        // the annotation on the hidden attic is skipped with a warning naming the layer
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /attic/);
        assert.equal(media.length, 0);
    });
});

describe('composeExperience with rooms', () => {
    const roomedExperience = () => {
        const experience = emptyExperience();
        experience.rooms.push({ layer: 1, id: 'hall', doors: [] });
        experience.rooms.push({ layer: 2, id: 'tunnel', doors: [] });
        return experience;
    };

    it('the first room carries the rooms list and the others their own settings', () => {
        const experience = roomedExperience();
        experience.rooms[0].doors.push({
            id: 'd1',
            to: 2,
            label: 'To the tunnel',
            center: [1, 1, 1],
            size: [1.4, 2.6, 1],
            preloadRadius: 8,
            arrival: { position: [0, 0, 0], target: [1, 1, 1] }
        });

        const { pages } = composeExperience(experience, layers(), base());
        assert.deepEqual(pages.map((p) => p.path), ['', 'rooms/tunnel/']);
        assert.equal(pages[0].layer, 1);
        assert.equal(pages[0].settings.rooms.length, 2);
        assert.equal(pages[0].settings.rooms[0].id, 'hall');
        assert.equal(pages[0].settings.rooms[0].contentUrl, undefined);
        assert.equal(pages[0].settings.rooms[1].contentUrl, 'rooms/tunnel/scene.sog');
        assert.equal(pages[0].settings.rooms[1].settingsUrl, 'rooms/tunnel/settings.json');
        assert.equal(pages[0].settings.rooms[0].doors[0].to, 'tunnel');
        assert.deepEqual(pages[0].settings.rooms[0].doors[0].arrival, { position: [0, 0, 0], target: [1, 1, 1] });
        // the other room: its own settings, no rooms list, no animation
        assert.equal(pages[1].layer, 2);
        assert.equal(pages[1].settings.rooms, undefined);
        assert.deepEqual(pages[1].settings.animTracks, []);
        assert.equal(pages[1].settings.startMode, 'default');
    });

    it('firstRoom picks the page', () => {
        const experience = roomedExperience();
        experience.firstRoom = 2;
        const { pages } = composeExperience(experience, layers(), base());
        assert.equal(pages[0].layer, 2);
        assert.equal(pages[1].layer, 1);
    });

    it('ignores a visible non-room layer with a warning', () => {
        const experience = roomedExperience();
        const { warnings } = composeExperience(experience, layers(), base());
        // hall and tunnel are rooms; attic is hidden (no warning about it here)
        assert.equal(warnings.filter((w) => !w.includes('attic')).length, 0);
        const visibleNonRoom = layers();
        experience.rooms.pop(); // tunnel no longer a room
        const { warnings: w2 } = composeExperience(experience, visibleNonRoom, base());
        assert.equal(w2.filter((x) => x.includes('tunnel')).length, 1);
    });
});

describe('screen sources', () => {
    it('a file screen becomes media/<id>.<ext>', () => {
        const experience = emptyExperience();
        experience.screens.push(screen(1, { kind: 'file', name: 'My Clip.MP4', blob: new Blob(['x']) }));
        const { pages, media } = composeExperience(experience, layers(), base());
        assert.equal(media.length, 1);
        assert.equal(media[0].path, 'media/s1.mp4');
        assert.equal(media[0].screen, experience.screens[0]);
        assert.equal(pages[0].settings.videos[0].src, 'media/s1.mp4');
    });

    it('a url screen keeps its url and lists no media', () => {
        const experience = emptyExperience();
        experience.screens.push(screen(1, { kind: 'url', url: 'https://example.com/v.mp4' }));
        const { pages, media } = composeExperience(experience, layers(), base());
        assert.equal(media.length, 0);
        assert.equal(pages[0].settings.videos[0].src, 'https://example.com/v.mp4');
    });

    it('sound null exports as false', () => {
        const experience = emptyExperience();
        experience.screens.push({ ...screen(1, { kind: 'url', url: 'https://example.com/v.mp4' }), sound: null });
        const { pages } = composeExperience(experience, layers(), base());
        assert.equal(pages[0].settings.videos[0].sound, false);
    });

    it('mediaFileName maps a file to its path and a url to null', () => {
        assert.equal(mediaFileName(screen(1, { kind: 'file', name: 'clip.mp4', blob: new Blob(['x']) })), 'media/s1.mp4');
        assert.equal(mediaFileName(screen(1, { kind: 'url', url: 'u' })), null);
        assert.equal(mediaFileName(screen(1, null)), null);
    });
});

describe('exportProblems', () => {
    it('lists a door without arrival, a door to a non-room, a screen without source, a hidden room layer, a duplicate room id', () => {
        const experience = emptyExperience();
        experience.rooms.push({ layer: 1, id: 'hall', doors: [{ id: 'd1', to: 2, label: '', center: [0, 0, 0], size: [1, 2, 1], preloadRadius: 8, arrival: null }] });
        experience.rooms.push({ layer: 2, id: 'hall', doors: [] });
        experience.rooms.push({ layer: 3, id: 'attic', doors: [{ id: 'd2', to: 9, label: '', center: [0, 0, 0], size: [1, 2, 1], preloadRadius: 8, arrival: { position: [0, 0, 0], target: [1, 0, 0] } }] });
        experience.screens.push(screen(1, null));

        const problems = exportProblems(experience, layers());
        assert.equal(problems.length, 5, problems.join('\n'));
        assert.match(problems[0], /arrival/i);
        assert.match(problems[1], /not a room/i);
        assert.match(problems[2], /source/i);
        assert.match(problems[3], /hidden/i);
        assert.match(problems[4], /more than one room/i);
    });

    it('composeExperience throws with the problems', () => {
        const experience = emptyExperience();
        experience.screens.push(screen(1, null));
        assert.throws(() => composeExperience(experience, layers(), base()), /source/);
    });
});

describe('validation', () => {
    it('every page validates against the fork', () => {
        const experience = emptyExperience();
        experience.annotations.push(annotation(1));
        experience.screens.push(screen(2, { kind: 'url', url: 'https://example.com/v.mp4' }));
        const { pages } = composeExperience(experience, layers(), base());
        assert.equal(pages.length, 1);
        validateSettings(pages[0].settings, { limits: true });
    });

    it('a too-long title throws naming the page', () => {
        const experience = emptyExperience();
        experience.rooms.push({ layer: 1, id: 'hall', doors: [] });
        experience.rooms.push({ layer: 2, id: 'tunnel', doors: [] });
        experience.annotations.push({ ...annotation(2, 'x'.repeat(ANNOTATION_LIMITS.titleMax + 1)), layer: 2 });
        assert.throws(() => composeExperience(experience, layers(), base()), /rooms\/tunnel\//);
    });
});

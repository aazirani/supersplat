import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SOUND, DOOR_DEFAULTS, SCREEN_DEFAULTS, emptyExperience } from '../src/experience/types.ts';

describe('experience defaults', () => {
    it('match the viewer format', () => {
        assert.deepEqual(DEFAULT_SOUND, { volume: 1, refDistance: 1, fadeDistance: 12 });
        assert.deepEqual(SCREEN_DEFAULTS, { offset: 0.01, loop: true, playDistance: 20 });
        assert.equal(DOOR_DEFAULTS.preloadRadius, 8);
        assert.deepEqual(DOOR_DEFAULTS.size, [1.4, 2.6, 1]);
    });
    it('starts empty with no first room', () => {
        assert.deepEqual(emptyExperience(), { annotations: [], screens: [], rooms: [], firstRoom: null, nextId: 1 });
    });
});

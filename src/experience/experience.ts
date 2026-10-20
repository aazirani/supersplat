// The experience store: one live Experience behind the editor's events, with snapshot undo
// through ExperienceEditOp, the layer-removal cascade on element destruction, and the
// document round trip hooks.

import { ExperienceEditOp } from '../edit-ops';
import { ElementType } from '../element';
import { Events } from '../events';
import { Scene } from '../scene';
import type { Splat } from '../splat';
import { deserializeExperience, serializeExperience } from './experience-doc';
import { find, removeLayer } from './experience-ops';
import { exportProblems } from './experience-settings';
import { emptyExperience, type Experience, type LayerInfo, type LayerPose } from './types';

type ExperienceSelection = { kind: 'annotation' | 'screen' | 'door'; id: string } | null;

const splatPose = (splat: Splat): LayerPose => {
    const position = splat.entity.getPosition();
    const rotation = splat.entity.getRotation();
    const scale = splat.entity.getLocalScale();
    return {
        position: [position.x, position.y, position.z],
        rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
        scale: [scale.x, scale.y, scale.z]
    };
};

const registerExperienceEvents = (events: Events, scene: Scene) => {
    let store: Experience = emptyExperience();
    let selection: ExperienceSelection = null;

    // fire after every change, undo, redo, load and clear; a selection whose item
    // is gone resets to null
    const changed = () => {
        if (selection && !find(store, selection.kind, selection.id)) {
            selection = null;
            events.fire('experience.selection', selection);
        }
        events.fire('experience.changed');
    };

    events.function('experience.get', () => store);

    // the layers as the export and the panel see them
    const layers = () => (scene.getElementsByType(ElementType.splat) as Splat[]).map(splat => ({
        uid: splat.uid,
        name: splat.name,
        visible: splat.visible,
        pose: splatPose(splat)
    }));

    events.function('experience.layers', layers);

    events.function('experience.layerPose', (uid: number) => {
        const splat = (scene.getElementsByType(ElementType.splat) as Splat[]).find(s => s.uid === uid);
        return splat ? splatPose(splat) : null;
    });

    events.function('experience.hasRoomsOrScreens', () => store.rooms.length > 0 || store.screens.length > 0);

    // what stops an export: one line per problem, empty means it may go
    events.function('experience.exportProblems', () => exportProblems(store, layers()));

    // one generic edit command: snapshot, mutate, push the undo op (the mutation has
    // already happened, so the op is added suppressed)
    events.on('experience.edit', (name: string, fn: (e: Experience) => void) => {
        const before = structuredClone(store);
        fn(store);
        const after = structuredClone(store);
        const restore = (snapshot: Experience) => {
            // a clone, so the live store and the op's snapshot are never the same object
            store = structuredClone(snapshot);
            changed();
        };
        events.fire('edit.add', new ExperienceEditOp(name, before, after, restore), true);
        changed();
    });

    events.on('experience.select', (sel: ExperienceSelection) => {
        selection = sel;
        events.fire('experience.selection', selection);
    });

    events.function('experience.selection', () => selection);

    events.function('docSerialize.experience', (splats: Splat[]) => {
        const layerIndex = new Map(splats.map((splat, i) => [splat.uid, i]));
        return serializeExperience(store, layerIndex);
    });

    events.function('docDeserialize.experience', (doc: unknown, splats: Splat[], media: Map<string, Blob>) => {
        store = deserializeExperience(doc, splats.map(splat => splat.uid), media);
        selection = null;
        changed();
    });

    // layer deletion is not undoable in this editor (history is pruned on destroy), so the
    // cascade runs directly, no op pushed
    events.on('scene.elementDestroyed', (element) => {
        if (element.type === ElementType.splat) {
            removeLayer(store, element.uid);
            changed();
        }
    });

    events.on('scene.clear', () => {
        store = emptyExperience();
        selection = null;
        changed();
    });
};

export { registerExperienceEvents, type ExperienceSelection };

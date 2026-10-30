// The experience's place in document.json: layer references as indices into document.splats,
// picked videos as media/<screen id>.<ext> entries. Pure, so Node can run it in tests.

import { mediaFileName } from './experience-settings.ts';
import type { Experience, ExperienceAnnotation, ExperienceDoor, ExperienceRoom, ExperienceScreen, LayerPose, PoseT, ScreenSource, Vec3T } from './types.ts';

type ExperienceDoc = {
    version: 1;
    annotations: unknown[];
    screens: unknown[];
    rooms: unknown[];
    firstRoom: number | null;
    nextId: number;
};

type SerializedExperience = {
    doc: ExperienceDoc;
    media: { path: string; blob: Blob }[];
};

// layer references become indices; -1 (a door with no destination yet) stays -1
const layerRef = (uid: number, layerIndex: Map<number, number>): number | null => {
    if (uid === -1) return -1;
    const index = layerIndex.get(uid);
    return index === undefined ? null : index;
};

const serializeExperience = (experience: Experience, layerIndex: Map<number, number>): SerializedExperience => {
    const media: { path: string; blob: Blob }[] = [];

    const annotations = experience.annotations
    .filter(a => layerIndex.has(a.layer))
    .map(a => ({ ...a, layer: layerIndex.get(a.layer) }));

    const screens = experience.screens
    .filter(s => layerIndex.has(s.layer))
    .map((s) => {
        const source: unknown = s.source === null ? null : s.source.kind === 'url' ? s.source : null;
        if (s.source?.kind === 'file') {
            const path = mediaFileName(s);
            if (path) {
                media.push({ path, blob: s.source.blob });
                return { ...s, layer: layerIndex.get(s.layer), source: { kind: 'file', name: s.source.name, path } };
            }
        }
        return { ...s, layer: layerIndex.get(s.layer), source };
    });

    const rooms = experience.rooms
    .filter(room => layerIndex.has(room.layer))
    .map(room => ({
        ...room,
        layer: layerIndex.get(room.layer),
        doors: room.doors
        .map(door => ({ ...door, to: layerRef(door.to, layerIndex) }))
        .filter(door => door.to !== null)
    }));

    const firstRoom = experience.firstRoom === null ? null : layerRef(experience.firstRoom, layerIndex);

    return {
        doc: {
            version: 1,
            annotations,
            screens,
            rooms,
            firstRoom: firstRoom === -1 ? null : firstRoom,
            nextId: experience.nextId
        },
        media
    };
};

// layerUids[index] or undefined; -1 (no destination) stays -1
const readLayer = (index: unknown, layerUids: number[]): number | undefined => {
    if (index === -1) return -1;
    return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < layerUids.length ? layerUids[index] : undefined;
};

const readVec3 = (v: unknown): Vec3T | null => (Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number') ? [v[0], v[1], v[2]] : null);

const readPose = (v: unknown): PoseT | null => {
    if (typeof v !== 'object' || v === null) return null;
    const { position, target, fov } = v as { position: unknown; target: unknown; fov: unknown };
    const p = readVec3(position);
    const t = readVec3(target);
    return p && t && typeof fov === 'number' ? { position: p, target: t, fov } : null;
};

const readLayerPose = (v: unknown): LayerPose | null => {
    if (typeof v !== 'object' || v === null) return null;
    const { position, rotation, scale } = v as { position: unknown; rotation: unknown; scale: unknown };
    const p = readVec3(position);
    const s = readVec3(scale);
    const r =
        Array.isArray(rotation) && rotation.length === 4 && rotation.every(x => typeof x === 'number') ?
            [rotation[0], rotation[1], rotation[2], rotation[3]] as [number, number, number, number] :
            null;
    return p && r && s ? { position: p, rotation: r, scale: s } : null;
};

const deserializeExperience = (doc: unknown, layerUids: number[], media: Map<string, Blob>): Experience => {
    if (typeof doc !== 'object' || doc === null || (doc as { version?: unknown }).version !== 1) {
        return { annotations: [], screens: [], rooms: [], firstRoom: null, nextId: 1 };
    }
    const { annotations, screens, rooms, firstRoom, nextId } = doc as {
        annotations: unknown;
        screens: unknown;
        rooms: unknown;
        firstRoom: unknown;
        nextId: unknown;
    };

    const outAnnotations: ExperienceAnnotation[] = [];
    if (Array.isArray(annotations)) {
        for (const a of annotations) {
            if (typeof a !== 'object' || a === null) continue;
            const { id, layer, position, title, text, camera, layerPose } = a as Record<string, unknown>;
            const uid = readLayer(layer, layerUids);
            const pos = readVec3(position);
            const pose = readPose(camera);
            const lp = readLayerPose(layerPose);
            if (uid === undefined || !pos || !pose || !lp) continue;
            outAnnotations.push({
                id: String(id),
                layer: uid,
                position: pos,
                title: String(title ?? ''),
                text: String(text ?? ''),
                camera: pose,
                layerPose: lp
            });
        }
    }

    const outScreens: ExperienceScreen[] = [];
    if (Array.isArray(screens)) {
        for (const s of screens) {
            if (typeof s !== 'object' || s === null) continue;
            const { id, layer, corners, source, offset, loop, playDistance, sound, layerPose } = s as Record<string, unknown>;
            const uid = readLayer(layer, layerUids);
            const lp = readLayerPose(layerPose);
            if (uid === undefined || !lp) continue;
            const cs = Array.isArray(corners) && corners.length === 4 ? corners.map(readVec3) : null;
            if (!cs || cs.some(c => c === null)) continue;
            let outSource: ScreenSource | null = null;
            if (typeof source === 'object' && source !== null) {
                const src = source as { kind?: unknown; url?: unknown; name?: unknown; path?: unknown };
                if (src.kind === 'url' && typeof src.url === 'string') {
                    outSource = { kind: 'url', url: src.url };
                } else if (src.kind === 'file' && typeof src.name === 'string' && typeof src.path === 'string') {
                    const blob = media.get(src.path);
                    if (blob) outSource = { kind: 'file', name: src.name, blob };
                }
            }
            const outSound =
                typeof sound === 'object' && sound !== null ?
                    {
                        volume: Number((sound as { volume: unknown }).volume ?? 1),
                        refDistance: Number((sound as { refDistance: unknown }).refDistance ?? 1),
                        fadeDistance: Number((sound as { fadeDistance: unknown }).fadeDistance ?? 12)
                    } :
                    null;
            outScreens.push({
                id: String(id),
                layer: uid,
                corners: cs as [Vec3T, Vec3T, Vec3T, Vec3T],
                source: outSource,
                offset: Number(offset ?? 0.01),
                loop: loop !== false,
                playDistance: Number(playDistance ?? 20),
                sound: outSound,
                layerPose: lp
            });
        }
    }

    const outRooms: ExperienceRoom[] = [];
    if (Array.isArray(rooms)) {
        for (const room of rooms) {
            if (typeof room !== 'object' || room === null) continue;
            const { layer, id, doors } = room as Record<string, unknown>;
            const uid = readLayer(layer, layerUids);
            if (uid === undefined) continue;
            const outDoors: ExperienceDoor[] = [];
            if (Array.isArray(doors)) {
                for (const door of doors) {
                    if (typeof door !== 'object' || door === null) continue;
                    const { id: doorId, to, label, center, size, preloadRadius, arrival } = door as Record<string, unknown>;
                    const toUid = readLayer(to, layerUids);
                    const c = readVec3(center);
                    const sz = readVec3(size);
                    if (toUid === undefined || !c || !sz) continue;
                    let outArrival: ExperienceDoor['arrival'] = null;
                    if (typeof arrival === 'object' && arrival !== null) {
                        const p = readVec3((arrival as { position: unknown }).position);
                        const t = readVec3((arrival as { target: unknown }).target);
                        if (p && t) outArrival = { position: p, target: t };
                    }
                    outDoors.push({
                        id: String(doorId),
                        to: toUid,
                        label: String(label ?? ''),
                        center: c,
                        size: sz,
                        preloadRadius: Number(preloadRadius ?? 8),
                        arrival: outArrival
                    });
                }
            }
            outRooms.push({ layer: uid, id: String(id), doors: outDoors });
        }
    }

    const first = readLayer(firstRoom, layerUids);

    return {
        annotations: outAnnotations,
        screens: outScreens,
        rooms: outRooms,
        firstRoom: first === undefined || first === -1 ? null : first,
        nextId: typeof nextId === 'number' && nextId >= 1 ? nextId : 1
    };
};

export type { ExperienceDoc, SerializedExperience };
export { deserializeExperience, serializeExperience };

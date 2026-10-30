// Composing the forked viewer's settings.json files from the editor's experience store, and
// listing what stops an export. Pure, so Node can run it in tests.

import { validateSettings, type ExperienceSettings } from '@playcanvas/supersplat-viewer/settings';

import type { Experience, ExperienceScreen, LayerInfo, Vec3T } from './types.ts';

type ComposedPage = {
    // the room's layer uid, or null for the "all visible layers" page when there are no rooms
    layer: number | null;
    // '' for the first room (the page), 'rooms/<id>/' for the others
    path: string;
    settings: ExperienceSettings;
};

type ComposedMedia = { path: string; screen: ExperienceScreen };

type ComposeResult = { pages: ComposedPage[]; media: ComposedMedia[]; warnings: string[] };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// the media file a picked video lands at in the export and the project: media/<screen id>.<ext>,
// the extension taken from the picked name (lowercase, [a-z0-9] only, mp4 as the fallback)
const mediaFileName = (screen: ExperienceScreen): string | null => {
    if (screen.source?.kind !== 'file') return null;
    const name = screen.source.name;
    const dot = name.lastIndexOf('.');
    const ext = dot === -1 ? '' : name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
    return `media/${screen.id}.${ext || 'mp4'}`;
};

// One line per problem, in door, screen, hidden-layer, id order; empty means export may go.
const exportProblems = (experience: Experience, layers: LayerInfo[]): string[] => {
    const problems: string[] = [];
    const layerName = (uid: number) => layers.find(l => l.uid === uid)?.name ?? `layer ${uid}`;

    for (const room of experience.rooms) {
        for (const door of room.doors) {
            if (!door.arrival) {
                problems.push(`Room ${room.id}: door ${door.id} (${door.label || 'unlabelled'}) has no arrival pose.`);
            }
            const target = experience.rooms.find(r => r.layer === door.to);
            if (!target) {
                problems.push(`Room ${room.id}: door ${door.id} leads to ${layerName(door.to)}, which is not a room.`);
            }
        }
    }

    for (const screen of experience.screens) {
        if (!screen.source) {
            problems.push(`Screen ${screen.id} (${layerName(screen.layer)}) has no video source.`);
        }
    }

    for (const room of experience.rooms) {
        const info = layers.find(l => l.uid === room.layer);
        if (!info) {
            problems.push(`Room ${room.id} (${layerName(room.layer)}) is not in the scene.`);
        } else if (!info.visible) {
            problems.push(`Room ${room.id} (${info.name}) is hidden; a room's layer must be visible to export.`);
        }
    }

    const seen = new Set<string>();
    for (const room of experience.rooms) {
        if (!SLUG.test(room.id)) {
            problems.push(`Room id "${room.id}" is not lowercase letters, digits and dashes.`);
        } else if (seen.has(room.id)) {
            problems.push(`Room id "${room.id}" is used by more than one room.`);
        }
        seen.add(room.id);
    }

    return problems;
};

// What an export leaves out without being stopped by it, one line per layer, for the user to
// confirm before the export runs: without rooms, content on hidden layers; with rooms, every
// layer that is not a room (visible, or hidden with content).
const exportWarnings = (experience: Experience, layers: LayerInfo[]): string[] => {
    const warnings: string[] = [];
    const hasContent = (uid: number) => experience.annotations.some(a => a.layer === uid) || experience.screens.some(s => s.layer === uid);

    for (const layer of layers) {
        if (experience.rooms.length === 0) {
            if (!layer.visible && hasContent(layer.uid)) {
                warnings.push(`Layer ${layer.name} is hidden; its annotations and screens are not exported.`);
            }
        } else if (!experience.rooms.some(r => r.layer === layer.uid)) {
            if (layer.visible) {
                warnings.push(`Layer ${layer.name} is not a room; it is not part of the experience.`);
            } else if (hasContent(layer.uid)) {
                warnings.push(`Layer ${layer.name} is hidden and not a room; its annotations and screens are not exported.`);
            }
        }
    }

    return warnings;
};

// the annotations and videos of one layer, in the viewer's settings format
const layerEntries = (experience: Experience, layer: number): { annotations: unknown[]; videos: unknown[] } => {
    const annotations = experience.annotations
    .filter(a => a.layer === layer)
    .map(a => ({ position: a.position, title: a.title, text: a.text, camera: { initial: a.camera } }));
    const videos = experience.screens
    .filter(s => s.layer === layer)
    .map(s => ({
        src: mediaFileName(s) ?? (s.source as { url: string }).url,
        corners: s.corners,
        offset: s.offset,
        loop: s.loop,
        playDistance: s.playDistance,
        sound: s.sound ?? false
    }));
    return { annotations, videos };
};

/**
 * Compose the viewer's settings files from the experience: one page per room (or one page over
 * all visible layers without rooms), and the media files the picked videos land at. Throws with
 * `exportProblems`'s lines when the experience is not exportable, and with the page path
 * prefixed when a composed page fails the fork's validation.
 */
const composeExperience = (experience: Experience, layers: LayerInfo[], base: ExperienceSettings): ComposeResult => {
    const problems = exportProblems(experience, layers);
    if (problems.length > 0) {
        throw new Error(problems.join('\n'));
    }

    const warnings = exportWarnings(experience, layers);
    const media: ComposedMedia[] = [];
    const pages: ComposedPage[] = [];

    // the viewer settings of one room's page: the base look plus this room's content
    const roomPage = (room: Experience['rooms'][number], path: string, withBase: ExperienceSettings): ComposedPage => {
        const settings: ExperienceSettings = structuredClone(withBase);
        const { annotations, videos } = layerEntries(experience, room.layer);
        settings.annotations = annotations as ExperienceSettings['annotations'];
        if (videos.length > 0) {
            settings.videos = videos as ExperienceSettings['videos'];
        }
        for (const screen of experience.screens) {
            const path = mediaFileName(screen);
            if (screen.layer === room.layer && path) {
                media.push({ path, screen });
            }
        }
        return { layer: room.layer, path, settings };
    };

    if (experience.rooms.length === 0) {
        // one page over every visible layer; hidden layers' content is skipped with a warning
        const settings = structuredClone(base);
        const annotations: unknown[] = [];
        const videos: unknown[] = [];
        for (const layer of layers) {
            if (!layer.visible) continue;
            const entries = layerEntries(experience, layer.uid);
            annotations.push(...entries.annotations);
            videos.push(...entries.videos);
        }
        settings.annotations = annotations as ExperienceSettings['annotations'];
        if (videos.length > 0) {
            settings.videos = videos as ExperienceSettings['videos'];
        }
        for (const screen of experience.screens) {
            const path = mediaFileName(screen);
            if (path && layers.find(l => l.uid === screen.layer)?.visible) {
                media.push({ path, screen });
            }
        }
        pages.push({ layer: null, path: '', settings });
    } else {
        // the page's own room first, the others in experience order
        const firstLayer = experience.firstRoom ?? experience.rooms[0].layer;
        const ordered = [...experience.rooms].sort((a, b) => (a.layer === firstLayer ? -1 : b.layer === firstLayer ? 1 : 0));
        const [first, ...others] = ordered;

        pages.push(roomPage(first, '', base));

        // the rooms list the viewer walks: the page's own room first (no urls), the others' folders
        pages[0].settings.rooms = ordered.map(room => ({
            ...(room.layer === first.layer ? {} : { contentUrl: `rooms/${room.id}/scene.sog`, settingsUrl: `rooms/${room.id}/settings.json` }),
            id: room.id,
            doors: room.doors.map(door => ({
                to: experience.rooms.find(r => r.layer === door.to)?.id ?? '',
                label: door.label,
                center: door.center,
                size: door.size,
                preloadRadius: door.preloadRadius,
                arrival: door.arrival ?? { position: [0, 0, 0] as Vec3T, target: [0, 0, 0] as Vec3T }
            }))
        })) as ExperienceSettings['rooms'];

        for (const room of others) {
            const settings = structuredClone(base);
            settings.animTracks = [];
            settings.startMode = 'default';
            pages.push(roomPage(room, `rooms/${room.id}/`, settings));
        }
    }

    for (const page of pages) {
        try {
            validateSettings(page.settings, { limits: true });
        } catch (err) {
            throw new Error(page.path ? `${page.path}: ${(err as Error).message}` : (err as Error).message);
        }
    }

    return { pages, media, warnings };
};

export type { ComposedMedia, ComposedPage, ComposeResult };
export { composeExperience, exportProblems, exportWarnings, mediaFileName };

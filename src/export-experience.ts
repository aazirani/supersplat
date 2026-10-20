// The experience export: per-room settings and SOG content, embedded media, and the forked
// viewer's files, all in one zip the viewer plays as the museum does.

import { logger as splatTransformLogger, MemoryFileSystem, ZipFileSystem, type FileSystem } from '@playcanvas/splat-transform';
import { css, js, renderViewerHtml } from '@playcanvas/supersplat-viewer';
import type { ExperienceSettings as ForkSettings } from '@playcanvas/supersplat-viewer/settings';

import { ElementType } from './element';
import { Events } from './events';
import { composeExperience } from './experience/experience-settings';
import { Scene } from './scene';
import { Splat } from './splat';
import { createProgressRenderer, writeSplatFile, type SceneExportOptions, type SerializeSettings, type ViewerExportSettings } from './splat-serialize';

// one room's SOG content into a fresh memory filesystem, so the fixed 'scene.sog'
// name inside can be placed at any path in the zip
const sogTo = async (splats: Splat[], serializeSettings: SerializeSettings, iterations: number, zipFs: ZipFileSystem, path: string) => {
    const memFs = new MemoryFileSystem();
    await writeSplatFile(splats, serializeSettings, 'sog-bundle', 'scene.sog', { iterations }, memFs);
    for (const [filename, data] of memFs.results.entries()) {
        const writer = await zipFs.createWriter(filename === 'scene.sog' ? path : filename);
        await writer.write(data);
        await writer.close();
    }
};

const writeBytes = async (zipFs: ZipFileSystem, path: string, data: string | Uint8Array) => {
    const writer = await zipFs.createWriter(path);
    await writer.write(typeof data === 'string' ? new TextEncoder().encode(data) : data);
    await writer.close();
};

const exportExperience = async (
    events: Events,
    scene: Scene,
    serializeSettings: SerializeSettings,
    options: SceneExportOptions,
    fs: FileSystem
): Promise<void> => {
    const { viewerExportSettings, sogIterations } = options;
    const { experienceSettings } = viewerExportSettings as ViewerExportSettings;

    splatTransformLogger.setRenderer(createProgressRenderer('Exporting Experience', events));

    try {
        const splatsOfScene = scene.getElementsByType(ElementType.splat) as Splat[];
        const visibleSplats = splatsOfScene.filter(splat => splat.visible && splat.numSplats > 0);
        const layerInfos = events.invoke('experience.layers');
        const experience = events.invoke('experience.get');

        const { pages, media, warnings } = composeExperience(
            experience,
            layerInfos,
            // splat-transform's settings type is structurally the fork's for every field used
            experienceSettings as unknown as ForkSettings
        );
        for (const warning of warnings) {
            console.warn(warning);
        }

        const zipWriter = await fs.createWriter('output.zip');
        const zipFs = new ZipFileSystem(zipWriter);
        try {
            // the forked viewer's page and assets
            const [first] = pages;
            await writeBytes(zipFs, 'index.html', renderViewerHtml({
                bootstrap: { settingsUrl: 'settings.json', contentUrl: 'scene.sog', contentFilename: 'scene.sog' },
                backgroundColor: first.settings.background.color
            }));
            await writeBytes(zipFs, 'index.js', js);
            await writeBytes(zipFs, 'index.css', css);

            await writeBytes(zipFs, 'settings.json', JSON.stringify(first.settings));

            // the first page's content: its room's layer, or every visible layer without rooms
            const firstSplats = first.layer === null ? visibleSplats : visibleSplats.filter(splat => splat.uid === first.layer);
            await sogTo(firstSplats, serializeSettings, sogIterations ?? 10, zipFs, 'scene.sog');

            // every other room's folder
            for (const page of pages.slice(1)) {
                const roomSplats = visibleSplats.filter(splat => splat.uid === page.layer);
                await sogTo(roomSplats, serializeSettings, sogIterations ?? 10, zipFs, `${page.path}scene.sog`);
                await writeBytes(zipFs, `${page.path}settings.json`, JSON.stringify(page.settings));
            }

            // the picked video files
            for (const entry of media) {
                if (entry.screen.source?.kind === 'file') {
                    await writeBytes(zipFs, entry.path, new Uint8Array(await entry.screen.source.blob.arrayBuffer()));
                }
            }
        } finally {
            await zipFs.close();
        }
    } catch (err) {
        splatTransformLogger.unwindAll(true);
        throw err;
    }
};

export { exportExperience };

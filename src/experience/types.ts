// The experience store's types and defaults. Pure: Node runs this file unbundled in tests, so
// erasable TypeScript only (no enum, no parameter properties, no namespaces).

type Vec3T = [number, number, number];
type PoseT = { position: Vec3T; target: Vec3T; fov: number };
type LayerPose = { position: Vec3T; rotation: [number, number, number, number]; scale: Vec3T };
type ExperienceAnnotation = { id: string; layer: number; position: Vec3T; title: string; text: string; camera: PoseT; layerPose: LayerPose };
type ScreenSource = { kind: 'url'; url: string } | { kind: 'file'; name: string; blob: Blob };
type SoundSettings = { volume: number; refDistance: number; fadeDistance: number };
type ExperienceScreen = { id: string; layer: number; corners: [Vec3T, Vec3T, Vec3T, Vec3T]; source: ScreenSource | null; offset: number; loop: boolean; playDistance: number; sound: SoundSettings | null; layerPose: LayerPose };
type ExperienceDoor = { id: string; to: number; label: string; center: Vec3T; size: Vec3T; preloadRadius: number; arrival: { position: Vec3T; target: Vec3T } | null };
type ExperienceRoom = { layer: number; id: string; doors: ExperienceDoor[] };
type Experience = { annotations: ExperienceAnnotation[]; screens: ExperienceScreen[]; rooms: ExperienceRoom[]; firstRoom: number | null; nextId: number };
type LayerInfo = { uid: number; name: string; visible: boolean; pose: LayerPose };

// the viewer's own defaults (docs/api.md), so what the editor authors matches what it plays
const DEFAULT_SOUND: SoundSettings = { volume: 1, refDistance: 1, fadeDistance: 12 };
const SCREEN_DEFAULTS = { offset: 0.01, loop: true, playDistance: 20 };
const DOOR_DEFAULTS = { preloadRadius: 8, size: [1.4, 2.6, 1] as Vec3T, distance: 2 };

const emptyExperience = (): Experience => ({ annotations: [], screens: [], rooms: [], firstRoom: null, nextId: 1 });

export type {
    Experience,
    ExperienceAnnotation,
    ExperienceDoor,
    ExperienceRoom,
    ExperienceScreen,
    LayerInfo,
    LayerPose,
    PoseT,
    ScreenSource,
    SoundSettings,
    Vec3T
};
export { DEFAULT_SOUND, DOOR_DEFAULTS, SCREEN_DEFAULTS, emptyExperience };

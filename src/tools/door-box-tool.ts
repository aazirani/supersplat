// The door box gizmo: translate and scale the axis-aligned box a door occupies, writing the
// result back into the experience store as one undoable edit per drag.

import { Vec3 } from 'playcanvas';

import { BoxShape } from '../box-shape';
import { Events } from '../events';
import { Scene } from '../scene';
import { ShapeTransformGizmo } from './shape-transform-gizmo';

class DoorBoxTool {
    activate: () => void;
    deactivate: () => void;
    setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => boolean;
    getFocus: () => { position: Vec3, radius: number } | null;

    constructor(events: Events, scene: Scene) {
        const box = new BoxShape();

        const doorOf = (id: string) => {
            const experience = events.invoke('experience.get');
            for (const room of experience.rooms) {
                const door = room.doors.find(d => d.id === id);
                if (door) {
                    return door;
                }
            }
            return null;
        };

        let doorId: string = null;
        let active = false;

        // write the box's transform into the store as one edit
        const commit = () => {
            const door = doorOf(doorId);
            if (!door) {
                return;
            }
            const p = box.pivot.getPosition();
            const center: [number, number, number] = [p.x, p.y, p.z];
            const size: [number, number, number] = [box.lenX, box.lenY, box.lenZ];
            const id = doorId;
            events.fire('experience.edit', 'moveDoor', (experience) => {
                for (const room of experience.rooms) {
                    const d = room.doors.find(x => x.id === id);
                    if (d) {
                        d.center = center;
                        d.size = size;
                    }
                }
            });
        };

        // place the box from the store
        const syncFromStore = () => {
            const door = doorOf(doorId);
            if (!door) {
                return;
            }
            const [cx, cy, cz] = door.center;
            box.pivot.setPosition(cx, cy, cz);
            box.lenX = door.size[0];
            box.lenY = door.size[1];
            box.lenZ = door.size[2];
            box.moved();
        };

        events.on('experience.editDoor', (id: string) => {
            doorId = id;
            syncFromStore();
            events.fire('tool.doorBox');
        });

        const gizmo = new ShapeTransformGizmo(events, scene, {
            rotate: false,
            uniformScale: false,
            lowerBoundScale: new Vec3(0.05, 0.05, 0.05),
            onTransformStart: () => {
                // the drag itself is one experience.edit pushed by onTransformEnd
            },
            onTransform: (mode) => {
                if (mode === 'scale') {
                    // snapshot the live scale vector before the length setters mutate it
                    const { x, y, z } = box.pivot.getLocalScale();
                    box.lenX = x;
                    box.lenY = y;
                    box.lenZ = z;
                } else {
                    box.moved();
                }
            },
            onTransformEnd: () => {
                commit();
            },
            onModeChanged: () => {
                // the door box has no rotation mode to reflect in any ui
            }
        });

        this.setTransformMode = (mode) => {
            gizmo.toggleMode(mode);
            return true;
        };

        this.getFocus = () => {
            const bound = box.worldBound;
            return { position: bound.center.clone(), radius: bound.halfExtents.length() };
        };

        // undo/redo moves the door while the tool is active: follow the store
        events.on('experience.changed', () => {
            if (!active) {
                return;
            }
            const door = doorOf(doorId);
            if (!door) {
                events.fire('tool.deactivate');
                return;
            }
            const p = box.pivot.getPosition();
            if (p.x !== door.center[0] || p.y !== door.center[1] || p.z !== door.center[2] ||
                box.lenX !== door.size[0] || box.lenY !== door.size[1] || box.lenZ !== door.size[2]) {
                syncFromStore();
                gizmo.attach(box.pivot);
            }
        });

        this.activate = () => {
            active = true;
            syncFromStore();
            scene.add(box);
            if (gizmo.mode === 'none') {
                gizmo.setMode('translate');
            }
            gizmo.attach(box.pivot);
        };

        this.deactivate = () => {
            active = false;
            gizmo.detach();
            scene.remove(box);
        };
    }
}

export { DoorBoxTool };

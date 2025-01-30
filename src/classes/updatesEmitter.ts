import { EventEmitter } from "stream";

export class UpdatesEmitter extends EventEmitter {
    constructor() {
        super();
    }

    sendUpdate(text: string) {
        this.emit(UpdateEmitterEvents.UPDATE, text);
    }
}

export const UpdateEmitterEvents = Object.freeze({
    "UPDATE": "UPDATE"
} as const)
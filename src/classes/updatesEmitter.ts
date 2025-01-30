import { EventEmitter } from "stream";

export class UpdatesEmitter extends EventEmitter {
    #updates: string[] = [];
    constructor() {
        super();
    }

    get updates() {
        return this.#updates;
    }

    sendUpdate(text: string) {
        this.#updates.push(text);
        this.emit(UpdateEmitterEvents.UPDATE, text);
    }
}

export const UpdateEmitterEvents = Object.freeze({
    "UPDATE": "UPDATE"
} as const)
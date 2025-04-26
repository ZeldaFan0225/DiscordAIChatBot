import {
    APIBaseComponent,
    ComponentType,
    Interaction,
    Message
} from "discord.js";
import { BaseContextInitOptions } from "../types";
import { DiscordBotClient } from "./client";

export class BaseContext {
    interaction: Interaction
    client: DiscordBotClient
    constructor(options: BaseContextInitOptions) {
        this.interaction = options.interaction
        this.client = options.client
    }

    get isStaff() {
        return Array.isArray(this.interaction.member?.roles) ? this.interaction.member?.roles.some(r => this.client.config.staff_roles?.includes(r)) : this.interaction.member?.roles.cache.some(r => this.client.config.staff_roles?.includes(r.id))
    }

    static extractMessageText(message: Message): string {
        if(message.flags.has("IsComponentsV2")) {
            // Iterate through all components and extract the content field from all of them
            const queue: (APIBaseComponent<ComponentType>)[] = message.components
            let text = ""
            while(queue.length) {
                const comp = queue.shift()
                if(!comp) continue;
                if("content" in comp) {
                    text += comp.content
                }
                if("components" in comp && Array.isArray(comp.components)) {
                    queue.unshift(...(comp.components as APIBaseComponent<ComponentType>[]))
                }
            }
            return text;
        } else {
            let text = ""
            if(message.content) text += message.content + "\n"
            if(!message.content && message.attachments.size) {
                text += "[Attachments: " + message.attachments.map(a => a.name).join(", ") + "]\n"
            }
            if(message.embeds.length && message.author.bot) {
                for(const embed of message.embeds) {
                    if(embed.description) text += embed.description + "\n"
                    if(embed.title) text += embed.title + "\n"
                }
            }
            return text.trim()
        }
    }
}
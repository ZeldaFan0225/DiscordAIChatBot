import {
    Interaction,
} from "discord.js";
import {BaseContextInitOptions} from "../types";
import { DiscordBotClient } from "./client";

export class BaseContext{
    interaction: Interaction
    client: DiscordBotClient
    constructor(options: BaseContextInitOptions) {
        this.interaction = options.interaction
        this.client = options.client
    }

    get is_staff() {
        return Array.isArray(this.interaction.member?.roles) ? this.interaction.member?.roles.some(r => this.client.config.staff_roles?.includes(r)) : this.interaction.member?.roles.cache.some(r => this.client.config.staff_roles?.includes(r.id))
    }
}
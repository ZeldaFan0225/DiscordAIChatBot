import { ChatInputCommandInteraction, Colors, ContainerBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { CommandContextInitOptions } from "../types";
import { BaseContext } from "./baseContext";

export class CommandContext extends BaseContext {
    override interaction: ChatInputCommandInteraction
    constructor(options: CommandContextInitOptions) {
        super(options)
        this.interaction = options.interaction
    }

    async error(options: { error?: string, ephemeral?: boolean, codeblock?: boolean, componentsV2?: boolean }) {
        const err_string = options.error ?? "Unknown Error"

        if (options.componentsV2) {
            const container = new ContainerBuilder({
                components: [
                    {
                        type: 10,
                        content: `❌ **Error** | ${(options.codeblock ?? true) ? `\`${err_string}\`` : err_string}`,
                    }
                ],
                accent_color: Colors.Red,
            })
            if (this.interaction.deferred) return await this.interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 })
            else if (this.interaction.replied) return await this.interaction.editReply({ components: [container] })
            else return await this.interaction.reply({ components: [container], flags: (options.ephemeral ? MessageFlags.Ephemeral : 0) | MessageFlags.IsComponentsV2 })
        } else {
            const embed = new EmbedBuilder({
                color: Colors.Red,
                description: `❌ **Error** | ${(options.codeblock ?? true) ? `\`${err_string}\`` : err_string}`
            })
            if (this.interaction.replied || this.interaction.deferred) return await this.interaction.editReply({ embeds: [embed], content: null })
            else return await this.interaction.reply({ embeds: [embed], flags: options.ephemeral ? MessageFlags.Ephemeral : undefined })
        }
    }
}
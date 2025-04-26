import {
    AnySelectMenuInteraction,
    ButtonInteraction,
    ChannelSelectMenuInteraction,
    Colors,
    ComponentType,
    ContainerBuilder,
    EmbedBuilder,
    MentionableSelectMenuInteraction,
    MessageComponentType,
    MessageFlags,
    RoleSelectMenuInteraction,
    StringSelectMenuInteraction,
    UserSelectMenuInteraction
} from "discord.js";
import { BaseContext } from "./baseContext";
import {ButtonContextInitOptions, SelectMenuContextInitOptions} from "../types";

export class ComponentContext<T extends MessageComponentType> extends BaseContext {
    override interaction:   T extends ComponentType.Button ? ButtonInteraction
                            : T extends ComponentType.ChannelSelect ? ChannelSelectMenuInteraction
                            : T extends ComponentType.MentionableSelect ? MentionableSelectMenuInteraction
                            : T extends ComponentType.RoleSelect ? RoleSelectMenuInteraction
                            : T extends ComponentType.StringSelect ? StringSelectMenuInteraction
                            : T extends ComponentType.UserSelect ? UserSelectMenuInteraction : AnySelectMenuInteraction
    constructor(options: T extends ComponentType.Button ? ButtonContextInitOptions : SelectMenuContextInitOptions) {
        super(options)
        this.interaction = options.interaction as (
            T extends ComponentType.Button ? ButtonInteraction
            : T extends ComponentType.ChannelSelect ? ChannelSelectMenuInteraction
            : T extends ComponentType.MentionableSelect ? MentionableSelectMenuInteraction
            : T extends ComponentType.RoleSelect ? RoleSelectMenuInteraction
            : T extends ComponentType.StringSelect ? StringSelectMenuInteraction
            : T extends ComponentType.UserSelect ? UserSelectMenuInteraction : AnySelectMenuInteraction
        )
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
            // The typing here is currently broken, so we need to ignore it
            // @ts-ignore
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
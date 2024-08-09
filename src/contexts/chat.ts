import { ApplicationCommandType } from "discord.js";
import { Context } from "../classes/context";
import { ContextContext } from "../classes/contextContext";
import { ContextMenuCommandBuilder } from "@discordjs/builders";

const command_data = new ContextMenuCommandBuilder()
    .setType(ApplicationCommandType.Message)
    .setName("Chat")
    .setContexts(0, 1, 2)
    .setIntegrationTypes(0, 1)

export default class extends Context {
    constructor() {
        super({
            name: "Chat",
            command_data: command_data.toJSON(),
            staff_only: false,
        })
    }

    override async run(ctx: ContextContext<ApplicationCommandType.Message>): Promise<any> {
        if(ctx.interaction.targetMessage.author.id !== ctx.interaction.applicationId)
            return await ctx.error({error: "Can only be used on messages sent by me."})
        if(ctx.interaction.targetMessage.interaction?.commandName.toLocaleLowerCase() !== "chat")
            return await ctx.error({error: "Can only be used on chat messages."})

        const modal = {
            title: `Respond to ${ctx.client.user?.displayName}`,
            custom_id: `chat_${ctx.interaction.targetMessage.id}`,
            components: [{
                type: 1,
                components: [{
                    type: 4,
                    style: 2,
                    placeholder: "Your response",
                    required: true,
                    custom_id: "response",
                    label: "Response",
                }]
            }]
        }

        await ctx.interaction.showModal(modal)
    }
}
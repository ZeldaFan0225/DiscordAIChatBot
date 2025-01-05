import { ApplicationCommandType, ContextMenuCommandBuilder } from "discord.js";
import { Context } from "../classes/context";
import { ContextContext } from "../classes/contextContext";

const command_data = new ContextMenuCommandBuilder()
    .setType(ApplicationCommandType.Message)
    .setName("Ask")
    .setContexts(0, 1, 2)
    .setIntegrationTypes(0, 1)

export default class extends Context {
    constructor() {
        super({
            name: "Ask",
            command_data: command_data.toJSON(),
            staff_only: false,
        })
    }

    override async run(ctx: ContextContext<ApplicationCommandType.Message>): Promise<any> {
        ctx.client.cache.set(`ask_${ctx.interaction.targetMessage.id}`, ctx.interaction.targetMessage, 1000 * 60 * 60)

        const modal = {
            title: `Ask about ${ctx.interaction.targetMessage.author.username.slice(0,24)}'s message`,
            custom_id: `ask_${ctx.interaction.targetMessage.id}`,
            components: [{
                type: 1,
                components: [{
                    type: 4,
                    style: 2,
                    placeholder: "Your question",
                    required: true,
                    custom_id: "question",
                    label: "Question",
                }]
            }]
        }

        await ctx.interaction.showModal(modal)
    }
}
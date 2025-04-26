import { ApplicationCommandType, AttachmentBuilder, ContextMenuCommandBuilder, MessageFlags } from "discord.js";
import { Context } from "../classes/context";
import { ContextContext } from "../classes/contextContext";
import { ChatMessageData, HeyMessageData } from "../types";

const command_data = new ContextMenuCommandBuilder()
    .setType(ApplicationCommandType.Message)
    .setName("Export Chat")
    .setContexts(0, 1, 2)
    .setIntegrationTypes(0, 1)

export default class extends Context {
    constructor() {
        super({
            name: "Export Chat",
            command_data: command_data.toJSON(),
            staff_only: false,
        })
    }

    override async run(ctx: ContextContext<ApplicationCommandType.Message>): Promise<any> {
        const id = ctx.interaction.targetId;
        let history: (ChatMessageData | HeyMessageData)[] = [];

        let type = "unknown";
        if(await ctx.client.hasChatMessage(id!)) {
            history = await ctx.client.getChatHistory(id!);
            type = "chat";
        } else if(await ctx.client.hasHeyMessage(id!)) {
            history = await ctx.client.getHeyHistory(id!);
            type = "hey";
        }
        if (!history.length) return await ctx.error({ error: "No chat message found" });

        history = history.reverse();

        let content = "";
        const dividor = "=".repeat(25);
        const dividorUser = "=".repeat(20);
        const dividorAssistant = "=".repeat(15);
        for(const message of history) {
            content += `user ${dividorUser}\n${message.user_content}\n${dividor}\n\nassistant ${dividorAssistant}\n${message.assistant_content}\n${dividor}\n\n`;
        }

        const attachment = new AttachmentBuilder(Buffer.from(content.trim()), { name: `${id}.json` });

        await ctx.interaction.reply({ content: `Here is the ${type} history`, files: [attachment], flags: MessageFlags.Ephemeral });
    }
}
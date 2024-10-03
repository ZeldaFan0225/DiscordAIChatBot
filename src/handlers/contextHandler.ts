import { ApplicationCommandType, MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { ContextContext } from "../classes/contextContext";

export async function handleContexts(interaction: UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction, client: DiscordBotClient) {
    const command = await client.contexts.getContext(interaction).catch(() => null)
    if(!command) return;

    let context
    if(interaction.commandType === ApplicationCommandType.User) context = new ContextContext<ApplicationCommandType.User>({interaction, client})
    else context = new ContextContext<ApplicationCommandType.Message>({interaction, client})

    if(client.config.user_blacklist?.includes(interaction.user.id))
        return await context.error({
            error: "You are blacklisted from using this bot"
        });
    if(!interaction.channel)
        return await context.error({
            error: "Please add me to the private thread (by mentioning me) to use commands",
            ephemeral: true
        })
    if(command.staff_only && !context.is_staff)
        return await context.error({
            error: "You are not staff"
        })

    return await command.run(context).catch(console.error)
}
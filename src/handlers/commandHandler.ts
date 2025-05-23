import { ChatInputCommandInteraction } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { CommandContext } from "../classes/commandContext";

export async function handleCommands(interaction: ChatInputCommandInteraction, client: DiscordBotClient) {
    const command = await client.commands.getCommand(interaction).catch(() => null)
    if(!command) return;
    const context = new CommandContext({interaction, client})
    if(client.config.user_blacklist?.includes(interaction.user.id))
        return await context.error({
            error: "You are blacklisted from using this bot"
        });
    //console.log(interaction)
    /*if(!interaction.channel)
        return await context.error({
            error: "Please add me to the private thread (by mentioning me) to use commands",
            ephemeral: true
        })*/
    if(command.staff_only && !context.isStaff)
        return await context.error({
            error: "You are not staff"
        })
    return await command.run(context).catch(console.error)
}
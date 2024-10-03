import { AutocompleteInteraction } from "discord.js";
import { AutocompleteContext } from "../classes/autocompleteContext";
import { DiscordBotClient } from "../classes/client";

export async function handleAutocomplete(interaction: AutocompleteInteraction, client: DiscordBotClient) {
    const command = await client.commands.getCommand(interaction).catch(() => null)
    if(!command) return;
    const context = new AutocompleteContext({interaction, client})
    if(client.config.user_blacklist?.includes(interaction.user.id))
        return await context.error();
    // the following, commented out lines broke functionality when using the bot as a user app in a channel the bot can't see
    //if(!interaction.channel)
    //    return await context.error()
    if(command.staff_only && !context.is_staff)
        return await context.error()
    return await command.autocomplete(context).catch(console.error)
}
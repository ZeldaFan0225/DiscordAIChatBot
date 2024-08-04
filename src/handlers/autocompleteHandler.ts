import { AutocompleteInteraction } from "discord.js";
import { AutocompleteContext } from "../classes/autocompleteContext";
import { DiscordBotClient } from "../classes/client";

export async function handleAutocomplete(interaction: AutocompleteInteraction, client: DiscordBotClient) {
    const command = await client.commands.getCommand(interaction).catch(() => null)
    if(!command) return;
    const context = new AutocompleteContext({interaction, client})
    if(!interaction.inGuild())
        return await context.error()
    if(!interaction.channel)
        return await context.error()
    if(command.staff_only && !context.is_staff)
        return await context.error()
    return await command.autocomplete(context).catch(console.error)
}
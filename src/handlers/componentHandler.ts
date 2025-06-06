import { ButtonInteraction, ComponentType, AnySelectMenuInteraction } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { ComponentContext } from "../classes/componentContext";

export async function handleComponents(interaction: ButtonInteraction | AnySelectMenuInteraction, client: DiscordBotClient) {
    const command = await client.components.getComponent(interaction).catch(() => null)
    if(!command) return;
    let context


    if(interaction.componentType === ComponentType.Button) context = new ComponentContext<ComponentType.Button>({interaction, client})
    else {
        switch(interaction.componentType) {
            case ComponentType.StringSelect: context = new ComponentContext<ComponentType.StringSelect>({interaction, client}); break;
            case ComponentType.ChannelSelect: context = new ComponentContext<ComponentType.ChannelSelect>({interaction, client}); break;
            case ComponentType.MentionableSelect: context = new ComponentContext<ComponentType.MentionableSelect>({interaction, client}); break;
            case ComponentType.RoleSelect: context = new ComponentContext<ComponentType.RoleSelect>({interaction, client}); break;
            case ComponentType.UserSelect: context = new ComponentContext<ComponentType.UserSelect>({interaction, client}); break;
        }
    }

    if(client.config.user_blacklist?.includes(interaction.user.id))
        return await context.error({
            error: "You are blacklisted from using this bot"
        });
    if(command.staff_only && !context?.isStaff)
    return await context.error({
        error: "You are not staff"
    })

    return await command.run(context).catch(console.error)
}
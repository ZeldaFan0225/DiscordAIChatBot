import { ModalSubmitInteraction } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { ModalContext } from "../classes/modalContext";

export async function handleModals(interaction: ModalSubmitInteraction, client: DiscordBotClient) {
    const command = await client.modals.getModal(interaction).catch(() => null)
    if(!command) return;
    let context = new ModalContext({interaction, client})

    if(command.staff_only && !context.is_staff)
        return await context.error({
            error: "You are not staff"
        })

    return await command.run(context).catch(console.error)
}
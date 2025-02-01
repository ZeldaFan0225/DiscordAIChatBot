import { Message } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { handleHey } from "./hey";

export default async function handleMessage(message: Message, client: DiscordBotClient) {
    if (message.author.bot) return;
    if (client.config.user_blacklist?.includes(message.author.id)) return;
    if (client.config.hey.ignoreNonMentionReplies && !message.mentions.users.has(client.user!.id)) return;
    if (client.config.hey.enabled) await handleHey(message, client);
}
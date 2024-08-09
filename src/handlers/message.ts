import { Message } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { handleHey } from "./hey";

export default async function handleMessage(message: Message, client: DiscordBotClient) {
    console.log("Message received: ", message.content);
    if (message.author.bot) return;
    if (client.config.hey.enabled) await handleHey(message, client);
}
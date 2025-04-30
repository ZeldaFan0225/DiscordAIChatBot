import { Message, MessageFlags, TextDisplayBuilder } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { ChatMessage } from "../classes/connectors/BaseConnector";
import { UpdateEmitterEvents, UpdatesEmitter } from "../classes/updatesEmitter";
import { HeyMessageData } from "../types";
import { BaseContext } from "../classes/baseContext";

export async function handleHey(message: Message, client: DiscordBotClient) {
    const { triggerName, history } = await getHeyData(client, message);
    if (!triggerName) return;
    const triggerData = client.config.hey.triggers[triggerName];
    if (!triggerData) return;
    if (
        client.config.hey.ignoreNonMentionReplies &&
        message.mentions.repliedUser?.id === client.user!.id &&
        !message.mentions.users.has(client.user!.id)
    ) return;

    let content = message.content.slice(message.content.toLowerCase().startsWith(triggerName) ? triggerName.length : 0).trim();
    if (!content) return;
    if (triggerData.allowNonHistoryReplyContext && !history.length) {
        const contextContent = await message.fetchReference().then(m => BaseContext.extractMessageText(m)).catch(() => null);
        content = `Context message:\n${contextContent}\n\nUser Prompt:\n${content}`;
    }
    let responseMessage = await message.reply({
        components: [new TextDisplayBuilder({ content: `⌛ Processing...` })],
        flags: MessageFlags.IsComponentsV2
    })
    await message.react(triggerData.processingEmoji || "⌛");

    const modelConfig = client.config.modelConfigurations[triggerData.model];
    if (!modelConfig) {
        await responseMessage.delete();
        console.error(`Invalid model ${triggerData.model}`);
        return;
    }

    const connector = client.connectorInstances[modelConfig.connector];
    if (!connector) {
        if (!message.channel.isDMBased()) await message.reactions.removeAll();
        await responseMessage.delete();
        console.error(`Invalid connector ${modelConfig.connector}`);
        return;
    }

    const systemInstruction = client.config.systemInstructions[triggerData.systemInstruction || modelConfig.defaultSystemInstructionName || "default"];
    if (!systemInstruction) {
        if (!message.channel.isDMBased()) await message.reactions.removeAll();
        await responseMessage.delete();
        console.error(`Invalid system instruction ${triggerData.systemInstruction || modelConfig.defaultSystemInstructionName}`);
        return;
    }

    const messages: ChatMessage[] = []

    if (systemInstruction && modelConfig.systemInstructionAllowed !== false) {
        messages.unshift({ role: "system", content: systemInstruction });
    }

    for (const message of history.slice(-1 * (triggerData.previousMessagesContext || 0))) {
        messages.push({
            role: "user",
            content: message.user_content
        }, {
            role: "assistant",
            content: message.assistant_content
        })
    }

    messages.push({
        role: "user",
        content,
        attachments: modelConfig.images.supported ? message.attachments.filter(a => a.contentType?.includes("image")).map(i => i.url) : []
    });

    const updatesEmitter = new UpdatesEmitter();
    updatesEmitter.on(UpdateEmitterEvents.UPDATE, async (text) => {
        responseMessage.edit({
            components: [new TextDisplayBuilder({ content: `⌛ ${text}` })],
            flags: MessageFlags.IsComponentsV2
        });
    });

    const completion = await connector.requestChatCompletion(
        messages,
        modelConfig.generationOptions,
        {
            userId: message.author.id,
            updatesEmitter
        }
    ).catch(console.error);

    updatesEmitter.removeAllListeners(UpdateEmitterEvents.UPDATE);

    if (!completion) {
        if (!message.channel.isDMBased()) await message.reactions.removeAll();
        await responseMessage?.delete();
        console.error("Failed to get completion");
        return;
    }

    if (!message.channel.isDMBased()) await message.reactions.removeAll();

    const { components, attachments } = await DiscordBotClient.constructMessage(completion);

    await responseMessage.edit({ components, files: attachments, flags: MessageFlags.IsComponentsV2, allowedMentions: { repliedUser: false } }).catch(console.error);

    await client.saveHeyCompletion(content, completion.resultMessage.content, triggerName, responseMessage.id, message.author.id, history.at(-1)?.message_id);
}

async function getHeyData(client: DiscordBotClient, message: Message) {
    if (message.flags.has("SuppressNotifications")) return { triggerName: undefined, history: [] };
    let history: HeyMessageData[] = []
    let triggerName;
    if (message.reference?.messageId) {
        const hasHistory = await client.hasHeyMessage(message.reference.messageId);
        if (hasHistory) {
            history = (await client.getHeyHistory(message.reference.messageId)).reverse();
        }
        triggerName = history.at(-1)?.trigger_name
    }
    if (!triggerName) {
        triggerName = Object.keys(client.config.hey.triggers).find(t => message.content.toLowerCase().startsWith(t));
    }

    return {
        triggerName,
        history
    }
}
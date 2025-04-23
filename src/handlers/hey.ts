import { AttachmentBuilder, Message } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { ChatMessage } from "../classes/connectors/BaseConnector";
import { UpdateEmitterEvents, UpdatesEmitter } from "../classes/updatesEmitter";
import { HeyMessageData } from "../types";

export async function handleHey(message: Message, client: DiscordBotClient) {
    const {triggerName, history} = await getHeyData(client, message);
    if(!triggerName) return;
    const triggerData = client.config.hey.triggers[triggerName];
    if(!triggerData) return;
    if (
        client.config.hey.ignoreNonMentionReplies &&
        message.mentions.repliedUser?.id === client.user!.id &&
        !message.mentions.users.has(client.user!.id)
    ) return;

    let content = message.content.slice(message.content.toLowerCase().startsWith(triggerName) ? triggerName.length : 0).trim();
    if(!content) return;
    if(triggerData.allowNonHistoryReplyContext && !history.length) {
        const contextContent = await message.fetchReference().then(m => m.content).catch(() => null);
        content = `Context message:\n${contextContent}\n\nUser Prompt:\n${content}`;
    }
    console.log(content)
    let responseMessage = await message.reply("⌛ ...")
    await message.react(triggerData.processingEmoji || "⌛");

    const modelConfig = client.config.modelConfigurations[triggerData.model];
    if(!modelConfig) {
        await responseMessage.delete();
        console.error(`Invalid model ${triggerData.model}`);
        return;
    }

    const connector = client.connectorInstances[modelConfig.connector];
    if(!connector) {
        if(!message.channel.isDMBased()) await message.reactions.removeAll();
        await responseMessage.delete();
        console.error(`Invalid connector ${modelConfig.connector}`);
        return;
    }

    const systemInstruction = client.config.systemInstructions[triggerData.systemInstruction || modelConfig.defaultSystemInstructionName || "default"];
    if(!systemInstruction) {
        if(!message.channel.isDMBased()) await message.reactions.removeAll();
        await responseMessage.delete();
        console.error(`Invalid system instruction ${triggerData.systemInstruction || modelConfig.defaultSystemInstructionName}`);
        return;
    }

    const messages: ChatMessage[] = []

    if(systemInstruction && modelConfig.systemInstructionAllowed !== false) {
        messages.unshift({role: "system", content: systemInstruction});
    }

    for(const message of history.slice(-1 * (triggerData.previousMessagesContext || 0))) {
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
        responseMessage.edit({content: `⌛ ${text}`});
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

    if(!completion) {
        if(!message.channel.isDMBased()) await message.reactions.removeAll();
        await responseMessage?.delete();
        console.error("Failed to get completion");
        return;
    }

    if(!message.channel.isDMBased()) await message.reactions.removeAll();

    let completedMessage = completion.resultMessage.content;

    const files = await Promise.allSettled(
        (completion.resultMessage.attachments || [])
            .map((a, i) => DiscordBotClient.convertToAttachmentBuilder(a, `attachment-${i}`))
    ).then(res => res.filter(r => r.status === "fulfilled").map(r => r.value));

    if(completion.resultMessage.audio_data_string) {
        const [contentType, data] = completion.resultMessage.audio_data_string.slice(5).split(";base64,");
        if(contentType && data)  {
            const attachment = new AttachmentBuilder(Buffer.from(data, "base64"), {name: `response.${contentType.split("/")[1]}`});
            files.unshift(attachment)
        }
    }

    let payload;
    if(completedMessage.length > 2000) {
        const attachment = new AttachmentBuilder(Buffer.from(completion.resultMessage.content), {name: "response.txt"});
        files.push(attachment);
        payload = {
            files,
            allowedMentions: {repliedUser: false},
            content: null
        }
    } else {
        payload = {
            content: completedMessage,
            files,
            allowedMentions: {repliedUser: false}
        }
    }

    await responseMessage.edit(payload);

    await saveHeyCompletion(content, completion.resultMessage.content, triggerName, responseMessage.id, message.author.id, history.at(-1)?.message_id);
}

async function getHeyData(client: DiscordBotClient, message: Message) {
    if(message.flags.has("SuppressNotifications")) return {triggerName: undefined, history: []};
    let history: HeyMessageData[] = []
    let triggerName;
    if(message.reference?.messageId) {
        const hasHistory = await hasHeyMessage(message.reference.messageId);
        if(hasHistory) {
            history = (await getHeyHistory(message.reference.messageId)).reverse();
        }
        triggerName = history.at(-1)?.trigger_name
    }
    if(!triggerName) {
        triggerName = Object.keys(client.config.hey.triggers).find(t => message.content.toLowerCase().startsWith(t));
    }

    return {
        triggerName,
        history
    }
}

export async function saveHeyCompletion(userContent: string, assistantResponse: string, triggerName: string, responseMessageId: string, userId: string, parentMessageId?: string) {
    await DiscordBotClient.db.query(
        "INSERT INTO hey_messages (message_id, user_content, assistant_content, trigger_name, user_id, parent_message_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [responseMessageId, userContent, assistantResponse, triggerName, userId, parentMessageId || null]
    ).catch(console.error);
}

export async function hasHeyMessage(messageId: string) {
    const {rows} = await DiscordBotClient.db.query("SELECT * FROM hey_messages WHERE message_id = $1", [messageId]);
    return rows.length > 0;
}

export async function getHeyHistory(messageId: string) {
    const {rows} = await DiscordBotClient.db.query<HeyMessageData>(
`WITH RECURSIVE message_hierarchy AS (
    SELECT
        index,
        message_id,
        trigger_name,
        user_content,
        assistant_content,
        user_id,
        parent_message_id
    FROM
        hey_messages
    WHERE
        message_id = $1

    UNION ALL

    SELECT
        m.index,
        m.message_id,
        m.trigger_name,
        m.user_content,
        m.assistant_content,
        m.user_id,
        m.parent_message_id
    FROM
        hey_messages m
        INNER JOIN message_hierarchy mh ON m.message_id = mh.parent_message_id
)

SELECT
    *
FROM
    message_hierarchy;`,
        [messageId]
    );
    return rows;
}
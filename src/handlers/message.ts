import { AttachmentBuilder, Message } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { ChatMessage } from "../classes/connectors/BaseConnector";
import { MessageData } from "../types";

export default async function handleMessage(message: Message, client: DiscordBotClient) {
    if(message.author.bot) return;
    if(client.config.hey.enabled) await handleHey(message, client);
}

async function handleHey(message: Message, client: DiscordBotClient) {
    const {triggerName, history} = await getHeyData(client, message);
    if(!triggerName) return;
    const triggerData = client.config.hey.triggers[triggerName];
    if(!triggerData) return;

    const content = message.content.slice(message.content.toLowerCase().startsWith(triggerName) ? triggerName.length : 0).trim();
    if(!content) return;
    await message.react(triggerData.processingEmoji || "⌛");

    const modelConfig = client.config.modelConfigurations[triggerData.model];
    if(!modelConfig) {
        await message.reactions.removeAll();
        console.error(`Invalid model ${triggerData.model}`);
        return;
    }

    const connector = client.connectorInstances[modelConfig.connector];
    if(!connector) {
        await message.reactions.removeAll();
        console.error(`Invalid connector ${modelConfig.connector}`);
        return;
    }

    const systemInstruction = client.config.systemInstructions[triggerData.systemInstruction || modelConfig.defaultSystemInstructionName];
    if(!systemInstruction) {
        await message.reactions.removeAll();
        console.error(`Invalid system instruction ${triggerData.systemInstruction || modelConfig.defaultSystemInstructionName}`);
        return;
    }

    const messages: ChatMessage[] = [
        {role: "system", content: systemInstruction}
    ]

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
        attachments: message.attachments.filter(a => a.contentType?.includes("image")).map(i => i.url)
    });

    console.log(...messages)

    const completion = await connector.requestChatCompletion(messages, modelConfig.generationOptions).catch(console.error);
    if(!completion) {
        await message.reactions.removeAll();
        console.error("Failed to get completion");
        return;
    }
    console.info("Completion: ", completion);

    await message.reactions.removeAll();

    let completedMessage = completion.resultMessage.content;
    let responseMessage;

    if(completedMessage.length > 2000) {
        const attachment = new AttachmentBuilder(Buffer.from(completion.resultMessage.content), {name: "response.txt"});
        responseMessage = await message.reply({
            files: [attachment],
            allowedMentions: {repliedUser: false}
        });
    } else {
        responseMessage = await message.reply({
            content: completedMessage,
            allowedMentions: {repliedUser: false}
        });
    }

    await saveCompletion(content, completion.resultMessage.content, triggerName, responseMessage.id, message.author.id, history.at(-1)?.message_id);
}

async function getHeyData(client: DiscordBotClient, message: Message) {
    if(message.flags.has("SuppressNotifications")) return {triggerName: undefined, history: []};
    let history: MessageData[] = []
    let triggerName;
    if(message.reference?.messageId) {
        const hasHistory = await hasMessage(message.reference.messageId);
        if(hasHistory) {
            history = (await getHistory(message.reference.messageId)).reverse();
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

async function saveCompletion(userContent: string, assistantResponse: string, triggerName: string, responseMessageId: string, userId: string, parentMessageId?: string) {
    await DiscordBotClient.db.query(
        "INSERT INTO messages (message_id, user_content, assistant_content, trigger_name, user_id, parent_message_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [responseMessageId, userContent, assistantResponse, triggerName, userId, parentMessageId || null]
    ).catch(console.error);
}

async function hasMessage(messageId: string) {
    const {rows} = await DiscordBotClient.db.query("SELECT * FROM messages WHERE message_id = $1", [messageId]);
    return rows.length > 0;
}

async function getHistory(messageId: string) {
    const {rows} = await DiscordBotClient.db.query<MessageData>(
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
        messages
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
        messages m
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
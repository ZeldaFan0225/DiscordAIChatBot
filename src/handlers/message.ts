import { Message } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { ChatMessage } from "../classes/connectors/BaseConnector";
import { ModelConfiguration } from "../classes/configLoader";

export default async function handleMessage(message: Message, client: DiscordBotClient) {
    if(message.author.bot) return;
    if(client.config.hey.enabled) await handleHey(message, client);
}

async function handleHey(message: Message, client: DiscordBotClient) {
    const trigger = client.config.hey.triggers.find(t => message.content.toLowerCase().startsWith(t.trigger));
    if(!trigger) return;
    console.info(`Trigger found: `, trigger);
    const content = message.content.slice(trigger.trigger.length).trim();
    if(!content) return;
    await message.react(trigger.processingEmoji || "⌛");

    const modelConfig = client.config.modelConfigurations[trigger.model];
    if(!modelConfig) {
        await message.reactions.removeAll();
        console.error(`Invalid model ${trigger.model}`);
        return;
    }

    const connector = client.connectorInstances[modelConfig.connector];
    if(!connector) {
        await message.reactions.removeAll();
        console.error(`Invalid connector ${modelConfig.connector}`);
        return;
    }

    const systemInstruction = client.config.systemInstructions[trigger.systemInstruction || modelConfig.defaultSystemInstructionName];
    if(!systemInstruction) {
        await message.reactions.removeAll();
        console.error(`Invalid system instruction ${trigger.systemInstruction || modelConfig.defaultSystemInstructionName}`);
        return;
    }

    const messages: ChatMessage[] = [
        {role: "system", content: systemInstruction}
    ]

    if(trigger.previousMessagesContext && trigger.previousMessagesContext > 0) {
        const previousMessages = await fetchPreviousMessages(message, trigger.previousMessagesContext, modelConfig);
        messages.push(...previousMessages);
    }

    messages.push({
        role: "user",
        content: content,
        attachments: message.attachments.filter(a => a.contentType?.includes("image")).map(i => i.url)
    });

    const completion = await connector.requestChatCompletion(messages, modelConfig.generationOptions);
    console.info("Completion: ", completion);

    await message.reactions.removeAll();

    let completedMessage = completion.content;

    do {
        await message.reply({
            content: completedMessage.slice(0, 2000),
            allowedMentions: {repliedUser: false}
        });
        completedMessage = completedMessage.slice(2000);
    } while(completedMessage.length > 2000)
}

async function fetchPreviousMessages(message: Message, depth: number, model_configuration: ModelConfiguration): Promise<ChatMessage[]> {
    if(depth <= 0) return []
    if(!message.reference) return []
    const referencedAssistantMessage = await message.fetchReference().catch(console.error)
    if(!referencedAssistantMessage) return []
    if(referencedAssistantMessage.author.id !== message.client.user?.id) return []
    const referencedUserMessage = await referencedAssistantMessage.fetchReference().catch(console.error)
    if(!referencedUserMessage) return []

    const images = referencedUserMessage.attachments.filter(a => a.contentType?.includes("image"))
    return [
        ...(await fetchPreviousMessages(referencedUserMessage, depth - 1, model_configuration)),
        {
            role: "user",
            content: referencedUserMessage.content,
            attachments: images.map(i => i.url)
        }, {
            role: "assistant",
            content: referencedAssistantMessage.content
        }
    ]
}
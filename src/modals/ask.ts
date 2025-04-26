import { Message, MessageFlags, TextDisplayBuilder } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { ChatMessage } from "../classes/connectors/BaseConnector";
import { Modal } from "../classes/modal";
import { ModalContext } from "../classes/modalContext";
import { UpdateEmitterEvents, UpdatesEmitter } from "../classes/updatesEmitter";

export default class extends Modal {
    constructor() {
        super({
            name: "ask",
            staff_only: false,
            regex: /ask_\d+/
        })
    }

    override async run(ctx: ModalContext): Promise<any> {
        const [, id] = ctx.interaction.customId.split("_");
        const message = ctx.interaction.fields.getTextInputValue("question");

        const targetMessage = ctx.client.cache.get(`ask_${id}`) as Message;
        if (!targetMessage) return await ctx.error({ error: "Invalid message", componentsV2: true });
        ctx.client.cache.delete(`ask_${id}`);

        const targetMessageContent = this.getMessageContent(targetMessage).trim();
        if (!targetMessageContent) return await ctx.error({ error: "Message is empty", componentsV2: true });

        const template = ctx.client.config.ask?.initialPromptTemplate || "Take the following message:\n\n{{TARGET_MESSAGE_CONTENT}}\n\nWhat I need you to do:\n{{USER_PROMPT}}";
        const prompt = template.replaceAll("{{TARGET_MESSAGE_CONTENT}}", targetMessageContent).replaceAll("{{USER_PROMPT}}", message)

        const modelName = ctx.client.config.ask?.model || "default";
        const modelConfig = ctx.client.config.modelConfigurations[modelName];
        if (!modelConfig) return await ctx.error({ error: "Invalid model", componentsV2: true });
        const systemInstructionName = ctx.client.config.ask?.systemInstruction || modelConfig!.defaultSystemInstructionName;

        if (!modelConfig) return await ctx.error({ error: "Invalid model", componentsV2: true });

        const connector = ctx.client.connectorInstances[modelConfig.connector];
        if (!connector) return await ctx.error({ error: "Invalid connector", componentsV2: true });
        const systemInstruction = ctx.client.config.systemInstructions[systemInstructionName || modelConfig.defaultSystemInstructionName || "default"];

        await ctx.interaction.deferReply();

        const messages: ChatMessage[] = []

        if (systemInstruction && modelConfig.systemInstructionAllowed !== false) {
            messages.unshift({ role: "system", content: systemInstruction });
        }

        messages.push({
            role: "user",
            content: prompt
        });

        const updatesEmitter = new UpdatesEmitter();
        updatesEmitter.on(UpdateEmitterEvents.UPDATE, (text) => {
            //@ts-ignore This typing is broken, but we need to ignore it for now
            ctx.interaction.editReply({ components: [new TextDisplayBuilder({ content: `⌛ ${text}` })], flags: MessageFlags.IsComponentsV2 });
        });

        const completion = await connector.requestChatCompletion(
            messages,
            modelConfig.generationOptions,
            {
                userId: ctx.interaction.user.id,
                updatesEmitter
            }
        ).catch(console.error);

        updatesEmitter.removeAllListeners(UpdateEmitterEvents.UPDATE);

        if (!completion) return await ctx.error({ error: "Failed to get completion", componentsV2: true });

        const { components, attachments } = await DiscordBotClient.constructMessage(completion);

        // @ts-ignore This typing is currently broken, but we need to ignore it for now
        const result = await ctx.interaction.editReply({ components, files: attachments, flags: MessageFlags.IsComponentsV2 })

        ctx.client.saveChatCompletion(prompt, completion.resultMessage.content, modelName, systemInstructionName || modelConfig.defaultSystemInstructionName || "default", result.id, ctx.interaction.user.id);
    }

    getMessageContent(message: Message) {
        const content = message.content;
        const embedContent = message.embeds.map(embed => {
            return `${embed.title}\n${embed.description}\n${embed.fields.map(field => `${field.name}\n${field.value}`).join("\n")}`
        }).join("\n");

        return `${content}\n${embedContent}`;
    }
}
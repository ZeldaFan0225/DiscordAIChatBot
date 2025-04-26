import { MessageFlags, TextDisplayBuilder } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { ChatMessage } from "../classes/connectors/BaseConnector";
import { Modal } from "../classes/modal";
import { ModalContext } from "../classes/modalContext";
import { UpdateEmitterEvents, UpdatesEmitter } from "../classes/updatesEmitter";


export default class extends Modal {
    constructor() {
        super({
            name: "chat",
            staff_only: false,
            regex: /chat_\d+/
        })
    }

    override async run(ctx: ModalContext): Promise<any> {
        const [, id] = ctx.interaction.customId.split("_");
        const message = ctx.interaction.fields.getTextInputValue("response");

        const hasHistory = await ctx.client.hasChatMessage(id!);
        if (!hasHistory) return await ctx.error({ error: "No chat message found", componentsV2: true });

        const history = (await ctx.client.getChatHistory(id!)).reverse();

        const model = history.at(-1)!.model_name;
        const modelConfig = ctx.client.config.modelConfigurations[model];
        if (!modelConfig) return await ctx.error({ error: "Invalid model", componentsV2: true });
        const systemInstructionName = history.at(-1)!.system_instruction_name || modelConfig!.defaultSystemInstructionName;

        if (!modelConfig) return await ctx.error({ error: "Invalid model", componentsV2: true });

        const connector = ctx.client.connectorInstances[modelConfig.connector];
        if (!connector) return await ctx.error({ error: "Invalid connector", componentsV2: true });
        const systemInstruction = ctx.client.config.systemInstructions[systemInstructionName || modelConfig.defaultSystemInstructionName || "default"];

        await ctx.interaction.deferReply();

        const messages: ChatMessage[] = []

        if (systemInstruction && modelConfig.systemInstructionAllowed !== false) {
            messages.unshift({ role: "system", content: systemInstruction });
        }

        for (const message of history.slice(-1 * (ctx.client.config.chat?.maxHistoryDepth || 0))) {
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
            content: message
        });

        const updatesEmitter = new UpdatesEmitter();
        updatesEmitter.on(UpdateEmitterEvents.UPDATE, async (text) => {
            // @ts-ignore This typing is currently broken, but we need to ignore it for now
            await ctx.interaction.editReply({ components: [new TextDisplayBuilder({ content: `⌛ ${text}` })], flags: MessageFlags.IsComponentsV2 });
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

        const { components, attachments } = await DiscordBotClient.constructMessage(completion)

        // @ts-ignore This typing is currently broken, but we need to ignore it for now
        const result = await ctx.interaction.editReply({ components, files: attachments, flags: MessageFlags.IsComponentsV2 });

        ctx.client.saveChatCompletion(message, completion.resultMessage.content, model, systemInstructionName || modelConfig.defaultSystemInstructionName || "default", result.id, ctx.interaction.user.id, id!);
    }
}
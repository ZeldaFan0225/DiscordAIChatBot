import { AttachmentBuilder } from "discord.js";
import { ChatMessage } from "../classes/connectors/BaseConnector";
import { Modal } from "../classes/modal";
import { ModalContext } from "../classes/modalContext";
import { getChatHistory, hasChatMessage, saveChatCompletion } from "../commands/chat";
import { DiscordBotClient } from "../classes/client";
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
        const [,id] = ctx.interaction.customId.split("_");
        const message = ctx.interaction.fields.getTextInputValue("response");

        const hasHistory = await hasChatMessage(id!);
        if(!hasHistory) return await ctx.error({error: "No chat message found"});

        const history = (await getChatHistory(id!)).reverse();

        const model = history.at(-1)!.model_name;
        const modelConfig = ctx.client.config.modelConfigurations[model];
        if(!modelConfig) return await ctx.error({error: "Invalid model"});
        const systemInstructionName = history.at(-1)!.system_instruction_name || modelConfig!.defaultSystemInstructionName;

        if(!modelConfig) return await ctx.error({error: "Invalid model"});

        const connector = ctx.client.connectorInstances[modelConfig.connector];
        if(!connector) return await ctx.error({error: "Invalid connector"});
        const systemInstruction = ctx.client.config.systemInstructions[systemInstructionName || modelConfig.defaultSystemInstructionName || "default"];

        await ctx.interaction.deferReply();

        const messages: ChatMessage[] = []

        if(systemInstruction && modelConfig.systemInstructionAllowed !== false) {
            messages.unshift({role: "system", content: systemInstruction});
        }

        for(const message of history.slice(-1 * (ctx.client.config.chat?.maxHistoryDepth || 0))) {
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
            await ctx.interaction.editReply({content: `Processing... ${text}`});
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

        if(!completion) return await ctx.error({error: "Failed to get completion"});

        let payload;
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

        if(completion.resultMessage.content.length > 2000) {
            const attachment = new AttachmentBuilder(Buffer.from(completion.resultMessage.content), {name: "response.txt"});
            files.push(attachment)
            payload = {
                files
            }
        } else {
            payload = {
                content: completion.resultMessage.content,
                files
            }
        }

        const result = await ctx.interaction.editReply(payload);

        saveChatCompletion(message, completion.resultMessage.content, model, systemInstructionName || modelConfig.defaultSystemInstructionName || "default", result.id, ctx.interaction.user.id, id!);
    }
}
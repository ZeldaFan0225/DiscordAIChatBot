import { AttachmentBuilder, Message } from "discord.js";
import { ChatMessage } from "../classes/connectors/BaseConnector";
import { Modal } from "../classes/modal";
import { ModalContext } from "../classes/modalContext";
import { saveChatCompletion } from "../commands/chat";
import { DiscordBotClient } from "../classes/client";

export default class extends Modal {
    constructor() {
        super({
            name: "ask",
            staff_only: false,
            regex: /ask_\d+/
        })
    }

    override async run(ctx: ModalContext): Promise<any> {
        const [,id] = ctx.interaction.customId.split("_");
        const message = ctx.interaction.fields.getTextInputValue("question");

        const targetMessage = ctx.client.cache.get(`ask_${id}`) as Message;
        if (!targetMessage) return await ctx.error({ error: "Invalid message" });
        ctx.client.cache.delete(`ask_${id}`);

        const targetMessageContent = this.getMessageContent(targetMessage).trim();
        if(!targetMessageContent) return await ctx.error({ error: "Message is empty" });

        const template = ctx.client.config.ask?.initialPromptTemplate || "Take the following message:\n\n{{TARGET_MESSAGE_CONTENT}}\n\nWhat I need you to do:\n{{USER_PROMPT}}";
        const prompt = template.replaceAll("{{TARGET_MESSAGE_CONTENT}}", targetMessageContent).replaceAll("{{USER_PROMPT}}", message)

        const modelName = ctx.client.config.ask?.model || "default";
        const modelConfig = ctx.client.config.modelConfigurations[modelName];
        if(!modelConfig) return await ctx.error({error: "Invalid model"});
        const systemInstructionName = ctx.client.config.ask?.systemInstruction || modelConfig!.defaultSystemInstructionName;

        if(!modelConfig) return await ctx.error({error: "Invalid model"});

        const connector = ctx.client.connectorInstances[modelConfig.connector];
        if(!connector) return await ctx.error({error: "Invalid connector"});
        const systemInstruction = ctx.client.config.systemInstructions[systemInstructionName || modelConfig.defaultSystemInstructionName || "default"];

        await ctx.interaction.deferReply();

        const messages: ChatMessage[] = []

        if(systemInstruction && modelConfig.systemInstructionAllowed !== false) {
            messages.unshift({role: "system", content: systemInstruction});
        }

        messages.push({
            role: "user",
            content: prompt
        });

        const completion = await connector.requestChatCompletion(
            messages,
            modelConfig.generationOptions,
            ctx.interaction.user.id
        ).catch(console.error);

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

        saveChatCompletion(prompt, completion.resultMessage.content, modelName, systemInstructionName || modelConfig.defaultSystemInstructionName || "default", result.id, ctx.interaction.user.id);
    }

    getMessageContent(message: Message) {
        const content = message.content;
        const embedContent = message.embeds.map(embed => {
            return `${embed.title}\n${embed.description}\n${embed.fields.map(field => `${field.name}\n${field.value}`).join("\n")}`
        }).join("\n");

        return `${content}\n${embedContent}`;
    }
}
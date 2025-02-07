import { Command } from "../classes/command";
import { CommandContext } from "../classes/commandContext";
import { AutocompleteContext } from "../classes/autocompleteContext";
import { ApplicationIntegrationType, AttachmentBuilder, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { DiscordBotClient } from "../classes/client";
import { ChatMessageData } from "../types";
import { ChatMessage } from "../classes/connectors/BaseConnector";
import { UpdateEmitterEvents, UpdatesEmitter } from "../classes/updatesEmitter";


const command_data = new SlashCommandBuilder()
    .setName("chat")
    .setDescription(`Request a chat completion`)
    .setContexts(
        InteractionContextType.PrivateChannel,
        InteractionContextType.Guild,
        InteractionContextType.BotDM
    )
    .setIntegrationTypes(
        ApplicationIntegrationType.UserInstall,
        ApplicationIntegrationType.GuildInstall
    )
    .addStringOption(
        option => option
            .setName("message")
            .setDescription("The message you want to send to the AI")
            .setRequired(true)
    )
    .addStringOption(
        option => option
            .setName("model")
            .setDescription("The model you want to use for completion")
            .setRequired(true)
            .setAutocomplete(true)
    )
    .addStringOption(
        option => option
            .setName("system_instruction")
            .setDescription("The system instruction you want to use for completion")
            .setRequired(false)
            .setAutocomplete(true)
    )
    .addAttachmentOption(
        option => option
            .setName("image")
            .setDescription("An image to send to the AI")
            .setRequired(false)
    )


export default class extends Command {
    constructor() {
        super({
            name: "chat",
            command_data: command_data.toJSON(),
            staff_only: false,
        })
    }

    override async run(ctx: CommandContext): Promise<any> {
        const message = ctx.interaction.options.getString("message", true);
        const model = ctx.interaction.options.getString("model", true);
        const modelConfig = ctx.client.config.modelConfigurations[model];
        const systemInstructionName = ctx.interaction.options.getString("system_instruction", false);
        const image = ctx.interaction.options.getAttachment("image");

        if(!modelConfig) return await ctx.error({error: "Invalid model"});

        const connector = ctx.client.connectorInstances[modelConfig.connector];
        if(!connector) return await ctx.error({error: "Invalid connector"});
        const systemInstruction = ctx.client.config.systemInstructions[systemInstructionName || modelConfig.defaultSystemInstructionName || "default"];

        await ctx.interaction.deferReply();

        const messages: ChatMessage[] = [{
            role: "user",
            content: message,
            attachments: image && modelConfig.images.supported ? [image.url] : []
        }];

        if(systemInstruction && modelConfig.systemInstructionAllowed !== false) {
            messages.unshift({role: "system", content: systemInstruction});
        }

        const updatesEmitter = new UpdatesEmitter();
        updatesEmitter.on(UpdateEmitterEvents.UPDATE, (text) => {
            ctx.interaction.editReply({content: `⌛ ${text}`});
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
                files,
                content: null
            }
        } else {
            payload = {
                content: completion.resultMessage.content,
                files
            }
        }

        const result = await ctx.interaction.editReply(payload);

        saveChatCompletion(message, completion.resultMessage.content, model, systemInstructionName || modelConfig.defaultSystemInstructionName || "default", result.id, ctx.interaction.user.id);
    }

    override async autocomplete(context: AutocompleteContext): Promise<any> {
        const focus = context.interaction.options.getFocused(true);
        switch(focus.name) {
            case "model": {
                const models = Object.entries(context.client.config.modelConfigurations);
                const filtered = models.filter(([name, {displayName}]) => name.toLowerCase().includes(focus.value.toLowerCase()) || displayName.toLowerCase().includes(focus.value.toLowerCase()));
                return await context.interaction.respond(
                    filtered.map(([name, {displayName}]) => ({name: displayName || name, value: name})).slice(0, 25)
                )
            }
            case "system_instruction": {
                const instructions = Object.keys(context.client.config.systemInstructions);
                const filtered = instructions.filter((name) => name.toLowerCase().includes(focus.value.toLowerCase()));
                return await context.interaction.respond(
                    filtered.map((name) => ({name, value: name})).slice(0, 25)
                )
            }
        }
    }
}

export async function saveChatCompletion(userContent: string, assistantResponse: string, modelName: string, systemInstructionName: string, responseMessageId: string, userId: string, parentMessageId?: string) {
    await DiscordBotClient.db.query(
        "INSERT INTO chat_messages (message_id, user_content, assistant_content, model_name, system_instruction_name, user_id, parent_message_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [responseMessageId, userContent, assistantResponse, modelName, systemInstructionName, userId, parentMessageId || null]
    ).catch(console.error);
}

export async function hasChatMessage(messageId: string) {
    const {rows} = await DiscordBotClient.db.query("SELECT * FROM chat_messages WHERE message_id = $1", [messageId]);
    return rows.length > 0;
}

export async function getChatHistory(messageId: string) {
    const {rows} = await DiscordBotClient.db.query<ChatMessageData>(
`WITH RECURSIVE message_hierarchy AS (
    SELECT
        index,
        message_id,
        model_name,
        system_instruction_name,
        user_content,
        assistant_content,
        user_id,
        parent_message_id
    FROM
        chat_messages
    WHERE
        message_id = $1

    UNION ALL

    SELECT
        m.index,
        m.message_id,
        m.model_name,
        m.system_instruction_name,
        m.user_content,
        m.assistant_content,
        m.user_id,
        m.parent_message_id
    FROM
        chat_messages m
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
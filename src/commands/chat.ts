import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder, TextDisplayBuilder } from "discord.js";
import { AutocompleteContext } from "../classes/autocompleteContext";
import { DiscordBotClient } from "../classes/client";
import { Command } from "../classes/command";
import { CommandContext } from "../classes/commandContext";
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

        if (!modelConfig) return await ctx.error({ error: "Invalid model", componentsV2: true });

        const connector = ctx.client.connectorInstances[modelConfig.connector];
        if (!connector) return await ctx.error({ error: "Invalid connector", componentsV2: true });
        const systemInstruction = ctx.client.config.systemInstructions[systemInstructionName || modelConfig.defaultSystemInstructionName || "default"];

        await ctx.interaction.deferReply();

        const messages: ChatMessage[] = [{
            role: "user",
            content: message,
            attachments: image && modelConfig.images.supported ? [image.url] : []
        }];

        if (systemInstruction && modelConfig.systemInstructionAllowed !== false) {
            messages.unshift({ role: "system", content: systemInstruction });
        }

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

        const {components, attachments} = await DiscordBotClient.constructMessage(completion)
        const result = await ctx.interaction.editReply({ components, files: attachments, content: null });

        ctx.client.saveChatCompletion(message, completion.resultMessage.content, model, systemInstructionName || modelConfig.defaultSystemInstructionName || "default", result.id, ctx.interaction.user.id);
    }

    override async autocomplete(context: AutocompleteContext): Promise<any> {
        const focus = context.interaction.options.getFocused(true);
        switch (focus.name) {
            case "model": {
                const models = Object.entries(context.client.config.modelConfigurations);
                const filtered = models.filter(([name, { displayName }]) => name.toLowerCase().includes(focus.value.toLowerCase()) || displayName.toLowerCase().includes(focus.value.toLowerCase()));
                return await context.interaction.respond(
                    filtered.map(([name, { displayName }]) => ({ name: displayName || name, value: name })).slice(0, 25)
                )
            }
            case "system_instruction": {
                const instructions = Object.keys(context.client.config.systemInstructions);
                const filtered = instructions.filter((name) => name.toLowerCase().includes(focus.value.toLowerCase()));
                return await context.interaction.respond(
                    filtered.map((name) => ({ name, value: name })).slice(0, 25)
                )
            }
        }
    }
}
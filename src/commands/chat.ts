import { SlashCommandBuilder } from "discord.js";
import { Command } from "../classes/command";
import { CommandContext } from "../classes/commandContext";
import { AutocompleteContext } from "../classes/autocompleteContext";


const command_data = new SlashCommandBuilder()
    .setName("chat")
    .setDMPermission(false)
    .setDescription(`Request a chat completion`)
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

        if(!modelConfig) return await ctx.error({error: "Invalid model"});

        const connector = ctx.client.connectorInstances[modelConfig.connector];
        if(!connector) return await ctx.error({error: "Invalid connector"});
        const systemInstruction = ctx.client.config.systemInstructions[systemInstructionName || modelConfig.defaultSystemInstructionName];
        if(!systemInstruction) return await ctx.error({error: "Invalid system instruction"});

        await ctx.interaction.deferReply();

        const completion = await connector.requestChatCompletion(
            [
                {role: "system", content: systemInstruction},
                {role: "user", content: message}
            ],
            modelConfig.generationOptions
        ).catch(console.error);

        if(!completion) return await ctx.error({error: "Failed to get completion"});
        await ctx.interaction.editReply(completion.resultMessage.content)
    }

    override async autocomplete(context: AutocompleteContext): Promise<any> {
        const focus = context.interaction.options.getFocused(true);
        switch(focus.name) {
            case "model": {
                const models = Object.entries(context.client.config.modelConfigurations);
                const filtered = models.filter(([name, {displayName}]) => name.toLowerCase().includes(focus.value.toLowerCase()) || displayName.toLowerCase().includes(focus.value.toLowerCase()));
                return await context.interaction.respond(
                    filtered.map(([name, {displayName}]) => ({name: displayName || name, value: name}))
                )
            }
            case "system_instruction": {
                const instructions = Object.keys(context.client.config.systemInstructions);
                const filtered = instructions.filter((name) => name.toLowerCase().includes(focus.value.toLowerCase()));
                return await context.interaction.respond(
                    filtered.map((name) => ({name, value: name}))
                )
            }
        }
    }
}
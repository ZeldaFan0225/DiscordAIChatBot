import {readFileSync} from "fs"
import { DiscordBotClient } from "./classes/client";
import { handleCommands } from "./handlers/commandHandler";
import { handleComponents } from "./handlers/componentHandler";
import { handleModals } from "./handlers/modalHandler";
import { handleAutocomplete } from "./handlers/autocompleteHandler";
import { handleContexts } from "./handlers/contextHandler";
import {ActivityType, ApplicationCommandType, InteractionType, Partials, PresenceUpdateStatus} from "discord.js";
import handleMessage from "./handlers/message";
import { Pool } from "pg";
import BaseConnector from "./classes/connectors/BaseConnector";
import BaseTool from "./classes/tools/BaseTool";

if (process.env['NODE_ENV'] !== 'production') {
    const RE_INI_KEY_VAL = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/
    for (const line of readFileSync(`${process.cwd()}/.env`, 'utf8').split(/[\r\n]/)) {
        const [, key, value] = line.match(RE_INI_KEY_VAL) || []
        if (!key) continue
        process.env[key] = value?.trim()
    }
}

const connection = new Pool({
    user: process.env["DB_USERNAME"],
    host: process.env["DB_IP"],
    database: process.env["DB_NAME"],
    password: process.env["DB_PASSWORD"],
    port: Number(process.env["DB_PORT"]),
})
DiscordBotClient.db = connection

const client = new DiscordBotClient({
    intents: ["Guilds", "MessageContent", "GuildMessages", "DirectMessages"],
    partials: [Partials.Message, Partials.Channel],
})

client.login(process.env["DISCORD_TOKEN"])
BaseConnector.client = client;
BaseTool.client = client;


client.on("ready", async () => {
    connection.query(readFileSync(`${process.cwd()}/init.sql`, 'utf8')).catch(console.error)

    client.commands.loadClasses().catch(console.error)
    client.components.loadClasses().catch(console.error)
    client.contexts.loadClasses().catch(console.error)
    client.modals.loadClasses().catch(console.error)
    client.user?.setPresence({activities: [{type: ActivityType.Listening, name: "your messages"}], status: PresenceUpdateStatus.DoNotDisturb })
    console.log(`Ready`)
    await client.application?.commands.set([...client.commands.createPostBody(), ...client.contexts.createPostBody()]).catch(console.error)
})

client.on("interactionCreate", async (interaction) => {
    switch(interaction.type) {
        case InteractionType.ApplicationCommand: {
            switch(interaction.commandType) {
                case ApplicationCommandType.ChatInput: {
                    return await handleCommands(interaction, client);
                }
                case ApplicationCommandType.User:
                case ApplicationCommandType.Message: {
                    return await handleContexts(interaction, client);
                }
            }
        };
        case InteractionType.MessageComponent: {
			return await handleComponents(interaction, client);
        };
        case InteractionType.ApplicationCommandAutocomplete: {
			return await handleAutocomplete(interaction, client);
        };
        case InteractionType.ModalSubmit: {
			return await handleModals(interaction, client);
        };
    }
})

client.on("messageCreate", async (message) => await handleMessage(message, client))

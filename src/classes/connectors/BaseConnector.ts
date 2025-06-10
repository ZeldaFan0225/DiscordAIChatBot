import { DiscordBotClient } from "../client";
import { UpdatesEmitter } from "../updatesEmitter";
import { ConfigLoader } from "../configLoader";

export default abstract class BaseConnector {
    #connectionOptions: ConnectionOptions;
    static client: DiscordBotClient;
    constructor(options: ConnectionOptions) {
        this.#connectionOptions = options;
    }
    get availableTools() {
        const tools = [];
        
        // Add regular tools
        if (this.#connectionOptions.tools) {
            tools.push(...this.#connectionOptions.tools.map(tool => {
                return BaseConnector.client.toolInstances[tool]!
            }));
        }
        
        // Add MCP tools
        if (this.#connectionOptions.mcpServers) {
            tools.push(...ConfigLoader.getMCPToolsForConnector(this.#connectionOptions.mcpServers));
        }
        
        return tools;
    }
    get connectionOptions() {
        return this.#connectionOptions;
    }
    abstract requestChatCompletion(
        messages: ChatMessage[],
        generationOptions: GenerationOptions,
        requestOptions: RequestOptions
    ): Promise<ChatCompletionResult>;
}

export interface ChatCompletionResult {
    resultMessage: ChatMessage;
}

export interface ConnectionOptions {
    url: string;
    apiKey: string;
    tools?: string[];
    mcpServers?: string[];
}

export interface RequestOptions {
    userId?: string;
    updatesEmitter: UpdatesEmitter;
}

export interface GenerationOptions extends Record<string, any> {
    model: string
}

export const ChatMessageRoles = Object.freeze({
    USER: "user",
    ASSISTANT: "assistant",
    SYSTEM: "system"
} as const)

export interface ChatMessage {
    /** The role of the message */
    role: typeof ChatMessageRoles[keyof typeof ChatMessageRoles];
    /** The content of the message */
    content: string;
    /** The name of the user who sent the message */
    name?: string;
    /** The attachments to be included as a fetchable https url */
    attachments?: string[];
    /** Optional audio for the response */
    audio_data_string?: string;
}
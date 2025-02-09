import { DiscordBotClient } from "../client";

export default abstract class BaseTool {
    #definition: ToolDefinition;
    static client: DiscordBotClient;
    readonly name: string;
    constructor(definition: ToolDefinition) {
        this.#definition = definition;
        this.name = definition.name;
    }

    abstract handleToolCall(parameters: ToolCallData): Promise<ToolResponse>;

    public toOpenAiToolDefinition(): OpenAiToolDefinition {
        return {
            name: this.#definition.name,
            description: this.#definition.description,
            parameters: this.#definition.parameters,
            strict: false
        }
    }

    public toAnthropicToolDefinition(): AnthropicToolDefinition {
        return {
            name: this.#definition.name,
            description: this.#definition.description,
            input_schema: this.#definition.parameters
        }
    }

    public toGoogleToolDefinition(): ToolDefinition {
        return this.#definition;
    }
}

export interface ToolResponse {
    result: any;
    /** Base64 or fetchable URL */
    attachments?: string[];
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters?: ToolDefinitionParameters;
}
export type ToolDefinitionParameters = Record<string, any>;
export type ToolCallData = Record<string, any>;

export interface OpenAiToolDefinition extends ToolDefinition {
    strict?: boolean
}

export interface AnthropicToolDefinition extends Omit<ToolDefinition, "parameters"> {
    input_schema?: ToolDefinitionParameters;
}

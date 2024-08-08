export default abstract class BaseConnector {
    #connectionOptions: ConnectionOptions;
    constructor(options: ConnectionOptions) {
        this.#connectionOptions = options;
    }
    get connectionOptions() {
        return this.#connectionOptions;
    }
    abstract requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions): Promise<ChatCompletionResult>;
}

export interface ChatCompletionResult {
    resultMessage: ChatMessage;
}

export interface ConnectionOptions {
    url: string;
    apiKey: string;
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
}
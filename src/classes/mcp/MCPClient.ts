import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { 
    CallToolResultSchema, 
    ListResourcesResultSchema, 
    ListToolsResultSchema,
    ListPromptsResultSchema,
    ReadResourceResultSchema,
    GetPromptResultSchema,
    Tool,
    Resource,
    Prompt
} from "@modelcontextprotocol/sdk/types.js";

export interface MCPServerConfig {
    command?: string;
    args?: string[];
    url?: string;
    transportType: "stdio" | "sse";
    env?: Record<string, string>;
}

export class MCPClient {
    private client: Client;
    private serverConfig: MCPServerConfig;
    private connected: boolean = false;
    private tools: Tool[] = [];
    private resources: Resource[] = [];
    private prompts: Prompt[] = [];

    constructor(serverName: string, config: MCPServerConfig) {
        this.serverConfig = config;
        this.client = new Client({
            name: `discord-bot-${serverName}`,
            version: "1.0.0"
        }, {
            capabilities: {
                tools: {},
                resources: {},
                prompts: {}
            }
        });
    }

    async connect(): Promise<void> {
        if (this.connected) return;

        let transport;
        if (this.serverConfig.transportType === "stdio") {
            if (!this.serverConfig.command) {
                throw new Error("Command is required for stdio transport");
            }
            transport = new StdioClientTransport({
                command: this.serverConfig.command,
                args: this.serverConfig.args,
                env: this.serverConfig.env
            });
        } else if (this.serverConfig.transportType === "sse") {
            if (!this.serverConfig.url) {
                throw new Error("URL is required for SSE transport");
            }
            transport = new SSEClientTransport(new URL(this.serverConfig.url));
        } else {
            throw new Error(`Unsupported transport type: ${this.serverConfig.transportType}`);
        }

        await this.client.connect(transport);
        this.connected = true;

        // Discover available capabilities
        await this.discoverCapabilities();
    }

    async disconnect(): Promise<void> {
        if (!this.connected) return;
        await this.client.close();
        this.connected = false;
    }

    private async discoverCapabilities(): Promise<void> {
        // Discover tools
        try {
            const toolsResult = await this.client.request(
                { method: "tools/list" },
                ListToolsResultSchema
            );
            this.tools = toolsResult.tools || [];
        } catch (error) {
            console.error("Failed to discover tools:", error);
        }

        // Discover resources
        try {
            const resourcesResult = await this.client.request(
                { method: "resources/list" },
                ListResourcesResultSchema
            );
            this.resources = resourcesResult.resources || [];
        } catch (error) {
            console.error("Failed to discover resources:", error);
        }

        // Discover prompts
        try {
            const promptsResult = await this.client.request(
                { method: "prompts/list" },
                ListPromptsResultSchema
            );
            this.prompts = promptsResult.prompts || [];
        } catch (error) {
            console.error("Failed to discover prompts:", error);
        }
    }

    async callTool(toolName: string, args: Record<string, any>): Promise<any> {
        if (!this.connected) {
            throw new Error("MCP client not connected");
        }

        const tool = this.tools.find(t => t.name === toolName);
        if (!tool) {
            throw new Error(`Tool ${toolName} not found`);
        }

        const result = await this.client.request(
            {
                method: "tools/call",
                params: {
                    name: toolName,
                    arguments: args
                }
            },
            CallToolResultSchema
        );

        return result;
    }

    async readResource(uri: string): Promise<string> {
        if (!this.connected) {
            throw new Error("MCP client not connected");
        }

        const resource = this.resources.find(r => r.uri === uri);
        if (!resource) {
            throw new Error(`Resource ${uri} not found`);
        }

        const result = await this.client.request(
            {
                method: "resources/read",
                params: { uri }
            },
            ReadResourceResultSchema
        );

        if (result.contents && result.contents.length > 0) {
            const firstContent = result.contents[0];
            if (firstContent && typeof firstContent === 'object' && 'text' in firstContent) {
                return String(firstContent.text);
            }
        }
        return "";
    }

    async getPrompt(promptName: string, args: Record<string, string>): Promise<string> {
        if (!this.connected) {
            throw new Error("MCP client not connected");
        }

        const prompt = this.prompts.find(p => p.name === promptName);
        if (!prompt) {
            throw new Error(`Prompt ${promptName} not found`);
        }

        const result = await this.client.request(
            {
                method: "prompts/get",
                params: {
                    name: promptName,
                    arguments: args
                }
            },
            GetPromptResultSchema
        );

        return result.messages.map(m => m.content.text).join("\n");
    }

    getTools(): Tool[] {
        return this.tools;
    }

    getResources(): Resource[] {
        return this.resources;
    }

    getPrompts(): Prompt[] {
        return this.prompts;
    }

    isConnected(): boolean {
        return this.connected;
    }
}
import { MCPClient, MCPServerConfig } from "./MCPClient";
import { MCPToolAdapter } from "./MCPToolAdapter";
import BaseTool from "../tools/BaseTool";

export class MCPManager {
    private static instance: MCPManager;
    private clients: Map<string, MCPClient> = new Map();
    private toolAdapters: Map<string, MCPToolAdapter[]> = new Map();

    private constructor() {}

    static getInstance(): MCPManager {
        if (!MCPManager.instance) {
            MCPManager.instance = new MCPManager();
        }
        return MCPManager.instance;
    }

    async initializeServer(serverName: string, config: MCPServerConfig): Promise<void> {
        if (this.clients.has(serverName)) {
            console.warn(`MCP server ${serverName} already initialized`);
            return;
        }

        const client = new MCPClient(serverName, config);
        try {
            await client.connect();
            this.clients.set(serverName, client);

            // Create tool adapters for all tools from this server
            const tools = client.getTools();
            const adapters = tools.map(tool => new MCPToolAdapter(client, tool));
            this.toolAdapters.set(serverName, adapters);

            console.info(`Initialized MCP server ${serverName} with ${tools.length} tools`);
        } catch (error) {
            console.error(`Failed to initialize MCP server ${serverName}:`, error);
            throw error;
        }
    }

    async disconnectServer(serverName: string): Promise<void> {
        const client = this.clients.get(serverName);
        if (client) {
            await client.disconnect();
            this.clients.delete(serverName);
            this.toolAdapters.delete(serverName);
            console.info(`Disconnected MCP server ${serverName}`);
        }
    }

    async disconnectAll(): Promise<void> {
        for (const [, client] of this.clients) {
            await client.disconnect();
        }
        this.clients.clear();
        this.toolAdapters.clear();
    }

    getClient(serverName: string): MCPClient | undefined {
        return this.clients.get(serverName);
    }

    getToolsForServers(serverNames: string[]): BaseTool[] {
        const tools: BaseTool[] = [];
        for (const serverName of serverNames) {
            const adapters = this.toolAdapters.get(serverName);
            if (adapters) {
                tools.push(...adapters);
            }
        }
        return tools;
    }

    getAllAvailableTools(): BaseTool[] {
        const tools: BaseTool[] = [];
        for (const adapters of this.toolAdapters.values()) {
            tools.push(...adapters);
        }
        return tools;
    }

    async getResourceContent(serverName: string, uri: string): Promise<string> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server ${serverName} not found`);
        }
        return await client.readResource(uri);
    }

    async getPrompt(serverName: string, promptName: string, args: Record<string, string>): Promise<string> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server ${serverName} not found`);
        }
        return await client.getPrompt(promptName, args);
    }

    getAvailableServers(): string[] {
        return Array.from(this.clients.keys());
    }
}
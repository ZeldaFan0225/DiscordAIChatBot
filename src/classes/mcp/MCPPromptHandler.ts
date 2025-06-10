import { MCPManager } from "./MCPManager";

export class MCPPromptHandler {
    private static mcpManager = MCPManager.getInstance();

    /**
     * Gets an MCP prompt by name with arguments
     * @param promptName The prompt name
     * @param args Arguments for the prompt
     * @returns The formatted prompt content
     */
    static async getPrompt(promptName: string, args: Record<string, string> = {}): Promise<string> {
        const servers = this.mcpManager.getAvailableServers();
        
        for (const serverName of servers) {
            try {
                const promptContent = await this.mcpManager.getPrompt(serverName, promptName, args);
                return promptContent;
            } catch (error) {
                // Try next server
                continue;
            }
        }
        
        throw new Error(`Prompt ${promptName} not found in any MCP server`);
    }

    /**
     * Lists all available prompts across all MCP servers
     */
    static async listAllPrompts(): Promise<{ serverName: string; prompts: any[] }[]> {
        const servers = this.mcpManager.getAvailableServers();
        const allPrompts: { serverName: string; prompts: any[] }[] = [];
        
        for (const serverName of servers) {
            const client = this.mcpManager.getClient(serverName);
            if (client) {
                const prompts = client.getPrompts();
                allPrompts.push({ serverName, prompts });
            }
        }
        
        return allPrompts;
    }

    /**
     * Enhances a system instruction with MCP prompts
     * @param baseInstruction The base system instruction
     * @param promptNames Array of MCP prompt names to include
     * @param promptArgs Arguments for the prompts
     * @returns The enhanced system instruction
     */
    static async enhanceSystemInstruction(
        baseInstruction: string, 
        promptNames: string[], 
        promptArgs: Record<string, Record<string, string>> = {}
    ): Promise<string> {
        let enhancedInstruction = baseInstruction;
        
        for (const promptName of promptNames) {
            try {
                const args = promptArgs[promptName] || {};
                const promptContent = await this.getPrompt(promptName, args);
                enhancedInstruction += `\n\n${promptContent}`;
            } catch (error) {
                console.error(`Failed to get MCP prompt ${promptName}:`, error);
            }
        }
        
        return enhancedInstruction;
    }
}
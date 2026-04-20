# MCP (Model Context Protocol) Integration

This document describes how to configure and use MCP servers with the Discord AI Chat Bot.

## Overview

The Model Context Protocol (MCP) allows the bot to connect to external servers that provide:
- **Tools**: Additional functions that can be called by AI models
- **Resources**: Files and data that can be accessed during conversations
- **Prompts**: Reusable prompt templates

## Configuration

### 1. Define MCP Servers

Add MCP server configurations to your `config.json`:

```json
{
  "mcpServerConfigurations": {
    "filesystem": {
      "transportType": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"]
    },
    "github": {
      "transportType": "stdio", 
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token"
      }
    },
    "memory": {
      "transportType": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "custom-server": {
      "transportType": "sse",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### 2. Assign MCP Servers to Connectors

Add MCP servers to connector configurations:

```json
{
  "connectorConfigurations": {
    "ToolsOpenAIConnector": {
      "class": "classes/connectors/ToolsOpenAIConnector",
      "connectionOptions": {
        "url": "https://api.openai.com/v1/chat/completions",
        "apiKey": "OPENAI_KEY",
        "tools": ["SearxingTool"],
        "mcpServers": ["filesystem", "memory", "github"]
      }
    }
  }
}
```

## Transport Types

### stdio Transport
- Used for local MCP servers that run as processes
- Requires `command` and optionally `args` and `env`
- Example servers: filesystem, GitHub, SQLite

### SSE (Server-Sent Events) Transport
- Used for remote MCP servers accessible via HTTP
- Requires `url` pointing to the SSE endpoint
- Suitable for cloud-hosted MCP servers

## Available MCP Servers

### Official Servers

1. **Filesystem** (`@modelcontextprotocol/server-filesystem`)
   - Access files and directories
   - Read/write operations
   - Safe sandboxed access

2. **GitHub** (`@modelcontextprotocol/server-github`) 
   - Repository operations
   - File reading/searching
   - Issue and PR management

3. **Memory** (`@modelcontextprotocol/server-memory`)
   - Key-value storage
   - Persistent memory across conversations

4. **PostgreSQL** (`@modelcontextprotocol/server-postgres`)
   - Database queries
   - Schema inspection

5. **Brave Search** (`@modelcontextprotocol/server-brave-search`)
   - Web search capabilities
   - Requires Brave API key

### Community Servers

See [MCP Servers List](https://github.com/modelcontextprotocol/servers) for more options.

## How It Works

1. **Initialization**: When the bot starts, it connects to all configured MCP servers
2. **Tool Discovery**: The bot automatically discovers tools from each MCP server
3. **Tool Integration**: MCP tools are seamlessly integrated with existing bot tools
4. **Resource Access**: MCP resources can be accessed as attachments in responses
5. **Prompt Templates**: MCP prompts can enhance system instructions

## Features

### MCP Tools
- Automatically discovered and made available to AI models
- Work alongside existing bot tools (SearxingTool, WolframTool, etc.)
- Support the same interfaces as native tools

### MCP Resources  
- Files and data from MCP servers
- Automatically converted to attachments in Discord messages
- Support for text, images, and other media types

### MCP Prompts
- Reusable prompt templates
- Can be used to enhance system instructions
- Support for parameterized prompts

## Example Use Cases

1. **File System Access**
   ```json
   "mcpServers": ["filesystem"]
   ```
   AI can read/write files in allowed directories

2. **GitHub Integration**
   ```json
   "mcpServers": ["github"]
   ```
   AI can browse repos, read code, manage issues

3. **Persistent Memory**
   ```json
   "mcpServers": ["memory"]
   ```
   AI can remember information across conversations

4. **Combined Powers**
   ```json
   "mcpServers": ["filesystem", "github", "memory"]
   ```
   Full suite of capabilities

## Security Considerations

- **Sandboxing**: Filesystem server only accesses allowed directories
- **Authentication**: Use environment variables for API keys
- **Transport Security**: SSE transport should use HTTPS in production
- **Tool Permissions**: Each connector only has access to its assigned MCP servers

## Troubleshooting

1. **Server won't start**: Check command path and arguments
2. **Tools not appearing**: Verify server is running and discoverable
3. **Authentication errors**: Ensure API keys are set in environment
4. **Connection timeouts**: Check firewall and network settings

## Development

To create a custom MCP server:
1. Implement the MCP protocol specification
2. Expose via stdio or SSE transport
3. Add configuration to `mcpServerConfigurations`
4. Assign to appropriate connectors

See [MCP Documentation](https://modelcontextprotocol.io) for protocol details.
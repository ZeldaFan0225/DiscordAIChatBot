# Discord AI Chat Bot 🤖

A powerful, multi-provider Discord bot for AI interactions. Seamlessly integrate multiple AI models into your Discord server with support for text, images, and audio responses.

## Features ✨

- **Multiple AI Providers** 
  - OpenAI (e.g. GPT-4)
  - Anthropic (e.g. Claude 3.5)
  - Google AI (Gemini 1.5)
  - Together AI (e.g. Llama 3.1)
  - Groq
  - Wolfram Alpha
  - Hybrid connectors (e.g., Wolfram + OpenAI)

- **Advanced Capabilities**
  - Multi-modal support (text + images)
  - Audio responses
  - Message history tracking
  - Content moderation
  - Configurable system instructions
  - Passive listening with custom triggers

- **Discord Integration**
  - Slash commands
  - Context menus
  - Rich interactions
  - Guild and DM support
  - Permission management
  - User blacklisting

## Prerequisites 📋

- Node.js and npm
- PostgreSQL database server
- Discord bot token
- API keys for desired AI providers

## Discord Bot Setup 🤖

1. Create a new Discord application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a bot user and get your bot token
3. Enable required Privileged Gateway Intents:
   - Message Content Intent
   - Server Members Intent
4. Generate an invite with the required Bot Permissions:
   - Send Messages
   - Send Messages in Threads
   - Embed Links
   - Attach Files
   - Read Message History
   - Use Slash Commands
   - Add Reactions
   - Use External Emojis

## Quick Start 🚀

1. **Clone the Repository**
```bash
git clone https://github.com/ZeldaFan0225/DiscordAIChatBot
cd DiscordAIChatBot
npm install
```

2. **Environment Setup**
Create a `.env` file:
```env
DISCORD_TOKEN=your_discord_bot_token
DB_NAME=your_database_name
DB_USERNAME=your_database_user
DB_PASSWORD=your_database_password
DB_IP=localhost
DB_PORT=5432
OPENAI_KEY=your_openai_key
ANTHROPIC_KEY=your_anthropic_key
GOOGLE_AI_KEY=your_google_ai_key
TOGETHERAI_KEY=your_together_ai_key
GROQ_KEY=your_groq_key
WOLFRAM_ALPHA_ID=your_wolfram_api_key
GITHUB_PAT=your_github_personal_access_token
```

3. **Bot Configuration**
Create `config.json` from template:
```json
{
    "staff_roles": ["your_admin_role_id"],
    "user_blacklist": [],
    "hey": {
        "enabled": true,
        "triggers": {
            "hey gpt": {
                "model": "gpt-4o-mini",
                "systemInstruction": "default",
                "previousMessagesContext": 5
            }
        }
    },
    "chat": {
        "maxHistoryDepth": 5
    },
    "systemInstructions": {
        "default": "You are a helpful, lightweight AI assistant"
    },
    "connectorConfigurations": {
        "OpenAIConnector": {
            "class": "classes/connectors/OpenAIConnector",
            "connectionOptions": {
                "url": "https://api.openai.com/v1/chat/completions",
                "apiKey": "OPENAI_KEY"
            }
        }
    },
    "modelConfigurations": {
        "gpt-4o-mini": {
            "connector": "OpenAIConnector",
            "displayName": "GPT-4o Mini",
            "defaultSystemInstructionName": "default",
            "systemInstructionAllowed": true,
            "images": {
                "supported": true
            },
            "generationOptions": {
                "model": "gpt-4o-mini"
            }
        }
    }
}
```

4. **Database Setup**
- Create a PostgreSQL database
- The required tables will be automatically created on first run
- Tables created:
  - `chat_messages`: Stores chat interactions
  - `hey_messages`: Stores passive listening responses

5. **Launch the Bot**
```bash
npm run deploy
```

## Development Setup 🛠️

1. **TypeScript Configuration**
The project uses TypeScript. A `tsconfig.json` is provided with recommended settings.

2. **Building**
- The `deploy` script handles TypeScript compilation and bot startup
- Source files are compiled to the `dist` directory

3. **Dependencies**
- discord.js: ^14.16.1
- @discordjs/builders, formatters, rest, util
- pg: ^8.12.0 (PostgreSQL client)
- TypeScript development dependencies

## Usage 💡

### Chat Command
Use `/chat` with these options:
- `message`: Your message to the AI
- `model`: Select AI model (autocomplete available)
- `system_instruction`: Optional system prompt
- `image`: Optional image attachment

### Hey Triggers
Configure passive listening triggers in config.json:
```json
"hey": {
    "enabled": true,
    "triggers": {
        "hey gpt": {
            "model": "gpt-4o-mini",
            "systemInstruction": "default",
            "previousMessagesContext": 5
        }
    }
}
```

### Adding AI Providers
1. Add API key to `.env`
2. Configure connector in `config.json`
3. Add desired models in `modelConfigurations`
## Creating Custom Connectors 🔌

You can create custom connectors to integrate additional AI providers. Here's how:

### 1. Create Your Connector Class

Create a new file in `src/classes/connectors/` (e.g., `CustomConnector.ts`):

```typescript
import BaseConnector, {
    ChatCompletionResult,
    ChatMessage,
    GenerationOptions
} from "./BaseConnector";

export default class CustomConnector extends BaseConnector {
    override async requestChatCompletion(
        messages: ChatMessage[],
        generationOptions: GenerationOptions,
        user_id?: string
    ): Promise<ChatCompletionResult> {
        // 1. Convert messages to your AI provider's format
        const formattedMessages = this.convertMessages(messages);

        // 2. Send request to AI provider
        const response = await this.sendRequest({
            messages: formattedMessages,
            ...generationOptions
        });

        // 3. Convert response to standard format
        return {
            resultMessage: {
                role: "assistant",
                content: response.text,
                // Optional: audio_data_string for audio responses
                // Optional: attachments for image URLs
            }
        };
    }

    private async sendRequest(payload: any) {
        const response = await fetch(this.connectionOptions.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env[this.connectionOptions.apiKey]}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.error) throw new Error("API Error", {cause: data});
        return data;
    }

    private convertMessages(messages: ChatMessage[]) {
        // Convert messages to your AI provider's format
        return messages.map(m => ({
            // Your conversion logic here
        }));
    }
}
```

### 2. Implement Required Interfaces

Your messages must conform to these interfaces:

```typescript
interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
    name?: string;
    attachments?: string[];
    audio_data_string?: string;
}

interface ChatCompletionResult {
    resultMessage: ChatMessage;
}
```

### 3. Configure Your Connector

Add your connector configuration to `config.json`:

```json
{
    "connectorConfigurations": {
        "CustomConnector": {
            "class": "classes/connectors/CustomConnector",
            "connectionOptions": {
                "url": "https://api.your-ai-provider.com/v1/chat",
                "apiKey": "YOUR_API_KEY_ENV_VAR"
            }
        }
    }
}
```

### 4. Add Model Configuration

Configure models that use your connector:

```json
{
    "modelConfigurations": {
        "custom-model": {
            "connector": "CustomConnector",
            "displayName": "Custom AI Model",
            "defaultSystemInstructionName": "default",
            "systemInstructionAllowed": true,
            "images": {
                "supported": false
            },
            "generationOptions": {
                "model": "your-model-name"
            }
        }
    }
}
```

### Key Considerations

1. **Error Handling**
   - Implement proper error handling for API responses
   - Throw meaningful errors that can be caught by the bot

2. **Message Format**
   - Implement proper conversion between the bot's message format and your AI provider's format
   - Handle system instructions if supported
   - Handle attachments if supported

3. **Authentication**
   - Use environment variables for API keys
   - Implement proper authentication headers

4. **Optional Features**
   - Image support: Handle attachments array in messages
   - Audio support: Provide audio_data_string in responses
   - Moderation: Implement content filtering if needed

### Example Features

Your connector can implement additional features:

```typescript
// Content moderation
private async moderateContent(message: string): Promise<boolean> {
    // Your moderation logic
    return true;
}

// Image processing
private handleAttachments(attachments: string[]) {
    // Your attachment handling logic
}

// Audio response handling
private formatAudioResponse(audioData: any) {
    return `data:audio/mp3;base64,${audioData}`;
}
```

## Architecture 🏗️

- **Connector System**: Modular design for easy AI provider integration
- **Database**: PostgreSQL for message history and threading
- **Discord Integration**: Full support for Discord's interaction features
- **Configuration**: Flexible setup for providers, models, and permissions

## Error Handling 🔧

Common issues and solutions:
- Database connection errors: Check PostgreSQL credentials and server status
- Discord API errors: Verify bot token and permissions
- AI provider errors: Validate API keys and model configurations
- TypeScript compilation errors: Check for syntax issues in source files

## License 📄

This project is licensed under the GNU Affero General Public License v3.0 with additional terms:
- No commercial use without explicit permission
- Attribution required
- Modified versions must share source code

See the [LICENSE](LICENSE) file for details.

## Acknowledgments 🙏

- Original creator: [ZeldaFan0225](https://github.com/ZeldaFan0225)
- All AI providers for their APIs
- Discord.js team for their excellent library

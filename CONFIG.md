# Discord AI Chat Bot Configuration Guide

This document explains all configuration parameters for the Discord AI chat bot. Copy `template.config.json` to `config.json` and customize the parameters according to your needs.

## Basic Configuration

### Staff Roles
```json
"staff_roles": []
```
Array of Discord role IDs that have administrative access to the bot.

### User Blacklist
```json
"user_blacklist": []
```
Array of Discord user IDs that are blocked from using the bot.

## Hey Command Configuration
The "hey" feature allows users to trigger the bot by mentioning it.
```json
"hey": {
    "enabled": true,
    "ignoreNonMentionReplies": true,
    "allowReplyContext": true,
    "triggers": {
        "hey gpt": {
            "model": "gpt-4o-mini",
            "processingEmoji": "1094321943517335642",
            "systemInstruction": "default",
            "previousMessagesContext": 5,
            "allowNonHistoryReplyContext": true
        }
    }
}
```
- `enabled`: Enable/disable the hey command feature
- `ignoreNonMentionReplies`: If true, ignores messages that don't mention the bot
- `allowReplyContext`: If true, allows using message reply chains as context
- `triggers`: Define trigger phrases and their configurations
  - `model`: The AI model to use for this trigger
  - `processingEmoji`: Discord emoji ID to show while processing
  - `systemInstruction`: The system instruction to use (defined in systemInstructions)
  - `previousMessagesContext`: Number of previous messages to include as context
  - `allowNonHistoryReplyContext`: Allow context from replied messages even if not in history

## Chat Configuration
```json
"chat": {
    "maxHistoryDepth": 5
}
```
- `maxHistoryDepth`: Maximum number of messages to keep in chat history

## System Instructions
```json
"systemInstructions": {
    "default": "You are a helpful, lightweight AI assistant"
}
```
Define different system instructions that can be used with the models. Each instruction should have a unique name.

## Connector Configurations
Configure different AI service providers and their connection settings.

### Available Connectors:
- OpenAI
- Wolfram
- Groq
- TogetherAI
- Anthropic
- GoogleAI
- Tools-enabled versions of OpenAI and Anthropic

Example connector configuration:
```json
"OpenAIConnector": {
    "class": "classes/connectors/OpenAIConnector",
    "connectionOptions": {
        "url": "https://api.openai.com/v1/chat/completions",
        "apiKey": "OPENAI_KEY"
    }
}
```

For tools-enabled connectors, additional tools can be specified:
```json
"ToolsOpenAIConnector": {
    "class": "classes/connectors/ToolsOpenAIConnector",
    "connectionOptions": {
        "url": "https://api.openai.com/v1/chat/completions",
        "apiKey": "OPENAI_KEY",
        "tools": ["SearxingTool", "WolframTool"]
    }
}
```

## Tool Configurations
Configure external tools that can be used by the AI:
```json
"toolConfigurations": {
    "SearxingTool": {
        "class": "classes/tools/SearxingTool"
    },
    "WolframTool": {
        "class": "classes/tools/WolframTool"
    }
}
```

## Model Configurations
Define different AI models and their settings. Each model configuration includes:

- `connector`: The connector to use for this model
- `displayName`: Human-readable name for the model
- `defaultSystemInstructionName`: Default system instruction to use
- `systemInstructionAllowed`: Whether custom system instructions are allowed
- `images`: Configuration for image support
  - `supported`: Whether the model supports image input
- `generationOptions`: Model-specific generation options
  - `model`: The specific model identifier
  - Additional options like `max_tokens`, `reasoning_effort`, etc.

Example model configuration:
```json
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
```

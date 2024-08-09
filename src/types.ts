import {
    AnySelectMenuInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    Interaction,
    MessageContextMenuCommandInteraction,
    ModalSubmitInteraction,
    RESTPostAPIApplicationCommandsJSONBody,
    UserContextMenuCommandInteraction
} from "discord.js";
import { DiscordBotClient } from "./classes/client";

export enum StoreTypes {
    COMMANDS,
    COMPONENTS,
    CONTEXTS,
    MODALS
}

export interface StoreInitOptions {
    files_folder: string
    load_classes_on_init?: boolean,
    storetype: StoreTypes
}

export interface CommandInitOptions {
    name: string,
    command_data: RESTPostAPIApplicationCommandsJSONBody,
    staff_only: boolean,
}


export interface CustomIDInitOptions {
    name: string,
    staff_only?: boolean,
    regex: RegExp,
}

export interface BaseContextInitOptions {
    interaction: Interaction,
    client: DiscordBotClient
}

export interface CommandContextInitOptions extends BaseContextInitOptions {
    interaction: ChatInputCommandInteraction
}

export interface UserContextContextInitOptions extends BaseContextInitOptions {
    interaction: UserContextMenuCommandInteraction
}

export interface MessageContextContextInitOptions extends BaseContextInitOptions {
    interaction: MessageContextMenuCommandInteraction
}

export interface ButtonContextInitOptions extends BaseContextInitOptions {
    interaction: ButtonInteraction
}

export interface SelectMenuContextInitOptions extends BaseContextInitOptions {
    interaction: AnySelectMenuInteraction
}

export interface ModalContextInitOptions extends BaseContextInitOptions {
    interaction: ModalSubmitInteraction
}

export interface AutocompleteContextInitOptions extends BaseContextInitOptions {
    interaction: AutocompleteInteraction
}

export interface HeyMessageData {
    index: number,
    message_id: string,
    trigger_name: string,
    user_content: string,
    assistant_content: string,
    parent_message_id: string,
    user_id: string,
}

export interface ChatMessageData {
    index: number,
    message_id: string,
    model_name: string,
    system_instruction_name: string,
    user_content: string,
    assistant_content: string,
    parent_message_id: string,
    user_id: string,
}
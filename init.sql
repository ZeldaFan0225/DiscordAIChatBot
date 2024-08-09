CREATE TABLE IF NOT EXISTS hey_messages (
    index SERIAL,
    message_id VARCHAR(50) PRIMARY KEY,
    trigger_name VARCHAR(1000) NOT NULL,
    user_content text NOT NULL,
    assistant_content text NOT NULL,
    user_id VARCHAR(50),
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    parent_message_id VARCHAR(50) REFERENCES hey_messages(message_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
    index SERIAL,
    message_id VARCHAR(50) PRIMARY KEY,
    model_name VARCHAR(1000) NOT NULL,
    system_instruction_name VARCHAR(1000) NOT NULL,
    user_content text NOT NULL,
    assistant_content text NOT NULL,
    user_id VARCHAR(50),
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    parent_message_id VARCHAR(50) REFERENCES chat_messages(message_id)
);
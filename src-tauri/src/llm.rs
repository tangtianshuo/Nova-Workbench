//! Provider-agnostic Rig integration for Phase 9 chat and tool use.
//!
//! `generate_project` continues to use [`stream_generate`] and its DeepSeek-only
//! prompt contract. The chat path below deliberately uses concrete provider
//! branches because rig-core 0.41's completion model types are provider-specific.
//! Rust only forwards model output; tool execution remains in the JS webview
//! (D-05).

use std::collections::HashMap;

use futures::StreamExt;
use rig_core::client::{CompletionClient, Nothing};
use rig_core::completion::{CompletionModel, CompletionRequestBuilder, Message, ToolDefinition};
use rig_core::providers::{anthropic, deepseek, gemini, ollama, openai};
use rig_core::streaming::{StreamedAssistantContent, ToolCallDeltaContent};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

use crate::commands::StreamChunk;
use crate::error::AppError;

// D-24: system_instruction is program-constructed (no user input).
// user_prompt + files_context go ONLY into the user message. This is the basic
// prompt-injection mitigation called out in CONTEXT.md SEC-07.
const SYSTEM_INSTRUCTION: &str = "You are a senior PM assistant. Generate a structured project plan with milestones and tasks as JSON matching the requested schema. Output only JSON, no markdown fences.";

/// Providers exposed by Settings and the chat IPC command.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    DeepSeek,
    OpenAI,
    Anthropic,
    Gemini,
    Ollama,
}

impl Provider {
    pub const ALL: [Self; 5] = [
        Self::DeepSeek,
        Self::OpenAI,
        Self::Anthropic,
        Self::Gemini,
        Self::Ollama,
    ];

    pub const fn key(self) -> &'static str {
        match self {
            Self::DeepSeek => "deepseek",
            Self::OpenAI => "openai",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
            Self::Ollama => "ollama",
        }
    }

    pub const fn requires_api_key(self) -> bool {
        !matches!(self, Self::Ollama)
    }
}

impl std::fmt::Display for Provider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.key())
    }
}

/// A simple text chat message accepted at the Tauri boundary.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Final result returned by the chat command after streaming finishes.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct ChatResult {
    pub content: String,
    pub tool_calls: Vec<ToolCallInfo>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct ToolCallInfo {
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Default)]
struct ToolCallDeltaAccumulator {
    name: Option<String>,
    arguments: String,
}

/// Stream a DeepSeek project-generation completion for the existing
/// `generate_project` command.
pub async fn stream_generate(
    api_key: &str,
    user_prompt: String,
    files_context: String,
    on_token: &Channel<StreamChunk>,
    cancel: &CancellationToken,
) -> Result<String, AppError> {
    // api_key clones into the rig client builder (it needs 'static). We do not
    // cache the client because the key can change between calls.
    let client = deepseek::Client::new(api_key.to_string())
        .map_err(|e| AppError::InternalError(format!("rig client init: {}", e)))?;
    let model = client.completion_model(deepseek::DEEPSEEK_V4_FLASH);

    let user_content = if files_context.is_empty() {
        user_prompt
    } else {
        format!("{}\n\nFiles context:\n{}", user_prompt, files_context)
    };

    let mut stream = CompletionRequestBuilder::new(model, user_content)
        .preamble(SYSTEM_INSTRUCTION.to_string())
        .stream()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    let mut full = String::new();
    while let Some(item) = stream.next().await {
        if cancel.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        match item {
            Ok(StreamedAssistantContent::Text(text)) => {
                full.push_str(&text.text);
                let _ = on_token.send(StreamChunk::Token { text: text.text });
            }
            Ok(_) => continue,
            Err(e) => {
                let _ = on_token.send(StreamChunk::Error {
                    message: e.to_string(),
                });
                return Err(AppError::ParseError(e.to_string()));
            }
        }
    }
    Ok(full)
}

/// Stream a chat completion for any provider supported by rig-core 0.41.
///
/// The `tools_json` values are converted to rig's `ToolDefinition`; they are
/// never executed by this function. The returned `ToolCallInfo` values and the
/// matching stream chunks are the hand-off to the JS tool loop.
pub async fn chat_with_tools(
    provider: Provider,
    api_key: &str,
    messages: Vec<ChatMessage>,
    tools_json: Vec<serde_json::Value>,
    system_prompt: String,
    on_token: &Channel<StreamChunk>,
    cancel: &CancellationToken,
) -> Result<ChatResult, AppError> {
    let tools = parse_tool_definitions(tools_json)?;
    let (prompt, history) = split_messages(messages)?;

    match provider {
        Provider::DeepSeek => {
            let client = deepseek::Client::new(api_key.to_string())
                .map_err(|e| provider_init_error("deepseek", e))?;
            stream_model(
                client.completion_model(deepseek::DEEPSEEK_V4_FLASH),
                prompt,
                history,
                tools,
                system_prompt,
                on_token,
                cancel,
            )
            .await
        }
        Provider::OpenAI => {
            let client = openai::Client::new(api_key.to_string())
                .map_err(|e| provider_init_error("openai", e))?;
            stream_model(
                client.completion_model(openai::GPT_4O_MINI),
                prompt,
                history,
                tools,
                system_prompt,
                on_token,
                cancel,
            )
            .await
        }
        Provider::Anthropic => {
            let client = anthropic::Client::new(api_key.to_string())
                .map_err(|e| provider_init_error("anthropic", e))?;
            stream_model(
                client.completion_model(anthropic::completion::CLAUDE_SONNET_4_6),
                prompt,
                history,
                tools,
                system_prompt,
                on_token,
                cancel,
            )
            .await
        }
        Provider::Gemini => {
            let client = gemini::Client::new(api_key.to_string())
                .map_err(|e| provider_init_error("gemini", e))?;
            stream_model(
                client.completion_model(gemini::completion::GEMINI_2_5_FLASH),
                prompt,
                history,
                tools,
                system_prompt,
                on_token,
                cancel,
            )
            .await
        }
        Provider::Ollama => {
            // rig-core's Ollama `Client::new` takes an API key, not a URL. Using
            // Nothing preserves its documented default http://localhost:11434.
            let client =
                ollama::Client::new(Nothing).map_err(|e| provider_init_error("ollama", e))?;
            // Keep llama3.2 as the default, while allowing local installations
            // to select an already-pulled model without persisting model names.
            let model_name = std::env::var("NOVA_OLLAMA_MODEL")
                .or_else(|_| std::env::var("OLLAMA_MODEL"))
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| ollama::LLAMA3_2.to_string());
            stream_model(
                client.completion_model(model_name),
                prompt,
                history,
                tools,
                system_prompt,
                on_token,
                cancel,
            )
            .await
        }
    }
}

fn provider_init_error(provider: &str, error: impl std::fmt::Display) -> AppError {
    AppError::InternalError(format!("{} client init: {}", provider, error))
}

fn split_messages(messages: Vec<ChatMessage>) -> Result<(Message, Vec<Message>), AppError> {
    let mut converted = messages
        .into_iter()
        .map(|message| match message.role.to_ascii_lowercase().as_str() {
            "system" => Ok(Message::system(message.content)),
            "user" => Ok(Message::user(message.content)),
            "assistant" => Ok(Message::assistant(message.content)),
            role => Err(AppError::ParseError(format!(
                "unsupported chat message role: {}",
                role
            ))),
        })
        .collect::<Result<Vec<_>, _>>()?;

    let prompt = converted
        .pop()
        .ok_or_else(|| AppError::ParseError("chat requires at least one message".into()))?;
    Ok((prompt, converted))
}

fn parse_tool_definitions(tools: Vec<serde_json::Value>) -> Result<Vec<ToolDefinition>, AppError> {
    tools
        .into_iter()
        .map(|tool| {
            let object = tool
                .as_object()
                .ok_or_else(|| AppError::ParseError("tool schema must be a JSON object".into()))?;
            let function = object
                .get("function")
                .and_then(serde_json::Value::as_object)
                .unwrap_or(object);
            let name = function
                .get("name")
                .and_then(serde_json::Value::as_str)
                .filter(|name| !name.is_empty())
                .ok_or_else(|| AppError::ParseError("tool schema is missing name".into()))?;
            let description = function
                .get("description")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            let parameters = function
                .get("parameters")
                .or_else(|| function.get("input_schema"))
                .cloned()
                .unwrap_or_else(|| serde_json::json!({"type": "object"}));

            Ok(ToolDefinition {
                name: name.to_string(),
                description: description.to_string(),
                parameters,
            })
        })
        .collect()
}

async fn stream_model<M: CompletionModel>(
    model: M,
    prompt: Message,
    history: Vec<Message>,
    tools: Vec<ToolDefinition>,
    system_prompt: String,
    on_token: &Channel<StreamChunk>,
    cancel: &CancellationToken,
) -> Result<ChatResult, AppError> {
    let mut request = CompletionRequestBuilder::new(model, prompt)
        .messages(history)
        // rig-core 0.41 calls this method `tools`; there is no `tools_vec` API.
        .tools(tools);
    if !system_prompt.is_empty() {
        request = request.preamble(system_prompt);
    }

    let mut stream = request
        .stream()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;
    let mut content = String::new();
    let mut tool_calls = Vec::new();
    let mut deltas: HashMap<String, ToolCallDeltaAccumulator> = HashMap::new();

    while let Some(item) = stream.next().await {
        if cancel.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        match item {
            Ok(StreamedAssistantContent::Text(text)) => {
                content.push_str(&text.text);
                let _ = on_token.send(StreamChunk::Token { text: text.text });
            }
            Ok(StreamedAssistantContent::ToolCall { tool_call, .. }) => {
                let info = ToolCallInfo {
                    name: tool_call.function.name,
                    arguments: tool_call.function.arguments,
                };
                deltas.retain(|_, delta| delta.name.as_deref() != Some(info.name.as_str()));
                let _ = on_token.send(StreamChunk::ToolCall {
                    name: info.name.clone(),
                    arguments: info.arguments.clone(),
                });
                tool_calls.push(info);
            }
            Ok(StreamedAssistantContent::ToolCallDelta {
                internal_call_id,
                content: delta,
                ..
            }) => {
                let accumulator = deltas.entry(internal_call_id).or_default();
                match delta {
                    ToolCallDeltaContent::Name(name) => accumulator.name = Some(name),
                    ToolCallDeltaContent::Delta(arguments) => {
                        accumulator.arguments.push_str(&arguments)
                    }
                }
            }
            Ok(_) => continue,
            Err(error) => {
                let message = error.to_string();
                let _ = on_token.send(StreamChunk::Error {
                    message: message.clone(),
                });
                return Err(AppError::NetworkError(message));
            }
        }
    }

    // Some providers expose only deltas in their streaming adapter. Emit a
    // complete call once the argument JSON becomes valid, avoiding malformed
    // partial tool requests at the JS boundary.
    for accumulator in deltas.into_values() {
        let Some(name) = accumulator.name else {
            continue;
        };
        // ponytail: empty/blank argument delta means the tool takes no args
        // (e.g. listProducts with z.object({})). from_str("") would fail and
        // silently drop the call — LLM then loops until MAX_ITERATIONS because
        // it thinks the call never executed. Treat empty as `{}`.
        let trimmed = accumulator.arguments.trim();
        let arguments = if trimmed.is_empty() {
            serde_json::Value::Object(serde_json::Map::new())
        } else {
            match serde_json::from_str(trimmed) {
                Ok(value) => value,
                Err(_) => continue,
            }
        };
        let info = ToolCallInfo { name, arguments };
        let _ = on_token.send(StreamChunk::ToolCall {
            name: info.name.clone(),
            arguments: info.arguments.clone(),
        });
        tool_calls.push(info);
    }

    Ok(ChatResult {
        content,
        tool_calls,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_serializes_to_lowercase_wire_names() {
        let values = Provider::ALL
            .into_iter()
            .map(|provider| serde_json::to_string(&provider).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            values,
            vec![
                "\"deepseek\"",
                "\"openai\"",
                "\"anthropic\"",
                "\"gemini\"",
                "\"ollama\""
            ]
        );
    }

    #[test]
    fn provider_display_is_keychain_safe() {
        assert_eq!(Provider::DeepSeek.to_string(), "deepseek");
        assert_eq!(Provider::OpenAI.to_string(), "openai");
        assert!(!Provider::Ollama.requires_api_key());
    }

    #[test]
    fn direct_and_openai_tool_schemas_are_accepted() {
        let tools = parse_tool_definitions(vec![
            serde_json::json!({
                "name": "direct",
                "description": "Direct schema",
                "parameters": {"type": "object"}
            }),
            serde_json::json!({
                "type": "function",
                "function": {
                    "name": "wrapped",
                    "description": "Wrapped schema",
                    "parameters": {"type": "object"}
                }
            }),
        ])
        .unwrap();
        assert_eq!(tools[0].name, "direct");
        assert_eq!(tools[1].name, "wrapped");
    }

    #[test]
    fn system_instruction_is_const_and_mentions_json() {
        let _is_static: &'static str = SYSTEM_INSTRUCTION;
        assert!(SYSTEM_INSTRUCTION.to_lowercase().contains("json"));
        assert!(!SYSTEM_INSTRUCTION.contains("{user") && !SYSTEM_INSTRUCTION.contains("{}"));
    }

    #[tokio::test]
    async fn cancellation_token_observed() {
        let token = CancellationToken::new();
        assert!(!token.is_cancelled());
        token.cancel();
        assert!(token.is_cancelled());
    }

    #[tokio::test]
    #[ignore = "requires a running Ollama instance and a tool-capable local model"]
    async fn ollama_real_tool_call_uat() {
        let channel = Channel::new(|_| Ok(()));
        let cancel = CancellationToken::new();
        let result = chat_with_tools(
            Provider::Ollama,
            "",
            vec![ChatMessage {
                role: "user".into(),
                content: "Create a high-priority task titled Local Ollama UAT due 2026-08-20."
                    .into(),
            }],
            vec![serde_json::json!({
                "type": "function",
                "function": {
                    "name": "createTask",
                    "description": "Create a task",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": { "type": "string" },
                            "priority": {
                                "type": "string",
                                "enum": ["low", "medium", "high"]
                            },
                            "deadline": { "type": "string" }
                        },
                        "required": ["title", "priority", "deadline"]
                    }
                }
            })],
            "Use createTask when the user asks to create a task.".into(),
            &channel,
            &cancel,
        )
        .await
        .expect("Ollama chat request should complete");

        let call = result
            .tool_calls
            .iter()
            .find(|call| call.name == "createTask")
            .expect("Ollama should request createTask");
        assert_eq!(call.arguments["title"], "Local Ollama UAT");
        assert_eq!(call.arguments["priority"], "high");
        assert_eq!(call.arguments["deadline"], "2026-08-20");
    }
}

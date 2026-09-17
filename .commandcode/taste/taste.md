# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# communication
- Respond to the user in Spanish; all user messages are in Spanish and the assistant should reply in Spanish. Confidence: 0.80

# workflow
- Apply edits to the same file sequentially (one edit_file at a time), never as parallel tool calls, to avoid parallel writes clobbering each other's changes. Confidence: 0.65
- Orchestrate implementation/fix tasks with agents rather than doing changes directly (project uses an explicit multi-agent owner contract in docs/architecture.md). Confidence: 0.70

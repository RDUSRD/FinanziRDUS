# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# communication
- Respond to the user in Spanish; all user messages are in Spanish and the assistant should reply in Spanish. He will explicitly correct a reply that drifts out of Spanish ("Dimelo en spanish"), so never switch languages mid-conversation. His requests are terse and informal, often with typos/abbreviations ("para verlo desde el tlf", "como puedo prender el destokp nodo"), and he expects a short, concrete, action-oriented answer rather than a long lecture. Confidence: 0.9
- Beyond just getting things fixed, he explicitly wants to understand the machinery: he opens with "quiero que me expliques cómo hacer…" and expects a conceptual walkthrough of how the system works (the data-flow through the layers) plus a copy-pasteable command reference grouped by layer, and a triage section for when things fail by symptom. He'll still accept an offer to have it applied for him afterward (he bundles both in one ask: e.g. resetting the DB "para poder probar la app", "y quiero que me digas tambien como funciona"). Confidence: 0.75

# workflow
See [workflow/taste.md](workflow/taste.md)
# tooling
See [tooling/taste.md](tooling/taste.md)
# frontend
See [frontend/taste.md](frontend/taste.md)

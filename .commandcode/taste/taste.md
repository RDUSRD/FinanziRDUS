# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# communication
- Respond to the user in Spanish; all user messages are in Spanish and the assistant should reply in Spanish. His requests are terse and informal, often with typos/abbreviations ("para verlo desde el tlf", "como puedo prender el destokp nodo"), and he expects a short, concrete, action-oriented answer rather than a long lecture. Confidence: 0.80
- Beyond just getting things fixed, he wants to understand the machinery: he asks for a conceptual walkthrough of how the system works (data-flow through the layers) plus a copy-pasteable command reference grouped by layer, and a triage section for when things fail. Confidence: 0.55

# workflow
See [workflow/taste.md](workflow/taste.md)
# tooling
See [tooling/taste.md](tooling/taste.md)
# frontend
- Prefer pagination + filtering over long single-page scrolling lists; user dislikes pages that stretch long ("no me gusta alargado") and wants general search in list views. Confidence: 0.65
- Error messages must reach assistive tech (aria-invalid + aria-describedby, live region); exactly one role="status" live region; contrast verified numerically, not by eye. Confidence: 0.65
- Project-specific visual world: after the dark "pizarra de la tasa", the user explicitly chose "La Factura del Mes" in an impeccable decision round — the month as a white invoice bound like a savings passbook (cool-white paper, print ink, Libre Franklin + Chivo Mono, square corners everywhere), with stamp red ONLY for loss/excess/the single action plate, ballpoint blue for bolívar (Bs) amounts, and highlighter only as a background stroke behind ink. Treat the dark pizarra as the incumbent to replace, not a constraint. Confidence: 0.70
- Prefer modal windows (Window primitive) for forms, destructive confirmations and import; never use window.confirm. Confidence: 0.70

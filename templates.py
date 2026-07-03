"""
Format templates — the "proven formats" layer.

A template is a JSON slot schema; the editor renders slots as editable fields,
Gemini can autofill them from a niche + brand profile, and the renderers
(composer.py / slideshow.py) turn filled slots into media. Templates are data,
so adding format #5 later is cheap.
"""
import json
from google import genai

MOCK_HOOKS = [
    "POV: you finally found a fitness app that plans FOR you 🤯",
    "I deleted every fitness app except this one",
    "3 signs your workout app is wasting your time",
    "This AI just replaced my $200/mo personal trainer",
    "Nobody talks about why workout plans fail by week 3",
    "The fitness app hack I wish I knew a year ago",
    "Stop paying for workout plans. Do this instead.",
    "My gym progress after 30 days of letting AI plan everything",
]

TEMPLATES = [
    {
        "key": "hook_demo",
        "name": "Hook + Demo",
        "description": "A bold hook card stitched before (or overlaid on) your app demo footage, with an optional CTA end-card.",
        "kind": "video",
        "slots": {
            "hook_text": {"type": "text", "label": "Hook text", "required": True},
            "style": {"type": "choice", "label": "Hook style", "options": ["preroll", "overlay"], "default": "preroll"},
            "cta_text": {"type": "text", "label": "CTA end-card text", "default": ""},
        },
    },
    {
        "key": "listicle",
        "name": "Listicle slideshow",
        "description": "Good-better-best list for your niche — your app is always the payoff slide. Exports a photo set + MP4.",
        "kind": "slideshow",
        "slots": {
            "title": {"type": "text", "label": "Title slide", "required": True},
            "items": {"type": "list", "label": "Items (last one = yours)", "min": 3, "max": 6,
                      "item_fields": {"name": "Name", "note": "One-liner"}},
            "cta_text": {"type": "text", "label": "CTA slide text", "default": ""},
        },
    },
    {
        "key": "before_after",
        "name": "Before / After",
        "description": "Two-panel transformation story — the classic fitness format. Exports a photo set + MP4.",
        "kind": "slideshow",
        "slots": {
            "title": {"type": "text", "label": "Title slide", "required": True},
            "before_text": {"type": "text", "label": "Before", "required": True},
            "after_text": {"type": "text", "label": "After", "required": True},
            "cta_text": {"type": "text", "label": "CTA slide text", "default": ""},
        },
    },
    {
        "key": "ai_talking_head",
        "name": "AI talking-head ad",
        "description": "An AI actor pitches your product — research → script → actor → voice → video. Runs in the AI Actor Ads studio.",
        "kind": "external",
        "slots": {},
        "route": "saasshorts",
    },
]


def get_templates():
    return TEMPLATES


def get_template(key):
    for t in TEMPLATES:
        if t["key"] == key:
            return t
    return None


def suggest_hooks(api_key, product_desc, niche="", n=8, mock=False):
    """Viral hook lines grounded in the founder's product (ReelFarm-style, but brand-aware)."""
    if mock:
        return MOCK_HOOKS[:n]

    client = genai.Client(api_key=api_key)
    prompt = f"""You write scroll-stopping TikTok hooks for short-form UGC marketing.

Product: {product_desc}
Niche: {niche or 'general'}

Write {n} hook lines (max 90 chars each) using proven patterns: POV, listicle teases
("3 signs..."), curiosity gaps, bold claims, before/after teases. No hashtags, no quotes.
Return ONLY a JSON array of {n} strings."""
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    try:
        hooks = json.loads(response.text)
        return [str(h) for h in hooks][:n]
    except Exception:
        return MOCK_HOOKS[:n]


def autofill_slots(api_key, template_key, niche, brand=None, mock=False):
    """Fill a template's slots from a niche prompt, injecting the founder's app as the winner."""
    template = get_template(template_key)
    if template is None:
        raise ValueError(f"Unknown template: {template_key}")

    brand_name = (brand or {}).get("name") or "My App"
    brand_tagline = (brand or {}).get("tagline") or ""
    brand_cta = (brand or {}).get("cta_text") or f"Get {brand_name} free"

    if mock:
        if template_key == "listicle":
            return {
                "title": f"{(niche or 'fitness apps').capitalize()} that actually work in 2026",
                "items": [
                    {"name": "Strava", "note": "the social one"},
                    {"name": "Whoop", "note": "the data one"},
                    {"name": brand_name, "note": brand_tagline or "the one that plans it FOR you ⭐"},
                ],
                "cta_text": brand_cta,
            }
        if template_key == "before_after":
            return {
                "title": f"30 days of {brand_name}",
                "before_text": "Guessing my workouts, skipping half the week",
                "after_text": f"A plan that adapts to me — every single day",
                "cta_text": brand_cta,
            }
        return {"hook_text": MOCK_HOOKS[0], "cta_text": brand_cta}

    client = genai.Client(api_key=api_key)
    prompt = f"""You fill short-form content templates for UGC marketing.

Template: {template['name']} — {template['description']}
Slot schema: {json.dumps(template['slots'])}
Niche: {niche}
The founder's product (must appear as the FINAL list item / the payoff / the answer):
  name: {brand_name}
  tagline: {brand_tagline}
  cta: {brand_cta}

Fill every slot with punchy, TikTok-native copy (short lines, no hashtags).
For "items" lists: 3-5 well-known real products in the niche first, the founder's
product LAST with the most compelling note (add a ⭐).
Return ONLY a JSON object matching the slot schema (lists as arrays of objects)."""
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    return json.loads(response.text)

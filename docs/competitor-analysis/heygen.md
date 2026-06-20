# HeyGen

> The market-leading AI avatar video platform: turn a single photo or a short webcam clip into a reusable, photorealistic "Digital Twin" that talks, gestures, and speaks 175+ languages from a typed script.

| | |
|---|---|
| **Website** | https://www.heygen.com |
| **Category** | Core AI UGC |
| **Pricing (June 2026)** | Free $0/mo (3 videos/mo, ~1 min each, watermark, 720p); Creator ~$29/mo (~$24/mo annual, unlimited videos, 1080p, voice clone, watermark removed); Pro ~$49–$99/mo (1080p–4K — price varies by source); Business $149/mo + $20/seat (4K, 5+ custom avatars, SSO); Enterprise custom. Plans are credit-metered on top of the base fee. |
| **Best known for** | Photorealistic talking-head AI avatars ("Digital Twins") and AI video translation |

## What they do

HeyGen is an AI video platform whose core product is the **AI avatar (or "Digital Twin")**: a lifelike, talking version of a real person that can deliver any script you type, without filming. A user creates an avatar once — from as little as a single photo or a ~15-second to 2-minute webcam recording — and then generates unlimited videos by typing a script (or uploading audio), choosing a voice, and hitting render. The avatar lip-syncs, produces facial micro-expressions, and (in the newer models) gestures with its hands in time with the speech. This collapses the entire "shoot a talking-head video" workflow into a text box.

HeyGen offers several avatar-creation pathways at different realism/effort tradeoffs: **Avatar IV** (one photo, no training, talking head with gestures), **Photo Avatar / Custom Photo Avatar** (10–15 still images, trained), the **Hyper-Realistic Avatar / Digital Twin** (a 2-minute video upload plus identity-consent verification — the most realistic motion and voice), and **fully AI-generated avatars** (from a text prompt, no real person). The newest model, **Avatar V**, captures your specific motion, gestures, and cadence from a ~15-second reference video and lets you apply that motion to *any* photo of yourself — so the appearance is flexible but "the motion is unmistakably yours." (Sources: [Custom Avatars pathways](https://community.heygen.com/public/resources/custom-avatars-how-to-create-digital-twins-or-fully-ai-generated-avatars), [Avatar IV](https://www.heygen.com/avatars/avatar-iv), [Avatar V guide](https://community.heygen.com/public/resources/how-to-use-avatar-v-to-create-a-realistic-ai-avatar-from-a-15-second-video).)

The second pillar is **AI video translation**: HeyGen translates an existing video into 175+ languages, cloning the speaker's voice and re-syncing their lips so they appear to natively speak the new language. Voice cloning and text-to-speech are likewise available in 175+ languages, so a single avatar + script can be fanned out into many localized versions at once. ([HeyGen Translate](https://www.heygen.com/translate).)

The most strategically relevant piece for OpenShorts is HeyGen's **"one character, many looks"** model. Rather than treating every outfit/background/angle as a separate avatar, HeyGen consolidates all variations of the same person into **one avatar identity ("group") that holds up to 500 "looks."** A "look" is a distinct variation — different background, wardrobe, camera angle, or stance — all tied to the same face/identity. Looks can be created two ways: by uploading new footage of the person, or by AI-**generating** new outfits/settings from photos plus a text prompt ("Generate Looks"). This is exactly the "reuse one consistent character across many pieces of content" mental model OpenShorts is pursuing. ([Avatar Looks Explained](https://help.heygen.com/en/articles/9964694-avatar-looks-explained), [Generate Looks](https://community.heygen.com/public/resources/generate-looks-photo-avatars).)

## Core workflow

1. **Pick a creation pathway.** Choose Avatar IV (1 photo, fastest), Custom Photo Avatar (10–15 photos, trained), Hyper-Realistic Digital Twin (2-min video + consent), or a fully AI-generated avatar from text.
2. **Provide the input + consent.** Upload the photo/footage. For realistic Digital Twins, record a consent video featuring the same person (HeyGen blocks third-party / non-consented footage and AIGC-sourced content).
3. **(No training for Avatar IV/V.)** Avatar IV and Avatar V require no training — upload and go. Photo Avatars require a "Train Model" step on 10+ photos.
4. **Add looks under the one character.** Within that single avatar identity, add additional looks — upload more footage, or use "Design with AI" / "Generate Looks": give a reference look + a text prompt (e.g. "put avatar in a Christmas sweater in front of a Christmas tree") to spin up new outfits/backgrounds. Up to 500 looks per avatar; delete/recreate freely.
5. **Clone your voice (optional).** Each avatar can include a cloned voice that becomes its default TTS voice; you can also tune it in the TTS section.
6. **Write the script & generate.** Type a script (or upload audio), pick a voice/language, pick a look, render. Avatar IV reads vocal tone/rhythm to drive expressions and gestures.
7. **Translate / fan out.** Optionally translate the rendered video into 175+ languages with cloned voice + re-synced lips, producing many localized versions from one source.
8. **Export & distribute.** Download (watermarked on Free; 1080p/4K on paid tiers) for social, ads, training, etc.

## Key features

- **Avatar IV** — talking avatar from a **single photo, no training**; audio-to-expression engine drives lip sync, micro-expressions, head tilts, and hand gestures; handles tilted/profile/angled photos; works on humans, anime, cartoons, animals. Output up to 1080p / "1280p+ HD"; max ~3 min per run, single speaker.
- **Avatar V** — captures *your* motion/gestures/cadence from a ~15-second reference video, then applies that motion to any photo of you (flexible appearance, consistent identity).
- **Digital Twin / Hyper-Realistic Avatar** — most realistic appearance, motion, voice, and lip sync, built from a ~2-minute video upload + identity-consent verification.
- **"One character, many looks"** — a single avatar identity holds **up to 500 looks** (photo + video combined), each a different outfit/background/angle/stance, all tied to the same face.
- **Generate Looks** — AI-create new outfits and surroundings from photos + a text prompt (premium-credit cost); optional motion ("Consistent" vs "Expressive") and ambient sound effects.
- **Voice cloning + TTS in 175+ languages** — clone the avatar's voice; type once, generate in many languages.
- **AI video translation** — translate existing videos into 175+ languages with voice clone + lip re-sync.
- **1,100+ stock avatars** and template library for users who don't want a custom twin.
- **Developer API** — programmatic avatar/look creation and video generation (passing a *look ID* as `avatar_id`); photo-avatar group training endpoints.

## Output / content types

- Talking-head / talking-photo avatar videos (portrait and full-body).
- Multilingual versions of the same video (175+ languages) via translation or multi-language generation.
- Non-human talking avatars (anime, cartoons, mascots, animals).
- Resolutions from 720p (Free) up to 1080p (Creator/Pro) and 4K (Business/Enterprise).
- Per-clip length capped by tier (Free ~1 min/15s for Avatar IV; paid up to 30–60 min).
- Aspect-ratio flexibility for social (suitable for ads, Reels/Shorts/TikTok, L&D, marketing).

## Strengths

- **Best-in-class avatar realism** — Avatar IV/V gestures and emotion-driven micro-expressions are noticeably ahead of typical "type-to-talking-head" tools.
- **Extremely low input requirement** — a usable avatar from a single photo (Avatar IV) or a 15-second clip (Avatar V), with **no training step** for those models.
- **The "one identity, many looks" model is excellent** — 500 looks per character keeps brand/identity consistent while allowing infinite wardrobe/background variation; delete/recreate freely.
- **Generate-Looks lets you create new outfits/settings from text** — no reshoot needed to get a new look.
- **Translation + voice cloning at 175+ languages** is a genuine moat for global/localized content.
- **Mature ecosystem** — large stock-avatar library, templates, API, and broad enterprise adoption.

## Weaknesses & gaps

- **Talking-head-shaped product.** Output is fundamentally a person talking to camera. It does **not** show real product UI, screen recordings, b-roll, or edited multi-shot short-form sequences — exactly the things UGC ads and shorts often need.
- **Single-speaker per generation.** Avatar IV can't do multi-character scenes in one render.
- **Credit metering is the recurring complaint.** Premium credits burn fast (reportedly ~1 credit per 3 seconds of Avatar IV ≈ 20 credits/min), credits **don't roll over**, and re-rendering after an edit re-charges the full cost — making iteration expensive. Plan credit amounts also vary by source/date (e.g. Creator listed as 200 or 600 credits), so the real per-video cost is hard to predict.
- **Consent/verification friction.** Realistic Digital Twins require a consent video of the same person and block third-party or AIGC-sourced footage — slower and more gated than a casual UGC flow.
- **Free tier is thin** — ~3 videos/month, ~1 minute each, watermarked, 720p (down from 3 minutes in 2025).
- **Length limits per tier** and daily render caps that aren't fully transparent on the pricing page.

## Relevant to OpenShorts (steal / avoid)

- **Steal:**
  - **The "one character, many looks" mental model is the headline takeaway.** Model identity as a *single character* that owns many *looks* (outfit / background / angle / setting), not as a pile of separate avatars. Cap looks generously (HeyGen allows 500) and let users add/delete looks freely so identity stays locked while appearance varies — this is precisely OpenShorts' "reuse a character across content for consistency" idea, already validated in market.
  - **Avatar-from-one-photo, no training.** The lowest-friction on-ramp wins: let a user create a reusable character from a single photo (or a short webcam clip) with zero training/wait, the way Avatar IV/V do. Make the "create once, reuse forever" promise explicit.
  - **Generate new looks from text.** Let users spin up a new outfit/setting from a reference image + a prompt ("avatar in a kitchen, casual sweater") instead of reshooting — a strong, low-effort way to keep one character fresh across many shorts.
  - **Voice clone tied to the character** so the character's voice is consistent and reusable alongside its look library.
- **Avoid / their gap we exploit:**
  - **Don't be a talking-head-only tool.** OpenShorts already does real video reframing, scene detection, subtitles, hooks, and short-form editing — combine a *reusable character* with actual product footage / b-roll / multi-shot UGC ad structure, which HeyGen can't produce.
  - **Avoid punitive credit metering.** HeyGen's non-rolling credits and re-charge-on-re-render frustrate iterative creators; predictable/iteration-friendly pricing is a wedge.
  - **Lower the consent/verification wall for casual UGC** while still being responsible — HeyGen's gated Digital Twin flow is heavier than a creator-first shorts tool needs.

## What I like

> _TODO (founder to fill in)_

## Out of scope

> _TODO (founder to fill in)_

## Sources

- [Avatar Looks Explained — HeyGen Help Center](https://help.heygen.com/en/articles/9964694-avatar-looks-explained) — accessed June 2026
- [Generate Looks: change your avatar's outfits and surroundings using only photos and text — HeyGen Community](https://community.heygen.com/public/resources/generate-looks-photo-avatars) — accessed June 2026
- [Custom Avatars: HeyGen's 4 creation pathways explained — HeyGen Community](https://community.heygen.com/public/resources/custom-avatars-how-to-create-digital-twins-or-fully-ai-generated-avatars) — accessed June 2026
- [Introducing Avatar IV: Create talking Avatars from a single photo — HeyGen Community](https://community.heygen.com/public/resources/introducing-avatar-iv-create-talking-avatars-from-a-single-photo) — accessed June 2026
- [Create Talking Photo Avatars in 1280p+ HD Resolution (Avatar IV) — HeyGen](https://www.heygen.com/avatars/avatar-iv) — accessed June 2026
- [How to use Avatar V to create a realistic AI Avatar from a 15-second video — HeyGen Community](https://community.heygen.com/public/resources/how-to-use-avatar-v-to-create-a-realistic-ai-avatar-from-a-15-second-video) — accessed June 2026
- [Digital Twin (Video Avatar) FAQ — HeyGen Help Center](https://help.heygen.com/en/articles/9380615-digital-twin-video-avatar-faq) — accessed June 2026
- [Create Avatar — HeyGen Developer Documentation](https://developers.heygen.com/docs/create-avatar) — accessed June 2026
- [HeyGen AI Video Translator: Translate Videos into 175+ Languages](https://www.heygen.com/translate) — accessed June 2026
- [HeyGen Pricing 2026 — Arcade Blog](https://www.arcade.software/post/heygen-pricing) — accessed June 2026
- [HeyGen Pricing 2026: Free vs. Creator vs. Business — Flowith Blog](https://flowith.io/blog/heygen-pricing-2026-free-vs-creator-vs-business/) — accessed June 2026

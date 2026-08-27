"""
Persistence layer for ClipZoo.

Uses DATABASE_URL (Supabase Postgres, e.g. postgresql://user:pass@host:5432/postgres)
when set; falls back to a local SQLite file (data/clipzoo.db) so local dev is never
blocked on infra. Media bytes stay on disk/S3 — the DB holds metadata + state.
"""
import os
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, Column, String, Text, DateTime, Integer
from sqlalchemy.orm import declarative_base, sessionmaker

DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR}/clipzoo.db")

# Supabase gives postgres:// URLs sometimes; SQLAlchemy wants postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def _uuid():
    return uuid.uuid4().hex


def _now():
    return datetime.now(timezone.utc)


class BrandProfile(Base):
    """The founder's product (e.g. Evex) — pre-fills every template."""
    __tablename__ = "brand_profiles"
    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(120), nullable=False)
    tagline = Column(String(300), default="")
    app_store_url = Column(String(500), default="")
    website_url = Column(String(500), default="")
    cta_text = Column(String(200), default="")
    niche = Column(String(200), default="")
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "tagline": self.tagline,
            "app_store_url": self.app_store_url, "website_url": self.website_url,
            "cta_text": self.cta_text, "niche": self.niche,
        }


class Creation(Base):
    """A generated piece of content (hook+demo video, slideshow, AI ad)."""
    __tablename__ = "creations"
    id = Column(String(32), primary_key=True, default=_uuid)
    kind = Column(String(40), nullable=False)          # hook_demo | listicle | before_after | ai_talking_head
    title = Column(String(300), default="")
    template_key = Column(String(60), default="")
    slots_json = Column(Text, default="{}")            # editable template state — the re-edit loop
    video_path = Column(String(500), default="")       # web path under /videos or /mocks
    image_paths_json = Column(Text, default="[]")      # slideshow PNG set (web paths)
    status = Column(String(20), default="draft")       # draft | scheduled | published
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    def to_dict(self):
        return {
            "id": self.id, "kind": self.kind, "title": self.title,
            "template_key": self.template_key,
            "slots": json.loads(self.slots_json or "{}"),
            "video_path": self.video_path,
            "image_paths": json.loads(self.image_paths_json or "[]"),
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ScheduledPost(Base):
    """A calendar entry: either a post handed to Upload-Post with a future
    scheduled_date (method="upload_post") or a manual plan the user will post
    themselves from the app after downloading (method="manual")."""
    __tablename__ = "scheduled_posts"
    id = Column(String(32), primary_key=True, default=_uuid)
    creation_id = Column(String(32), default="")
    title = Column(String(300), default="")
    platforms_json = Column(Text, default="[]")        # ["tiktok","instagram","youtube"]
    scheduled_at = Column(String(40), nullable=False)  # ISO-8601 (as sent to Upload-Post)
    timezone_name = Column(String(60), default="UTC")
    upload_post_ref = Column(Text, default="")         # raw Upload-Post response for tracing
    status = Column(String(20), default="scheduled")   # scheduled | posted | failed | canceled | planned
    account = Column(String(120), default="")          # username/label the post goes out as
    method = Column(String(20), default="upload_post") # upload_post | manual
    note = Column(Text, default="")                    # free-form note on manual plans
    created_at = Column(DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {
            "id": self.id, "creation_id": self.creation_id, "title": self.title,
            "platforms": json.loads(self.platforms_json or "[]"),
            "scheduled_at": self.scheduled_at, "timezone": self.timezone_name,
            "status": self.status, "account": self.account or "",
            "method": self.method or "upload_post", "note": self.note or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Character(Base):
    """A reusable AI character (ReelFarm-style): identity attributes + a portrait,
    plus generated 'looks' (scene/pose/outfit variations) that keep the identity."""
    __tablename__ = "characters"
    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(120), nullable=False, default="New character")
    attributes_json = Column(Text, default="{}")   # gender, age_range, ethnicity, hair, style, extra
    portrait_path = Column(String(500), default="")  # web path under /creations
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    def to_dict(self, looks=None):
        return {
            "id": self.id, "name": self.name,
            "attributes": json.loads(self.attributes_json or "{}"),
            "portrait_path": self.portrait_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "looks": looks if looks is not None else [],
        }


class CharacterLook(Base):
    """One generated image of a character in a specific scene/pose/outfit."""
    __tablename__ = "character_looks"
    id = Column(String(32), primary_key=True, default=_uuid)
    character_id = Column(String(32), nullable=False)
    prompt = Column(String(500), default="")
    image_path = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {
            "id": self.id, "character_id": self.character_id,
            "prompt": self.prompt, "image_path": self.image_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ImageCollection(Base):
    """A named pack of preset photos used by slideshow automations."""
    __tablename__ = "image_collections"
    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(120), nullable=False, default="New collection")
    kind = Column(String(20), default="user")   # user | starter (seeded, ready-made)
    created_at = Column(DateTime(timezone=True), default=_now)

    def to_dict(self, images=None):
        return {
            "id": self.id, "name": self.name, "kind": self.kind or "user",
            "images": images if images is not None else [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CollectionImage(Base):
    """One preset photo inside an ImageCollection."""
    __tablename__ = "collection_images"
    id = Column(String(32), primary_key=True, default=_uuid)
    collection_id = Column(String(32), nullable=False)
    image_path = Column(String(500), nullable=False)   # web path under /creations/collections/
    created_at = Column(DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {"id": self.id, "collection_id": self.collection_id, "image_path": self.image_path}


class SlideshowAutomation(Base):
    """A recurring TikTok photo-carousel recipe (ReelFarm-style automation):
    topic + tone + hook bank + per-slide content directions + AI-or-collection
    images + posting schedule + TikTok posting settings."""
    __tablename__ = "slideshow_automations"
    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(120), nullable=False, default="New automation")
    status = Column(String(20), default="paused")      # active | paused
    favorite = Column(Integer, default=0)              # favorites sort first in the list
    topic = Column(Text, default="")
    tone_preset = Column(String(40), default="conversational")
    tone_prompt = Column(Text, default="")             # freeform style rules when preset == custom
    hooks_json = Column(Text, default="[]")            # ["hook line", ...] — one picked per post
    hook_image_json = Column(Text, default="{}")       # {source: ai|collection|specific, image_prompt, collection_id, image_path}
    content_json = Column(Text, default="{}")          # {slide_count, count_mode: fixed|vary, count_min, count_max,
                                                       #  instructions, numbering, text_length: short|medium|long}
    slides_json = Column(Text, default="[]")           # sparse overrides: [{slide_n, direction}]
    image_default_json = Column(Text, default="{}")    # default image source for content/CTA slides
    image_overrides_json = Column(Text, default="[]")  # [{slide_n, source, image_prompt, collection_id, image_path}]
    cta_json = Column(Text, default="{}")              # {enabled, direction, position: "last" | slide number}
    schedule_json = Column(Text, default="{}")         # {timezone, times: [{time: "09:00", days: [0..6]}]}  0=Sun
    tiktok_json = Column(Text, default="{}")           # {auto_post, user_id, platforms, title_mode, title, caption_mode, caption}
    last_fired_slot = Column(String(60), default="")   # "YYYY-MM-DD|HH:MM" scheduler dedupe marker
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_run_note = Column(String(300), default="")
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "status": self.status,
            "favorite": bool(self.favorite),
            "topic": self.topic, "tone_preset": self.tone_preset, "tone_prompt": self.tone_prompt,
            "hooks": json.loads(self.hooks_json or "[]"),
            "hook_image": json.loads(self.hook_image_json or "{}"),
            "content": json.loads(self.content_json or "{}"),
            "slides": json.loads(self.slides_json or "[]"),
            "image_default": json.loads(self.image_default_json or "{}"),
            "image_overrides": json.loads(self.image_overrides_json or "[]"),
            "cta": json.loads(self.cta_json or "{}"),
            "schedule": json.loads(self.schedule_json or "{}"),
            "tiktok": json.loads(self.tiktok_json or "{}"),
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "last_run_note": self.last_run_note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SlideshowSeries(Base):
    """A reusable Character Slideshows config: mascot character + style preset + niche/topic
    bank + plug (app pitch + screenshots) + caption settings. One Series ~= one TikTok
    account's content lane (see charshow.py)."""
    __tablename__ = "slideshow_series"
    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(120), nullable=False, default="New series")
    character_id = Column(String(32), nullable=False, default="")
    style_key = Column(String(40), default="impact")
    accent_hex = Column(String(20), default="#00C080")
    niche = Column(String(200), default="")
    tone = Column(String(40), default="conversational")
    topic_bank_json = Column(Text, default="{}")    # {category: [topic, ...]}
    used_topics_json = Column(Text, default="[]")   # [{category, topic}, ...] oldest-first
    slide_min = Column(Integer, default=4)
    slide_max = Column(Integer, default=7)
    plug_json = Column(Text, default="{}")          # {app_name, pitch, screenshots: [paths], position}
    caption_cfg_json = Column(Text, default="{}")
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "character_id": self.character_id,
            "style_key": self.style_key or "impact", "accent_hex": self.accent_hex or "#00C080",
            "niche": self.niche, "tone": self.tone or "conversational",
            "topic_bank": json.loads(self.topic_bank_json or "{}"),
            "used_topics": json.loads(self.used_topics_json or "[]"),
            "slide_min": self.slide_min or 4, "slide_max": self.slide_max or 7,
            "plug": json.loads(self.plug_json or "{}"),
            "caption_cfg": json.loads(self.caption_cfg_json or "{}"),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


def _ensure_columns():
    """create_all doesn't ALTER existing tables — add any columns models grew later.
    ADD COLUMN with a constant default is safe on both SQLite and Postgres."""
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                coltype = column.type.compile(engine.dialect)
                default = ""
                if isinstance(column.default.arg if column.default is not None else None, str):
                    default = f" DEFAULT '{column.default.arg}'"
                conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN {column.name} {coltype}{default}'))
                print(f"🗄️ Migrated: {table.name} + {column.name}")


def init_db():
    Base.metadata.create_all(engine)
    _ensure_columns()
    print(f"🗄️ DB ready ({'postgres' if DATABASE_URL.startswith('postgresql') else 'sqlite'})")


def get_session():
    return SessionLocal()

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
    """A post handed to Upload-Post with a future scheduled_date."""
    __tablename__ = "scheduled_posts"
    id = Column(String(32), primary_key=True, default=_uuid)
    creation_id = Column(String(32), default="")
    title = Column(String(300), default="")
    platforms_json = Column(Text, default="[]")        # ["tiktok","instagram","youtube"]
    scheduled_at = Column(String(40), nullable=False)  # ISO-8601 (as sent to Upload-Post)
    timezone_name = Column(String(60), default="UTC")
    upload_post_ref = Column(Text, default="")         # raw Upload-Post response for tracing
    status = Column(String(20), default="scheduled")   # scheduled | posted | failed | canceled
    created_at = Column(DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {
            "id": self.id, "creation_id": self.creation_id, "title": self.title,
            "platforms": json.loads(self.platforms_json or "[]"),
            "scheduled_at": self.scheduled_at, "timezone": self.timezone_name,
            "status": self.status,
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


def init_db():
    Base.metadata.create_all(engine)
    print(f"🗄️ DB ready ({'postgres' if DATABASE_URL.startswith('postgresql') else 'sqlite'})")


def get_session():
    return SessionLocal()

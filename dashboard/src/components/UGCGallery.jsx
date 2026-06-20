import React, { useState, useEffect, useRef } from 'react';
import { Film, Download, Copy, Check, ExternalLink, Loader2, Play, User } from 'lucide-react';
import { getApiUrl } from '../config';

export default function UGCGallery() {
  const [tab, setTab] = useState('videos');
  const [videos, setVideos] = useState([]);
  const [avatars, setAvatars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(getApiUrl('/api/saasshorts/gallery?limit=100')).then(r => r.ok ? r.json() : { videos: [] }),
      fetch(getApiUrl('/api/saasshorts/actor-gallery')).then(r => r.ok ? r.json() : { images: [] }),
    ])
      .then(([vData, aData]) => {
        setVideos(vData.videos || []);
        setAvatars(aData.images || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-violet-400" />
        <span className="ml-2 text-muted-foreground">Loading gallery...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">UGC Gallery</h2>
          <p className="text-xs text-muted-foreground">{videos.length} videos · {avatars.length} avatars</p>
        </div>
        <a
          href={getApiUrl('/gallery')}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
        >
          <ExternalLink size={12} /> Public Gallery
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('videos')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
            tab === 'videos' ? 'bg-violet-500/20 text-violet-300' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Film size={12} className="inline mr-1.5" />Videos ({videos.length})
        </button>
        <button
          onClick={() => setTab('avatars')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
            tab === 'avatars' ? 'bg-violet-500/20 text-violet-300' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <User size={12} className="inline mr-1.5" />Avatars ({avatars.length})
        </button>
      </div>

      {/* Videos Tab */}
      {tab === 'videos' && (
        videos.length === 0 ? (
          <div className="text-center py-16">
            <Film size={40} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No videos yet. Generate one from AI Shorts.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {videos.map((video) => (
              <VideoCard key={video.video_id} video={video} copied={copied} onCopy={handleCopy} />
            ))}
          </div>
        )
      )}

      {/* Avatars Tab */}
      {tab === 'avatars' && (
        avatars.length === 0 ? (
          <div className="text-center py-16">
            <User size={40} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No avatars yet. Generate actors from AI Shorts.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {avatars.map((avatar, i) => (
              <AvatarCard key={avatar.key || i} avatar={avatar} copied={copied} onCopy={handleCopy} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function AvatarCard({ avatar, copied, onCopy }) {
  return (
    <div className="group rounded-xl overflow-hidden border border-border bg-muted hover:border-border transition-all">
      <div className="aspect-[3/4] bg-black">
        <img src={avatar.url} alt="Avatar" className="w-full h-full object-cover" />
      </div>
      <div className="p-2 space-y-1">
        {avatar.description ? (
          <div className="relative pr-4">
            <p className="text-[9px] text-muted-foreground line-clamp-2">{avatar.description}</p>
            <button
              onClick={() => onCopy(avatar.description, `avatar-${avatar.key}`)}
              className="absolute top-0 right-0 p-0.5 text-muted-foreground hover:text-muted-foreground"
              title="Copy prompt"
            >
              {copied === `avatar-${avatar.key}` ? <Check size={9} /> : <Copy size={9} />}
            </button>
          </div>
        ) : (
          <p className="text-[9px] text-muted-foreground italic">No description</p>
        )}
        <a
          href={avatar.url}
          download
          className="block text-center text-[9px] bg-muted hover:bg-muted text-muted-foreground py-1 rounded-md transition-colors"
        >
          <Download size={9} className="inline mr-0.5" />Download
        </a>
      </div>
    </div>
  );
}

function VideoCard({ video, copied, onCopy }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const handleMouseEnter = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  const handleMouseLeave = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setPlaying(false);
    }
  };

  const mode = video.video_mode;
  const caption = video.caption || '';
  const hashtags = (video.hashtags || []).join(' ');

  return (
    <div className="group rounded-xl overflow-hidden border border-border bg-muted hover:border-border transition-all">
      <div
        className="relative aspect-[9/16] bg-black cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <video
          ref={videoRef}
          src={video.video_url}
          poster={video.actor_url}
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
        />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Play size={20} className="text-foreground/70" />
          </div>
        )}
        <div className="absolute top-1.5 right-1.5">
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
            mode === 'lowcost' ? 'bg-green-500 text-black' : 'bg-violet-500 text-foreground'
          }`}>
            {mode === 'lowcost' ? 'LOW COST' : 'PREMIUM'}
          </span>
        </div>
      </div>

      <div className="p-2 space-y-1">
        <h3 className="text-[11px] font-semibold text-foreground truncate">{video.title || 'Untitled'}</h3>
        <p className="text-[9px] text-muted-foreground">
          {video.duration?.toFixed(0)}s · ${video.cost_estimate?.total?.toFixed(2) || '?'}
        </p>
        {caption && (
          <div className="relative pr-4">
            <p className="text-[9px] text-muted-foreground line-clamp-2">{caption}</p>
            <button
              onClick={() => onCopy(`${caption}\n${hashtags}`, `caption-${video.video_id}`)}
              className="absolute top-0 right-0 p-0.5 text-muted-foreground hover:text-muted-foreground"
              title="Copy caption"
            >
              {copied === `caption-${video.video_id}` ? <Check size={9} /> : <Copy size={9} />}
            </button>
          </div>
        )}
        <div className="flex gap-1 pt-0.5">
          <a
            href={video.video_url}
            download
            className="flex-1 text-center text-[9px] bg-muted hover:bg-muted text-muted-foreground py-1 rounded-md transition-colors"
          >
            <Download size={9} className="inline mr-0.5" />Download
          </a>
          <a
            href={getApiUrl(`/video/${video.video_id}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-[9px] bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 py-1 rounded-md transition-colors"
          >
            <ExternalLink size={9} className="inline mr-0.5" />View
          </a>
        </div>
      </div>
    </div>
  );
}

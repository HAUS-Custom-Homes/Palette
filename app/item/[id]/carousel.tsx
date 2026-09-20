"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PostMedia } from "@/search/query";
import { ExpandIcon, MutedIcon, SoundIcon } from "../../ui/icons";

/**
 * REF-02. A post, whole. Swipe, arrow buttons, arrow keys, dots and thumbnails
 * all move it, and the counter is always right. Native scroll-snap does the
 * swiping, so it feels like the phone's own photo viewer and needs no library.
 * A video plays from Palette's own copy, muted until asked, and stops when it
 * is swiped away.
 */
const clock = (s: number | null | undefined) => {
  const n = Math.max(0, Math.round(s ?? 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

export function Carousel({
  media, start, alt, canEdit, makeCover,
}: {
  media: PostMedia[];
  start: number;
  alt: string;
  canEdit: boolean;
  makeCover: (fd: FormData) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(Math.min(Math.max(start, 0), media.length - 1));
  const [zoom, setZoom] = useState(false);
  const n = media.length;

  const go = useCallback((i: number, smooth = true) => {
    const t = track.current;
    if (!t) return;
    const to = Math.max(0, Math.min(n - 1, i));
    t.scrollTo({ left: t.clientWidth * to, behavior: smooth ? "smooth" : "auto" });
    setCur(to);
  }, [n]);

  // Land on the slide the link asked for, without an animation.
  useEffect(() => { if (cur > 0) go(cur, false); /* once */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = track.current;
    if (!t) return;
    const onScroll = () => {
      const i = Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
      setCur((c) => (c === i ? c : i));
    };
    t.addEventListener("scroll", onScroll, { passive: true });
    return () => t.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.key === "ArrowRight") { go(cur + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { go(cur - 1); e.preventDefault(); }
      else if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, go]);

  // A video that is not on screen is not playing.
  useEffect(() => {
    track.current?.querySelectorAll("video").forEach((v, i) => {
      const mine = Number(v.dataset.index) === cur;
      if (!mine) v.pause();
      else v.play().catch(() => {});
      void i;
    });
  }, [cur]);

  const m = media[cur]!;

  return (
    <div>
      <div className="stage" data-zoom={zoom}>
        <div className="track" ref={track} tabIndex={0} role="region" aria-roledescription="carousel" aria-label={alt}>
          {media.map((s, i) => (
            <div className="slide" key={s.id} role="group" aria-label={`${i + 1} of ${n}`}
                 style={{ aspectRatio: s.width && s.height ? `${s.width} / ${s.height}` : undefined }}>
              {s.videoSha ? (
                <Video index={i} sha={s.videoSha} poster={`/api/asset/${s.sha256}/detail`} seconds={s.videoSeconds} />
              ) : (
                <img src={`/api/asset/${s.sha256}/detail`} alt={n > 1 ? `${alt}, image ${i + 1} of ${n}` : alt}
                     width={s.width ?? undefined} height={s.height ?? undefined}
                     loading={Math.abs(i - cur) <= 1 ? "eager" : "lazy"} decoding="async"
                     onClick={() => setZoom((z) => !z)} />
              )}
              {s.videoMissing && (
                <span className="glass vnote">Instagram would not give Palette this video. The cover is kept.</span>
              )}
            </div>
          ))}
        </div>

        {n > 1 && <button className="arrow l" onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="Previous">&#8249;</button>}
        {n > 1 && <button className="arrow r" onClick={() => go(cur + 1)} disabled={cur === n - 1} aria-label="Next">&#8250;</button>}
        {n > 1 && <span className="glass count">{cur + 1} / {n}</span>}
        {zoom && <button className="arrow x" onClick={() => setZoom(false)} aria-label="Close">&#10005;</button>}

        {n > 1 && canEdit && !zoom && (
          <form action={makeCover} className="coverform">
            <input type="hidden" name="memberId" value={m.id} />
            <button className="glass coverbtn" data-on={m.isCover} disabled={m.isCover} type="submit">
              {m.isCover ? "This is the cover" : "Make cover"}
            </button>
          </form>
        )}
      </div>

      {n > 1 && (
        <div className="dots">
          {media.map((s, i) => (
            <button key={s.id} className="dot" data-on={i === cur} aria-label={`Go to ${i + 1}`} aria-current={i === cur} onClick={() => go(i)} />
          ))}
        </div>
      )}
      {n > 1 && (
        <div className="thumbs">
          {media.map((s, i) => (
            <button key={s.id} data-on={i === cur} onClick={() => go(i)} aria-label={`Show ${i + 1}`}>
              <img src={`/api/asset/${s.sha256}/thumb`} alt="" loading="lazy" />
              {s.isCover && <span className="star">cover</span>}
              {(s.videoSha || s.videoMissing) && <span className="vmark">{s.videoSeconds ? clock(s.videoSeconds) : "video"}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Video({ index, sha, poster, seconds }: { index: number; sha: string; poster: string; seconds: number | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(seconds ?? 0);
  const [paused, setPaused] = useState(true);

  return (
    <div className="vwrap">
      <video ref={ref} data-index={index} src={`/api/asset/${sha}/original`} poster={poster}
             muted={muted} playsInline loop preload="metadata" autoPlay={index === 0}
             onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
             onLoadedMetadata={(e) => setDur(e.currentTarget.duration || seconds || 0)}
             onPlay={() => setPaused(false)} onPause={() => setPaused(true)}
             onClick={(e) => { const v = e.currentTarget; if (v.paused) void v.play(); else v.pause(); }} />
      {paused && <span className="vplay" aria-hidden>&#9654;</span>}
      <span className="glass vtime">Kept in Palette · {clock(t)} / {clock(dur)}</span>
      <button className="vbtn l" onClick={() => setMuted((x) => !x)} aria-label={muted ? "Unmute" : "Mute"}>{muted ? <MutedIcon /> : <SoundIcon />}</button>
      <button className="vbtn r" onClick={() => void ref.current?.requestFullscreen?.()} aria-label="Full screen"><ExpandIcon /></button>
      <input className="vseek" type="range" min={0} max={Math.max(1, dur)} step={0.1} value={t} aria-label="Seek"
             onChange={(e) => { if (ref.current) ref.current.currentTime = Number(e.target.value); }} />
    </div>
  );
}

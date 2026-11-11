import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_VIDEO_SECONDS = 30;

interface Props {
  mode: 'photo' | 'video';
  stamp: string;
  onCapture: (blob: Blob, type: 'photo' | 'video') => void;
  /** Demo mode (and local development) can use a generated image when there's no camera. */
  allowSample?: boolean;
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
}

/**
 * Live capture only. There is deliberately no way to pick from the camera
 * roll: proof has to be shot in the app, right now.
 */
export function Camera({ mode, stamp, onCapture, allowSample }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream>();
  const recRef = useRef<MediaRecorder>();
  const chunks = useRef<Blob[]>([]);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string>();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState<{ blob: Blob; url: string; type: 'photo' | 'video' }>();

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = undefined;
  };

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    setError(undefined);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser can’t open the camera. Open Belted in Safari or Chrome on your phone.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: mode === 'video' })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => setError('Belted needs your camera for proof. Allow camera access for this site in your browser settings, then try again.'));
    return () => { cancelled = true; stop(); };
  }, [facing, mode, preview]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const finishRecording = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    setRecording(false);
  }, []);

  useEffect(() => {
    if (recording && seconds >= MAX_VIDEO_SECONDS) finishRecording();
  }, [recording, seconds, finishRecording]);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(v, 0, 0);
    drawStamp(ctx, c.width, c.height, stamp);
    c.toBlob((b) => {
      if (!b) return;
      stop();
      setPreview({ blob: b, url: URL.createObjectURL(b), type: 'photo' });
    }, 'image/jpeg', 0.85);
  }

  function record() {
    const s = streamRef.current;
    if (!s) return;
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
    } catch {
      setError('This browser can’t record video. Try Safari on iPhone.');
      return;
    }
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || mime || 'video/webm' });
      stop();
      setPreview({ blob, url: URL.createObjectURL(blob), type: 'video' });
    };
    recRef.current = rec;
    rec.start(250);
    setSeconds(0);
    setRecording(true);
  }

  /** Only for testing on a computer with no camera. */
  function sample() {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 900;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 900, 900);
    g.addColorStop(0, '#24406b');
    g.addColorStop(1, '#121b2b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 900, 900);
    ctx.fillStyle = '#eef2f8';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SAMPLE PROOF', 450, 430);
    ctx.font = '32px system-ui, sans-serif';
    ctx.fillText('No camera on this device', 450, 490);
    drawStamp(ctx, 900, 900, stamp);
    c.toBlob((b) => b && setPreview({ blob: b, url: URL.createObjectURL(b), type: 'photo' }), 'image/jpeg', 0.85);
  }

  if (preview) {
    return (
      <div className="cam">
        <div className="viewfinder">
          {preview.type === 'video'
            ? <video src={preview.url} controls playsInline autoPlay muted className="vf-media" />
            : <img src={preview.url} alt="Your proof" className="vf-media" />}
        </div>
        <div className="row2">
          <button className="btn ghost" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(undefined); setSeconds(0); }}>Retake</button>
          <button className="btn" onClick={() => onCapture(preview.blob, preview.type)}>Use this proof</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cam">
      <div className="viewfinder">
        {error ? (
          <div className="vf-error">
            <p>{error}</p>
            {allowSample && <button className="btn sm ghost" onClick={sample}>No camera? Use a sample proof (demo only)</button>}
          </div>
        ) : (
          <>
            <video ref={videoRef} className="vf-media" playsInline muted autoPlay />
            <div className="vf-label">{recording ? `● REC 0:${String(seconds).padStart(2, '0')} / 0:${MAX_VIDEO_SECONDS}` : 'LIVE CAMERA · NO CAMERA ROLL'}</div>
            <button className="vf-flip" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} aria-label="Flip camera" disabled={recording}>⟲</button>
          </>
        )}
      </div>
      {!error && (
        <div className="shutter-row">
          {mode === 'photo' ? (
            <button className="shutter" onClick={snap} aria-label="Take photo"><i /></button>
          ) : (
            <button className={`shutter rec ${recording ? 'on' : ''}`} onClick={recording ? finishRecording : record} aria-label={recording ? 'Stop recording' : 'Start recording'}><i /></button>
          )}
          <div className="muted small">{mode === 'photo' ? 'Tap to snap' : recording ? 'Tap to stop' : `Tap to record (max ${MAX_VIDEO_SECONDS}s)`}</div>
        </div>
      )}
    </div>
  );
}

function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  const size = Math.round(w * 0.032);
  ctx.font = `600 ${size}px ui-monospace, Menlo, monospace`;
  const label = `BELTED · ${text} · ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  const pad = size * 0.6;
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(pad, h - size * 2.4, tw + pad * 2, size * 1.8);
  ctx.fillStyle = '#f2b632';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, pad * 2, h - size * 1.5);
}

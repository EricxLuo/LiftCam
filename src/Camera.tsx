import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { SquatTracker, jointAngle, localCoach, type SetAnalysis } from './analysis';

function speak(message: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.96;
  window.speechSynthesis.speak(utterance);
}

export function Camera({ onSetComplete }: { onSetComplete: (analysis: SetAnalysis) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const trackerRef = useRef(new SquatTracker());
  const frameRef = useRef(0);
  const liveCountRef = useRef(0);
  const runningRef = useRef(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'recording'>('idle');
  const [error, setError] = useState('');
  const [liveCount, setLiveCount] = useState(0);
  const [analysis, setAnalysis] = useState<SetAnalysis | null>(null);
  const [coachText, setCoachText] = useState('');
  const [coachSource, setCoachSource] = useState<'ai' | 'local' | null>(null);
  const [coaching, setCoaching] = useState(false);

  function stopCamera() {
    runningRef.current = false;
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => () => {
    stopCamera();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  async function openCamera() {
    setError('');
    setAnalysis(null);
    setCoachText('');
    setStatus('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'CPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      setStatus('ready');
    } catch (err) {
      stopCamera();
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Could not start the camera.');
    }
  }

  function startSet() {
    trackerRef.current = new SquatTracker();
    liveCountRef.current = 0;
    setLiveCount(0);
    setAnalysis(null);
    setStatus('recording');
    runningRef.current = true;
    let lastFrame = -1;
    const tick = () => {
      if (!runningRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const detector = landmarkerRef.current;
      if (video && canvas && detector && video.readyState >= 2 && video.currentTime !== lastFrame) {
        lastFrame = video.currentTime;
        try {
          const result = detector.detectForVideo(video, performance.now());
          const pose = result.landmarks[0];
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (pose) {
              const sides = [[23, 25, 27], [24, 26, 28]];
              const side = sides.sort((a, b) => b.reduce((sum, index) => sum + (pose[index]?.visibility ?? 0), 0) - a.reduce((sum, index) => sum + (pose[index]?.visibility ?? 0), 0))[0];
              if (side.every(index => (pose[index]?.visibility ?? 0) > 0.55)) {
                const points = side.map(index => pose[index]);
                const angle = jointAngle(points[0], points[1], points[2]);
                trackerRef.current.update(angle, performance.now());
                ctx.strokeStyle = '#55a7ff';
                ctx.fillStyle = '#55a7ff';
                ctx.lineWidth = Math.max(3, canvas.width / 250);
                ctx.beginPath();
                points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x * canvas.width, point.y * canvas.height) : ctx.lineTo(point.x * canvas.width, point.y * canvas.height));
                ctx.stroke();
                points.forEach(point => {
                  ctx.beginPath();
                  ctx.arc(point.x * canvas.width, point.y * canvas.height, Math.max(5, canvas.width / 160), 0, Math.PI * 2);
                  ctx.fill();
                });
              }
            }
          }
          if (trackerRef.current.reps.length !== liveCountRef.current) {
            liveCountRef.current = trackerRef.current.reps.length;
            setLiveCount(liveCountRef.current);
          }
        } catch {
          // A dropped frame should not end a set.
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }

  async function endSet() {
    const result = trackerRef.current.summary();
    stopCamera();
    setStatus('idle');
    setAnalysis(result);
    if (result.reps.length > 0) onSetComplete(result);
    const fallback = localCoach(result);
    const endpoint = import.meta.env.VITE_COACH_API_URL?.trim();
    if (!endpoint) {
      setCoachSource('local');
      setCoachText(fallback);
      speak(fallback);
      return;
    }
    setCoaching(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise: 'Barbell Squat', reps: result.reps.map(rep => ({ duration: Number(rep.duration.toFixed(2)), ascent: Number(rep.ascent.toFixed(2)), minKneeAngle: rep.minKneeAngle })), slowdownPercent: result.slowdownPercent, proximity: result.proximity, incompleteAttempt: result.incompleteAttempt }),
      });
      if (!response.ok) throw new Error(`Coach API returned ${response.status}`);
      const body = await response.json() as { summary?: string };
      if (!body.summary) throw new Error('Coach API response had no summary');
      setCoachText(body.summary);
      setCoachSource('ai');
      speak(body.summary);
    } catch {
      setCoachText(fallback);
      setCoachSource('local');
      speak(fallback);
    } finally {
      setCoaching(false);
    }
  }

  const insight = !analysis ? '' : analysis.incompleteAttempt ? 'An incomplete attempt was observed' : analysis.proximity === 'possibly-near-failure' ? 'You may have been near failure' : analysis.proximity === 'steady' ? 'Your pace stayed steady' : 'More reps needed for a failure estimate';

  return <div className="camera-layout">
    <section className="surface camera-panel">
      <div className="section-heading"><div><span className="eyebrow">SET ANALYSIS</span><h2>Squat camera</h2></div><span className="tag">SQUATS · BETA</span></div>
      <p className="section-copy">Set your phone at your side so your full body is visible. LiftCam times each rep and looks for late-set slowdown.</p>
      <div className={`camera-stage ${status === 'recording' ? 'is-recording' : ''}`}>
        <video ref={videoRef} playsInline muted className={status === 'idle' ? 'hidden' : ''} />
        <canvas ref={canvasRef} className={status === 'recording' ? '' : 'hidden'} />
        {status === 'idle' && <div className="camera-placeholder"><div className="viewfinder"><span /></div><strong>Camera is off</strong><span>Side view · full body · steady phone</span></div>}
        {status === 'recording' && <div className="camera-overlay"><span className="record-dot" /> Recording <strong>{liveCount} reps</strong></div>}
        {status === 'loading' && <div className="camera-loading">Loading camera and pose model…</div>}
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="camera-actions">
        {status === 'idle' && <button className="primary-button" onClick={openCamera}>Open camera</button>}
        {status === 'ready' && <button className="primary-button" onClick={startSet}>Start set</button>}
        {status === 'recording' && <button className="primary-button danger-button" onClick={endSet}>End set</button>}
        {status === 'ready' && <button className="text-button" onClick={() => { stopCamera(); setStatus('idle'); }}>Close camera</button>}
      </div>
      <p className="privacy-note">Video stays on your device. Only rep measurements go to the coach if AWS is connected.</p>
    </section>
    <section className="surface results-panel" aria-live="polite">
      <div className="section-heading"><div><span className="eyebrow">AFTER YOUR SET</span><h2>Coach's notes</h2></div></div>
      {!analysis ? <div className="empty-results"><div className="empty-symbol">✦</div><h3>Make every rep count.</h3><p>Complete a set to see your pace and hear one practical suggestion for the next one.</p></div> : <>
        <div className="stat-grid"><div className="stat"><strong>{analysis.reps.length}</strong><span>Full reps</span></div><div className="stat"><strong>{analysis.slowdownPercent === null ? '—' : `${Math.max(0, analysis.slowdownPercent)}%`}</strong><span>Late-set slowdown</span></div></div>
        <div className="insight-label">{insight}</div>
        <div className="coach-card"><span className="eyebrow">{coaching ? 'PREPARING YOUR SUMMARY' : coachSource === 'ai' ? 'AI COACH · AWS BEDROCK' : 'LOCAL COACH PREVIEW'}</span><p>{coaching ? 'Reviewing your rep measurements…' : coachText}</p>{coachText && <button className="text-button" onClick={() => speak(coachText)}>Play summary again</button>}</div>
        {analysis.reps.length > 0 && <div className="rep-list"><h3>Rep pace</h3>{analysis.reps.map(rep => <div key={rep.number} className="rep-row"><span>Rep {rep.number}</span><div className="rep-bar"><i style={{ width: `${Math.min(100, Math.max(15, rep.ascent / Math.max(...analysis.reps.map(item => item.ascent)) * 100))}%` }} /></div><strong>{rep.ascent.toFixed(1)}s</strong></div>)}</div>}
      </>}
    </section>
  </div>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { DAYS, EXERCISES, INITIAL_PLAN, WEEK_ORDER, loadStored, localDateKey, type PlannedExercise, type WeekPlan, type WorkoutLog } from './data';
import { SquatTracker, jointAngle, localCoach, type SetAnalysis } from './analysis';

type Tab = 'home' | 'camera' | 'plan' | 'calendar';
const today = new Date();

function speak(message: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.96;
  window.speechSynthesis.speak(utterance);
}

function Camera({ onSetComplete }: { onSetComplete: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const trackerRef = useRef(new SquatTracker());
  const frameRef = useRef(0);
  const liveCountRef = useRef(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'recording'>('idle');
  const [error, setError] = useState('');
  const [liveCount, setLiveCount] = useState(0);
  const [analysis, setAnalysis] = useState<SetAnalysis | null>(null);
  const [coachText, setCoachText] = useState('');
  const [coachSource, setCoachSource] = useState<'ai' | 'local' | null>(null);
  const [coaching, setCoaching] = useState(false);
  const runningRef = useRef(false);

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
                ctx.strokeStyle = '#c7ff73';
                ctx.fillStyle = '#c7ff73';
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
    if (result.reps.length > 0) onSetComplete();
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

  return <div className="page-grid camera-grid">
    <section className="panel camera-panel">
      <div className="section-heading"><div><span className="eyebrow">01 / SET ANALYSIS</span><h2>Squat camera</h2></div><span className="pill accent-pill">BETA · SQUATS ONLY</span></div>
      <p className="muted">Place your phone to the side, with your full body visible. Start the camera, then tap Start set before you lift.</p>
      <div className={`camera-stage ${status === 'recording' ? 'is-recording' : ''}`}>
        <video ref={videoRef} playsInline muted className={status === 'idle' ? 'hidden' : ''} />
        <canvas ref={canvasRef} className={status === 'recording' ? '' : 'hidden'} />
        {status === 'idle' && <div className="camera-placeholder"><div className="target-mark">⌖</div><strong>Ready when you are</strong><span>Side view · full body · steady phone</span></div>}
        {status === 'recording' && <div className="camera-overlay"><span className="record-dot" /> REC <strong>{liveCount} REPS</strong></div>}
        {status === 'loading' && <div className="camera-loading">Loading camera and pose model…</div>}
      </div>
      {error && <p className="error-message">{error}</p>}
      <div className="camera-actions">
        {status === 'idle' && <button className="primary-button" onClick={openCamera}>Open camera <span>↗</span></button>}
        {status === 'ready' && <button className="primary-button" onClick={startSet}>Start set <span>●</span></button>}
        {status === 'recording' && <button className="primary-button danger-button" onClick={endSet}>End set <span>■</span></button>}
        {status === 'ready' && <button className="text-button" onClick={() => { stopCamera(); setStatus('idle'); }}>Close camera</button>}
      </div>
      <div className="privacy-note"><span>◇</span> Video stays on your phone. Only rep measurements are sent to the AI coach when connected.</div>
    </section>
    <section className="panel results-panel">
      <div className="section-heading"><div><span className="eyebrow">02 / AFTER YOUR SET</span><h2>Coach's notes</h2></div><span className="sound-icon">◖))</span></div>
      {!analysis ? <div className="empty-results"><div className="result-illustration">↗</div><h3>Your analysis will land here.</h3><p>Finish a set to see your rep count, pace, and a spoken recommendation for what to do next.</p></div> : <>
        <div className="stat-grid"><div className="stat"><strong>{analysis.reps.length}</strong><span>FULL REPS</span></div><div className="stat"><strong>{analysis.slowdownPercent === null ? '—' : `${Math.max(0, analysis.slowdownPercent)}%`}</strong><span>LAST REP SLOWDOWN</span></div></div>
        <div className="insight-label">{analysis.incompleteAttempt ? 'INCOMPLETE ATTEMPT OBSERVED' : analysis.proximity === 'possibly-near-failure' ? 'POSSIBLY NEAR FAILURE' : analysis.proximity === 'steady' ? 'PACE STAYED STEADY' : 'NOT ENOUGH DATA FOR FAILURE ESTIMATE'}</div>
        <div className="coach-card"><span className="eyebrow">{coaching ? 'GENERATING COACHING…' : coachSource === 'ai' ? 'AI COACH · AWS BEDROCK' : 'LOCAL COACH PREVIEW'}</span><p>{coaching ? 'Reviewing your rep measurements…' : coachText}</p>{coachText && <button className="replay-button" onClick={() => speak(coachText)}>◖)) &nbsp; Play summary</button>}</div>
        {analysis.reps.length > 0 && <div className="rep-list"><h3>Rep pace</h3>{analysis.reps.map(rep => <div key={rep.number} className="rep-row"><span>REP {String(rep.number).padStart(2, '0')}</span><div className="rep-bar"><i style={{ width: `${Math.min(100, Math.max(15, rep.ascent / Math.max(...analysis.reps.map(item => item.ascent)) * 100))}%` }} /></div><strong>{rep.ascent.toFixed(1)}s</strong></div>)}</div>}
      </>}
    </section>
  </div>;
}

function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [plan, setPlan] = useState<WeekPlan>(() => loadStored('liftcam-plan-v1', INITIAL_PLAN));
  const [logs, setLogs] = useState<Record<string, WorkoutLog>>(() => loadStored('liftcam-logs-v1', {}));
  const [selectedDay, setSelectedDay] = useState(today.getDay());
  const [search, setSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const todayKey = localDateKey(today);
  const todayExercises = plan[today.getDay()] ?? [];
  const todayLog = logs[todayKey];
  const plannedDays = WEEK_ORDER.filter(day => (plan[day] ?? []).length > 0).length;
  const completedThisWeek = WEEK_ORDER.filter(day => {
    const offset = (today.getDay() + 6) % 7;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + (day === 0 ? 6 : day - 1));
    return Boolean(logs[localDateKey(date)]?.completed.length);
  }).length;

  useEffect(() => { localStorage.setItem('liftcam-plan-v1', JSON.stringify(plan)); }, [plan]);
  useEffect(() => { localStorage.setItem('liftcam-logs-v1', JSON.stringify(logs)); }, [logs]);

  function addExercise(exercise: PlannedExercise) {
    setPlan(current => ({ ...current, [selectedDay]: [...(current[selectedDay] ?? []), exercise] }));
    setSearch('');
    setCustomName('');
  }
  function removeExercise(index: number) {
    setPlan(current => ({ ...current, [selectedDay]: current[selectedDay].filter((_, i) => i !== index) }));
  }
  function toggleComplete(name: string) {
    setLogs(current => {
      const previous = current[todayKey] ?? { date: todayKey, completed: [], sets: 0 };
      const completed = previous.completed.includes(name) ? previous.completed.filter(item => item !== name) : [...previous.completed, name];
      return { ...current, [todayKey]: { ...previous, completed } };
    });
  }
  function completeAnalyzedSet() {
    setLogs(current => {
      const previous = current[todayKey] ?? { date: todayKey, completed: [], sets: 0 };
      return { ...current, [todayKey]: { ...previous, sets: previous.sets + 1, completed: previous.completed.includes('Barbell Squat') ? previous.completed : [...previous.completed, 'Barbell Squat'] } };
    });
  }

  const filteredExercises = useMemo(() => EXERCISES.filter(exercise => `${exercise.name} ${exercise.category}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8), [search]);
  const firstOfMonth = calendarMonth.getDay();
  const cells = Array.from({ length: firstOfMonth + new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => index < firstOfMonth ? null : new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index - firstOfMonth + 1));

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">L<span>↗</span></div><span>LiftCam<small>TRAIN WITH INTENTION</small></span></div>
      <nav className="side-nav" aria-label="Main navigation">
        <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}><span>▦</span> Overview</button>
        <button className={tab === 'camera' ? 'active' : ''} onClick={() => setTab('camera')}><span>◉</span> Squat camera</button>
        <button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}><span>☷</span> Weekly plan</button>
        <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}><span>▦</span> Consistency</button>
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><span>✦ TRAINING NOTE</span><p>Progress is built one set at a time.</p></div><div className="sidebar-footer">LIFTCAM / EARLY ACCESS</div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><span>YOUR TRAINING SPACE</span><div><span className="topbar-date">{today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="avatar">LC</span></div></header>
      {tab === 'home' && <div className="content-stack">
        <section className="hero"><div className="hero-copy"><span className="eyebrow">YOUR NEXT REP STARTS HERE</span><h1>Train smarter.<br /><em>See the difference.</em></h1><p>Plan your week, track every session, and let LiftCam turn your squat sets into useful coaching.</p><button className="hero-button" onClick={() => setTab('camera')}>Analyze a set <span>↗</span></button></div><div className="hero-graphic"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-glyph">L<span>↗</span></div><div className="hero-label">FOCUS ON<br/>THE NEXT REP</div></div></section>
        <div className="overview-grid"><section className="panel today-panel"><div className="section-heading"><div><span className="eyebrow">TODAY'S GAME PLAN</span><h2>{DAYS[today.getDay()]}'s workout</h2></div><button className="small-link" onClick={() => { setSelectedDay(today.getDay()); setTab('plan'); }}>Edit plan ↗</button></div>{todayExercises.length ? todayExercises.map((exercise, index) => <button key={`${exercise.id}-${index}`} className="today-exercise" onClick={() => toggleComplete(exercise.name)}><span className={`check-circle ${todayLog?.completed.includes(exercise.name) ? 'checked' : ''}`}>{todayLog?.completed.includes(exercise.name) ? '✓' : ''}</span><span className="exercise-info"><strong>{exercise.name}</strong><small>{exercise.sets} SETS · {exercise.reps} REPS {exercise.analyzed ? '· CAMERA READY' : ''}</small></span><span className="exercise-arrow">↗</span></button>) : <div className="empty-small">No workout planned today. Head to your weekly plan to add one.</div>}</section><section className="panel consistency-panel"><span className="eyebrow">THIS WEEK</span><h2>Keep showing up.</h2><div className="big-progress"><strong>{completedThisWeek}</strong><span>/ {plannedDays || 0} planned days</span></div><div className="week-dots">{WEEK_ORDER.map(day => <div key={day}><span className={(day === today.getDay() ? 'current ' : '') + (day === today.getDay() && todayLog?.completed.length ? 'done' : '')}>{DAYS[day][0]}</span></div>)}</div><button className="small-link" onClick={() => setTab('calendar')}>View consistency calendar ↗</button></section></div>
        <div className="notice-strip"><span className="notice-icon">◇</span><div><strong>Private by design</strong><p>Your camera footage stays on your device. Schedule and calendar are saved only in this browser.</p></div></div>
      </div>}
      {tab === 'camera' && <div className="content-stack"><div className="page-title"><span className="eyebrow">MOVE WITH MORE INSIGHT</span><h1>Set analysis<span>.</span></h1><p>Get the numbers from your set, then hear your next move.</p></div><Camera onSetComplete={completeAnalyzedSet} /></div>}
      {tab === 'plan' && <div className="content-stack"><div className="page-title"><span className="eyebrow">BUILD YOUR ROUTINE</span><h1>Weekly plan<span>.</span></h1><p>A flexible plan for every day of the week. Camera analysis currently supports squats.</p></div><div className="plan-grid"><section className="panel plan-days"><span className="eyebrow">YOUR WEEK</span><div className="day-list">{WEEK_ORDER.map(day => <button key={day} className={selectedDay === day ? 'selected' : ''} onClick={() => setSelectedDay(day)}><span>{DAYS[day]}</span><small>{(plan[day] ?? []).length ? `${plan[day].length} EXERCISES` : 'REST DAY'}</small><b>↗</b></button>)}</div></section><section className="panel day-detail"><div className="section-heading"><div><span className="eyebrow">{DAYS[selectedDay].toUpperCase()} / SESSION</span><h2>{DAYS[selectedDay]} plan</h2></div><span className="pill">{(plan[selectedDay] ?? []).length} EXERCISES</span></div>{(plan[selectedDay] ?? []).length ? (plan[selectedDay] ?? []).map((exercise, index) => <div className="plan-exercise" key={`${exercise.id}-${index}`}><div><strong>{exercise.name}</strong><span>{exercise.sets} sets · {exercise.reps} reps {exercise.analyzed ? '· Camera ready' : ''}</span></div><button aria-label={`Remove ${exercise.name}`} onClick={() => removeExercise(index)}>×</button></div>) : <div className="empty-small">Rest day, or add an exercise below.</div>}<div className="add-box"><span className="eyebrow">ADD AN EXERCISE</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search workouts…" aria-label="Search workouts" /><div className="exercise-options">{filteredExercises.map(exercise => <button key={exercise.id} onClick={() => addExercise({ id: exercise.id, name: exercise.name, sets: 3, reps: '8–10', analyzed: exercise.analyzed })}><span>{exercise.name}<small>{exercise.category}{exercise.analyzed ? ' · CAMERA READY' : ''}</small></span><b>+</b></button>)}</div><div className="custom-row"><input value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Or name a custom exercise" aria-label="Custom exercise name" /><button onClick={() => customName.trim() && addExercise({ id: `custom-${Date.now()}`, name: customName.trim(), sets: 3, reps: '8–10' })} disabled={!customName.trim()}>Add</button></div></div></section></div></div>}
      {tab === 'calendar' && <div className="content-stack"><div className="page-title"><span className="eyebrow">EVERY DAY COUNTS</span><h1>Consistency<span>.</span></h1><p>A simple record of the days you showed up.</p></div><section className="panel calendar-panel"><div className="calendar-header"><div><span className="eyebrow">TRAINING HISTORY</span><h2>{calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2></div><div><button aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>←</button><button aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>→</button></div></div><div className="calendar-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="calendar-weekday">{day}</div>)}{cells.map((date, index) => date ? <div key={localDateKey(date)} className={`calendar-day ${localDateKey(date) === todayKey ? 'today' : ''} ${logs[localDateKey(date)]?.completed.length ? 'completed' : ''}`} title={logs[localDateKey(date)]?.completed.join(', ') || 'No workout logged'}><span>{date.getDate()}</span>{logs[localDateKey(date)]?.completed.length ? <i /> : null}</div> : <div key={`blank-${index}`} className="calendar-blank" />)}</div><div className="calendar-footer"><span><i className="legend-dot" /> WORKOUT COMPLETED</span><span>Tap exercises on Overview to mark today complete.</span></div></section></div>}
    </main>
    <nav className="mobile-nav" aria-label="Mobile navigation"><button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}><span>▦</span>Home</button><button className={tab === 'camera' ? 'active' : ''} onClick={() => setTab('camera')}><span>◉</span>Camera</button><button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}><span>☷</span>Plan</button><button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}><span>▦</span>Calendar</button></nav>
  </div>;
}

export default App;

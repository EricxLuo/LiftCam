import { useEffect, useMemo, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { DAYS, EXERCISES, INITIAL_PLAN, WEEK_ORDER, loadStored, localDateKey, type PlannedExercise, type WeekPlan, type WorkoutLog } from './data';
import { SquatTracker, jointAngle, localCoach, type SetAnalysis } from './analysis';

type Tab = 'workout' | 'calendar' | 'profile';
type WorkoutView = 'today' | 'plan' | 'camera';
const today = new Date();

function speak(message: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.96;
  window.speechSynthesis.speak(utterance);
}

function NavIcon({ name }: { name: Tab }) {
  if (name === 'workout') return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 9v6m3-9v12m3-9v6m6-6v6m3-9v12m3-9v6M3 12h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  if (name === 'calendar') return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" /><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 4h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" /><path d="M4.5 20c.5-4 3.2-6 7.5-6s7 2 7.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function Camera({ onSetComplete }: { onSetComplete: () => void }) {
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

function App() {
  const [tab, setTab] = useState<Tab>('workout');
  const [workoutView, setWorkoutView] = useState<WorkoutView>('today');
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
  const weekDates = WEEK_ORDER.map(day => {
    const offset = (today.getDay() + 6) % 7;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + (day === 0 ? 6 : day - 1));
  });
  const completedThisWeek = weekDates.filter(date => Boolean(logs[localDateKey(date)]?.completed.length)).length;
  const loggedDays = Object.values(logs).filter(log => log.completed.length > 0).length;
  const analyzedSets = Object.values(logs).reduce((sum, log) => sum + log.sets, 0);

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
  function showWorkout(view: WorkoutView) {
    setTab('workout');
    setWorkoutView(view);
    window.scrollTo(0, 0);
  }
  function navigate(nextTab: Tab) {
    setTab(nextTab);
    window.scrollTo(0, 0);
  }

  const filteredExercises = useMemo(() => EXERCISES.filter(exercise => `${exercise.name} ${exercise.category}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8), [search]);
  const firstOfMonth = calendarMonth.getDay();
  const cells = Array.from({ length: firstOfMonth + new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => index < firstOfMonth ? null : new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index - firstOfMonth + 1));

  return <div className="app-shell">
    <header className="app-header"><div className="header-inner"><div className="brand"><span className="brand-symbol" aria-hidden="true">L</span><span>LiftCam</span></div><span className="header-date">{today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span></div></header>
    <main className="main-content">
      {tab === 'workout' && <>
        <div className="page-heading"><span className="eyebrow">YOUR TRAINING SPACE</span><h1>Workout</h1><p>Show up. Move with intention. Learn from every set.</p></div>
        <div className="segmented-control" role="tablist" aria-label="Workout sections">
          {([['today', 'Today'], ['plan', 'Weekly plan'], ['camera', 'Camera']] as const).map(([view, label]) => <button key={view} type="button" role="tab" aria-selected={workoutView === view} className={workoutView === view ? 'selected' : ''} onClick={() => showWorkout(view)}>{label}</button>)}
        </div>
        {workoutView === 'today' && <div className="content-stack">
          <section className="feature-card"><div><span className="eyebrow">LIFTCAM VISION</span><h2>A better next set<br />starts here.</h2><p>Record a squat set. See your rep pace. Hear what to focus on next.</p><button className="feature-link" onClick={() => showWorkout('camera')}>Analyze a set <span aria-hidden="true">→</span></button></div><div className="feature-orbit" aria-hidden="true"><div className="orbit-core"><span>01</span><i /></div><span className="orbit-caption">REP BY REP</span></div></section>
          <div className="dashboard-grid">
            <section className="surface today-panel"><div className="section-heading"><div><span className="eyebrow">TODAY'S PLAN</span><h2>{DAYS[today.getDay()]}</h2></div><button className="text-button" onClick={() => { setSelectedDay(today.getDay()); showWorkout('plan'); }}>Edit plan</button></div>
              {todayExercises.length ? todayExercises.map((exercise, index) => <button key={`${exercise.id}-${index}`} className="today-exercise" aria-pressed={Boolean(todayLog?.completed.includes(exercise.name))} onClick={() => toggleComplete(exercise.name)}><span className={`check-circle ${todayLog?.completed.includes(exercise.name) ? 'checked' : ''}`}>{todayLog?.completed.includes(exercise.name) ? '✓' : ''}</span><span className="exercise-info"><strong>{exercise.name}</strong><small>{exercise.sets} sets · {exercise.reps} reps{exercise.analyzed ? ' · Camera ready' : ''}</small></span></button>) : <div className="empty-small">It's a rest day. Add a workout in your weekly plan whenever you're ready.</div>}
            </section>
            <section className="surface consistency-panel"><span className="eyebrow">THIS WEEK</span><h2>Keep your rhythm.</h2><div className="big-progress"><strong>{completedThisWeek}</strong><span>of {plannedDays} planned days</span></div><div className="week-dots">{WEEK_ORDER.map((day, index) => <div key={day}><span className={(day === today.getDay() ? 'current ' : '') + (logs[localDateKey(weekDates[index])]?.completed.length ? 'done' : '')}>{DAYS[day][0]}</span></div>)}</div><button className="text-button" onClick={() => navigate('calendar')}>View calendar <span aria-hidden="true">→</span></button></section>
          </div>
          <div className="subtle-note"><span className="note-symbol" aria-hidden="true">◈</span><div><strong>Private by design</strong><p>Your camera footage stays on your device. Your plan and calendar live in this browser.</p></div></div>
        </div>}
        {workoutView === 'plan' && <div className="content-stack"><div className="section-intro"><h2>Make the week yours.</h2><p>Add any exercise to any day. Camera analysis currently supports barbell squats.</p></div><div className="plan-layout"><section className="surface plan-days"><span className="eyebrow">SELECT A DAY</span><div className="day-list">{WEEK_ORDER.map(day => <button key={day} className={selectedDay === day ? 'selected' : ''} onClick={() => setSelectedDay(day)}><span>{DAYS[day]}</span><small>{(plan[day] ?? []).length ? `${plan[day].length} exercises` : 'Rest day'}</small></button>)}</div></section><section className="surface day-detail"><div className="section-heading"><div><span className="eyebrow">YOUR SESSION</span><h2>{DAYS[selectedDay]} plan</h2></div><span className="tag">{(plan[selectedDay] ?? []).length} exercises</span></div>{(plan[selectedDay] ?? []).length ? (plan[selectedDay] ?? []).map((exercise, index) => <div className="plan-exercise" key={`${exercise.id}-${index}`}><div><strong>{exercise.name}</strong><span>{exercise.sets} sets · {exercise.reps} reps{exercise.analyzed ? ' · Camera ready' : ''}</span></div><button aria-label={`Remove ${exercise.name}`} onClick={() => removeExercise(index)}>×</button></div>) : <div className="empty-small">Nothing planned. Leave it as a rest day or add an exercise below.</div>}<div className="add-box"><span className="eyebrow">ADD AN EXERCISE</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search workouts…" aria-label="Search workouts" /><div className="exercise-options">{filteredExercises.map(exercise => <button key={exercise.id} onClick={() => addExercise({ id: exercise.id, name: exercise.name, sets: 3, reps: '8–10', analyzed: exercise.analyzed })}><span>{exercise.name}<small>{exercise.category}{exercise.analyzed ? ' · Camera ready' : ''}</small></span><b>+</b></button>)}</div><div className="custom-row"><input value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Or name a custom exercise" aria-label="Custom exercise name" /><button onClick={() => customName.trim() && addExercise({ id: `custom-${Date.now()}`, name: customName.trim(), sets: 3, reps: '8–10' })} disabled={!customName.trim()}>Add</button></div></div></section></div></div>}
        {workoutView === 'camera' && <div className="content-stack"><div className="section-intro"><h2>See what your set says.</h2><p>Set your phone down, record your squats, then hear your next move.</p></div><Camera onSetComplete={completeAnalyzedSet} /></div>}
      </>}
      {tab === 'calendar' && <><div className="page-heading"><span className="eyebrow">YOUR CONSISTENCY</span><h1>Calendar</h1><p>A clear view of the days you showed up.</p></div><div className="content-stack"><section className="surface calendar-panel"><div className="calendar-header"><div><span className="eyebrow">TRAINING HISTORY</span><h2>{calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2></div><div className="calendar-controls"><button aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><button aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div></div><div className="calendar-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="calendar-weekday">{day}</div>)}{cells.map((date, index) => date ? <div key={localDateKey(date)} className={`calendar-day ${localDateKey(date) === todayKey ? 'today' : ''} ${logs[localDateKey(date)]?.completed.length ? 'completed' : ''}`} title={logs[localDateKey(date)]?.completed.join(', ') || 'No workout logged'}><span>{date.getDate()}</span>{logs[localDateKey(date)]?.completed.length ? <i /> : null}</div> : <div key={`blank-${index}`} className="calendar-blank" />)}</div><div className="calendar-footer"><span><i className="legend-dot" />Workout logged</span><span>Mark exercises complete on the Workout tab.</span></div></section><div className="subtle-note"><span className="note-symbol" aria-hidden="true">◈</span><div><strong>Your history is local</strong><p>Calendar entries are saved only in this browser. Clearing its data removes them.</p></div></div></div></>}
      {tab === 'profile' && <><div className="page-heading"><span className="eyebrow">YOUR SPACE</span><h1>Profile</h1><p>Your training at a glance, without an account.</p></div><div className="content-stack profile-stack"><section className="surface profile-hero"><div className="profile-avatar" aria-hidden="true">L</div><div><span className="eyebrow">LIFTCAM PROFILE</span><h2>Keep showing up.</h2><p>No sign-in, no cloud profile. Just your plan and your progress on this device.</p></div></section><section className="surface profile-stats"><div className="section-heading"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>Progress so far</h2></div></div><div className="profile-stat-grid"><div><strong>{loggedDays}</strong><span>Days logged</span></div><div><strong>{analyzedSets}</strong><span>Camera sets</span></div><div><strong>{plannedDays}</strong><span>Planned days / week</span></div></div></section><section className="surface privacy-panel"><span className="eyebrow">DATA & PRIVACY</span><h2>Built to be personal.</h2><div className="privacy-row"><strong>Camera video</strong><span>Processed on your device, never uploaded</span></div><div className="privacy-row"><strong>Plan and calendar</strong><span>Saved in this browser only</span></div><div className="privacy-row"><strong>AI coach</strong><span>{import.meta.env.VITE_COACH_API_URL ? 'Numeric rep measurements sent to your AWS endpoint' : 'Local preview until AWS is connected'}</span></div></section></div></>}
    </main>
    <nav className="bottom-nav" aria-label="Main navigation">{([['workout', 'Workout'], ['calendar', 'Calendar'], ['profile', 'Profile']] as const).map(([name, label]) => <button key={name} className={tab === name ? 'active' : ''} aria-current={tab === name ? 'page' : undefined} onClick={() => navigate(name)}><NavIcon name={name} /><span>{label}</span></button>)}</nav>
  </div>;
}

export default App;

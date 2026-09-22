import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Camera } from './Camera';
import { type SetAnalysis } from './analysis';
import { DAYS, EXERCISES, INITIAL_PLAN, WEEK_ORDER, loadStored, localDateKey, type PlannedExercise, type WeekPlan, type WorkoutLog } from './data';

type Tab = 'workout' | 'calendar' | 'profile';
type WorkoutView = 'overview' | 'session' | 'camera';
type CalendarView = 'history' | 'schedule';
type SetDraft = { weight: string; reps: string };
const today = new Date();
const exerciseCount = (count: number) => `${count} ${count === 1 ? 'exercise' : 'exercises'}`;

function NavIcon({ name }: { name: Tab }) {
  if (name === 'workout') return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 9v6m3-9v12m3-9v6m6-6v6m3-9v12m3-9v6M3 12h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  if (name === 'calendar') return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" /><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 4h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" /><path d="M4.5 20c.5-4 3.2-6 7.5-6s7 2 7.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function App() {
  const [tab, setTab] = useState<Tab>('workout');
  const [workoutView, setWorkoutView] = useState<WorkoutView>('overview');
  const [cameraReturn, setCameraReturn] = useState<'overview' | 'session'>('overview');
  const [cameraDraftKey, setCameraDraftKey] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>('history');
  const [plan, setPlan] = useState<WeekPlan>(() => loadStored('liftcam-plan-v1', INITIAL_PLAN));
  const [logs, setLogs] = useState<Record<string, WorkoutLog>>(() => loadStored('liftcam-logs-v1', {}));
  const [selectedDay, setSelectedDay] = useState(today.getDay());
  const [search, setSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb');

  const todayKey = localDateKey(today);
  const todayExercises = plan[today.getDay()] ?? [];
  const todayLog = logs[todayKey];
  const todayEntries = todayLog?.entries ?? [];
  const loggedDays = Object.values(logs).filter(log => log.completed.length > 0).length;
  const manualSets = Object.values(logs).reduce((sum, log) => sum + (log.entries?.length ?? 0), 0);
  const analyzedSets = Object.values(logs).reduce((sum, log) => sum + log.sets, 0);

  useEffect(() => { localStorage.setItem('liftcam-plan-v1', JSON.stringify(plan)); }, [plan]);
  useEffect(() => { localStorage.setItem('liftcam-logs-v1', JSON.stringify(logs)); }, [logs]);

  function navigate(nextTab: Tab) {
    setTab(nextTab);
    window.scrollTo(0, 0);
  }

  function openSchedule() {
    setSelectedDay(today.getDay());
    setCalendarView('schedule');
    navigate('calendar');
  }

  function openCamera(returnTo: 'overview' | 'session', draftKey: string | null = null) {
    setCameraReturn(returnTo);
    setCameraDraftKey(draftKey);
    setWorkoutView('camera');
    window.scrollTo(0, 0);
  }

  function addExercise(exercise: PlannedExercise) {
    setPlan(current => ({ ...current, [selectedDay]: [...(current[selectedDay] ?? []), exercise] }));
    setSearch('');
    setCustomName('');
  }

  function removeExercise(index: number) {
    setPlan(current => ({ ...current, [selectedDay]: current[selectedDay].filter((_, i) => i !== index) }));
  }

  function updateDraft(key: string, field: keyof SetDraft, value: string) {
    setDrafts(current => ({ ...current, [key]: { weight: current[key]?.weight ?? '', reps: current[key]?.reps ?? '', [field]: value } }));
  }

  function logSet(event: FormEvent<HTMLFormElement>, exercise: PlannedExercise, key: string) {
    event.preventDefault();
    const draft = drafts[key];
    if (!draft?.weight.trim() || !draft.reps.trim()) return;
    const weight = Number(draft.weight);
    const reps = Number(draft.reps);
    if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 1) return;
    setLogs(current => {
      const previous = current[todayKey] ?? { date: todayKey, completed: [], sets: 0 };
      const entry = { exerciseId: exercise.id, exerciseName: exercise.name, weight, unit, reps, recordedAt: new Date().toISOString() };
      return { ...current, [todayKey]: { ...previous, completed: previous.completed.includes(exercise.name) ? previous.completed : [...previous.completed, exercise.name], entries: [...(previous.entries ?? []), entry] } };
    });
    setDrafts(current => ({ ...current, [key]: { weight: draft.weight, reps: '' } }));
  }

  function completeAnalyzedSet(analysis: SetAnalysis) {
    setLogs(current => {
      const previous = current[todayKey] ?? { date: todayKey, completed: [], sets: 0 };
      return { ...current, [todayKey]: { ...previous, sets: previous.sets + 1, completed: previous.completed.includes('Barbell Squat') ? previous.completed : [...previous.completed, 'Barbell Squat'] } };
    });
    if (cameraDraftKey) updateDraft(cameraDraftKey, 'reps', String(analysis.reps.length));
  }

  const filteredExercises = useMemo(() => EXERCISES.filter(exercise => `${exercise.name} ${exercise.category}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8), [search]);
  const firstOfMonth = calendarMonth.getDay();
  const cells = Array.from({ length: firstOfMonth + new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => index < firstOfMonth ? null : new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index - firstOfMonth + 1));

  return <div className="app-shell">
    <header className="app-header"><div className="header-inner"><div className="brand"><span className="brand-symbol" aria-hidden="true">L</span><span>LiftCam</span></div><span className="header-date">{today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span></div></header>
    <main className="main-content">
      {tab === 'workout' && <>
        {workoutView === 'overview' && <>
          <div className="page-heading"><span className="eyebrow">READY WHEN YOU ARE</span><h1>Workout</h1><p>Today's plan and one focused way to train smarter.</p></div>
          <div className="content-stack workout-overview">
            <section className="feature-card"><div><span className="eyebrow">LIFTCAM VISION</span><h2>See the story<br />in every rep.</h2><p>Record a squat set to see your pace and hear what to focus on next.</p><button className="feature-link" onClick={() => openCamera('overview')}>Open LiftCam vision <span aria-hidden="true">→</span></button></div><div className="feature-orbit" aria-hidden="true"><div className="orbit-core"><span>01</span><i /></div><span className="orbit-caption">REP BY REP</span></div></section>
            <section className="surface today-panel"><div className="section-heading"><div><span className="eyebrow">TODAY'S WORKOUT</span><h2>{DAYS[today.getDay()]}</h2></div><span className="tag">{exerciseCount(todayExercises.length)}</span></div>
              {todayExercises.length ? <><div className="today-list">{todayExercises.map((exercise, index) => <div key={`${exercise.id}-${index}`} className="today-exercise"><span className="exercise-number">{String(index + 1).padStart(2, '0')}</span><span className="exercise-info"><strong>{exercise.name}</strong><small>{exercise.sets} sets · {exercise.reps} reps</small></span>{todayLog?.completed.includes(exercise.name) && <span className="done-label">Logged</span>}</div>)}</div><button className="primary-button start-workout" onClick={() => { setWorkoutView('session'); window.scrollTo(0, 0); }}>{todayEntries.length ? 'Resume workout' : 'Start workout'}</button></> : <><div className="empty-small">No exercises planned today.</div><button className="text-button" onClick={openSchedule}>Create your weekly schedule →</button></>}
            </section>
          </div>
        </>}
        {workoutView === 'session' && <>
          <div className="page-heading session-heading"><button className="back-link" onClick={() => { setWorkoutView('overview'); window.scrollTo(0, 0); }}>← Workout</button><span className="eyebrow">IN PROGRESS</span><h1>Today's workout</h1><p>{todayEntries.length} {todayEntries.length === 1 ? 'set' : 'sets'} logged · {DAYS[today.getDay()]}</p><div className="unit-control"><span>Weight unit</span><button className={unit === 'lb' ? 'selected' : ''} onClick={() => setUnit('lb')}>lb</button><button className={unit === 'kg' ? 'selected' : ''} onClick={() => setUnit('kg')}>kg</button></div></div>
          <div className="content-stack session-stack">
            {todayExercises.map((exercise, index) => {
              const key = `${exercise.id}-${index}`;
              const draft = drafts[key] ?? { weight: '', reps: '' };
              const exerciseSets = todayEntries.filter(entry => entry.exerciseName === exercise.name);
              return <section className="surface session-exercise" key={key}>
                <div className="section-heading"><div><span className="eyebrow">EXERCISE {String(index + 1).padStart(2, '0')}</span><h2>{exercise.name}</h2><p className="target-copy">Target · {exercise.sets} sets of {exercise.reps} reps</p></div><span className="tag">{exerciseSets.length} logged</span></div>
                {exerciseSets.length > 0 && <div className="logged-sets" aria-label={`Logged sets for ${exercise.name}`}>{exerciseSets.map((entry, setIndex) => <div key={`${entry.recordedAt}-${setIndex}`}><span>Set {setIndex + 1}</span><strong>{entry.weight === 0 ? 'Bodyweight' : `${entry.weight} ${entry.unit}`} × {entry.reps} reps</strong></div>)}</div>}
                <form className="set-form" onSubmit={event => logSet(event, exercise, key)}>
                  <label><span className="field-label">Weight <small>({unit})</small></span><input type="number" inputMode="decimal" min="0" step="0.5" required placeholder="0" value={draft.weight} onChange={event => updateDraft(key, 'weight', event.target.value)} /></label>
                  <label>Reps<input type="number" inputMode="numeric" min="1" step="1" required placeholder="0" value={draft.reps} onChange={event => updateDraft(key, 'reps', event.target.value)} /></label>
                  <button className="primary-button" type="submit">Log set</button>
                </form>
                {exercise.analyzed && <button className="text-button camera-option" onClick={() => openCamera('session', key)}>Use LiftCam vision for this set →</button>}
              </section>;
            })}
            <div className="session-footer"><button className="secondary-button" onClick={() => { setWorkoutView('overview'); window.scrollTo(0, 0); }}>Done for now</button></div>
          </div>
        </>}
        {workoutView === 'camera' && <>
          <div className="page-heading camera-page-heading"><button className="back-link" onClick={() => { setWorkoutView(cameraReturn); window.scrollTo(0, 0); }}>← {cameraReturn === 'session' ? 'Back to workout' : 'Workout'}</button><span className="eyebrow">LIFTCAM VISION</span><h1>Set analysis</h1><p>Record a squat set, then hear your next move.</p></div>
          <div className="content-stack"><Camera onSetComplete={completeAnalyzedSet} />{cameraDraftKey && <p className="camera-hint">After analysis, return to your workout. The detected rep count will be ready in your set log; add your weight and save it.</p>}</div>
        </>}
      </>}
      {tab === 'calendar' && <>
        <div className="page-heading"><span className="eyebrow">PLAN AND PROGRESS</span><h1>Calendar</h1><p>Make your weekly schedule, then see the days you showed up.</p></div>
        <div className="segmented-control" role="tablist" aria-label="Calendar sections"><button role="tab" aria-selected={calendarView === 'history'} className={calendarView === 'history' ? 'selected' : ''} onClick={() => setCalendarView('history')}>History</button><button role="tab" aria-selected={calendarView === 'schedule'} className={calendarView === 'schedule' ? 'selected' : ''} onClick={() => setCalendarView('schedule')}>Weekly schedule</button></div>
        {calendarView === 'history' && <div className="content-stack"><section className="surface calendar-panel"><div className="calendar-header"><div><span className="eyebrow">TRAINING HISTORY</span><h2>{calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2></div><div className="calendar-controls"><button aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><button aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div></div><div className="calendar-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="calendar-weekday">{day}</div>)}{cells.map((date, index) => date ? <div key={localDateKey(date)} className={`calendar-day ${localDateKey(date) === todayKey ? 'today' : ''} ${logs[localDateKey(date)]?.completed.length ? 'completed' : ''}`} title={logs[localDateKey(date)]?.completed.join(', ') || 'No workout logged'}><span>{date.getDate()}</span>{logs[localDateKey(date)]?.completed.length ? <i /> : null}</div> : <div key={`blank-${index}`} className="calendar-blank" />)}</div><div className="calendar-footer"><span><i className="legend-dot" />Workout logged</span><button className="text-button" onClick={() => setCalendarView('schedule')}>Edit weekly schedule →</button></div></section></div>}
        {calendarView === 'schedule' && <div className="content-stack"><div className="section-intro"><h2>Your weekly schedule.</h2><p>Choose a day, then add exercises. This repeats each week on this device.</p></div><div className="plan-layout"><section className="surface plan-days"><span className="eyebrow">SELECT A DAY</span><div className="day-list">{WEEK_ORDER.map(day => <button key={day} className={selectedDay === day ? 'selected' : ''} onClick={() => setSelectedDay(day)}><span>{DAYS[day]}</span><small>{(plan[day] ?? []).length ? exerciseCount(plan[day].length) : 'Rest day'}</small></button>)}</div></section><section className="surface day-detail"><div className="section-heading"><div><span className="eyebrow">YOUR SESSION</span><h2>{DAYS[selectedDay]} plan</h2></div><span className="tag">{exerciseCount((plan[selectedDay] ?? []).length)}</span></div>{(plan[selectedDay] ?? []).length ? (plan[selectedDay] ?? []).map((exercise, index) => <div className="plan-exercise" key={`${exercise.id}-${index}`}><div><strong>{exercise.name}</strong><span>{exercise.sets} sets · {exercise.reps} reps{exercise.analyzed ? ' · Camera ready' : ''}</span></div><button aria-label={`Remove ${exercise.name}`} onClick={() => removeExercise(index)}>×</button></div>) : <div className="empty-small">Nothing planned. Leave it as a rest day or add an exercise below.</div>}<div className="add-box"><span className="eyebrow">ADD AN EXERCISE</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search workouts…" aria-label="Search workouts" /><div className="exercise-options">{filteredExercises.map(exercise => <button key={exercise.id} onClick={() => addExercise({ id: exercise.id, name: exercise.name, sets: 3, reps: '8–10', analyzed: exercise.analyzed })}><span>{exercise.name}<small>{exercise.category}{exercise.analyzed ? ' · Camera ready' : ''}</small></span><b>+</b></button>)}</div><div className="custom-row"><input value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Or name a custom exercise" aria-label="Custom exercise name" /><button onClick={() => customName.trim() && addExercise({ id: `custom-${Date.now()}`, name: customName.trim(), sets: 3, reps: '8–10' })} disabled={!customName.trim()}>Add</button></div></div></section></div></div>}
      </>}
      {tab === 'profile' && <><div className="page-heading"><span className="eyebrow">YOUR SPACE</span><h1>Profile</h1><p>Your training at a glance, without an account.</p></div><div className="content-stack profile-stack"><section className="surface profile-hero"><div className="profile-avatar" aria-hidden="true">L</div><div><span className="eyebrow">LIFTCAM PROFILE</span><h2>Keep showing up.</h2><p>No sign-in, no cloud profile. Just your plan and your progress on this device.</p></div></section><section className="surface profile-stats"><div className="section-heading"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>Progress so far</h2></div></div><div className="profile-stat-grid"><div><strong>{loggedDays}</strong><span>Days logged</span></div><div><strong>{manualSets}</strong><span>Sets logged</span></div><div><strong>{analyzedSets}</strong><span>Camera sets</span></div></div></section><section className="surface privacy-panel"><span className="eyebrow">DATA & PRIVACY</span><h2>Built to be personal.</h2><div className="privacy-row"><strong>Camera video</strong><span>Processed on your device, never uploaded</span></div><div className="privacy-row"><strong>Plan and workout log</strong><span>Saved in this browser only</span></div><div className="privacy-row"><strong>AI coach</strong><span>{import.meta.env.VITE_COACH_API_URL ? 'Numeric rep measurements sent to your AWS endpoint' : 'Local preview until AWS is connected'}</span></div></section></div></>}
    </main>
    <nav className="bottom-nav" aria-label="Main navigation">{([['workout', 'Workout'], ['calendar', 'Calendar'], ['profile', 'Profile']] as const).map(([name, label]) => <button key={name} className={tab === name ? 'active' : ''} aria-current={tab === name ? 'page' : undefined} onClick={() => navigate(name)}><NavIcon name={name} /><span>{label}</span></button>)}</nav>
  </div>;
}

export default App;

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Camera } from './Camera';
import { ExerciseThumb } from './ExerciseThumb';
import { type SetAnalysis } from './analysis';
import { DAYS, EXERCISES, WEEK_ORDER, loadStored, loadWeekPlan, localDateKey, type PlannedExercise, type SavedRoutine, type WorkoutLog } from './data';

type Tab = 'workout' | 'calendar' | 'profile';
type WorkoutView = 'overview' | 'create' | 'session' | 'camera';
type CalendarView = 'history' | 'schedule';
type SetDraft = { id: string; weight: string; reps: string };
type SessionExercise = PlannedExercise & { instanceId: string; rows: SetDraft[] };
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
  const [plan, setPlan] = useState(loadWeekPlan);
  const [savedRoutines, setSavedRoutines] = useState<SavedRoutine[]>(() => loadStored('liftcam-routines-v1', []));
  const [logs, setLogs] = useState<Record<string, WorkoutLog>>(() => loadStored('liftcam-logs-v1', {}));
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cameraSetsInSession, setCameraSetsInSession] = useState(0);
  const [sessionExercises, setSessionExercises] = useState<SessionExercise[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [routineName, setRoutineName] = useState('');
  const [selectedDay, setSelectedDay] = useState(today.getDay());
  const [search, setSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb');

  const todayKey = localDateKey(today);
  const sessionName = savedRoutines.find(routine => routine.id === activeRoutineId)?.name ?? 'Workout';
  const loggedDays = Object.values(logs).filter(log => log.completed.length > 0).length;
  const manualSets = Object.values(logs).reduce((sum, log) => sum + (log.entries?.length ?? 0), 0);
  const analyzedSets = Object.values(logs).reduce((sum, log) => sum + log.sets, 0);

  useEffect(() => { localStorage.setItem('liftcam-plan-v1', JSON.stringify(plan)); }, [plan]);
  useEffect(() => { localStorage.setItem('liftcam-routines-v1', JSON.stringify(savedRoutines)); }, [savedRoutines]);
  useEffect(() => { localStorage.setItem('liftcam-logs-v1', JSON.stringify(logs)); }, [logs]);

  useEffect(() => {
    if (!sessionStartedAt) return;
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - sessionStartedAt) / 1000));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [sessionStartedAt]);

  const timerText = `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0')}:${String(Math.floor(elapsedSeconds % 3600 / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;

  function navigate(nextTab: Tab) {
    setTab(nextTab);
    window.scrollTo(0, 0);
  }

  function startWorkout(routineId: string) {
    setActiveRoutineId(routineId);
    setActiveSessionId(`session-${Date.now()}`);
    setSessionStartedAt(Date.now());
    setElapsedSeconds(0);
    setCameraSetsInSession(0);
    setSessionExercises([]);
    setShowExercisePicker(true);
    setSessionError('');
    setWorkoutView('session');
    window.scrollTo(0, 0);
  }

  function finishWorkout() {
    const rows = sessionExercises.flatMap(exercise => exercise.rows.map(row => ({ exercise, row })));
    const partial = rows.some(({ row }) => (row.weight.trim() && !row.reps.trim()) || (!row.weight.trim() && row.reps.trim()));
    if (partial) { setSessionError('Complete both weight and reps for each set, or leave the row blank.'); return; }
    const completed = rows.filter(({ row }) => row.weight.trim() && row.reps.trim());
    const invalid = completed.some(({ row }) => !Number.isFinite(Number(row.weight)) || Number(row.weight) < 0 || !Number.isInteger(Number(row.reps)) || Number(row.reps) < 1);
    if (invalid) { setSessionError('Use a valid weight and at least one rep for each completed set.'); return; }
    if (completed.length) {
      setLogs(current => {
        const previous = current[todayKey] ?? { date: todayKey, completed: [], sets: 0 };
        const entries = completed.map(({ exercise, row }) => ({ exerciseId: exercise.id, exerciseName: exercise.name, weight: Number(row.weight), unit, reps: Number(row.reps), recordedAt: new Date().toISOString(), sessionId: activeSessionId ?? undefined }));
        return { ...current, [todayKey]: { ...previous, completed: [...new Set([...previous.completed, ...completed.map(({ exercise }) => exercise.name)])], entries: [...(previous.entries ?? []), ...entries] } };
      });
    }
    setSessionStartedAt(null);
    setActiveRoutineId(null);
    setWorkoutView('overview');
    window.scrollTo(0, 0);
  }

  function createRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = routineName.trim();
    if (!name) return;
    setSavedRoutines(current => [...current, { id: `routine-${Date.now()}`, name, exercises: [] }]);
    setRoutineName('');
    setWorkoutView('overview');
    window.scrollTo(0, 0);
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

  function addSessionExercise(exercise: PlannedExercise) {
    setSessionExercises(current => [...current, { ...exercise, instanceId: `exercise-${Date.now()}-${Math.random()}`, rows: [{ id: `set-${Date.now()}`, weight: '', reps: '' }] }]);
    setShowExercisePicker(false);
    setSearch('');
    setCustomName('');
  }

  function removeExercise(index: number) {
    setPlan(current => ({ ...current, [selectedDay]: current[selectedDay].filter((_, i) => i !== index) }));
  }

  function updateSet(exerciseId: string, rowId: string, field: 'weight' | 'reps', value: string) {
    setSessionExercises(current => current.map(exercise => exercise.instanceId === exerciseId ? { ...exercise, rows: exercise.rows.map(row => row.id === rowId ? { ...row, [field]: value } : row) } : exercise));
    setSessionError('');
  }

  function addSet(exerciseId: string) {
    setSessionExercises(current => current.map(exercise => exercise.instanceId === exerciseId ? { ...exercise, rows: [...exercise.rows, { id: `set-${Date.now()}-${Math.random()}`, weight: '', reps: '' }] } : exercise));
  }

  function completeAnalyzedSet(analysis: SetAnalysis) {
    const exerciseName = sessionExercises.find(exercise => exercise.instanceId === cameraDraftKey)?.name ?? 'Workout';
    setCameraSetsInSession(current => current + 1);
    setLogs(current => {
      const previous = current[todayKey] ?? { date: todayKey, completed: [], sets: 0 };
      return { ...current, [todayKey]: { ...previous, sets: previous.sets + 1, completed: previous.completed.includes(exerciseName) ? previous.completed : [...previous.completed, exerciseName] } };
    });
    if (cameraDraftKey) {
      setSessionExercises(current => current.map(exercise => {
        if (exercise.instanceId !== cameraDraftKey) return exercise;
        const blankIndex = exercise.rows.findIndex(row => !row.reps);
        const rows = blankIndex >= 0 ? exercise.rows.map((row, index) => index === blankIndex ? { ...row, reps: String(analysis.reps.length) } : row) : [...exercise.rows, { id: `set-${Date.now()}`, weight: '', reps: String(analysis.reps.length) }];
        return { ...exercise, rows };
      }));
    }
  }

  const filteredExercises = useMemo(() => EXERCISES.filter(exercise => `${exercise.name} ${exercise.category}`.toLowerCase().includes(search.toLowerCase())), [search]);
  const firstOfMonth = calendarMonth.getDay();
  const cells = Array.from({ length: firstOfMonth + new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => index < firstOfMonth ? null : new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index - firstOfMonth + 1));

  return <div className="app-shell">
    <header className="app-header"><div className="header-inner"><div className="brand"><span className="brand-symbol" aria-hidden="true">L</span><span>LiftCam</span></div></div></header>
    <main className="main-content">
      {tab === 'workout' && <>
        {workoutView === 'overview' && <>
          <div className="page-heading"><span className="eyebrow">YOUR TRAINING</span><h1>Routines</h1><p>{savedRoutines.length ? 'Choose a routine to get started.' : 'Your training starts here.'}</p></div>
          <div className="content-stack workout-overview routine-list">
            {savedRoutines.map(routine => <section className="surface routine-card" key={routine.id}>
              <div className="routine-icon saved" aria-hidden="true">L</div>
              <div className="routine-body"><span className="eyebrow">SAVED ROUTINE</span><h2>{routine.name}</h2><p>Build each session from the exercise library.</p><button className="primary-button" onClick={() => startWorkout(routine.id)}>Start routine</button></div>
            </section>)}
            <button className={`new-workout-button ${savedRoutines.length ? 'compact-create' : ''}`} onClick={() => { setWorkoutView('create'); window.scrollTo(0, 0); }}><span className="new-workout-plus" aria-hidden="true">+</span><strong>Create new routine</strong><small>Name it now, add exercises during your workout</small></button>
          </div>
        </>}
        {workoutView === 'create' && <><div className="page-heading"><button className="back-link" onClick={() => setWorkoutView('overview')}>← Routines</button><span className="eyebrow">YOUR TRAINING</span><h1>New routine</h1><p>Give your routine a name. It starts empty, ready for your exercises.</p></div><div className="content-stack finish-stack"><section className="surface save-routine-card"><form onSubmit={createRoutine}><label>Routine name<input value={routineName} onChange={event => setRoutineName(event.target.value)} placeholder="e.g. Push day" required autoFocus /></label><button className="primary-button" type="submit">Create routine</button></form></section></div></>}
        {workoutView === 'session' && <>
          <div className="page-heading session-heading"><span className="eyebrow">WORKOUT IN PROGRESS</span><h1>{sessionName}</h1><p>{sessionExercises.length ? `${exerciseCount(sessionExercises.length)} added` : 'Start by adding an exercise.'}{cameraSetsInSession > 0 ? ` · ${cameraSetsInSession} camera ${cameraSetsInSession === 1 ? 'analysis' : 'analyses'}` : ''}</p><div className="unit-control"><span>Weight unit</span><button className={unit === 'lb' ? 'selected' : ''} onClick={() => setUnit('lb')}>lb</button><button className={unit === 'kg' ? 'selected' : ''} onClick={() => setUnit('kg')}>kg</button></div></div>
          <div className="content-stack session-stack live-session">
            {!showExercisePicker && <button className="add-more-button" onClick={() => setShowExercisePicker(true)}>+ Add exercise</button>}
            {showExercisePicker && <section className="surface free-picker"><div className="picker-heading"><div><span className="eyebrow">EXERCISE LIBRARY</span><h2>Choose an exercise</h2></div><button className="picker-close" onClick={() => setShowExercisePicker(false)} aria-label="Close exercise library">×</button></div><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search all exercises…" aria-label="Search exercises" /><div className="free-exercise-options">{filteredExercises.map(exercise => <button key={exercise.id} onClick={() => addSessionExercise({ id: exercise.id, name: exercise.name, sets: 0, reps: '', analyzed: exercise.analyzed })}><ExerciseThumb id={exercise.id} name={exercise.name} /><span className="library-name"><strong>{exercise.name}</strong><small>{exercise.category}</small></span><b>+</b></button>)}{filteredExercises.length === 0 && <p className="empty-small">No matching exercises. Try another search or add your own below.</p>}</div><div className="custom-row"><input value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Custom exercise" aria-label="Custom exercise name" /><button onClick={() => customName.trim() && addSessionExercise({ id: `custom-${Date.now()}`, name: customName.trim(), sets: 0, reps: '' })} disabled={!customName.trim()}>Add</button></div></section>}
            {sessionExercises.map((exercise, index) => {
              return <section className="surface session-exercise" key={exercise.instanceId}>
                <div className="exercise-card-heading"><ExerciseThumb id={exercise.id} name={exercise.name} /><div><span className="eyebrow">EXERCISE {String(index + 1).padStart(2, '0')}</span><h2>{exercise.name}</h2></div><button className="remove-exercise" onClick={() => setSessionExercises(current => current.filter(item => item.instanceId !== exercise.instanceId))} aria-label={`Remove ${exercise.name}`}>×</button></div>
                <div className="set-table-head"><span>SET</span><span>WEIGHT ({unit})</span><span>REPS</span></div>
                <div className="set-rows">{exercise.rows.map((row, rowIndex) => <div className="set-row" key={row.id}><span className="set-number">{rowIndex + 1}</span><input type="number" inputMode="decimal" min="0" step="0.5" placeholder="—" value={row.weight} onChange={event => updateSet(exercise.instanceId, row.id, 'weight', event.target.value)} aria-label={`${exercise.name} set ${rowIndex + 1} weight in ${unit}`} /><input type="number" inputMode="numeric" min="1" step="1" placeholder="—" value={row.reps} onChange={event => updateSet(exercise.instanceId, row.id, 'reps', event.target.value)} aria-label={`${exercise.name} set ${rowIndex + 1} reps`} /></div>)}</div>
                <button className="add-set-button" onClick={() => addSet(exercise.instanceId)}>+ Add set</button>
                {exercise.analyzed && <button className="text-button camera-option" onClick={() => openCamera('session', exercise.instanceId)}>Use LiftCam vision for this set →</button>}
              </section>;
            })}
          </div>
          {sessionError && <p className="session-error" role="alert">{sessionError}</p>}
          <div className="floating-finish"><div><span>WORKOUT TIME</span><strong>{timerText}</strong></div><button className="primary-button" onClick={finishWorkout}>Finish workout</button></div>
        </>}
        {workoutView === 'camera' && <>
          <div className="page-heading camera-page-heading"><button className="back-link" onClick={() => { setWorkoutView(cameraReturn); window.scrollTo(0, 0); }}>← Back to workout</button><span className="eyebrow">LIFTCAM VISION</span><h1>Set analysis</h1><p>Record your set, then hear your next move.</p></div>
          <div className="content-stack"><Camera exercise={sessionExercises.find(exercise => exercise.instanceId === cameraDraftKey)?.name ?? 'Barbell Squat'} onSetComplete={completeAnalyzedSet} />{cameraDraftKey && <p className="camera-hint">After analysis, return to your workout. Detected reps will fill your last set row; add weight before finishing.</p>}</div>
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

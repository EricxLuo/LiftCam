import { useMemo, useState } from 'react';
import { EXERCISES, type Exercise } from './data';
import { ExerciseThumb } from './ExerciseThumb';

const CATEGORY_ORDER = ['Legs', 'Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Cardio'];

export function ExerciseLibrary({ onSelect, onCustom, onClose }: { onSelect: (exercise: Exercise) => void; onCustom: (name: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [customName, setCustomName] = useState('');
  const groups = useMemo(() => CATEGORY_ORDER.map(category => ({ category, exercises: EXERCISES.filter(exercise => exercise.category === category && `${exercise.name} ${exercise.category}`.toLowerCase().includes(query.trim().toLowerCase())) })).filter(group => group.exercises.length), [query]);

  return <section className="surface exercise-library">
    <div className="picker-heading"><div><span className="eyebrow">EXERCISE LIBRARY</span><h2>Add exercise</h2></div><button className="picker-close" onClick={onClose} aria-label="Close exercise library">×</button></div>
    <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search exercises…" aria-label="Search exercises" />
    <div className="exercise-groups">{groups.map(group => <div className="exercise-group" key={group.category}><h3>{group.category}</h3>{group.exercises.map(exercise => <button className="library-exercise" key={exercise.id} onClick={() => onSelect(exercise)}><ExerciseThumb id={exercise.id} name={exercise.name} /><span><strong>{exercise.name}</strong><small>{exercise.analyzed ? 'LiftCam Vision available' : group.category}</small></span><b>+</b></button>)}</div>)}{groups.length === 0 && <p className="empty-small">No matching exercises. Try a different search or add a custom exercise.</p>}</div>
    <div className="custom-row"><input value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Custom exercise" aria-label="Custom exercise name" /><button onClick={() => { if (customName.trim()) onCustom(customName.trim()); }} disabled={!customName.trim()}>Add</button></div>
  </section>;
}

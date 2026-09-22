export type Exercise = { id: string; name: string; category: string; analyzed?: boolean };
export type PlannedExercise = { id: string; name: string; sets: number; reps: string; analyzed?: boolean };
export type WorkoutLog = { date: string; completed: string[]; sets: number };
export type WeekPlan = Record<number, PlannedExercise[]>;

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const EXERCISES: Exercise[] = [
  { id: 'squat', name: 'Barbell Squat', category: 'Legs', analyzed: true },
  { id: 'goblet-squat', name: 'Goblet Squat', category: 'Legs' },
  { id: 'leg-press', name: 'Leg Press', category: 'Legs' },
  { id: 'rdl', name: 'Romanian Deadlift', category: 'Legs' },
  { id: 'lunge', name: 'Lunges', category: 'Legs' },
  { id: 'bench', name: 'Bench Press', category: 'Chest' },
  { id: 'incline-bench', name: 'Incline Press', category: 'Chest' },
  { id: 'pushup', name: 'Push-ups', category: 'Chest' },
  { id: 'deadlift', name: 'Deadlift', category: 'Back' },
  { id: 'row', name: 'Barbell Row', category: 'Back' },
  { id: 'pulldown', name: 'Lat Pulldown', category: 'Back' },
  { id: 'pullup', name: 'Pull-ups', category: 'Back' },
  { id: 'ohp', name: 'Overhead Press', category: 'Shoulders' },
  { id: 'lateral-raise', name: 'Lateral Raise', category: 'Shoulders' },
  { id: 'curl', name: 'Bicep Curl', category: 'Arms' },
  { id: 'tricep', name: 'Tricep Pushdown', category: 'Arms' },
  { id: 'plank', name: 'Plank', category: 'Core' },
  { id: 'run', name: 'Running', category: 'Cardio' },
  { id: 'bike', name: 'Cycling', category: 'Cardio' },
];

export const INITIAL_PLAN: WeekPlan = {
  0: [],
  1: [{ id: 'squat', name: 'Barbell Squat', sets: 3, reps: '6–8', analyzed: true }, { id: 'rdl', name: 'Romanian Deadlift', sets: 3, reps: '8–10' }],
  2: [],
  3: [{ id: 'bench', name: 'Bench Press', sets: 3, reps: '6–8' }, { id: 'row', name: 'Barbell Row', sets: 3, reps: '8–10' }],
  4: [],
  5: [{ id: 'squat', name: 'Barbell Squat', sets: 3, reps: '6–8', analyzed: true }, { id: 'ohp', name: 'Overhead Press', sets: 3, reps: '8–10' }],
  6: [],
};

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function loadStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

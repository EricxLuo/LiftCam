import { useState, type FormEvent } from 'react';

export type CoachExerciseContext = {
  name: string;
  current: { weight: number; reps: number; unit: 'lb' | 'kg' }[];
  previous: { weight: number; reps: number; unit: 'lb' | 'kg' }[];
};

type Message = { id: string; role: 'coach' | 'you'; text: string };

function localReply(question: string, exercises: CoachExerciseContext[]): string {
  const lower = question.toLowerCase();
  const current = exercises.flatMap(exercise => exercise.current.map(set => `${exercise.name}: ${set.weight} ${set.unit} × ${set.reps}`));
  const previous = exercises.flatMap(exercise => exercise.previous.map(set => `${exercise.name}: ${set.weight} ${set.unit} × ${set.reps}`));
  if (/previous|last time|last set|before/.test(lower)) return previous.length ? `Last recorded sets: ${previous.slice(0, 5).join('; ')}. Use those as a reference, then adjust based on how today's reps feel.` : 'This routine has no previous checked sets yet. Finish a workout with confirmed sets and I can compare next time.';
  if (/current|today|reps|weight|progress|volume|next set/.test(lower)) return current.length ? `Checked today: ${current.slice(0, 5).join('; ')}. Keep the next set controlled; if reps slow sharply, rest longer or reduce the load.` : 'No sets are checked yet. Enter weight and reps, tap the check beside the set, and I can summarize your workout.';
  if (/rest|recover/.test(lower)) return 'For hard sets, rest until your breathing and technique feel ready again. Heavier compound lifts often need longer rest than lighter accessory work.';
  if (/form|technique|camera|vision/.test(lower)) return 'I cannot judge form from the chat. Open LiftCam Vision on a supported exercise for a rough rep and pace check; its estimates are experimental.';
  return 'This local preview can read your checked and previous sets, but open-ended gym coaching needs the AWS AI endpoint. Try asking about your previous weight, today’s reps, or rest between sets.';
}

export function WorkoutCoach({ exercises }: { exercises: CoachExerciseContext[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ id: 'hello', role: 'coach', text: 'Ask about this workout or your previous sets. I’m here while you train.' }]);
  const [loading, setLoading] = useState(false);
  const endpoint = import.meta.env.VITE_COACH_API_URL?.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim().slice(0, 500);
    if (!question || loading) return;
    setDraft('');
    setMessages(current => [...current, { id: `you-${Date.now()}`, role: 'you', text: question }]);
    setLoading(true);
    let answer = localReply(question, exercises);
    if (endpoint) {
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'chat', question, context: exercises }) });
        if (!response.ok) throw new Error(`Coach API returned ${response.status}`);
        const body = await response.json() as { summary?: string };
        if (!body.summary?.trim()) throw new Error('Coach API response was empty');
        answer = body.summary.trim();
      } catch {
        answer = `${answer} (AI coach unavailable; showing local preview.)`;
      }
    }
    setMessages(current => [...current, { id: `coach-${Date.now()}`, role: 'coach', text: answer }]);
    setLoading(false);
  }

  return <div className={`workout-coach ${open ? 'is-open' : ''}`}>
    <div className="coach-popover" aria-hidden={!open}><div className="coach-popover-heading"><span className="coach-orb" aria-hidden="true">✦</span><div><strong>LiftCam Coach</strong><small>{endpoint ? 'AWS endpoint configured' : 'Local preview · AWS not connected'}</small></div><button onClick={() => setOpen(false)} aria-label="Close coach chat">×</button></div><div className="coach-messages" aria-live="polite">{messages.map(message => <p className={message.role} key={message.id}>{message.text}</p>)}{loading && <p className="coach">Thinking…</p>}</div><form onSubmit={submit}><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={500} placeholder="Ask about your workout…" aria-label="Message the coach" disabled={!open || loading} /><button type="submit" disabled={!open || loading || !draft.trim()} aria-label="Send message">↑</button></form></div>
    <button className="coach-launcher" onClick={() => setOpen(current => !current)} aria-expanded={open} aria-label={open ? 'Close LiftCam Coach' : 'Open LiftCam Coach'}><span className="coach-orb" aria-hidden="true">✦</span><span><strong>Ask LiftCam Coach</strong><small>Sets, progress, or your next move</small></span><b>{open ? '⌄' : '⌃'}</b></button>
  </div>;
}

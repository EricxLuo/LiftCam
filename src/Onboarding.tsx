import { useState, type FormEvent } from 'react';
import { type LocalProfile } from './data';

export function Onboarding({ onCreate }: { onCreate: (profile: LocalProfile) => void }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState<LocalProfile['goal']>('Strength');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    onCreate({ name: trimmed, goal, createdAt: new Date().toISOString() });
  }

  return <div className="onboarding-shell"><div className="onboarding-top"><span className="wordmark">Lift<span>Cam</span></span><span className="onboarding-step">01 / 01</span></div><main className="onboarding-main"><div className="onboarding-art" aria-hidden="true"><span>✦</span><i /><i /><i /></div><div className="onboarding-copy"><span className="eyebrow">TRAIN WITH INTENTION</span><h1>Make every set count.</h1><p>Track your training, check your reps, and see the days you showed up.</p></div><form className="onboarding-form" onSubmit={submit}><h2>Set up your space</h2><label>Your name<input value={name} onChange={event => setName(event.target.value)} maxLength={40} placeholder="What should we call you?" autoComplete="given-name" required autoFocus /></label><label>Training focus<select value={goal} onChange={event => setGoal(event.target.value as LocalProfile['goal'])}><option>Strength</option><option>Muscle growth</option><option>General fitness</option></select></label><button className="primary-button" type="submit">Continue to LiftCam →</button><p className="local-profile-note">Local profile only. No password or cloud account—your data stays in this browser until you connect a real sign-in service.</p></form></main></div>;
}

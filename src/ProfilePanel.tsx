import { useState, type FormEvent } from 'react';
import { type LocalProfile } from './data';

export function ProfilePanel({ profile, onSave, loggedDays, manualSets, analyzedSets }: { profile: LocalProfile; onSave: (profile: LocalProfile) => void; loggedDays: number; manualSets: number; analyzedSets: number }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [goal, setGoal] = useState(profile.goal);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ ...profile, name: name.trim().slice(0, 40), goal });
    setEditing(false);
  }

  return <><div className="page-heading"><span className="eyebrow">YOUR SPACE</span><h1>Profile</h1><p>A clearer view of your training.</p></div><div className="content-stack profile-stack"><section className="surface profile-hero updated-profile"><div className="profile-avatar" aria-hidden="true">{profile.name.slice(0, 1).toUpperCase()}</div><div><span className="eyebrow">LOCAL PROFILE</span><h2>{profile.name}</h2><p>Training focus · {profile.goal}</p><button className="text-button" onClick={() => { setName(profile.name); setGoal(profile.goal); setEditing(current => !current); }}>{editing ? 'Cancel editing' : 'Edit profile'}</button></div></section>{editing && <form className="surface profile-edit-form" onSubmit={submit}><label>Name<input value={name} onChange={event => setName(event.target.value)} maxLength={40} required /></label><label>Training focus<select value={goal} onChange={event => setGoal(event.target.value as LocalProfile['goal'])}><option>Strength</option><option>Muscle growth</option><option>General fitness</option></select></label><button className="primary-button" type="submit">Save profile</button></form>}<section className="surface profile-stats"><div className="section-heading"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>Progress so far</h2></div></div><div className="profile-stat-grid"><div><strong>{loggedDays}</strong><span>Days logged</span></div><div><strong>{manualSets}</strong><span>Sets logged</span></div><div><strong>{analyzedSets}</strong><span>Camera sets</span></div></div></section><section className="surface privacy-panel"><span className="eyebrow">DATA & PRIVACY</span><h2>Your training stays yours.</h2><div className="privacy-row"><strong>Profile and workouts</strong><span>Saved in this browser only</span></div><div className="privacy-row"><strong>Camera video</strong><span>Processed on your device, never uploaded</span></div><div className="privacy-row"><strong>AI coach</strong><span>{import.meta.env.VITE_COACH_API_URL ? 'Workout measurements sent to your configured AWS endpoint' : 'Local preview until AWS is connected'}</span></div><p className="privacy-footnote">This local profile is not a password-protected account and does not sync across devices.</p></section></div></>;
}

export type Rep = { number: number; duration: number; ascent: number; minKneeAngle: number };
export type SetAnalysis = { reps: Rep[]; slowdownPercent: number | null; proximity: 'unknown' | 'steady' | 'possibly-near-failure'; incompleteAttempt: boolean };

const RAD = 180 / Math.PI;
export function jointAngle(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const ab = Math.atan2(a.y - b.y, a.x - b.x);
  const cb = Math.atan2(c.y - b.y, c.x - b.x);
  let degrees = Math.abs((ab - cb) * RAD);
  if (degrees > 180) degrees = 360 - degrees;
  return degrees;
}

export class SquatTracker {
  private phase: 'standing' | 'descending' | 'ascending' = 'standing';
  private smoothed: number | null = null;
  private start = 0;
  private bottom = 0;
  private minimum = 180;
  private lowFrames = 0;
  private highFrames = 0;
  private lastTimestamp = 0;
  readonly reps: Rep[] = [];

  update(kneeAngle: number, timestampMs: number): void {
    if (!Number.isFinite(kneeAngle) || kneeAngle < 35 || kneeAngle > 180) return;
    this.smoothed = this.smoothed === null ? kneeAngle : this.smoothed * 0.72 + kneeAngle * 0.28;
    const angle = this.smoothed;
    this.lastTimestamp = timestampMs;
    this.lowFrames = angle < 137 ? this.lowFrames + 1 : 0;
    this.highFrames = angle > 153 ? this.highFrames + 1 : 0;

    if (this.phase === 'standing' && this.lowFrames >= 3) {
      this.phase = 'descending';
      this.start = timestampMs;
      this.minimum = angle;
    } else if (this.phase === 'descending') {
      this.minimum = Math.min(this.minimum, angle);
      if (angle > this.minimum + 12 && this.minimum < 125) {
        this.phase = 'ascending';
        this.bottom = timestampMs;
      }
    } else if (this.phase === 'ascending') {
      if (this.highFrames >= 3) {
        const duration = (timestampMs - this.start) / 1000;
        const ascent = (timestampMs - this.bottom) / 1000;
        if (duration > 0.45 && duration < 15) {
          this.reps.push({ number: this.reps.length + 1, duration, ascent, minKneeAngle: Math.round(this.minimum) });
        }
        this.phase = 'standing';
      }
    }
  }

  summary(): SetAnalysis {
    const incompleteAttempt = this.phase === 'ascending' && this.lastTimestamp - this.bottom > 1800;
    if (this.reps.length < 4) return { reps: [...this.reps], slowdownPercent: null, proximity: 'unknown', incompleteAttempt };
    const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const early = average(this.reps.slice(0, 2).map(rep => rep.ascent));
    const late = average(this.reps.slice(-2).map(rep => rep.ascent));
    const slowdownPercent = Math.round(((late / early) - 1) * 100);
    return {
      reps: [...this.reps],
      slowdownPercent,
      proximity: slowdownPercent >= 40 || incompleteAttempt ? 'possibly-near-failure' : 'steady',
      incompleteAttempt,
    };
  }
}

export function localCoach(analysis: SetAnalysis): string {
  const count = analysis.reps.length;
  if (count === 0) return 'I could not confirm a full squat rep. Try a clear side view with your whole body in frame, then record another set.';
  if (analysis.incompleteAttempt) return `You completed ${count} squat ${count === 1 ? 'rep' : 'reps'} and the last attempt appeared incomplete. Rest fully before your next set, and consider reducing the load if that happens again.`;
  if (analysis.proximity === 'possibly-near-failure') return `You completed ${count} squats. Your final reps slowed by about ${analysis.slowdownPercent}% compared with your first two, which suggests you may have been close to failure. Keep the next set controlled and allow enough rest.`;
  if (analysis.proximity === 'steady') return `You completed ${count} squats. Your rep speed stayed fairly steady. For your next set, keep the same depth and consider a small increase in reps if it feels manageable.`;
  return `You completed ${count} squat ${count === 1 ? 'rep' : 'reps'}. I need at least four clear reps to estimate how much your speed changed. Keep the same camera angle for your next set.`;
}

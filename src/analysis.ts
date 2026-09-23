export type Rep = { number: number; duration: number; ascent: number; minJointAngle: number };
export type SetAnalysis = { reps: Rep[]; slowdownPercent: number | null; proximity: 'unknown' | 'steady' | 'possibly-near-failure'; incompleteAttempt: boolean };

const RAD = 180 / Math.PI;
export function jointAngle(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  const ab = Math.atan2(a.y - b.y, a.x - b.x);
  const cb = Math.atan2(c.y - b.y, c.x - b.x);
  let degrees = Math.abs((ab - cb) * RAD);
  if (degrees > 180) degrees = 360 - degrees;
  return degrees;
}

export class RepTracker {
  private phase: 'standing' | 'descending' | 'ascending' = 'standing';
  private smoothed: number | null = null;
  private start = 0;
  private movementStart = 0;
  private bottom = 0;
  private minimum = 180;
  private lowFrames = 0;
  private highFrames = 0;
  private lastTimestamp = 0;
  readonly reps: Rep[] = [];

  constructor(private readonly lowThreshold = 137, private readonly highThreshold = 153, private readonly depthThreshold = 125, private readonly effortIntoLow = false) {}

  update(jointAngleDegrees: number, timestampMs: number): void {
    if (!Number.isFinite(jointAngleDegrees) || jointAngleDegrees < 25 || jointAngleDegrees > 180) return;
    this.smoothed = this.smoothed === null ? jointAngleDegrees : this.smoothed * 0.72 + jointAngleDegrees * 0.28;
    const angle = this.smoothed;
    this.lastTimestamp = timestampMs;
    this.lowFrames = angle < this.lowThreshold ? this.lowFrames + 1 : 0;
    this.highFrames = angle > this.highThreshold ? this.highFrames + 1 : 0;
    if (this.phase === 'standing' && angle > this.highThreshold) this.movementStart = timestampMs;

    if (this.phase === 'standing' && this.lowFrames >= 3) {
      this.phase = 'descending';
      this.start = this.movementStart || timestampMs;
      this.minimum = angle;
    } else if (this.phase === 'descending') {
      this.minimum = Math.min(this.minimum, angle);
      if (angle > this.minimum + 12 && this.minimum < this.depthThreshold) {
        this.phase = 'ascending';
        this.bottom = timestampMs;
      }
    } else if (this.phase === 'ascending') {
      if (this.highFrames >= 3) {
        const duration = (timestampMs - this.start) / 1000;
        const ascent = (this.effortIntoLow ? this.bottom - this.start : timestampMs - this.bottom) / 1000;
        if (duration > 0.45 && duration < 15) {
          this.reps.push({ number: this.reps.length + 1, duration, ascent, minJointAngle: Math.round(this.minimum) });
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

export function localCoach(analysis: SetAnalysis, exercise: string): string {
  const count = analysis.reps.length;
  if (count === 0) return `I could not confirm a full ${exercise} rep. Try a clear side view with your working joints in frame, then record another set.`;
  if (analysis.incompleteAttempt) return `You completed ${count} ${exercise} ${count === 1 ? 'rep' : 'reps'} and the last attempt appeared incomplete. Rest fully before your next set, and consider reducing the load if that happens again.`;
  if (analysis.proximity === 'possibly-near-failure') return `You completed ${count} ${exercise} reps. Your final reps slowed by about ${analysis.slowdownPercent}% compared with your first two, which may suggest you were near failure. Rest before your next set.`;
  if (analysis.proximity === 'steady') return `You completed ${count} ${exercise} reps. Your rep speed stayed fairly steady. For your next set, aim for the same controlled range of motion.`;
  return `You completed ${count} ${exercise} ${count === 1 ? 'rep' : 'reps'}. I need at least four clear reps to estimate how much your speed changed. Keep the same camera angle for your next set.`;
}

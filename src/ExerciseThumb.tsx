type Art = { kind: string; head: [number, number]; paths: string };

const ART: Record<string, Art> = {
  squat: { kind: 'squat', head: [32, 12], paths: 'M32 18l-4 17 11 6-2 14M28 35l-13 8-1 12M28 22l-12 7m17-7l13 7M7 26h50m-47-4v8m44-8v8' },
  'goblet-squat': { kind: 'squat', head: [32, 12], paths: 'M32 18l-4 17 11 6-2 14M28 35l-13 8-1 12M29 24l-7 6 7 1m6-7l7 6-7 1M28 26h8l2 8H26z' },
  'leg-press': { kind: 'squat', head: [17, 18], paths: 'M17 24l11 15-14 5m14-5l14-10 8 4M14 44l-5 10m38-29l10 14m-7-31v20m-7-20h14M7 55h21' },
  rdl: { kind: 'squat', head: [34, 13], paths: 'M32 20l-12 15 11 5m-11-5l-4 20m15-15l9 15M26 30l-2 15m11-15l1 15M11 46h39m-37-4v8m35-8v8' },
  lunge: { kind: 'squat', head: [31, 12], paths: 'M31 18l-1 19-15 4-4 14m19-18l14 7 11 1M28 24l-12 8m18-8l12 8M7 56h51' },
  bench: { kind: 'press', head: [21, 32], paths: 'M26 32h22m-18 0l-2 10m16-10l5 10M31 32l-3-14m11 14l4-14M12 42h40m-34 0v12m28-12v12M8 17h48m-46-4v8m44-8v8' },
  'incline-bench': { kind: 'press', head: [22, 22], paths: 'M24 27l17 15m-9-8l-5 11m12-5l9 3M29 31l-1-17m11 21l4-20M15 18h42m-40-4v8m38-8v8M19 27l-5 29m5-29l28 25' },
  pushup: { kind: 'press', head: [13, 31], paths: 'M18 31l30 5 10 16M29 33l-5 17m20-14l-1 17M8 54h52' },
  deadlift: { kind: 'squat', head: [33, 12], paths: 'M31 19l-10 18 13 5m-13-5l-7 18m20-13l9 13M26 32l-3 16m13-16l2 16M9 49h46m-43-5v10m40-10v10' },
  row: { kind: 'pull', head: [31, 13], paths: 'M29 19L16 35l16 5m-16-5l-4 20m20-15l10 15M25 27l4 19m7-18l4 18M23 47h25m-23-4v8m21-8v8' },
  pulldown: { kind: 'pull', head: [32, 22], paths: 'M32 28v18m0-15l-13-11-7 4m20 7l13-11 7 4M25 46l-3 10m17-10l3 10M18 49h28M8 16h48m-46-4v8m44-8v8' },
  pullup: { kind: 'pull', head: [32, 23], paths: 'M32 29v18m0-13L19 16m13 18l13-18M32 47l-8 10m8-10l8 10M8 13h48m-45-4v8m42-8v8' },
  ohp: { kind: 'press', head: [32, 23], paths: 'M32 29v18m0-11l-13-11-4-12m17 23l13-11 4-12M32 47l-8 10m8-10l8 10M7 11h50m-47-4v8m44-8v8' },
  'lateral-raise': { kind: 'arm', head: [32, 14], paths: 'M32 20v26m-1-18L13 26l-7 4m27-2l18-2 7 4M32 46l-8 11m8-11l8 11M3 26h8m42 0h8' },
  curl: { kind: 'arm', head: [32, 14], paths: 'M32 20v26m-2-20l-11 5 1-13m14 8l11 5-1-13M32 46l-8 11m8-11l8 11M14 17h12m-10-4v8m32-4H36m10-4v8' },
  tricep: { kind: 'arm', head: [32, 15], paths: 'M32 21v25m-2-19l-10 6 1 13m13-19l10 6-1 13M32 46l-8 11m8-11l8 11M32 4v13m-15 30h9m12 0h9' },
  plank: { kind: 'core', head: [12, 31], paths: 'M17 32l31 6 10 14M27 34l-4 18M7 55h53' },
  run: { kind: 'cardio', head: [32, 11], paths: 'M31 17l8 15-12 8m10-13l13 4M30 24l-12 4-8 12m17 0l-13 15m13-15l15 13M6 55h53' },
  bike: { kind: 'cardio', head: [33, 12], paths: 'M33 18l-7 16 8 8m-8-8l-11 13 20 1 15-16m-15 16l-7-14m6 8l-7 6' },
};

export function ExerciseThumb({ id, name }: { id: string; name: string }) {
  const art = ART[id] ?? { kind: 'core', head: [32, 14] as [number, number], paths: 'M32 20v24m0-16L17 36m15-8l15 8M32 44L22 57m10-13l10 13' };
  return <span className={`exercise-thumb thumb-${art.kind}`} role="img" aria-label={`${name} illustration`}>
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx={art.head[0]} cy={art.head[1]} r="5" /><path d={art.paths} />{id === 'bike' && <><circle cx="15" cy="47" r="9" /><circle cx="50" cy="47" r="9" /></>}</svg>
  </span>;
}

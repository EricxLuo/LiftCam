import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({});
const supportedExercises = new Set(['Barbell Squat', 'Goblet Squat', 'Leg Press', 'Romanian Deadlift', 'Lunges', 'Bench Press', 'Incline Press', 'Push-ups', 'Deadlift', 'Barbell Row', 'Lat Pulldown', 'Pull-ups', 'Overhead Press', 'Bicep Curl']);
const headers = {
  'content-type': 'application/json',
  'access-control-allow-origin': process.env.ALLOWED_ORIGIN || '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function reply(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

export async function handler(event) {
  if (event.requestContext?.http?.method === 'OPTIONS') return reply(204, {});
  if (event.requestContext?.http?.method !== 'POST') return reply(405, { error: 'Use POST' });

  if ((event.body || '').length > 12000) return reply(413, { error: 'Request too large' });
  let data;
  try { data = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'Invalid JSON' }); }
  if (data.mode === 'chat') {
    const question = typeof data.question === 'string' ? data.question.trim() : '';
    const context = data.context;
    const validSet = set => set && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 2000 && Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 1000 && ['lb', 'kg'].includes(set.unit);
    if (!question || question.length > 500 || !Array.isArray(context) || context.length > 30 || context.some(exercise => typeof exercise.name !== 'string' || exercise.name.length > 100 || !Array.isArray(exercise.current) || !Array.isArray(exercise.previous) || exercise.current.length > 30 || exercise.previous.length > 30 || [...exercise.current, ...exercise.previous].some(set => !validSet(set)))) return reply(400, { error: 'Invalid chat request' });
    if (!process.env.BEDROCK_MODEL_ID) return reply(503, { error: 'BEDROCK_MODEL_ID is not configured' });
    try {
      const response = await bedrock.send(new ConverseCommand({
        modelId: process.env.BEDROCK_MODEL_ID,
        system: [{ text: 'You are LiftCam Coach, a concise and encouraging gym training assistant. Answer fitness and exercise questions using the supplied workout context when relevant. Do not invent sets or claim to know form, injury status, or exact proximity to failure. If asked for medical diagnosis or treatment, suggest a qualified professional. Keep answers practical and under 110 words. No markdown.' }],
        messages: [{ role: 'user', content: [{ text: JSON.stringify({ question, workoutContext: context }) }] }],
        inferenceConfig: { maxTokens: 240, temperature: 0.35 },
      }));
      const summary = response.output?.message?.content?.find(part => part.text)?.text?.trim();
      if (!summary) return reply(502, { error: 'Coach returned no text' });
      return reply(200, { summary });
    } catch (error) {
      return reply(502, { error: 'Coach generation failed', type: error?.name || 'UnknownError' });
    }
  }
  const reps = data.reps;
  if (!supportedExercises.has(data.exercise) || !Array.isArray(reps) || reps.length > 30 || reps.some(rep => !Number.isFinite(rep.duration) || !Number.isFinite(rep.ascent) || !Number.isFinite(rep.minJointAngle ?? rep.minKneeAngle))) {
    return reply(400, { error: 'Invalid set measurements' });
  }
  if (!process.env.BEDROCK_MODEL_ID) return reply(503, { error: 'BEDROCK_MODEL_ID is not configured' });

  const metrics = {
    exercise: data.exercise,
    completedReps: reps.length,
    effortSeconds: reps.map(rep => Number(rep.ascent.toFixed(2))),
    slowdownPercent: Number.isFinite(data.slowdownPercent) ? Math.max(-100, Math.min(500, data.slowdownPercent)) : null,
    proximity: ['unknown', 'steady', 'possibly-near-failure'].includes(data.proximity) ? data.proximity : 'unknown',
    incompleteAttempt: data.incompleteAttempt === true,
  };

  try {
    const response = await bedrock.send(new ConverseCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      system: [{ text: 'You are LiftCam, a concise strength training coach. Give a friendly, spoken summary in 2 or 3 sentences, under 65 words. Use only the measurements supplied. State uncertainty clearly: slowdown may suggest proximity to failure but cannot prove it or determine reps in reserve. Never claim an injury diagnosis or that a movement is safe. Include exactly one practical suggestion for the next set. No markdown.' }],
      messages: [{ role: 'user', content: [{ text: JSON.stringify(metrics) }] }],
      inferenceConfig: { maxTokens: 180, temperature: 0.3 },
    }));
    const summary = response.output?.message?.content?.find(part => part.text)?.text?.trim();
    if (!summary) return reply(502, { error: 'Coach returned no text' });
    return reply(200, { summary });
  } catch (error) {
    return reply(502, { error: 'Coach generation failed', type: error?.name || 'UnknownError' });
  }
}

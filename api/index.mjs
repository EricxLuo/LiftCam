import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({});
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

  let data;
  try { data = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'Invalid JSON' }); }
  const reps = data.reps;
  if (data.exercise !== 'Barbell Squat' || !Array.isArray(reps) || reps.length > 30 || reps.some(rep => !Number.isFinite(rep.duration) || !Number.isFinite(rep.ascent) || !Number.isFinite(rep.minKneeAngle))) {
    return reply(400, { error: 'Invalid set measurements' });
  }
  if (!process.env.BEDROCK_MODEL_ID) return reply(503, { error: 'BEDROCK_MODEL_ID is not configured' });

  const metrics = {
    exercise: 'Barbell Squat',
    completedReps: reps.length,
    ascentSeconds: reps.map(rep => Number(rep.ascent.toFixed(2))),
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

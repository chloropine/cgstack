/**
 * Shared OpenAI-backed judge helpers for eval and E2E tests.
 *
 * These helpers are only used when paid evals are explicitly enabled.
 */

export interface JudgeScore {
  clarity: number;
  completeness: number;
  actionability: number;
  reasoning: string;
}

export interface OutcomeJudgeResult {
  detected: string[];
  missed: string[];
  false_positives: number;
  detection_rate: number;
  evidence_quality: number;
  reasoning: string;
}

export interface PostureScore {
  axis_a: number;
  axis_b: number;
  reasoning: string;
}

export type PostureMode = 'expansion' | 'forcing' | 'builder';

export interface RecommendationScore {
  present: boolean;
  commits: boolean;
  has_because: boolean;
  reason_substance: number;
  reason_text: string;
  reasoning: string;
}

export async function callJudge<T>(prompt: string, model = process.env.CGSTACK_JUDGE_MODEL || 'gpt-5.4-mini'): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.CGSTACK_OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set - judge requires OpenAI access.');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: { format: { type: 'text' } },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI judge request failed: ${response.status} ${body.slice(0, 500)}`);
  }

  const body = await response.json() as any;
  const text = extractResponseText(body);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Judge returned non-JSON: ${text.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]) as T;
}

function extractResponseText(body: any): string {
  if (typeof body.output_text === 'string') return body.output_text;
  const chunks: string[] = [];
  for (const item of body.output || []) {
    for (const part of item.content || []) {
      if (typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n');
}

export async function judge(section: string, content: string): Promise<JudgeScore> {
  return callJudge<JudgeScore>(`Evaluate documentation quality for an AI coding agent.

Section: ${section}

Score clarity, completeness, and actionability from 1-5.
Return JSON only: {"clarity":N,"completeness":N,"actionability":N,"reasoning":"..."}

Content:
${content}`);
}

export async function outcomeJudge(groundTruth: any, report: string): Promise<OutcomeJudgeResult> {
  return callJudge<OutcomeJudgeResult>(`Evaluate a QA report against planted-bug ground truth.

Ground truth:
${JSON.stringify(groundTruth, null, 2)}

Report:
${report}

Return JSON only:
{"detected":["bug ids or names"],"missed":["bug ids or names"],"false_positives":N,"detection_rate":N,"evidence_quality":N,"reasoning":"..."}`);
}

export async function judgePosture(mode: PostureMode, text: string): Promise<PostureScore> {
  return callJudge<PostureScore>(`Evaluate whether this cgstack response has the requested posture.

Mode: ${mode}

Score axis_a and axis_b from 1-5. Return JSON only:
{"axis_a":N,"axis_b":N,"reasoning":"..."}

Text:
${text}`);
}

export async function judgeRecommendation(text: string): Promise<RecommendationScore> {
  const recLine = text.split('\n').find((line) => /^recommendation:/i.test(line.trim())) || '';
  const because = recLine.match(/\bbecause\b\s*(.+)$/i)?.[1]?.trim() || '';
  const present = !!recLine;
  const commits = present && !/\b(option|either|depends|maybe)\b/i.test(recLine);
  const has_because = !!because;

  if (!present || !has_because) {
    return {
      present,
      commits,
      has_because,
      reason_substance: 0,
      reason_text: because,
      reasoning: present ? 'Recommendation line has no because-clause.' : 'No Recommendation line found.',
    };
  }

  return callJudge<RecommendationScore>(`Evaluate this recommendation line.

Return JSON only:
{"present":true,"commits":true/false,"has_because":true,"reason_substance":N,"reason_text":"...","reasoning":"..."}

Rubric: reason_substance is 1-5. 5 is concrete and option-specific. 3 is generic.

Text:
${text}`);
}

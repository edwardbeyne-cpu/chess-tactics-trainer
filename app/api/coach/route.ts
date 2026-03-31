import { NextRequest, NextResponse } from "next/server";

export interface CoachRequestBody {
  puzzlesSolved: number;
  correctCount: number;
  incorrectCount: number;
  avgTimeSec: number;
  failureModes: {
    missed: number;
    miscalculated: number;
    rushed: number;
    unsure: number;
    total: number;
  };
  patternFocus: string;
  timeOfDay: "morning" | "afternoon" | "evening";
  dominantFailureMode?: string | null; // Sprint 25: overall failure pattern
}

function buildPrompt(data: CoachRequestBody): string {
  const accuracy = data.puzzlesSolved > 0
    ? Math.round((data.correctCount / data.puzzlesSolved) * 100)
    : 0;

  const failureBreakdown =
    data.failureModes.total === 0
      ? "none recorded"
      : [
          data.failureModes.missed > 0 ? `${data.failureModes.missed} didn't see it` : null,
          data.failureModes.miscalculated > 0 ? `${data.failureModes.miscalculated} miscalculated` : null,
          data.failureModes.rushed > 0 ? `${data.failureModes.rushed} moved too fast` : null,
          data.failureModes.unsure > 0 ? `${data.failureModes.unsure} weren't sure` : null,
        ]
          .filter(Boolean)
          .join(", ");

  // Sprint 25: Include overall failure pattern in coaching context
  const overallFailureNote = data.dominantFailureMode
    ? `\n- Overall failure pattern: ${data.dominantFailureMode} (dominant across all sessions)`
    : "";

  const remediationHint = data.dominantFailureMode === "missed"
    ? " Focus your coaching on improving board vision and pattern recognition."
    : data.dominantFailureMode === "miscalculated"
    ? " Focus on calculation technique — counting moves carefully before committing."
    : data.dominantFailureMode === "rushed"
    ? " Emphasize slowing down and thinking before moving."
    : data.dominantFailureMode === "unsure"
    ? " Emphasize understanding WHY moves work, not just finding them."
    : "";

  return `You are a chess tactics coach reviewing a student's training session. Be direct, specific, and encouraging but honest. Max 3 sentences.

Session data:
- Puzzles: ${data.puzzlesSolved} solved, ${accuracy}% accuracy
- Average time: ${data.avgTimeSec} seconds per puzzle
- Failure modes: ${failureBreakdown}${overallFailureNote}
- Pattern focus: ${data.patternFocus}
- Time: ${data.timeOfDay}

Give specific, actionable coaching feedback. Focus on what they should do differently next session. Don't be generic.${remediationHint}`;
}

export async function POST(req: NextRequest) {
  try {
    const body: CoachRequestBody = await req.json();

    if (!body.puzzlesSolved || body.puzzlesSolved < 1) {
      return NextResponse.json({ error: "No puzzle data" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { note: "Good session. Keep drilling your weakest patterns and focus on slowing down before moving." },
        { status: 200 }
      );
    }

    const prompt = buildPrompt(body);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json(
        { note: "Good session. Keep drilling your weakest patterns and focus on slowing down before moving." },
        { status: 200 }
      );
    }

    const data = await response.json();
    const note = data?.content?.[0]?.text?.trim() ?? "Good session. Keep drilling your weakest patterns and focus on slowing down before moving.";

    return NextResponse.json({ note }, { status: 200 });
  } catch (err) {
    console.error("Coach API error:", err);
    return NextResponse.json(
      { note: "Good session. Keep drilling your weakest patterns and focus on slowing down before moving." },
      { status: 200 }
    );
  }
}

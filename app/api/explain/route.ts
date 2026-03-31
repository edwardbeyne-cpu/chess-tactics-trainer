import { NextRequest, NextResponse } from "next/server";

export interface ExplainRequestBody {
  puzzleId: string;
  fen: string;
  solution: string[]; // UCI move strings e.g. ["e2e4", "d7d5"]
  theme: string;       // Pattern name e.g. "FORK"
}

function buildExplainPrompt(data: ExplainRequestBody): string {
  const movesFormatted = data.solution.join(", ");
  const theme = data.theme.charAt(0) + data.theme.slice(1).toLowerCase();

  return `You are a chess coach explaining a tactical puzzle solution to a student.

Puzzle FEN: ${data.fen}
Pattern: ${theme}
Solution moves (UCI format): ${movesFormatted}

Explain in 2-3 sentences why this solution works. Be concrete — name the pieces, squares, and tactical motif. Use plain English, no jargon. Be direct and specific.

Example format: "The knight on e5 creates a fork — it simultaneously attacks the king on g6 and the queen on c4. Black must move the king, allowing White to capture the queen for free."

Do not start with "In this position" or generic openers. Jump straight to the tactical explanation.`;
}

export async function POST(req: NextRequest) {
  try {
    const body: ExplainRequestBody = await req.json();

    if (!body.puzzleId || !body.fen || !body.solution?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { explanation: "The solution works by creating a tactical threat that the opponent cannot simultaneously address. Look for the forcing sequence that wins material or delivers checkmate." },
        { status: 200 }
      );
    }

    const prompt = buildExplainPrompt(body);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json(
        { explanation: "The solution uses a forcing tactical sequence. Review the moves carefully to understand how the pieces coordinate." },
        { status: 200 }
      );
    }

    const data = await response.json();
    const explanation = data?.content?.[0]?.text?.trim() ?? "The solution uses a forcing tactical sequence that wins material or delivers checkmate.";

    return NextResponse.json({ explanation }, { status: 200 });
  } catch (err) {
    console.error("Explain API error:", err);
    return NextResponse.json(
      { explanation: "The solution uses a forcing tactical sequence. Review the moves carefully." },
      { status: 200 }
    );
  }
}

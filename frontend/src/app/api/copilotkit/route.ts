import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy route between the CopilotKit runtime (or generic chat client) and the
 * ADK backend. During the MVP the backend may be unavailable, in which case a
 * mock streamed response is returned so the UI remains functional.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const upstream = await fetch(`${API_BASE}/api/copilotkit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      throw new Error(`Upstream responded ${upstream.status}`);
    }

    // Stream the upstream response back to the client unchanged.
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    console.warn("copilotkit proxy fallback:", err);
    return NextResponse.json(
      {
        role: "assistant",
        content:
          "Backend chưa sẵn sàng. Đây là phản hồi minh hoạ từ proxy CopilotKit.",
        confidence: 0.5,
        disclaimer:
          "⚠️ Thông tin chỉ mang tính chất tham khảo, backend chưa được kết nối.",
      },
      { status: 200 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", backend: API_BASE });
}

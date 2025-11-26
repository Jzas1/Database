import { NextRequest, NextResponse } from "next/server";

const API_BASE = "http://localhost:8000";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const client = searchParams.get("client") || "Quicksilver Scientific";
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  try {
    const params = new URLSearchParams({
      client_name: client,
    });

    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    const response = await fetch(`${API_BASE}/api/summary?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 }
    );
  }
}

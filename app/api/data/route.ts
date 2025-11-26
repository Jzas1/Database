import { NextRequest, NextResponse } from "next/server";

// Your existing Python API endpoint
const API_BASE = "http://localhost:8000";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const client = searchParams.get("client") || "Quicksilver Scientific";
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");
  const limit = searchParams.get("limit") || "10000";

  try {
    // Build query params
    const params = new URLSearchParams({
      client_name: client,
      limit,
    });

    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    // Fetch from your Python API
    const response = await fetch(`${API_BASE}/api/data?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching data:", error);
    return NextResponse.json(
      { error: "Failed to fetch data from BigQuery" },
      { status: 500 }
    );
  }
}

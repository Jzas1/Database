import { NextRequest, NextResponse } from "next/server";

// Python API endpoint - in production this would be your deployed backend
const API_BASE = process.env.API_BASE_URL || "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ client: string }> }
) {
  const { client } = await params;
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  // Decode the client name (URL encoded spaces become %20)
  const clientName = decodeURIComponent(client);

  try {
    // Build URL for fast endpoint
    let url = `${API_BASE}/api/dashboard/fast/${encodeURIComponent(clientName)}`;

    // Add date filters if provided
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append("start_date", startDate);
    if (endDate) queryParams.append("end_date", endDate);

    if (queryParams.toString()) {
      url += `?${queryParams.toString()}`;
    }

    console.log(`Proxying to: ${url}`);

    // Fetch from Python API
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data from backend" },
      { status: 500 }
    );
  }
}

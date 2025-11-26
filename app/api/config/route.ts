import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { currentUser } from '@clerk/nextjs/server'

// Default layout when no config exists
const DEFAULT_LAYOUT = {
  modules: [
    { id: 'kpis', name: 'KPI Cards', visible: true },
    { id: 'dailyChart', name: 'Daily Spend & Impressions', visible: true },
    { id: 'channelHeatmap', name: 'Channel Heatmap', visible: true, heatmapEnabled: true },
    { id: 'creativeHeatmap', name: 'Creative Heatmap', visible: true, heatmapEnabled: true },
    { id: 'daypartHeatmap', name: 'Daypart Heatmap', visible: true, heatmapEnabled: true },
    { id: 'dayOfWeekHeatmap', name: 'Day of Week', visible: true, heatmapEnabled: true },
    { id: 'channelByDaypart', name: 'Channel by Daypart', visible: true, heatmapEnabled: true },
    { id: 'channelByCreative', name: 'Channel by Creative', visible: true, heatmapEnabled: true },
  ]
}

// GET /api/config?clientId=quicksilver
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')

  if (!clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  }

  const config = await prisma.dashboardConfig.findUnique({
    where: { clientId }
  })

  if (!config) {
    return NextResponse.json({ clientId, layout: DEFAULT_LAYOUT })
  }

  return NextResponse.json({ clientId, layout: config.layoutJson })
}

// POST /api/config - Save layout (admin only)
export async function POST(request: NextRequest) {
  // Check if user is admin
  const user = await currentUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'

  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json()
  const { clientId, layout } = body

  if (!clientId || !layout) {
    return NextResponse.json({ error: 'clientId and layout required' }, { status: 400 })
  }

  const config = await prisma.dashboardConfig.upsert({
    where: { clientId },
    update: { layoutJson: layout },
    create: { clientId, layoutJson: layout }
  })

  return NextResponse.json({ success: true, config })
}

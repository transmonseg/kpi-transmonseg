// TODO(Task 9): reescrever do zero, ver docs/superpowers/plans/2026-08-23-kpi-romaneio-nutrimax.md
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST() {
  return NextResponse.json({ erro: 'em reconstrucao' }, { status: 503 })
}

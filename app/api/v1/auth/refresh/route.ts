import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyRefreshToken, generateTokens } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { refresh } = body

    if (!refresh) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 400 }
      )
    }

    const payload = verifyRefreshToken(refresh)
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      )
    }

    const { data: user, error } = await supabase
      .from('bs_users')
      .select('id, username, first_name, email, role, is_admin_role')
      .eq('id', payload.user_id)
      .single()

    if (error || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      )
    }

    const tokens = generateTokens(user)

    return NextResponse.json({
      access: tokens.access,
      refresh: tokens.refresh,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

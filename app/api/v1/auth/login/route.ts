import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyPassword, generateTokens } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { username: !username ? ['This field is required.'] : undefined, password: !password ? ['This field is required.'] : undefined },
        { status: 400 }
      )
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const tokens = generateTokens(user)

    return NextResponse.json({
      access: tokens.access,
      refresh: tokens.refresh,
      user: {
        username: user.username,
        first_name: user.first_name || user.username,
        role: user.role,
        is_admin_role: user.role === 'admin',
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

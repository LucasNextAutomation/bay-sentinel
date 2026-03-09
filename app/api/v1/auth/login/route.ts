import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyPassword, generateTokens } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { allowed, retryAfter } = checkRateLimit(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter || 60) } }
      )
    }

    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { username: !username ? ['This field is required.'] : undefined, password: !password ? ['This field is required.'] : undefined },
        { status: 400 }
      )
    }

    const { data: user, error } = await supabase
      .from('bs_users')
      .select('id, username, first_name, email, role, is_admin_role, password_hash')
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
        is_admin_role: user.is_admin_role ?? (user.role === 'admin'),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

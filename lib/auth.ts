import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { supabase } from './db'

const JWT_SECRET = process.env.JWT_SECRET!

export interface User {
  id: number
  username: string
  first_name: string
  email: string
  role: 'admin' | 'viewer'
  is_admin_role: boolean
}

export interface TokenPayload {
  user_id: number
  username: string
  role: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateTokens(user: User): { access: string; refresh: string } {
  const access = jwt.sign(
    { user_id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '15m', algorithm: 'HS256', audience: 'access' }
  )

  const refresh = jwt.sign(
    { user_id: user.id },
    JWT_SECRET,
    { expiresIn: '7d', algorithm: 'HS256', audience: 'refresh' }
  )

  return { access, refresh }
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'access',
    }) as TokenPayload
    return decoded
  } catch {
    return null
  }
}

export function verifyRefreshToken(token: string): { user_id: number } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'refresh',
    }) as { user_id: number }
    return decoded
  } catch {
    return null
  }
}

export async function extractUser(request: Request): Promise<User | null> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7)
  const payload = verifyAccessToken(token)
  if (!payload) {
    return null
  }

  const { data, error } = await supabase
    .from('bs_users')
    .select('id, username, first_name, email, role, is_admin_role')
    .eq('id', payload.user_id)
    .single()

  if (error || !data) {
    return null
  }

  return data as User
}

export async function requireAuth(request: Request): Promise<User> {
  const user = await extractUser(request)
  if (!user) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return user
}

export async function requireAdmin(request: Request): Promise<User> {
  const user = await requireAuth(request)
  if (user.role !== 'admin' && !user.is_admin_role) {
    throw new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return user
}

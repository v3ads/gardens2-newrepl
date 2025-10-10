import { assertRole } from '@/lib/auth'

// Force dynamic rendering to prevent SSG hanging during build
export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await assertRole('ADMIN')

  return <>{children}</>
}
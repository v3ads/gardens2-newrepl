import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function HomePage() {
  // In development mode, always redirect to overview
  if (process.env.NODE_ENV === 'development') {
    redirect('/overview')
  }
  
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  redirect('/overview')
}
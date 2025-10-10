import { getCurrentUser } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function OverviewPage() {
  const user = await getCurrentUser()

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight neon-text">
          Command Center Overview
        </h1>
        <p className="text-base md:text-lg text-primary/80">
          Welcome to your futuristic command center dashboard
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="futuristic-card hover:scale-105 transition-all duration-300">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              Operator Identity
            </CardTitle>
            <CardDescription className="text-primary/70">Your current session</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{user?.name}</div>
            <p className="text-xs text-primary/60 mt-1">
              {user?.email}
            </p>
          </CardContent>
        </Card>

        <Card className="futuristic-card hover:scale-105 transition-all duration-300">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
              Access Clearance
            </CardTitle>
            <CardDescription className="text-primary/70">Security level permissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{user?.role}</div>
            <p className="text-xs text-primary/60 mt-1">
              Current authorization level
            </p>
          </CardContent>
        </Card>

        <Card className="futuristic-card hover:scale-105 transition-all duration-300 cyber-border">
          <CardHeader>
            <CardTitle className="text-primary flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              System Activity
            </CardTitle>
            <CardDescription className="text-primary/70">Neural network status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">ONLINE</div>
            <p className="text-xs text-primary/60 mt-1">
              All systems operational
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
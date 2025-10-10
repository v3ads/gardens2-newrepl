'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { useSession } from '@/hooks/use-session-override'
import { useTheme } from 'next-themes'
import { Moon, Sun, User, Settings, LogOut, Search, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Sidebar } from './sidebar'
import Link from 'next/link'

export function Header() {
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full futuristic-header">
      <div className="container flex h-16 items-center px-4">
        {/* Mobile menu button */}
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className="mr-2 px-0 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:hidden"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="pr-0">
            <Sidebar onNavigate={() => setIsSheetOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <div className="mr-4 flex">
          <Link href="/" className="mr-2 flex items-center space-x-3 md:mr-6">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full animated-gradient flex items-center justify-center pulse-glow">
                <span className="text-white dark:text-green-900 font-bold text-sm">CG</span>
              </div>
              <div className="flex flex-col">
                <span className="neon-text font-bold text-sm md:text-base hidden sm:inline-block leading-tight">
                  Cynthia Gardens
                </span>
                <span className="text-xs text-primary/80 hidden sm:inline-block">
                  Command Center
                </span>
              </div>
            </div>
            <span className="neon-text font-bold text-sm md:text-base sm:hidden">
              Command Center
            </span>
            {process.env.NODE_ENV === 'development' && (
              <span className="inline-block rounded-full bg-gradient-to-r from-green-400 to-emerald-400 px-3 py-1 text-xs font-medium text-green-900 shadow-lg shadow-green-400/30 animate-pulse">
                DEV MODE
              </span>
            )}
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-between space-x-2">
          <div className="flex-1"></div>

          <div className="flex items-center space-x-2">
          <div className="w-full flex-1 md:w-auto md:flex-none hidden sm:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-primary/60" />
              <Input
                placeholder="Search the matrix..."
                className="pl-10 md:w-[250px] lg:w-[300px] futuristic-input border-primary/40 focus:border-primary"
                disabled
              />
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="cyber-border hover:bg-primary/10 transition-all duration-300 hover:scale-110"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-primary" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-primary" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {session?.user ? (
            <div className="flex items-center gap-2">
              {process.env.NODE_ENV === 'development' && !session.user.image && (
                <span className="text-xs text-orange-500 bg-orange-100 dark:bg-orange-900/20 px-2 py-1 rounded">
                  DEV MODE
                </span>
              )}
              
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 hover:scale-110 transition-all duration-300">
                  <div className="h-10 w-10 rounded-full animated-gradient pulse-glow border-2 border-primary/50 shadow-lg flex items-center justify-center hover:shadow-2xl transition-all duration-300">
                    {session.user.image ? (
                      <img
                        src={session.user.image}
                        alt={session.user.name || ''}
                        className="h-8 w-8 rounded-full border border-primary/30"
                      />
                    ) : (
                      <User className="h-5 w-5 text-white" />
                    )}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 futuristic-card border-primary/30" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {session.user.name}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {session.user.email}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      Role: {session.user.role}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {session.user.role === 'ADMIN' && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/admin">
                        <Settings className="mr-2 h-4 w-4" />
                        Admin
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => {
                  // Force complete session cleanup with cache-busting
                  signOut({ 
                    callbackUrl: `/login?ts=${Date.now()}`,
                    redirect: true 
                  })
                  // Clear any browser storage
                  if (typeof window !== 'undefined') {
                    localStorage.clear()
                    sessionStorage.clear()
                    // Force browser to reload from server on next request
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.ready.then(registration => {
                        if (registration.active) {
                          registration.active.postMessage({ type: 'CLEAR_AUTH_CACHE' })
                        }
                      }).catch(() => {}) // Ignore errors if no SW
                    }
                  }
                }}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          ) : (
            <Button asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          )}
          </div>
        </div>
      </div>
    </header>
  )
}
'use client'

import { AdminIconUpload } from '@/components/admin-icon-upload'

export default function PWAIconPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold neon-text">PWA Icon Management</h1>
          <p className="text-muted-foreground">
            Upload a custom icon to replace the default PWA icons for the entire application
          </p>
        </div>
        
        <AdminIconUpload />
        
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <h3 className="font-semibold text-sm">What happens when you upload:</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Your icon replaces all PWA app icons</li>
            <li>• Automatically generates 192x192 and 512x512 versions</li>
            <li>• Creates maskable versions for better platform compatibility</li>
            <li>• Updates take effect immediately for new installs</li>
            <li>• Existing installed apps may need to be reinstalled to see changes</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
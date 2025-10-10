'use client'

import { IconUploader } from '@/components/icon-uploader'

export default function UploadIconPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Upload PWA Icon</h1>
          <p className="text-muted-foreground">
            Upload a custom icon for your Progressive Web App
          </p>
        </div>
        
        <IconUploader />
        
        <div className="text-center text-sm text-muted-foreground">
          <p>
            After uploading, your new icon will be used for the PWA app installation.
            <br />
            The icon will be automatically resized to all required sizes.
          </p>
        </div>
      </div>
    </div>
  )
}
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, Image, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

export function IconUploader() {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedIcon, setUploadedIcon] = useState<string | null>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB')
      return
    }

    setIsUploading(true)

    try {
      // Create a FormData object to upload the file
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload-icon', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const result = await response.json()
      setUploadedIcon(result.iconPath)
      toast.success('Icon uploaded successfully! PWA icons will be updated.')
      
    } catch (error) {
      console.error('Upload error:', error)
      toast.error('Failed to upload icon. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="w-5 h-5" />
          Upload PWA Icon
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Upload a custom icon for your PWA app. Best results with:
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Square image (1:1 aspect ratio)</li>
            <li>Minimum 512x512 pixels</li>
            <li>PNG or JPG format</li>
            <li>Clear, simple design</li>
          </ul>
        </div>

        {uploadedIcon && (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm text-green-700 dark:text-green-300">
              Icon uploaded successfully!
            </span>
          </div>
        )}

        <div className="relative">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            id="icon-upload"
          />
          <Button
            variant="outline"
            className="w-full h-20 border-dashed border-2 hover:border-primary"
            disabled={isUploading}
            asChild
          >
            <label htmlFor="icon-upload" className="flex flex-col items-center gap-2 cursor-pointer">
              <Upload className="w-6 h-6" />
              <span className="text-sm">
                {isUploading ? 'Uploading...' : 'Click to upload icon'}
              </span>
            </label>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
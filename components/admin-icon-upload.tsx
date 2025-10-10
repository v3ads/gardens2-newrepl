'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, Image, CheckCircle, FileImage } from 'lucide-react'
import { toast } from 'sonner'

export function AdminIconUpload() {
  const [isUploading, setIsUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const processIconFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB')
      return
    }

    setIsUploading(true)

    try {
      // Create preview
      const previewUrl = URL.createObjectURL(file)
      setPreview(previewUrl)

      // Upload to replace project icons
      const formData = new FormData()
      formData.append('icon', file)

      const response = await fetch('/api/admin/update-pwa-icon', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      toast.success('PWA icon updated successfully!')
      
    } catch (error) {
      console.error('Upload error:', error)
      toast.error('Failed to update icon. Please try again.')
      setPreview(null)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      processIconFile(files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processIconFile(file)
    }
  }

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileImage className="w-5 h-5" />
          Replace PWA Icon
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Upload your custom icon to replace the default PWA icons.
          <br />
          Recommended: Square image, 512x512px or larger, PNG format.
        </div>

        <div
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            disabled={isUploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            id="icon-file-input"
          />
          
          {preview ? (
            <div className="space-y-3">
              <img 
                src={preview} 
                alt="Icon preview" 
                className="w-20 h-20 mx-auto rounded-lg object-cover border"
              />
              <CheckCircle className="w-6 h-6 text-green-500 mx-auto" />
              <p className="text-sm text-green-600">Icon uploaded successfully!</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {isUploading ? 'Processing icon...' : 'Drop your icon here'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or click to browse files
                </p>
              </div>
            </div>
          )}
        </div>

        {preview && (
          <Button 
            onClick={() => {
              setPreview(null)
              const input = document.getElementById('icon-file-input') as HTMLInputElement
              if (input) input.value = ''
            }}
            variant="outline" 
            size="sm"
            className="w-full"
          >
            Upload Different Icon
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
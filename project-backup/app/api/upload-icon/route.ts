import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import sharp from 'sharp'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    // Get file buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Ensure public directory exists
    const publicDir = path.join(process.cwd(), 'public')
    if (!existsSync(publicDir)) {
      await mkdir(publicDir, { recursive: true })
    }

    // Generate the different icon sizes using Sharp
    const iconSizes = [
      { size: 192, name: 'icon-192x192.png' },
      { size: 512, name: 'icon-512x512.png' }
    ]

    // Generate maskable versions with padding
    const maskableIconSizes = [
      { size: 192, name: 'icon-maskable-192x192.png' },
      { size: 512, name: 'icon-maskable-512x512.png' }
    ]

    // Process regular icons
    for (const { size, name } of iconSizes) {
      const resizedBuffer = await sharp(buffer)
        .resize(size, size, { 
          fit: 'cover',
          position: 'center'
        })
        .png()
        .toBuffer()
      
      const filePath = path.join(publicDir, name)
      await writeFile(filePath, resizedBuffer)
    }

    // Process maskable icons (with safe zone padding)
    for (const { size, name } of maskableIconSizes) {
      const paddedSize = Math.round(size * 0.8) // 20% padding for safe zone
      const padding = Math.round((size - paddedSize) / 2)
      
      const maskableBuffer = await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 34, g: 197, b: 94, alpha: 1 } // Green background
        }
      })
      .composite([{
        input: await sharp(buffer)
          .resize(paddedSize, paddedSize, { 
            fit: 'cover',
            position: 'center'
          })
          .png()
          .toBuffer(),
        top: padding,
        left: padding
      }])
      .png()
      .toBuffer()
      
      const filePath = path.join(publicDir, name)
      await writeFile(filePath, maskableBuffer)
    }

    return NextResponse.json({ 
      message: 'Icons uploaded and processed successfully',
      iconPath: '/icon-512x512.png'
    })

  } catch (error) {
    console.error('Icon upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload and process icon' },
      { status: 500 }
    )
  }
}
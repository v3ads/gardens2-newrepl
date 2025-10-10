import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('icon') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No icon file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const publicDir = path.join(process.cwd(), 'public')

    // Generate all required PWA icon sizes
    const iconConfigs = [
      { size: 192, filename: 'icon-192x192.png', maskable: false },
      { size: 512, filename: 'icon-512x512.png', maskable: false },
      { size: 192, filename: 'icon-maskable-192x192.png', maskable: true },
      { size: 512, filename: 'icon-maskable-512x512.png', maskable: true }
    ]

    for (const config of iconConfigs) {
      let processedBuffer: Buffer

      if (config.maskable) {
        // For maskable icons, add padding for safe zone (80% of original size centered)
        const iconSize = Math.round(config.size * 0.8)
        const padding = Math.round((config.size - iconSize) / 2)
        
        // Create icon with background and centered original
        processedBuffer = await sharp({
          create: {
            width: config.size,
            height: config.size,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
          }
        })
        .composite([{
          input: await sharp(buffer)
            .resize(iconSize, iconSize, { 
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
      } else {
        // Regular icon - just resize
        processedBuffer = await sharp(buffer)
          .resize(config.size, config.size, { 
            fit: 'cover',
            position: 'center'
          })
          .png()
          .toBuffer()
      }

      const filePath = path.join(publicDir, config.filename)
      await writeFile(filePath, processedBuffer)
    }

    return NextResponse.json({ 
      success: true,
      message: 'PWA icons updated successfully'
    })

  } catch (error) {
    console.error('Icon update error:', error)
    return NextResponse.json(
      { error: 'Failed to update PWA icons' },
      { status: 500 }
    )
  }
}
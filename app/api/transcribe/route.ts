import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { openai } from '@/lib/openai'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Allow all authenticated users (same as chat endpoint)
    const allowedRoles = ['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']
    if (!user.role || !allowedRoles.includes(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ 
        error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to environment variables.' 
      }, { status: 500 })
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    const language = formData.get('language') as string || 'en'

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    // Check file size
    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` 
      }, { status: 413 })
    }

    // Check file type (be more permissive for mobile browsers)
    const allowedTypes = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/ogg', 'audio/x-m4a']
    const isAudioFile = allowedTypes.includes(audioFile.type) || audioFile.type.startsWith('audio/')
    
    if (!isAudioFile) {
      return NextResponse.json({ 
        error: 'Unsupported audio format. Please use webm, mp4, mpeg, wav, or m4a' 
      }, { status: 400 })
    }

    console.log(`[TRANSCRIBE] Processing ${audioFile.type} file, size: ${audioFile.size} bytes`)

    // Convert File to Buffer for OpenAI API
    const buffer = Buffer.from(await audioFile.arrayBuffer())
    
    // Create a new File object for OpenAI (requires name and type)
    const fileForOpenAI = new File([buffer], audioFile.name || 'audio.webm', {
      type: audioFile.type
    })

    // Call OpenAI Whisper API with better parameters for mobile audio
    const transcription = await openai.audio.transcriptions.create({
      file: fileForOpenAI,
      model: 'whisper-1',
      language: language === 'auto' ? undefined : language,
      response_format: 'json',
      temperature: 0.3, // Lower temperature for more consistent results
      prompt: "This is a voice message for an AI assistant. Please transcribe clearly and completely." // Help with context
    })

    console.log(`[TRANSCRIBE] Success: "${transcription.text}"`)

    return NextResponse.json({ 
      text: transcription.text,
      language: language
    })

  } catch (error: any) {
    console.error('[TRANSCRIBE] Error:', error)
    
    if (error.code === 'insufficient_quota') {
      return NextResponse.json(
        { error: 'OpenAI API quota exceeded. Please check your billing.' },
        { status: 429 }
      )
    }
    
    if (error.code === 'invalid_api_key') {
      return NextResponse.json(
        { error: 'Invalid OpenAI API key configuration.' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Transcription failed. Please try again.' },
      { status: 500 }
    )
  }
}
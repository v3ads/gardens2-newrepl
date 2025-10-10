import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { openai } from '@/lib/openai'

export async function POST(request: NextRequest) {
  try {
    // Check authentication and authorization using getCurrentUser helper
    const user = await getCurrentUser()
    console.log('[UPLOAD API] User:', user?.email, 'Role:', user?.role)
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Allow all authenticated users (ADMIN, LEVEL_1, LEVEL_2, LEVEL_3)
    const allowedRoles = ['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']
    
    if (!user.role || !allowedRoles.includes(user.role)) {
      console.log('[UPLOAD API] Access denied for role:', user.role)
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const threadId = formData.get('threadId') as string

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      )
    }

    let currentThreadId = threadId

    // Create thread if none provided
    if (!currentThreadId) {
      const thread = await openai.beta.threads.create({
        messages: []
      })
      currentThreadId = thread.id
    }

    // Upload file to OpenAI
    const uploadedFile = await openai.files.create({
      file: file,
      purpose: 'assistants'
    })

    // Create thread message with file attachment for code_interpreter
    await openai.beta.threads.messages.create(currentThreadId, {
      role: 'user',
      content: `I've uploaded a file for analysis: ${file.name}`,
      attachments: [
        {
          file_id: uploadedFile.id,
          tools: [{ type: 'code_interpreter' }]
        }
      ]
    })

    return NextResponse.json({
      threadId: currentThreadId,
      fileId: uploadedFile.id
    })

  } catch (error: any) {
    console.error('File upload error:', error)
    
    return NextResponse.json(
      { error: 'Failed to upload file. Please try again.' },
      { status: 500 }
    )
  }
}
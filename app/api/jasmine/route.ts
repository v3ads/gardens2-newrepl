// Legacy endpoint - redirects to new /api/chat endpoint
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { message, conversation, threadId } = await request.json()

    // Use environment variable or fixed localhost for internal calls
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:5000';
    const chatRequest = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('Cookie') || ''
      },
      body: JSON.stringify({
        text: message,
        threadId
      })
    })

    if (!chatRequest.ok) {
      const error = await chatRequest.json()
      return NextResponse.json(error, { status: chatRequest.status })
    }

    const chatResponse = await chatRequest.json()
    
    // Convert new format back to legacy format for compatibility
    const assistantMessage = chatResponse.messages.find((msg: any) => msg.role === 'assistant')
    
    return NextResponse.json({ 
      message: assistantMessage?.text || 'No response generated',
      threadId: chatResponse.threadId 
    })

  } catch (error: any) {
    console.error('Legacy Jasmine API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response. Please try again.' },
      { status: 500 }
    )
  }
}
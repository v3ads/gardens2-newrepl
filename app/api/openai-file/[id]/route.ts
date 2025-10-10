import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const fileId = resolvedParams.id;
    
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" }, 
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://api.openai.com/v1/files/${fileId}/content`,
      {
        headers: { 
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}` 
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Download failed" }, 
        { status: response.status }
      );
    }

    const blob = await response.blob();
    
    return new NextResponse(blob, {
      headers: { 
        "Content-Disposition": `attachment; filename="${fileId}.csv"`,
        "Content-Type": "text/csv"
      },
    });
  } catch (error) {
    console.error('Error downloading OpenAI file:', error);
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
}
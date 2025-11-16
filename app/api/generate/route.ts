import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {}
          },
        },
      }
    );

    const { outline } = await request.json();

    if (!outline || !outline.trim()) {
      return Response.json(
        { success: false, error: "Outline is required" },
        { status: 400 }
      );
    }

    const title = outline.trim().slice(0, 50) + (outline.length > 50 ? "..." : "");

    const { data: lesson, error: dbError } = await supabase
      .from("lessons")
      .insert({
        title,
        outline: outline.trim(),
        status: "generating",
      })
      .select()
      .single();

    if (dbError || !lesson) {
      console.error("Database error:", dbError);
      return Response.json(
        { success: false, error: "Failed to create lesson" },
        { status: 500 }
      );
    }

    try {
      await generateLesson(supabase, lesson.id, outline.trim());
      
      return Response.json({
        success: true,
        lessonId: lesson.id,
      });
    } catch (genError: any) {
      console.error("Generation error:", genError);
      
      await supabase
        .from("lessons")
        .update({
          status: "failed",
          error_message: genError.message,
        })
        .eq("id", lesson.id);
      
      return Response.json(
        { success: false, error: genError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("API error:", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

async function generateLesson(supabase: any, lessonId: string, outline: string) {
  console.log(`Generating lesson ${lessonId}`);

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are a JSON generator. Output ONLY valid JSON. No code. No markdown. No explanations. Just a pure JSON object.",
      },
      {
        role: "user",
        content: `Create educational content about: "${outline}"

${outline.toLowerCase().includes('quiz') || outline.toLowerCase().includes('question') ? 
  `IMPORTANT: If the outline mentions a specific number of questions (like "10 questions"), you MUST include exactly that many questions in the quiz array.` : ''}

Output ONLY this JSON (nothing else):
{
  "title": "Engaging title",
  "subtitle": "One sentence summary",
  "sections": [
    {"heading": "Introduction", "bodyMarkdown": "Content with **bold**.\\n\\n- Point 1\\n- Point 2"},
    {"heading": "Details", "bodyMarkdown": "More information here."}
  ],
  "quiz": [
    {"question": "Question?", "choices": ["A", "B", "C", "D"], "answer": "A", "explanation": "Why A"}
  ]
}

Include 2-3 sections. ${outline.toLowerCase().includes('quiz') || outline.toLowerCase().includes('question') ? 
  'For quiz: include the EXACT number of questions mentioned in the outline.' : 
  'Include 3-5 quiz questions if appropriate.'}`,
      },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.3,
    max_tokens: 6000,
  });

  let content = chatCompletion.choices[0]?.message?.content || "";
  console.log("Raw response start:", content.substring(0, 50));
  
  // Aggressively clean
  content = content.trim();
  
  // Remove ANY markdown
  content = content.replace(/```json/gi, "");
  content = content.replace(/```/g, "");
  
  // Remove any text before first {
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  
  if (firstBrace === -1 || lastBrace === -1) {
    console.error("No JSON braces found in:", content);
    throw new Error("AI did not return JSON");
  }
  
  content = content.substring(firstBrace, lastBrace + 1);
  console.log("Cleaned content start:", content.substring(0, 50));

  // Validate JSON
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e: any) {
    console.error("Parse error:", e.message);
    console.error("Content:", content.substring(0, 200));
    throw new Error("Invalid JSON from AI");
  }
  
  if (!parsed.title || !Array.isArray(parsed.sections)) {
    throw new Error("Missing required fields");
  }

  console.log(`Valid lesson: ${parsed.sections.length} sections`);

  // Save
  const { error } = await supabase
    .from("lessons")
    .update({
      content: content,
      status: "generated",
    })
    .eq("id", lessonId);

  if (error) {
    console.error("Save error:", error);
    throw new Error("Failed to save");
  }
  
  console.log(`Lesson ${lessonId} saved`);
}
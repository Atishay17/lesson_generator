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
        { success: false, error: "Failed to create lesson in database" },
        { status: 500 }
      );
    }

    try {
      await generateLesson(supabase, lesson.id, outline.trim());
      
      return Response.json({
        success: true,
        lessonId: lesson.id,
        message: "Lesson generated successfully",
      });
    } catch (genError: any) {
      console.error("Generation error:", genError);
      
      await supabase
        .from("lessons")
        .update({
          status: "failed",
          error_message: genError.message || "Generation failed",
        })
        .eq("id", lesson.id);
      
      return Response.json(
        { success: false, error: "Failed to generate lesson: " + genError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error in generate API:", error);
    return Response.json(
      { success: false, error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

async function generateLesson(supabase: any, lessonId: string, outline: string) {
  const prompt = `You are an expert educational content creator.

Create a structured lesson for: "${outline}"

You MUST respond with ONLY valid JSON in this exact format:

{
  "title": "Main lesson title",
  "subtitle": "Brief description",
  "sections": [
    {
      "heading": "Section title",
      "bodyMarkdown": "Content with **bold** and *italic* support. Use bullet points:\n- Point 1\n- Point 2"
    }
  ],
  "quiz": [
    {
      "question": "Question text?",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A",
      "explanation": "Why this is correct"
    }
  ]
}

RULES:
- Include 2-4 sections explaining the topic
- If it's a quiz/test, include 3-10 quiz questions
- Use markdown formatting in bodyMarkdown (**, *, lists, etc.)
- Keep language clear and educational
- No code fences, no extra text, ONLY the JSON object

Generate the lesson now:`;

  console.log(`🤖 Generating lesson ${lessonId}...`);

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are a JSON-generating educational content expert. Always respond with valid JSON only, no markdown formatting, no explanations.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.7,
    max_tokens: 4096,
  });

  let generatedContent = chatCompletion.choices[0]?.message?.content || "";
  
  // Clean up the response
  generatedContent = cleanJSONResponse(generatedContent);

  // Validate it's valid JSON
  let lessonData;
  try {
    lessonData = JSON.parse(generatedContent);
  } catch (parseError) {
    console.error("Failed to parse JSON:", generatedContent);
    throw new Error("Generated content is not valid JSON");
  }

  // Validate structure
  if (!lessonData.title || !lessonData.sections || !Array.isArray(lessonData.sections)) {
    throw new Error("Generated lesson missing required fields");
  }

  console.log(`✅ Lesson ${lessonId} generated successfully`);

  // Store as JSON string
  const { error: updateError } = await supabase
    .from("lessons")
    .update({
      content: generatedContent,
      status: "generated",
    })
    .eq("id", lessonId);

  if (updateError) {
    throw new Error("Failed to update lesson in database");
  }

  console.log(`💾 Lesson ${lessonId} saved to database`);
}

function cleanJSONResponse(content: string): string {
  // Remove markdown code fences if present
  content = content.replace(/```json\n?/g, "");
  content = content.replace(/```\n?/g, "");
  content = content.trim();
  
  // Find JSON object bounds
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    content = content.substring(firstBrace, lastBrace + 1);
  }
  
  return content;
}
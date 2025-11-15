import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const maxDuration = 60; // Set max duration to 60 seconds

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

    // Create lesson in database with 'generating' status
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

    // Generate the lesson SYNCHRONOUSLY (wait for it)
    try {
      await generateLesson(supabase, lesson.id, outline.trim());
      
      return Response.json({
        success: true,
        lessonId: lesson.id,
        message: "Lesson generated successfully",
      });
    } catch (genError: any) {
      console.error("Generation error:", genError);
      
      // Mark as failed
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

// Synchronous generation function
async function generateLesson(supabase: any, lessonId: string, outline: string) {
  const prompt = `You are an expert educational content creator.

Create an engaging, well-structured lesson for: "${outline}"

STRUCTURE YOUR LESSON:
1. Main title (clear and descriptive)
2. Brief introduction explaining what will be covered
3. Main content (questions, explanations, examples)
4. If it's a quiz: number each question clearly
5. Use simple, clear language
6. Make it engaging and educational

FORMAT AS REACT COMPONENT:
- Use semantic HTML with Tailwind CSS
- Structure: title, intro paragraph, then questions/content sections
- For quizzes: each question in its own section
- Use appropriate spacing and styling
- Keep it clean and readable

EXAMPLE STRUCTURE:
export default function LessonComponent() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-4 text-indigo-900">Main Title</h1>
      <p className="text-lg text-gray-600 mb-8">Brief introduction paragraph.</p>
      
      <div className="space-y-6">
        <div className="bg-blue-50 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-3 text-gray-800">Question 1: Title</h3>
          <p className="text-gray-700">Question content here</p>
        </div>
      </div>
    </div>
  );
}

Generate clean, educational content now:`;

  console.log(`🤖 Generating lesson ${lessonId}...`);

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are an expert TypeScript and React developer who creates educational content. Generate clean, working, executable code only. Never use markdown code fences or explanations.",
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

  let generatedCode = chatCompletion.choices[0]?.message?.content || "";
  generatedCode = cleanGeneratedCode(generatedCode);

  if (!isValidReactComponent(generatedCode)) {
    throw new Error("Generated code is not a valid React component");
  }

  console.log(`✅ Lesson ${lessonId} generated successfully`);

  // Update lesson in database
  const { error: updateError } = await supabase
    .from("lessons")
    .update({
      content: generatedCode,
      status: "generated",
    })
    .eq("id", lessonId);

  if (updateError) {
    throw new Error("Failed to update lesson in database");
  }

  console.log(`💾 Lesson ${lessonId} saved to database`);
}

function cleanGeneratedCode(code: string): string {
  code = code.replace(/```typescript\n?/g, "");
  code = code.replace(/```tsx\n?/g, "");
  code = code.replace(/```javascript\n?/g, "");
  code = code.replace(/```jsx\n?/g, "");
  code = code.replace(/```\n?/g, "");
  code = code.trim();

  if (!code.includes("import")) {
    code = `import { useState } from "react";\n\n${code}`;
  }

  return code;
}

function isValidReactComponent(code: string): boolean {
  if (!code.includes("export default")) {
    return false;
  }

  const hasFunction =
    code.includes("function") ||
    code.includes("const") ||
    code.includes("=>");

  const hasReturn = code.includes("return");

  return hasFunction && hasReturn;
}
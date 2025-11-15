import { createClient } from "@/utils/supabase/server";
import Groq from "groq-sdk";


const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { outline } = await request.json();

    if (!outline || !outline.trim()) {
      return Response.json(
        { success: false, error: "Outline is required" },
        { status: 400 }
      );
    }

    // Extract a title from the outline (first 50 chars)
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

    // Generate the lesson asynchronously (don't wait for it)
    generateLessonAsync(lesson.id, outline.trim());

    return Response.json({
      success: true,
      lessonId: lesson.id,
      message: "Lesson generation started",
    });
  } catch (error: any) {
    console.error("Error in generate API:", error);
    return Response.json(
      { success: false, error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// Async function to generate lesson content
async function generateLessonAsync(lessonId: string, outline: string) {
  try {
    const supabase = await createClient();
    
    const prompt = `You are an expert educational content creator and TypeScript developer.

Generate a complete, interactive React component for this lesson: "${outline}"

CRITICAL REQUIREMENTS:
1. Generate ONLY TypeScript/React code - no markdown, no explanations, no code fences
2. Export a default function component
3. Use proper TypeScript types
4. Use Tailwind CSS classes for beautiful styling
5. Make it educational, interactive, and engaging
6. Include clear explanations and examples
7. Add interactive elements where appropriate (quizzes, exercises, etc.)
8. Use modern React patterns (hooks, functional components)

EXAMPLE STRUCTURE:
export default function LessonComponent() {
  const [answer, setAnswer] = useState("");
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-4xl font-bold mb-6 text-indigo-900">Lesson Title</h1>
      <div className="space-y-6">
        {/* Lesson content here */}
      </div>
    </div>
  );
}

Generate the complete TypeScript code now:`;

    console.log(`🤖 Generating lesson ${lessonId}...`);

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an expert TypeScript and React developer who creates educational content. Generate clean, working, executable code only. Never use markdown code fences or explanations.",
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

    // Clean the generated code
    generatedCode = cleanGeneratedCode(generatedCode);

    // Validate the code
    if (!isValidReactComponent(generatedCode)) {
      throw new Error("Generated code is not a valid React component");
    }

    console.log(`✅ Lesson ${lessonId} generated successfully`);

    // Update lesson in database with generated content
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
  } catch (error: any) {
    console.error(`❌ Error generating lesson ${lessonId}:`, error);
    const supabase = await createClient();

    // Update lesson status to failed
    await supabase
      .from("lessons")
      .update({
        status: "failed",
        error_message: error.message || "Unknown error during generation",
      })
      .eq("id", lessonId);
  }
}

// Clean up the generated code
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

// Validate that the code is a React component
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
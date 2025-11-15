import Groq from "groq-sdk";

export async function GET() {
  try {
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: "Say hello in exactly 3 words",
        },
      ],
      model: "llama-3.3-70b-versatile", // ← CORRECT model name
      temperature: 0.7,
      max_tokens: 100,
    });

    const output = chatCompletion.choices[0]?.message?.content || "";

    return Response.json({
      success: true,
      response: output,
    });
  } catch (error: any) {
    console.error("Groq API Error:", error);
    return Response.json(
      {
        success: false,
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
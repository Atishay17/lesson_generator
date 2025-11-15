"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from '@supabase/ssr';
import Link from "next/link";
import { useParams } from "next/navigation";

interface Lesson {
  id: string;
  title: string;
  outline: string;
  status: string;
  content: string;
  created_at: string;
}

export default function LessonPage() {
  const params = useParams();
  const lessonId = params.id as string;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  useEffect(() => {
    if (supabaseUrl && supabaseKey) {
      fetchLesson();
    }
  }, [lessonId]);

  const fetchLesson = async () => {
    try {
      const supabase = createBrowserClient(supabaseUrl!, supabaseKey!);
      
      const { data, error: fetchError } = await supabase
        .from("lessons")
        .select("*")
        .eq("id", lessonId)
        .single();

      if (fetchError) throw fetchError;

      if (!data) {
        setError("Lesson not found");
        setLoading(false);
        return;
      }

      setLesson(data);
      setLoading(false);
    } catch (err: any) {
      console.error("Error fetching lesson:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading lesson...</p>
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Error Loading Lesson
          </h2>
          <p className="text-gray-600 mb-6">{error || "Lesson not found"}</p>
          <Link
            href="/"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (lesson.status === "generating") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="animate-pulse text-6xl mb-4">⏳</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Generating Lesson...
          </h2>
          <p className="text-gray-600 mb-6">
            Your lesson is being created. This usually takes 10-30 seconds.
          </p>
          <p className="text-sm text-gray-500 mb-4">
            You can go back and the lesson will appear when ready.
          </p>
          <Link
            href="/"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (lesson.status === "failed") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Generation Failed
          </h2>
          <p className="text-gray-600 mb-6">
            There was an error generating this lesson. Please try creating a new
            one.
          </p>
          <Link
            href="/"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // For now, display the generated code as formatted text
  // In production, you'd want to safely render the React component
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center text-indigo-600 hover:text-indigo-800 font-medium mb-4"
          >
            ← Back to Home
          </Link>
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {lesson.title}
            </h1>
            <p className="text-gray-600">{lesson.outline}</p>
            <div className="mt-4 flex items-center gap-2">
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                ✓ Generated Successfully
              </span>
              <span className="text-sm text-gray-500">
                {new Date(lesson.created_at).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Lesson Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">
              Generated Lesson Code
            </h2>
            <button
              onClick={() => navigator.clipboard.writeText(lesson.content)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
            >
              📋 Copy Code
            </button>
          </div>
          
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
              <span className="text-gray-300 text-sm font-mono">TypeScript React Component</span>
              <span className="text-gray-500 text-xs">
                {lesson.content.split('\n').length} lines
              </span>
            </div>
            <pre className="p-6 overflow-x-auto text-sm">
              <code className="text-green-400 font-mono">
                {lesson.content}
              </code>
            </pre>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-700">
              <strong>💡 To use this lesson:</strong> Copy the code above and paste it into a React component file. 
              Make sure you have React and Tailwind CSS set up in your project.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
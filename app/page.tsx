"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";

interface Lesson {
  id: string;
  title: string;
  outline: string;
  status: "generating" | "generated" | "failed";
  created_at: string;
  error_message?: string;
}

export default function Home() {
  const [outline, setOutline] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = createClient();

  // Fetch lessons on mount
useEffect(() => {
  fetchLessons();
  
  // Subscribe to real-time updates
  const channel = supabase
    .channel("lessons_changes")
    .on(
      "postgres_changes",
      { 
        event: "*", 
        schema: "public", 
        table: "lessons" 
      },
      (payload) => {
        console.log("🔔 Realtime update:", payload);
        fetchLessons();
      }
    )
    .subscribe((status) => {
      console.log("📡 Realtime status:", status);
    });

  return () => {
    supabase.removeChannel(channel);
  };
}, []);

  const fetchLessons = async () => {
    const { data, error } = await supabase
      .from("lessons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching lessons:", error);
    } else {
      setLessons(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!outline.trim()) {
      alert("Please enter a lesson outline");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ outline: outline.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        setOutline(""); // Clear the form
        // Lesson will appear in table via real-time subscription
      } else {
        alert("Error generating lesson: " + data.error);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to generate lesson");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      generating: "bg-yellow-100 text-yellow-800",
      generated: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
    };

    return (
      <span
        className={`px-3 py-1 rounded-full text-sm font-medium ${
          styles[status as keyof typeof styles]
        }`}
      >
        {status === "generating" && "⏳ Generating..."}
        {status === "generated" && "✓ Ready"}
        {status === "failed" && "✗ Failed"}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-3">
            📚 Digital Lessons
          </h1>
          <p className="text-gray-600 text-lg">
            Generate interactive educational lessons with AI
          </p>
        </div>

        {/* Generate Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Create a New Lesson
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="outline"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Lesson Outline
              </label>
              <textarea
                id="outline"
                value={outline}
                onChange={(e) => setOutline(e.target.value)}
                placeholder='e.g., "A 10 question pop quiz on Florida" or "An explanation of how the Cartesian Grid works"'
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                rows={4}
                disabled={isSubmitting}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 flex items-center justify-center"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Generating...
                </>
              ) : (
                "✨ Generate Lesson"
              )}
            </button>
          </form>
        </div>

        {/* Lessons Table */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            Your Lessons
          </h2>

          {lessons.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">No lessons yet.</p>
              <p className="text-sm">Generate your first lesson above!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      Title
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      Created
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {lessons.map((lesson) => (
                    <tr
                      key={lesson.id}
                      className="hover:bg-gray-50 transition"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">
                          {lesson.title}
                        </div>
                        <div className="text-sm text-gray-500 truncate max-w-md">
                          {lesson.outline}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(lesson.status)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(lesson.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        {lesson.status === "generated" ? (
                          <Link
                            href={`/lessons/${lesson.id}`}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            View Lesson →
                          </Link>
                        ) : lesson.status === "failed" ? (
                          <span className="text-red-600 text-sm">
                            {lesson.error_message || "Generation failed"}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">
                            Generating...
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
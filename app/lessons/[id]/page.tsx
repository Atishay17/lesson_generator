"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from '@supabase/ssr';
import Link from "next/link";
import { useParams } from "next/navigation";
import ReactMarkdown from 'react-markdown';

interface LessonData {
  title: string;
  subtitle?: string;
  sections: Array<{
    heading: string;
    bodyMarkdown: string;
  }>;
  quiz?: Array<{
    question: string;
    choices: string[];
    answer: string;
    explanation?: string;
  }>;
}

interface Lesson {
  id: string;
  title: string;
  outline: string;
  status: string;
  content: string;
  created_at: string;
}

// Helper: safely extract JSON from various formats
function extractJsonFromContent(content: string): LessonData | null {
  if (!content) return null;

  // Method 1: Try direct JSON parse (for new format)
  try {
    const parsed = JSON.parse(content);
    if (parsed.title && Array.isArray(parsed.sections)) {
      return parsed;
    }
  } catch (e) {
    // Not direct JSON, try other methods
  }

  // Method 2: Look for JSON in markdown code fences
  const fencedMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (fencedMatch) {
    try {
      const parsed = JSON.parse(fencedMatch[1]);
      if (parsed.title && Array.isArray(parsed.sections)) {
        return parsed;
      }
    } catch (e) {
      // Continue to next method
    }
  }

  // Method 3: Find JSON object with balanced braces
  const firstBrace = content.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let endBrace = -1;
    
    for (let i = firstBrace; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') {
        depth--;
        if (depth === 0) {
          endBrace = i;
          break;
        }
      }
    }
    
    if (endBrace !== -1) {
      try {
        const jsonStr = content.substring(firstBrace, endBrace + 1);
        const parsed = JSON.parse(jsonStr);
        if (parsed.title && Array.isArray(parsed.sections)) {
          return parsed;
        }
      } catch (e) {
        // Failed to parse
      }
    }
  }

  return null;
}

export default function LessonPage() {
  const params = useParams();
  const lessonId = params.id as string;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessonData, setLessonData] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawContent, setShowRawContent] = useState(false);
  const [userAnswers, setUserAnswers] = useState<{[key: number]: string}>({});
  const [showResults, setShowResults] = useState(false);

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

      // Safely parse lesson content
      if (data.status === "generated" && data.content) {
        const parsed = extractJsonFromContent(data.content);
        
        if (parsed) {
          setLessonData(parsed);
        } else {
          console.warn("Could not extract valid lesson JSON from content");
          setError("Lesson content is in an incompatible format. Please regenerate this lesson.");
        }
      }

      setLoading(false);
    } catch (err: any) {
      console.error("Error fetching lesson:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleAnswerSelect = (questionIndex: number, answer: string) => {
    setUserAnswers(prev => ({ ...prev, [questionIndex]: answer }));
  };

  const checkAnswers = () => {
    setShowResults(true);
  };

  const getScore = () => {
    if (!lessonData?.quiz) return 0;
    let correct = 0;
    lessonData.quiz.forEach((q, idx) => {
      if (userAnswers[idx] === q.answer) correct++;
    });
    return correct;
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Lesson</h2>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Generating Lesson...</h2>
          <p className="text-gray-600 mb-6">
            Your lesson is being created. This usually takes 10-30 seconds.
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Generation Failed</h2>
          <p className="text-gray-600 mb-6">
            There was an error generating this lesson. Please try creating a new one.
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center text-indigo-600 hover:text-indigo-800 font-medium mb-4"
          >
            ← Back to Home
          </Link>
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {lessonData?.title || lesson.title}
                </h1>
                {lessonData?.subtitle && (
                  <p className="text-lg text-gray-600 mb-4">{lessonData.subtitle}</p>
                )}
                <p className="text-sm text-gray-500 mb-4">{lesson.outline}</p>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                    ✓ Generated
                  </span>
                  <span className="text-sm text-gray-500">
                    {new Date(lesson.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowRawContent(!showRawContent)}
                className="ml-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition"
              >
                {showRawContent ? '📖 View Lesson' : '🔍 Debug'}
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {showRawContent ? (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Raw Content (Debug)</h2>
            <pre className="bg-gray-900 text-green-400 p-6 rounded-lg overflow-x-auto text-sm whitespace-pre-wrap">
              {lesson.content}
            </pre>
          </div>
        ) : lessonData ? (
          <div className="space-y-6">
            {/* Sections */}
            {lessonData.sections?.map((section, idx) => (
              <div key={idx} className="bg-white rounded-2xl shadow-xl p-8">
                <h2 className="text-2xl font-bold text-indigo-900 mb-4">
                  {section.heading}
                </h2>
                <div className="prose prose-lg max-w-none">
                  <ReactMarkdown>{section.bodyMarkdown}</ReactMarkdown>
                </div>
              </div>
            ))}

            {/* Quiz */}
            {lessonData.quiz && lessonData.quiz.length > 0 && (
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <h2 className="text-2xl font-bold text-indigo-900 mb-6">
                  📝 Quiz Time!
                </h2>
                <div className="space-y-6">
                  {lessonData.quiz.map((q, qIdx) => (
                    <div key={qIdx} className="border-l-4 border-indigo-500 pl-6 py-4">
                      <h3 className="text-lg font-semibold text-gray-800 mb-3">
                        {qIdx + 1}. {q.question}
                      </h3>
                      <div className="space-y-2">
                        {q.choices.map((choice, cIdx) => {
                          const isSelected = userAnswers[qIdx] === choice;
                          const isCorrect = choice === q.answer;
                          const showCorrect = showResults && isCorrect;
                          const showWrong = showResults && isSelected && !isCorrect;

                          return (
                            <button
                              key={cIdx}
                              onClick={() => handleAnswerSelect(qIdx, choice)}
                              disabled={showResults}
                              className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${
                                showCorrect
                                  ? 'border-green-500 bg-green-50'
                                  : showWrong
                                  ? 'border-red-500 bg-red-50'
                                  : isSelected
                                  ? 'border-indigo-500 bg-indigo-50'
                                  : 'border-gray-200 hover:border-indigo-300 bg-white'
                              }`}
                            >
                              <span className="flex items-center justify-between">
                                <span>{choice}</span>
                                {showCorrect && <span className="text-green-600">✓</span>}
                                {showWrong && <span className="text-red-600">✗</span>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {showResults && q.explanation && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-gray-700">
                          <strong>Explanation:</strong> {q.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {!showResults ? (
                  <button
                    onClick={checkAnswers}
                    disabled={Object.keys(userAnswers).length !== lessonData.quiz.length}
                    className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition"
                  >
                    Submit Answers
                  </button>
                ) : (
                  <div className="mt-6 p-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl text-center">
                    <p className="text-3xl font-bold text-indigo-900 mb-2">
                      Your Score: {getScore()} / {lessonData.quiz.length}
                    </p>
                    <p className="text-gray-600">
                      {getScore() === lessonData.quiz.length
                        ? '🎉 Perfect score! Great job!'
                        : getScore() >= lessonData.quiz.length * 0.7
                        ? '👍 Good work! Keep learning!'
                        : '📚 Keep studying and try again!'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="text-yellow-500 text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Incompatible Lesson Format
            </h2>
            <p className="text-gray-600 mb-6">
              This lesson was created with an older format. Please generate a new lesson for the best experience.
            </p>
            <Link
              href="/"
              className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              Generate New Lesson
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
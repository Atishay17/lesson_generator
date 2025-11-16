// scripts/migrate-lessons.js
// Works in CommonJS Node by using dynamic import()
// Usage (PowerShell):
// $env:SUPABASE_URL="https://..."
// $env:SUPABASE_SERVICE_ROLE_KEY="..."
// node .\scripts\migrate-lessons.js

(async () => {
  try {
    const { createClient } = await import('@supabase/supabase-js');

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error("Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment before running.");
      process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    function extractJsonBlock(text) {
      if (!text) return null;

      const marker = text.match(/---LESSON_JSON_START---\s*([\s\S]*?)\s*---LESSON_JSON_END---/m);
      if (marker) {
        try { return JSON.parse(marker[1]); } catch (e) {}
      }

      const fenced = text.match(/```json\s*([\s\S]*?)\s*```/m);
      if (fenced) {
        try { return JSON.parse(fenced[1]); } catch (e) {}
      }

      const start = text.indexOf("{");
      if (start !== -1) {
        let depth = 0;
        for (let i = start; i < text.length; i++) {
          const ch = text[i];
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              const candidate = text.slice(start, i + 1);
              try { return JSON.parse(candidate); } catch (e) {}
              break;
            }
          }
        }
      }

      const exportMatch = text.match(/export\s+const\s+lesson\s*=\s*({[\s\S]*?})\s*;?/m);
      if (exportMatch) {
        const objText = exportMatch[1];
        try {
          const transformed = objText.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":').replace(/'/g, '"');
          return JSON.parse(transformed);
        } catch (e) {
          try { return (new Function(`return (${objText});`))(); } catch (e) {}
        }
      }

      return null;
    }

    console.log("Fetching lessons...");
    const { data, error } = await supabase
      .from("lessons")
      .select("id, content, lesson_json, status")
      .limit(1000);

    if (error) {
      console.error("Fetch error:", error);
      process.exit(1);
    }

    for (const row of data) {
      if (row.lesson_json) {
        console.log("Skipping (already has lesson_json):", row.id);
        continue;
      }
      const json = extractJsonBlock(row.content || "");
      if (json) {
        console.log("Updating", row.id);
        const { error: uErr } = await supabase
          .from("lessons")
          .update({ lesson_json: json })
          .eq("id", row.id);
        if (uErr) console.error("Update failed for", row.id, uErr);
      } else {
        console.log("No JSON extracted for", row.id);
      }
    }

    console.log("Migration finished.");
    process.exit(0);
  } catch (err) {
    console.error("Migration script error:", err);
    process.exit(1);
  }
})();

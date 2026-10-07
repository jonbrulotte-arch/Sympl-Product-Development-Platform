"use client";

/** Highlights {Token} placeholders so admins can see the generator's fill-in fields. */
export function Tokenized({ text, values }: { text: string | null; values?: Record<string, string> }) {
  if (!text) return null;
  const parts = text.split(/(\{[^{}\n]{1,80}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{[^{}\n]{1,80}\}$/.test(p) ? (
          values?.[p.slice(1, -1).trim()]?.trim()
            ? <span key={i} className="rounded bg-green-50 px-1 text-green-800 font-medium">{values[p.slice(1, -1).trim()].trim()}</span>
            : <span key={i} className="rounded bg-blue-50 px-1 text-blue-700 font-medium">{p}</span>
        ) : <span key={i}>{p}</span>,
      )}
    </>
  );
}


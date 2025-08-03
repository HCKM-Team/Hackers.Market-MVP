import { sanitizeHTML } from "@/lib/security/sanitize";
import { useMemo } from "react";

export function SafeMarkdown({ content }: { content: string }) {
  const sanitized = useMemo(() => sanitizeHTML(content), [content]);

  return (
    <div className="prose" dangerouslySetInnerHTML={{ __html: sanitized }} />
  );
}

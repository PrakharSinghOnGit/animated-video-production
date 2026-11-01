import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Renders markdown (reviews, notes, scripts, guides) with the dashboard's prose styles. Links open in a new tab. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("wg-prose", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noreferrer" /> }}>{children}</ReactMarkdown>
    </div>
  );
}

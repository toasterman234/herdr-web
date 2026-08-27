import ReactMarkdown from "react-markdown";
import type { UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatMarkdown({ body }: { body: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        disallowedElements={["img"]}
        remarkPlugins={[remarkGfm]}
        urlTransform={safeMarkdownUrl}
        components={{
          a: ({ node, children, href, ...props }) => {
            void node;
            return href ? (
              <a {...props} href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            );
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
const safeMarkdownUrl: UrlTransform = (url, key) => {
  if (key !== "href") return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
};

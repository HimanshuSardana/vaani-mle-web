/** The recall mark: an open ring returning into a filled dot — something that
 *  comes back to you. One glyph, used in the sidebar and on replies. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="1.9" fill="currentColor" />
      <path
        d="M11.1 3.58A5.4 5.4 0 1 1 3.58 4.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M4.67 3.34 4.6 5.62 2.56 4.18Z" fill="currentColor" />
    </svg>
  );
}

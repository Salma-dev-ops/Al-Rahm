// Small inline icons (24×24, stroke = currentColor).

function Icon({ children, className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** The Al-Rahm mark: a five-petal blossom. */
export function BlossomLogo({ className = "h-6 w-6" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g fill="currentColor">
        {[0, 72, 144, 216, 288].map((angle) => (
          <path
            key={angle}
            transform={`rotate(${angle} 16 16)`}
            d="M16 15c-3.2-2.2-4.6-5.6-3.6-8.6.6-1.6 1.9-2.4 2.8-1.6l.8.9.8-.9c.9-.8 2.2 0 2.8 1.6 1 3-.4 6.4-3.6 8.6z"
          />
        ))}
      </g>
      <circle cx="16" cy="16" r="2.4" fill="var(--surface)" />
    </svg>
  );
}

export const HomeIcon = (p) => (
  <Icon {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
  </Icon>
);

export const TestIcon = (p) => (
  <Icon {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1" />
    <path d="m9 13 2 2 4-4" />
  </Icon>
);

export const ResultsIcon = (p) => (
  <Icon {...p}>
    <path d="M4 20h16" />
    <path d="M7 16V10" />
    <path d="M12 16V5" />
    <path d="M17 16v-4" />
  </Icon>
);

export const QuestionsIcon = (p) => (
  <Icon {...p}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" />
  </Icon>
);

export const MethodIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3v18" />
    <path d="M5 7h14" />
    <path d="m5 7-3 7a4 4 0 0 0 6 0z" />
    <path d="m19 7-3 7a4 4 0 0 0 6 0z" />
    <path d="M8 21h8" />
  </Icon>
);

export const CopyIcon = (p) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </Icon>
);

export const CheckIcon = (p) => (
  <Icon {...p}>
    <path d="m5 12 5 5 9-10" />
  </Icon>
);

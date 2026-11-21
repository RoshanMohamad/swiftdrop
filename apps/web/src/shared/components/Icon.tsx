/**
 * Small inline icon set (stroke SVGs, no dependency).
 * Icons are decorative: always aria-hidden, so labels and button names
 * come from the surrounding text only.
 */
const PATHS = {
  pin: "M12 21s-6-5.4-6-11a6 6 0 0 1 12 0c0 5.6-6 11-6 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  building:
    "M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16 M14 9h5a1 1 0 0 1 1 1v11 M3 21h18 M8 8h2 M8 12h2 M8 16h2 M17 13h0 M17 17h0",
  coins:
    "M12 7c4.4 0 8-1.1 8-2.5S16.4 2 12 2 4 3.1 4 4.5 7.6 7 12 7Z M4 4.5v5C4 10.9 7.6 12 12 12s8-1.1 8-2.5v-5 M4 9.5v5C4 15.9 7.6 17 12 17s8-1.1 8-2.5v-5 M4 14.5v5C4 20.9 7.6 22 12 22s8-1.1 8-2.5v-5",
  box: "M21 8 12 3 3 8v8l9 5 9-5V8Z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5",
  calendar:
    "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z M4 10h16 M8 2v4 M16 2v4",
  plus: "M12 5v14 M5 12h14",
  pause: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M10 9v6 M14 9v6",
  play: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M10 8.5l5 3.5-5 3.5v-7Z",
  trash:
    "M4 7h16 M10 11v6 M14 11v6 M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13 M9 7V4h6v3",
  store:
    "M4 10v10h16V10 M3 4h18l-1.5 5a2.5 2.5 0 0 1-4.5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-4.5 0L3 4Z M9 20v-5h6v5",
  chart: "M4 20h16 M7 16v-4 M12 16V8 M17 16V5",
  filter: "M4 5h16l-6 7.5V19l-4 2v-8.5L4 5Z",
  download: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
  "check-circle":
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M8.5 12.5l2.5 2.5 4.5-5",
  "x-circle": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M9 9l6 6 M15 9l-6 6",
  mail: "M4 6h16v12H4V6Z M4 7l8 6 8-6",
  phone:
    "M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v5 M12 8h0",
  users:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M2 21a7 7 0 0 1 14 0 M16 3.5a4 4 0 0 1 0 7 M18 14a6 6 0 0 1 4 7",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z M7.5 7.5h0",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  truck:
    "M2 6h11v10H2V6Z M13 10h4l4 4v2h-8 M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z M9 12l2 2 4-4",
  key: "M15 9a4 4 0 1 1-3.5 6L4 22l-2-2 2-2 2 2 2-2-2-2 5.5-5.5A4 4 0 0 1 15 9Z M17 7h0",
  lock: "M5 11h14v10H5V11Z M8 11V7a4 4 0 0 1 8 0v4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2",
  refresh: "M20 12a8 8 0 1 1-2.3-5.6 M20 4v5h-5",
  "arrow-right": "M5 12h14 M13 6l6 6-6 6",
  "chevron-left": "M15 6l-6 6 6 6",
  list: "M9 6h11 M9 12h11 M9 18h11 M4 6h0 M4 12h0 M4 18h0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21a8 8 0 0 1 16 0",
  send: "M21 3 10 14 M21 3l-7 18-4-7-7-4 18-7Z",
  webhook:
    "M9 16a4 4 0 1 1-3-6.8 M15 16h-5l-2.5-4.5 M12 6a4 4 0 1 1 6.5 3.2L16 13 M15 16a4 4 0 1 0 3-1",
  alert: "M12 3 2 20h20L12 3Z M12 10v4 M12 17h0",
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps {
  name: IconName;
  size?: number | string;
  className?: string;
}

export function Icon({ name, size = "1em", className = "" }: IconProps) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

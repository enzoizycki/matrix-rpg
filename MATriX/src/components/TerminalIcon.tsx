import type { SVGProps } from "react";

/** A single, monochrome icon language for the Construct interface. */
const paths = {
  terminal: ["M3 5h18v14H3z", "m6 9 3 3-3 3", "M12 15h5"],
  chip: ["M6 6h12v12H6z", "M9 9h6v6H9z", "M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"],
  connect: ["M8 3v5m8-5v5", "M6 8h12v5l-4 4h-4l-4-4z", "M12 17v4"],
  disconnected: ["M8 3v4m8-4v4", "M6 8h12v5l-4 4h-4l-4-4V8", "M12 17v4", "m3 3 18 18"],
  upload: ["M4 15v5h16v-5", "M12 16V4", "m7 9 5-5 5 5"],
  file: ["M5 3h9l5 5v13H5z", "M14 3v5h5", "M8 12h8m-8 4h6"],
  book: ["M12 5v15", "M3 4h5l4 2 4-2h5v15h-5l-4 2-4-2H3z", "M6 8h3m-3 4h3m6-4h3m-3 4h3"],
  user: ["M9 3h6l2 3-1 5-4 2-4-2-1-5z", "m4 18 4-3 4 2 4-2 4 3v3H4z"],
  dice: ["m12 2 9 5v10l-9 5-9-5V7z", "m12 2-5 13h10L12 2M3 7l4 8-4 2m18-10-4 8 4 2M7 15l5 7 5-7"],
  pin: ["M8 3h8l-1 7 4 4H5l4-4z", "M12 14v7"],
  pulse: ["M2 12h5l3-7 4 14 3-7h5"],
  check: ["m5 12 4 4L19 6"],
  close: ["m6 6 12 12M6 18 18 6"],
  send: ["M3 12h17", "m13 5 7 7-7 7", "M3 5h4M3 19h4"],
  refresh: ["M20 8a8 8 0 0 0-14-3L3 8", "M3 3v5h5", "M4 16a8 8 0 0 0 14 3l3-3", "M16 16h5v5"],
  plus: ["M5 12h14M12 5v14"],
  minus: ["M5 12h14"],
  sliders: ["M4 6h8m4 0h4M4 12h3m4 0h9M4 18h10m4 0h2", "M12 3v6M7 9v6m7 0v6"],
  target: ["M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4", "M8 8h8v8H8z", "M12 2v4m0 12v4M2 12h4m12 0h4"],
  immersive: ["m12 2 9 5v10l-9 5-9-5V7z", "m12 7 5 3v5l-5 3-5-3v-5z", "M12 2v5m9 10-4-2m-10 0-4 2"],
  narrative: ["M4 3h12l4 4v14H4z", "M16 3v4h4", "M7 9h6m-6 4h10m-10 4h7"],
  tactical: ["M3 3h7v7H3zM14 14h7v7h-7z", "M14 6h4v4m-8 8H6v-4", "m14 6 4 4M6 14l4 4"],
  balanced: ["M12 3v18M5 21h14M4 6h16", "m6 6-4 8h8L6 6m12 0-4 8h8l-4-8"],
  grim: ["M14 3a9 9 0 1 0 7 13A10 10 0 0 1 14 3Z", "M4 16h5m-4 3h6"],
  lighthearted: ["m14 2-9 12h6l-1 8L20 9h-7z"],
  equipment: ["M7 5V3h10v2", "M3 7h18v14H3z", "M3 12h18M9 10v4h6v-4"],
  note: ["M4 3h16v14l-4 4H4z", "M16 21v-4h4", "M8 7h8m-8 4h8m-8 4h4"],
  external: ["M13 3h8v8", "M21 3 10 14", "M9 4H3v17h17v-6"],
  cloud: ["M7 19h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.8 4.8 0 0 0 7 19z"],
  server: ["M3 4h18v6H3z", "M3 14h18v6H3z", "M7 7h2M7 17h2", "M14 7h4M14 17h4"],
} satisfies Record<string, string[]>;

export type TerminalIconName = keyof typeof paths;

type Props = Omit<SVGProps<SVGSVGElement>, "children" | "name"> & {
  name: TerminalIconName;
  size?: number;
};

// Decorative by default: buttons keep their readable text or aria-label.
export default function TerminalIcon({ name, size = 18, className = "", ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      className={`terminal-icon ${className}`}
      data-terminal-icon={name}
      {...props}
    >
      {paths[name].map((path, index) => <path key={index} d={path} />)}
    </svg>
  );
}

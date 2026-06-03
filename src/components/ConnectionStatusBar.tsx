interface Props {
  line: string;
  broken: boolean;
}

export function ConnectionStatusBar({ line, broken }: Props) {
  return (
    <p className={`connection-status ${broken ? "broken" : ""}`} role="status" aria-live="polite">
      {line}
    </p>
  );
}

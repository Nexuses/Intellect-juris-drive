const COLORS = ["#292d30", "#a58b60", "#6e5a3c", "#4a433c", "#8c7350", "#3d4246"];

export function UserAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const color = COLORS[name.length % COLORS.length];

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-cream"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}

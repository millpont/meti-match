// A lightweight, dependency-free celebration: a burst of confetti plus an "It's a match!" pill.
// Purely decorative — pointer-events are off so it never blocks the UI. The parent mounts it
// briefly (see Matches) and unmounts it after the animation.
const COLORS = ["#4c56c0", "#d4af5a", "#10b981", "#6366f1", "#ffffff"];

export default function Confetti() {
  const pieces = Array.from({ length: 100 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.5;
    const duration = 2.4 + Math.random() * 1.6;
    const size = 6 + Math.random() * 6;
    return (
      <span
        key={i}
        style={{
          position: "absolute",
          top: 0,
          left: `${left}%`,
          width: `${size}px`,
          height: `${size * 0.6}px`,
          backgroundColor: COLORS[i % COLORS.length],
          borderRadius: "1px",
          animation: `confetti-fall ${duration}s ${delay}s linear forwards`,
        }}
      />
    );
  });

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces}
      <div className="flex h-full items-start justify-center pt-[18vh]">
        <div
          className="rounded-full bg-grain-blue px-5 py-2.5 text-lg font-bold text-white shadow-xl"
          style={{ animation: "match-pop 0.5s ease-out both" }}
        >
          🎉 It's a match!
        </div>
      </div>
    </div>
  );
}

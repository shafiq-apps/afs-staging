export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-blue-500/8 rounded-full blur-[120px] animate-glow-drift-1" />
        <div className="absolute top-1/2 right-0 w-[600px] h-[600px] bg-violet-500/6 rounded-full blur-[100px] animate-glow-drift-2" />
        <div className="absolute bottom-0 left-1/4 w-[700px] h-[700px] bg-blue-500/7 rounded-full blur-[110px] animate-glow-drift-3" />
      </div>
    </div>
  );
}

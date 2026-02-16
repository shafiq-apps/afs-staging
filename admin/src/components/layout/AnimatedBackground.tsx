'use client';

export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Deep charcoal and slate base */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"></div>
      
      {/* Radial light glows - muted blue and violet, slow-moving */}
      <div className="absolute inset-0">
        {/* Top-left blue glow */}
        <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-blue-500/8 rounded-full blur-[120px] animate-glow-drift-1"></div>
        
        {/* Center-right violet glow */}
        <div className="absolute top-1/2 right-0 w-[600px] h-[600px] bg-violet-500/6 rounded-full blur-[100px] animate-glow-drift-2"></div>
        
        {/* Bottom-left blue-violet glow */}
        <div className="absolute bottom-0 left-1/4 w-[700px] h-[700px] bg-blue-500/7 rounded-full blur-[110px] animate-glow-drift-3"></div>
        
        {/* Subtle overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-slate-900/10 to-transparent"></div>
      </div>
    </div>
  );
}


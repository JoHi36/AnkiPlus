export function DemoECGImage() {
  return (
    <div className="my-4 rounded-lg overflow-hidden border border-white/10 bg-black relative">
       <svg viewBox="0 0 600 150" className="w-full h-auto">
          {/* Grid Background */}
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
             <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#ef4444" strokeWidth="0.5" strokeOpacity="0.2"/>
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* ECG Line */}
          <path 
            d="M 0 75 L 20 75 L 25 70 L 30 75 L 40 75 L 45 60 L 50 110 L 55 50 L 60 75 L 70 75 L 80 40 L 90 75 L 120 75"
            fill="none"
            stroke="#14b8a6" 
            strokeWidth="2"
            strokeLinejoin="round"
            className="drop-shadow-[0_0_5px_rgba(20,184,166,0.8)]"
          />
          
          {/* Repeated Pattern for effect */}
          <path 
            d="M 120 75 L 140 75 L 145 70 L 150 75 L 160 75 L 165 60 L 170 110 L 175 50 L 180 75 L 190 75 L 200 40 L 210 75 L 240 75"
            fill="none"
            stroke="#14b8a6" 
            strokeWidth="2"
            strokeLinejoin="round"
            className="drop-shadow-[0_0_5px_rgba(20,184,166,0.8)]"
          />

          <path 
            d="M 240 75 L 260 75 L 265 70 L 270 75 L 280 75 L 285 60 L 290 110 L 295 50 L 300 75 L 310 75 L 320 40 L 330 75 L 360 75"
            fill="none"
            stroke="#14b8a6" 
            strokeWidth="2"
            strokeLinejoin="round"
            className="drop-shadow-[0_0_5px_rgba(20,184,166,0.8)]"
          />

           <path 
            d="M 360 75 L 380 75 L 385 70 L 390 75 L 400 75 L 405 60 L 410 110 L 415 50 L 420 75 L 430 75 L 440 40 L 450 75 L 480 75"
            fill="none"
            stroke="#14b8a6" 
            strokeWidth="2"
            strokeLinejoin="round"
            className="drop-shadow-[0_0_5px_rgba(20,184,166,0.8)]"
          />
       </svg>
       
       {/* Label */}
       <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[9px] text-teal-400 font-mono border border-teal-500/20">
          FIG 1. HYPERKALEMIA ECG
       </div>
    </div>
  );
}

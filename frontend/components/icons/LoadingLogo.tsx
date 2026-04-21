export function LoadingLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Center symmetric loading icon">
      <defs>
        <linearGradient id="g1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF3B30"/>
          <stop offset="100%" stopColor="#FF9500"/>
        </linearGradient>
        <linearGradient id="g2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF9500"/>
          <stop offset="100%" stopColor="#FFCC00"/>
        </linearGradient>
        <linearGradient id="g3" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFCC00"/>
          <stop offset="100%" stopColor="#A8E63A"/>
        </linearGradient>
        <linearGradient id="g4" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#A8E63A"/>
          <stop offset="100%" stopColor="#4CD964"/>
        </linearGradient>
        <linearGradient id="g5" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4CD964"/>
          <stop offset="100%" stopColor="#52E3C2"/>
        </linearGradient>
        <linearGradient id="g6" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#52E3C2"/>
          <stop offset="100%" stopColor="#5AC8FA"/>
        </linearGradient>
        <linearGradient id="g7" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5AC8FA"/>
          <stop offset="100%" stopColor="#34AADC"/>
        </linearGradient>
        <linearGradient id="g8" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#34AADC"/>
          <stop offset="100%" stopColor="#007AFF"/>
        </linearGradient>
        <linearGradient id="g9" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#007AFF"/>
          <stop offset="100%" stopColor="#5856D6"/>
        </linearGradient>
        <linearGradient id="g10" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5856D6"/>
          <stop offset="100%" stopColor="#AF52DE"/>
        </linearGradient>
        <linearGradient id="g11" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#AF52DE"/>
          <stop offset="100%" stopColor="#FF2D55"/>
        </linearGradient>
        <linearGradient id="g12" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF2D55"/>
          <stop offset="100%" stopColor="#FF3B30"/>
        </linearGradient>
      </defs>

      <g transform="translate(256 256)" style={{ mixBlendMode: 'multiply' }}>
        <g transform="rotate(0)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g1)" opacity="0.9"/>
        </g>
        <g transform="rotate(30)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g2)" opacity="0.9"/>
        </g>
        <g transform="rotate(60)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g3)" opacity="0.9"/>
        </g>
        <g transform="rotate(90)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g4)" opacity="0.9"/>
        </g>
        <g transform="rotate(120)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g5)" opacity="0.9"/>
        </g>
        <g transform="rotate(150)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g6)" opacity="0.9"/>
        </g>
        <g transform="rotate(180)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g7)" opacity="0.9"/>
        </g>
        <g transform="rotate(210)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g8)" opacity="0.9"/>
        </g>
        <g transform="rotate(240)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g9)" opacity="0.9"/>
        </g>
        <g transform="rotate(270)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g10)" opacity="0.9"/>
        </g>
        <g transform="rotate(300)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g11)" opacity="0.9"/>
        </g>
        <g transform="rotate(330)">
          <rect x="-28" y="-204" width="56" height="118" rx="28" fill="url(#g12)" opacity="0.9"/>
        </g>
      </g>
    </svg>
  );
}

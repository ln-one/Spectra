export function SpectraLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="color-1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF3B30"></stop>
          <stop offset="100%" stopColor="#FF9500"></stop>
        </linearGradient>
        <linearGradient id="color-2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFCC00"></stop>
          <stop offset="100%" stopColor="#4CD964"></stop>
        </linearGradient>
        <linearGradient id="color-3" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5AC8FA"></stop>
          <stop offset="100%" stopColor="#007AFF"></stop>
        </linearGradient>
        <linearGradient id="color-4" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5856D6"></stop>
          <stop offset="100%" stopColor="#AF52DE"></stop>
        </linearGradient>
      </defs>

      <g transform="translate(110.64, 95)">
        <g style={{ mixBlendMode: 'multiply' }}>
          <rect x="0" y="45" width="70" height="150" rx="35" fill="url(#color-1)" opacity="0.85" transform="skewX(-15)"></rect>
          <rect x="55" y="15" width="70" height="150" rx="35" fill="url(#color-2)" opacity="0.85" transform="skewX(-15)"></rect>
          <rect x="110" y="45" width="70" height="150" rx="35" fill="url(#color-3)" opacity="0.85" transform="skewX(-15)"></rect>
          <rect x="165" y="15" width="70" height="150" rx="35" fill="url(#color-4)" opacity="0.85" transform="skewX(-15)"></rect>
        </g>
      </g>
    </svg>
  );
}

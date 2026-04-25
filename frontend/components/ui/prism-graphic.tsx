"use client";

import { motion } from "framer-motion";

export function PrismGraphic({ className }: { className?: string }) {
  // SVG points for an isometric prism representation
  const topPolygon = "50,10 90,30 50,50 10,30";
  const leftFace = "10,30 50,50 50,90 10,70";
  const rightFace = "90,30 50,50 50,90 90,70";

  return (
    <div className={`relative flex items-center justify-center w-full h-full ${className || ""}`}>
      <motion.svg
        viewBox="0 0 100 100"
        className="w-[120%] h-[120%] max-w-[600px] max-h-[600px] drop-shadow-2xl filter"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: [0, -10, 0], opacity: 1 }}
        transition={{
          y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
          opacity: { duration: 1 }
        }}
      >
        <defs>
          <linearGradient id="prism-top" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.2)" />
          </linearGradient>
          <linearGradient id="prism-left" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
          </linearGradient>
          <linearGradient id="prism-right" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.0)" />
          </linearGradient>

          {/* Core Brand Gradients mimicking the Spectra Logo */}
          <linearGradient id="beam-1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--spectra-1-start)" />
            <stop offset="100%" stopColor="var(--spectra-1-end)" />
          </linearGradient>
          <linearGradient id="beam-2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--spectra-2-start)" />
            <stop offset="100%" stopColor="var(--spectra-2-end)" />
          </linearGradient>
          <linearGradient id="beam-3" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--spectra-3-start)" />
            <stop offset="100%" stopColor="var(--spectra-3-end)" />
          </linearGradient>
          <linearGradient id="beam-4" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--spectra-4-start)" />
            <stop offset="100%" stopColor="var(--spectra-4-end)" />
          </linearGradient>
        </defs>

        {/* Outgoing colored beams */}
        <g style={{ mixBlendMode: 'screen', opacity: 0.8 }} transform="translate(10, 50) rotate(-15)">
          <motion.rect x="30" y="0" width="10" height="60" fill="url(#beam-1)" rx="5" 
            animate={{ height: [60, 70, 60], opacity: [0.7, 1, 0.7] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
          <motion.rect x="45" y="-10" width="10" height="70" fill="url(#beam-2)" rx="5" 
            animate={{ height: [70, 85, 70], opacity: [0.6, 0.9, 0.6] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }} />
          <motion.rect x="60" y="-5" width="10" height="65" fill="url(#beam-3)" rx="5" 
            animate={{ height: [65, 80, 65], opacity: [0.8, 1, 0.8] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1 }} />
          <motion.rect x="75" y="-15" width="10" height="75" fill="url(#beam-4)" rx="5" 
            animate={{ height: [75, 90, 75], opacity: [0.7, 0.95, 0.7] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }} />
        </g>

        {/* The Glass Prism Faces */}
        <polygon points={leftFace} fill="url(#prism-left)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" style={{ backdropFilter: 'blur(10px)' }} />
        <polygon points={rightFace} fill="url(#prism-right)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" style={{ backdropFilter: 'blur(10px)' }} />
        <polygon points={topPolygon} fill="url(#prism-top)" stroke="rgba(255,255,255,0.8)" strokeWidth="1" style={{ backdropFilter: 'blur(5px)' }} />

        {/* Incoming white beam */}
        <motion.polygon 
          points="-20,10 50,45 50,55 -20,30" 
          fill="url(#prism-top)" 
          opacity="0.6" 
          style={{ mixBlendMode: 'screen' }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        {/* Internal refraction highlights */}
        <polygon points="50,12 88,30 50,48 12,30" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.2" />
        <line x1="50" y1="50" x2="50" y2="88" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
      </motion.svg>
    </div>
  );
}

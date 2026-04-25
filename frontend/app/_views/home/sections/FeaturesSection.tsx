"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { features } from "./data";

export function FeaturesSection() {
  const prefersReducedMotion = useReducedMotion() ?? false;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: prefersReducedMotion ? 0 : 0.5 },
    },
  };

  return (
    <section id="features" className="py-20 md:py-32 relative overflow-hidden bg-background">
      {/* Background ambient light */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[400px] bg-blue-500/5 rounded-[100%] blur-[100px] pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
          className="text-center mb-16"
        >
          <Badge variant="outline" className="mb-4 glass glass-edge text-foreground">
            多维能力
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">
            知识的每一个切面
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Spectra 提供全方位的教学辅助工具，让备课与知识创造变得透明、高效。
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {features.map((feature, index) => (
            <motion.div key={feature.title} variants={itemVariants}>
              <FeatureCard feature={feature} index={index} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }: { feature: any, index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Map index to spectra colors for the spotlight
  const spotlightColors = [
    "rgba(255, 59, 48, 0.15)",   // Red
    "rgba(255, 204, 0, 0.15)",   // Yellow
    "rgba(90, 200, 250, 0.15)",  // Light Blue
    "rgba(175, 82, 222, 0.15)"   // Purple
  ];
  const spotlightColor = spotlightColors[index % spotlightColors.length];

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className="relative h-full rounded-xl overflow-hidden glass glass-edge transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl"
      style={{
        background: `linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)`
      }}
    >
      {/* Spotlight Effect */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-300"
        style={{ opacity: isHovering ? 1 : 0 }}
        animate={{
          background: `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, ${spotlightColor}, transparent 40%)`,
        }}
      />

      <Card className="h-full bg-transparent border-none shadow-none relative z-10">
        <CardHeader className="p-6">
          <div
            className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.color} shadow-lg ring-1 ring-white/20 relative overflow-hidden group`}
          >
            {/* Shimmer inside icon box */}
            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
            <feature.icon className="h-7 w-7 text-white relative z-10 drop-shadow-md" />
          </div>
          <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground/90">
            {feature.description}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

export function SlidePreview({ slideId = "1-1-1" }: { slideId?: string }) {
  return (
    <div className="h-full overflow-auto p-6">
      <h2 className="text-lg font-semibold mb-6">Slide Preview</h2>
      <motion.div
        key={slideId}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="aspect-video flex items-center justify-center shadow-sm">
          <div className="text-center space-y-4 p-8">
            <div className="text-6xl">📊</div>
            <h3 className="text-2xl font-semibold">Slide Preview</h3>
            <p className="text-muted-foreground max-w-md">
              Select a slide from the course outline to preview it here. This
              area will display the slide content.
            </p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

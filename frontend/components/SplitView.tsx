"use client";

import { useState } from "react";
import { CourseOutline } from "./CourseOutline";
import { SlidePreview } from "./SlidePreview";
import { Card } from "@/components/ui/card";

export function SplitView() {
  const [selectedSlide, setSelectedSlide] = useState<string>("1-1-1");

  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      <Card className="overflow-hidden">
        <CourseOutline onSlideSelect={setSelectedSlide} />
      </Card>
      <Card className="overflow-hidden">
        <SlidePreview slideId={selectedSlide} />
      </Card>
    </div>
  );
}

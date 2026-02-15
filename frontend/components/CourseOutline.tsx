'use client';

import { ChevronRight, ChevronDown, FileText } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface CourseItem {
  id: string;
  title: string;
  type: 'module' | 'lesson' | 'slide';
  children?: CourseItem[];
}

const mockCourseData: CourseItem[] = [
  {
    id: '1',
    title: 'Introduction to Programming',
    type: 'module',
    children: [
      {
        id: '1-1',
        title: 'Getting Started',
        type: 'lesson',
        children: [
          { id: '1-1-1', title: 'Welcome Slide', type: 'slide' },
          { id: '1-1-2', title: 'Course Overview', type: 'slide' },
        ],
      },
      {
        id: '1-2',
        title: 'Basic Concepts',
        type: 'lesson',
        children: [
          { id: '1-2-1', title: 'Variables', type: 'slide' },
          { id: '1-2-2', title: 'Data Types', type: 'slide' },
        ],
      },
    ],
  },
  {
    id: '2',
    title: 'Advanced Topics',
    type: 'module',
    children: [
      {
        id: '2-1',
        title: 'Object-Oriented Programming',
        type: 'lesson',
        children: [
          { id: '2-1-1', title: 'Classes and Objects', type: 'slide' },
          { id: '2-1-2', title: 'Inheritance', type: 'slide' },
        ],
      },
    ],
  },
];

function TreeItem({ item, level = 0, onSelect }: { item: CourseItem; level?: number; onSelect?: (id: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const hasChildren = item.children && item.children.length > 0;

  if (!hasChildren) {
    // 叶子节点（没有子项）- 直接用 Button
    return (
      <Button
        variant="ghost"
        onClick={() => onSelect?.(item.id)}
        className={cn(
          "w-full justify-start gap-2 px-4 py-2 text-sm font-normal",
          level > 0 && "ml-4"
        )}
      >
        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="truncate">{item.title}</span>
      </Button>
    );
  }

  // 有子项 - 用 Collapsible
  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          onClick={() => onSelect?.(item.id)}
          className={cn(
            "w-full justify-start gap-2 px-4 py-2 text-sm font-normal",
            level > 0 && "ml-4"
          )}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          <span className="truncate">{item.title}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 mt-1">
        {item.children?.map((child) => (
          <TreeItem key={child.id} item={child} level={level + 1} onSelect={onSelect} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CourseOutline({ onSlideSelect }: { onSlideSelect?: (slideId: string) => void }) {
  return (
    <div className="h-full overflow-auto p-6 space-y-2">
      <h2 className="text-lg font-semibold mb-6">Course Outline</h2>
      {mockCourseData.map((item) => (
        <TreeItem key={item.id} item={item} onSelect={onSlideSelect} />
      ))}
    </div>
  );
}

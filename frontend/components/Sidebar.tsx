'use client';

import { Home, BookOpen, Upload, Settings, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const navigationItems = [
  { icon: Home, label: 'Dashboard', href: '/' },
  { icon: BookOpen, label: 'Courses', href: '/courses' },
  { icon: Upload, label: 'Upload', href: '/upload' },
  { icon: FileText, label: 'Documents', href: '/documents' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export function Sidebar() {
  return (
    <TooltipProvider>
      <div className="fixed left-0 top-0 h-screen w-20 border-r border-border bg-background flex flex-col items-center py-8 gap-8">
        {/* Logo */}
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
          S
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-4">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-12 h-12"
                    aria-label={item.label}
                  >
                    <Icon className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </div>
    </TooltipProvider>
  );
}

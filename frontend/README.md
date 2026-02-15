# Spectra Frontend

A minimalist dashboard built with Next.js 14 App Router, featuring a split-view interface for course management and slide previews.

##  Features

- **Minimalist Sidebar Navigation** - Fixed sidebar with Lucide icons for clean navigation
- **Split-View Interface** - Interactive course outline tree with slide preview panel
- **File Upload Dropzone** - Drag-and-drop file upload with visual feedback
- **Responsive Design** - Clean, modern UI optimized for AI-native development
- **Accessibility First** - ARIA labels and keyboard navigation support
- **Smooth Animations** - Framer Motion for polished interactions

##  Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Components:** Shadcn/ui design patterns
- **Animations:** Framer Motion
- **Icons:** Lucide React

##  Getting Started

First, install the dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

##  Project Structure

```
├── app/
│   ├── layout.tsx       # Root layout with global styles
│   ├── page.tsx         # Main dashboard page
│   └── globals.css      # Global styles and CSS variables
├── components/
│   ├── Sidebar.tsx              # Navigation sidebar with icons
│   ├── SplitView.tsx            # Split-view container component
│   ├── CourseOutline.tsx        # Interactive course tree
│   ├── SlidePreview.tsx         # Slide preview panel
│   └── FileUploadDropzone.tsx   # File upload with drag-and-drop
└── lib/
    └── utils.ts         # Utility functions (cn helper)
```

##  Design System

- **Border Radius:** 12px consistently applied (rounded-lg)
- **Color Scheme:** HSL-based design tokens for easy theming
- **Spacing:** High whitespace for minimalist aesthetic
- **Typography:** Clean hierarchy with proper font sizes

##  Quality Assurance

-  **Build:** Production-ready with optimized bundle
-  **Linting:** Zero ESLint errors
-  **Security:** No CodeQL vulnerabilities detected
-  **Accessibility:** ARIA labels and semantic HTML throughout

##  Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

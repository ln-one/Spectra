# Spectra Frontend

A modern, minimalist dashboard built with Next.js 15 App Router, featuring authentication, file management, and AI-powered courseware generation.

## Features

- **Authentication** - User registration and login with JWT
- **File Management** - Drag-and-drop file upload with project organization
- **AI Generation** - Interactive courseware generation interface
- **Split-View Interface** - Course outline tree with slide preview panel
- **Responsive Design** - Clean, modern UI optimized for all devices
- **Accessibility First** - ARIA labels and keyboard navigation support
- **Smooth Animations** - Framer Motion for polished interactions

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Components:** Shadcn/ui + Radix UI
- **State Management:** Zustand
- **Form Handling:** React Hook Form + Zod
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **HTTP Client:** Fetch API with custom wrapper

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

1. **Install dependencies**:

```bash
npm install
```

2. **Configure environment**:

```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

3. **Run development server**:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Environment Variables

```bash
# API Configuration
# Browser-side SDK requests go directly to this backend origin
NEXT_PUBLIC_API_URL="http://localhost:8000"
NEXT_PUBLIC_API_TIMEOUT_MS=180000
NEXT_PUBLIC_CHAT_TIMEOUT_MS=300000

# App Configuration
NEXT_PUBLIC_APP_NAME="Spectra"
NEXT_PUBLIC_APP_VERSION="0.1.0"
NEXT_PUBLIC_ENVIRONMENT="development"

# Feature Flags
NEXT_PUBLIC_ENABLE_AI_GENERATION="true"
NEXT_PUBLIC_ENABLE_FILE_UPLOAD="true"

# Upload Configuration
NEXT_PUBLIC_MAX_FILE_SIZE=104857600 # 100MB

# Debug
NEXT_PUBLIC_DEBUG="true"
```

## Project Structure

```
├── app/
│ ├── auth/
│ │ ├── login/ # Login page
│ │ └── register/ # Registration page
│ ├── layout.tsx # Root layout with global styles
│ ├── page.tsx # Main dashboard page
│ └── globals.css # Global styles and CSS variables
├── components/
│ ├── ui/ # Shadcn/ui components
│ ├── Sidebar.tsx # Navigation sidebar
│ ├── SplitView.tsx # Split-view container
│ ├── CourseOutline.tsx # Interactive course tree
│ ├── SlidePreview.tsx # Slide preview panel
│ └── FileUploadDropzone.tsx # File upload component
├── lib/
│ ├── api.ts # API client wrapper
│ ├── auth.ts # Authentication utilities
│ └── utils.ts # Utility functions
├── stores/
│ └── authStore.ts # Authentication state management
└── __tests__/ # Test files
```

## Design System

- **Border Radius:** 12px consistently applied (rounded-lg)
- **Color Scheme:** HSL-based design tokens for easy theming
- **Spacing:** High whitespace for minimalist aesthetic
- **Typography:** Clean hierarchy with proper font sizes

## Scripts

```bash
npm run dev # Start development server
npm run build # Build for production
npm start # Start production server
npm run lint # Run ESLint
npm run format # Format code with Prettier
npm run format:check # Check code formatting
npm test # Run tests
npm run test:watch # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

## Quality Assurance

- **Build:** Production-ready with optimized bundle
- **Linting:** ESLint with Next.js config
- **Formatting:** Prettier for consistent code style
- **Testing:** Jest + React Testing Library
- **Type Safety:** TypeScript strict mode
- **Accessibility:** ARIA labels and semantic HTML throughout

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## API Integration

Browser-side SDK requests go directly to `NEXT_PUBLIC_API_URL`. Server-side
requests use `INTERNAL_API_URL` when present, otherwise `NEXT_PUBLIC_API_URL`.
The Next.js rewrite remains available as a compatibility path, but it is not
the canonical transport for long-running API calls like chat generation.

The backend API surface remains `/api/v1`:

- Authentication: `/api/v1/auth/*`
- Projects: `/api/v1/projects`
- Files: `/api/v1/files`
- Generation (Session-First): `/api/v1/generate/sessions*`
- Preview (Session-First): `/api/v1/generate/sessions/{session_id}/preview*`
- Chat: `/api/v1/chat/*`

Chat requests can legitimately take longer than ordinary CRUD requests because
the backend may wait for retrieval, model inference, and persistence before
responding. Use `NEXT_PUBLIC_CHAT_TIMEOUT_MS` to give `/api/v1/chat/messages`
more headroom without increasing the timeout for every API call. This is
especially important in local development: a verified incident showed the
backend returning `200 OK` after about 38 seconds while the Next dev proxy
reset the connection first.

See `lib/api.ts` for the complete API client implementation.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

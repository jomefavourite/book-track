# Book-Track

A Progressive Web App (PWA) for tracking your reading progress with calendar and fixed-days modes.

## Features

- **Calendar Mode**: Select a month range and distribute reading across days
- **Fixed Days Mode**: Set a specific number of days to complete a book
- **Progress Tracking**: Mark days as read/unread and track actual pages read
- **Catch-Up Suggestions**: Get suggestions when you miss reading days
- **Multi-Month Support**: Read books across multiple months (e.g., January to March)
- **PWA**: Install as a native app on your device
- **Offline Support**: Works offline with localStorage sync

## Tech Stack

- **Next.js 16**: React framework
- **Convex**: Backend and database
- **Convex Auth**: Authentication with GitHub
- **Tailwind CSS**: Styling
- **date-fns**: Date utilities
- **next-pwa**: PWA support

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up Convex:
```bash
npx convex dev
```

This will:
- Create a Convex project (if you don't have one)
- Generate the Convex URL
- Set up the database schema

3. Configure environment variables:
Create a `.env.local` file with:
```
NEXT_PUBLIC_CONVEX_URL=your_convex_url_here
```

4. Set up Google OAuth (for authentication):
- Go to your Convex dashboard
- Navigate to Authentication settings
- Add Google as a provider
- Configure Google OAuth app credentials:
  - Go to [Google Cloud Console](https://console.cloud.google.com/)
  - Create OAuth 2.0 credentials
  - Add authorized redirect URI from Convex
  - Add Client ID and Client Secret to Convex dashboard

5. Run the development server:
```bash
npm run dev
```

6. Build for production:
```bash
npm run build
npm start
```

## PWA Icons

The app expects PWA icons at:
- `/public/icon-192.png` (192x192)
- `/public/icon-512.png` (512x512)

You can generate these icons using tools like:
- [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

## Project Structure

```
app/
  auth/login/          # Login page
  books/
    new/               # Book creation form
    [id]/              # Book detail page with calendar/days view
  page.tsx             # Dashboard
convex/
  auth.ts              # Authentication setup
  books.ts             # Book mutations and queries
  readingSessions.ts   # Reading session mutations and queries
  schema.ts            # Database schema
components/
  BookCard.tsx         # Book card for dashboard
  BookForm.tsx         # Book creation form
  CalendarView.tsx      # Calendar view component
  DaysView.tsx         # Fixed days view component
  CatchUpSuggestion.tsx # Catch-up suggestions
lib/
  convex.ts            # Convex client setup
  dateUtils.ts         # Date utility functions
  readingCalculator.ts # Reading calculation logic
  localStorage.ts      # localStorage utilities
  sync.ts              # Data synchronization
```

## Usage

1. **Sign in** with your GitHub account
2. **Add a book** by clicking "Add New Book"
3. **Choose reading mode**:
   - Calendar: Select month range and reading duration
   - Fixed Days: Enter number of days
4. **Track progress** by marking days as read
5. **Update pages read** if you read more or less than planned
6. **Get catch-up suggestions** when you miss days

## Data Storage

- **Convex**: Primary storage (cloud, synced across devices)
- **localStorage**: Offline backup and caching

## License

MIT

# Skill: Bug Squasher

Debug errors fast. Paste your error, get a fix.

## How to Use
Give me:
1. The error message (full stack trace)
2. The relevant code
3. What you were trying to do

## What You'll Get

```json
{
  "diagnosis": "What's actually wrong",
  "root_cause": "Why it's happening",
  "fix": "Exact code change needed",
  "explanation": "Why this fixes it",
  "prevention": "How to avoid this in future"
}
```

## Common Hackathon Bugs (Quick Fixes)

### Next.js / React

**"Hydration mismatch"**
```typescript
// Problem: Server and client render different content
// Fix: Use useEffect for client-only content
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return null;
```

**"Cannot read property of undefined"**
```typescript
// Problem: Data not loaded yet
// Fix: Optional chaining + loading state
{data?.items?.map(item => ...)}
// Or better:
if (loading) return <Spinner />;
if (!data) return <Empty />;
```

**"Module not found"**
```bash
# Fix 1: Clear cache and reinstall
rm -rf node_modules .next
npm install

# Fix 2: Check import path (case sensitive!)
import Component from './Component'  # Not './component'
```

### API / Backend

**"CORS error"**
```typescript
// Next.js API route - add headers
export async function GET(request: Request) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
  });
}
```

**"Prisma client not generated"**
```bash
npx prisma generate
# Then restart your dev server
```

**"Database connection refused"**
```bash
# Check if database is running
# Check DATABASE_URL in .env
# For Supabase: Check connection pooler URL
```

### TypeScript

**"Type X is not assignable to type Y"**
```typescript
// Quick fix for hackathon: Type assertion
const data = response.json() as MyType;

// Better fix when you have time:
// Define proper types and validate with zod
```

**"Property does not exist on type"**
```typescript
// Quick fix: Add to interface or use any
interface MyType {
  existingProp: string;
  newProp: string;  // Add missing prop
}

// Or for speed (not recommended but works):
(data as any).newProp
```

### Deployment

**"Build failed" on Vercel**
```bash
# Run build locally first
npm run build

# Common fixes:
# 1. TypeScript errors - fix or add // @ts-ignore
# 2. Missing env vars - add to Vercel dashboard
# 3. ESLint errors - add to next.config.js:
#    eslint: { ignoreDuringBuilds: true }
```

**"500 Internal Server Error" in production**
```typescript
// Add error logging to find the issue
try {
  // your code
} catch (error) {
  console.error('API Error:', error);
  return Response.json({ error: 'Something went wrong' }, { status: 500 });
}
```

## Debug Checklist

When stuck, check in order:

1. **Console errors** - Browser DevTools
2. **Network tab** - Is the API being called? What's the response?
3. **Server logs** - Terminal running `npm run dev`
4. **Environment variables** - Are they set? Correct values?
5. **Database** - Is the data actually there?
6. **Dependencies** - Did `npm install` complete?

## Emergency Fixes

**Nothing works, deadline in 1 hour:**

1. **Hardcode it** - Replace API call with static data
2. **Hide it** - Remove broken feature from demo flow
3. **Fake it** - Show mockup/screenshot instead
4. **Pivot** - Present what DOES work as the MVP

**Remember:** A working demo of 3 features beats a broken demo of 10 features.

# Skill: UI Polisher

Make your hackathon project look professional in minimal time. Quick fixes for maximum visual impact.

## How to Use
Tell me what you have and I'll suggest high-impact polish.

**Input needed:**
- Your current stack (React, Next.js, etc.)
- What it looks like now (describe or screenshot)
- Time available for polish
- What pages need to look good for demo

## What You'll Get

```json
{
  "quick_wins": [
    {
      "change": "Add consistent padding",
      "time": "5 min",
      "impact": "High",
      "code": "className='p-6'"
    }
  ],
  "component_upgrades": "Replace X with shadcn/ui version",
  "color_scheme": "Suggested palette",
  "before_after": "Expected improvement"
}
```

## 30-Minute Polish Checklist

### 5 Minutes: Typography
```css
/* Add to global CSS - instant improvement */
body {
  font-family: 'Inter', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

h1 { @apply text-3xl font-bold tracking-tight; }
h2 { @apply text-2xl font-semibold; }
p { @apply text-gray-600 leading-relaxed; }
```

### 5 Minutes: Spacing
```jsx
/* Consistent padding/margin */
<main className="max-w-6xl mx-auto px-4 py-8">
  <section className="space-y-6">
    {/* Content with automatic spacing */}
  </section>
</main>
```

### 5 Minutes: Colors
```jsx
/* Pick ONE accent color, use sparingly */
// Primary actions: blue-600
// Success: green-600
// Errors: red-600
// Everything else: gray scale

<button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
  Primary Action
</button>
```

### 5 Minutes: Buttons
```jsx
/* Consistent button styles */
const Button = ({ variant = 'primary', children, ...props }) => {
  const styles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-900',
    ghost: 'hover:bg-gray-100 text-gray-600'
  };

  return (
    <button
      className={`px-4 py-2 rounded-lg font-medium transition-colors ${styles[variant]}`}
      {...props}
    >
      {children}
    </button>
  );
};
```

### 5 Minutes: Cards
```jsx
/* Wrap content in cards for instant structure */
<div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
  <h3 className="font-semibold text-lg mb-2">Card Title</h3>
  <p className="text-gray-600">Card content here</p>
</div>
```

### 5 Minutes: Loading States
```jsx
/* Simple spinner - never show blank screens */
const Spinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
);
```

## shadcn/ui Quick Setup

Fastest way to professional UI:

```bash
# Initialize (Next.js)
npx shadcn@latest init

# Add components you need
npx shadcn@latest add button card input table
```

Then use:
```jsx
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

<Card>
  <CardHeader>
    <CardTitle>Dashboard</CardTitle>
  </CardHeader>
  <CardContent>
    <Button>Click me</Button>
  </CardContent>
</Card>
```

## Demo Page Template

```jsx
/* Looks professional with minimal code */
export default function DemoPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">YourApp</h1>
          <nav className="flex gap-4">
            <a className="text-gray-600 hover:text-gray-900">Features</a>
            <a className="text-gray-600 hover:text-gray-900">About</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-16 text-center">
        <h2 className="text-4xl font-bold mb-4">
          Your Catchy Headline Here
        </h2>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          One sentence explaining the value proposition.
        </p>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg text-lg font-medium">
          Try It Now
        </button>
      </section>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Your demo content here */}
      </main>
    </div>
  );
}
```

## Red Flags to Fix

| Problem | Quick Fix |
|---------|-----------|
| Text touching edges | Add `px-4 py-2` padding |
| Everything same size | Use heading hierarchy (text-3xl, text-xl, text-base) |
| Cluttered layout | Add `space-y-4` between sections |
| Ugly default inputs | Use shadcn/ui or add border + rounded + padding |
| No visual hierarchy | Make primary actions blue, secondary gray |
| Walls of text | Break into cards or bullet points |
| Inconsistent corners | Pick one: `rounded-lg` everywhere |

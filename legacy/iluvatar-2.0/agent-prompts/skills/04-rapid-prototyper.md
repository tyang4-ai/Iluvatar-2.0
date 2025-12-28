# Skill: Rapid Prototyper

Generate working code quickly for common hackathon patterns - auth, CRUD, APIs, UI components.

## How to Use
Tell me what you need and your stack. I'll give you copy-paste code.

**Input needed:**
- What you need (auth, API endpoint, component, etc.)
- Your tech stack
- Any specific requirements

## Common Patterns I Can Generate

### Authentication
```
"Add GitHub OAuth to my Next.js app"
→ Full NextAuth setup with provider config
```

### API Endpoints
```
"CRUD API for 'projects' with title, description, status"
→ Complete API routes with validation
```

### Database Models
```
"Prisma schema for a task management app"
→ Models with relations, ready to migrate
```

### UI Components
```
"Dashboard layout with sidebar and header"
→ React component with Tailwind styling
```

### Forms
```
"Multi-step form for user onboarding"
→ Form with validation and state management
```

### Data Fetching
```
"Fetch and display paginated list of items"
→ Component with loading, error, empty states
```

## Output Format

```json
{
  "files": [
    {
      "path": "src/app/api/projects/route.ts",
      "code": "// Full implementation here",
      "explanation": "Handles GET (list) and POST (create)"
    }
  ],
  "dependencies": ["zod"],
  "install_command": "npm install zod",
  "next_steps": [
    "Add the API route",
    "Create the Prisma model",
    "Wire up the frontend"
  ]
}
```

## Example Requests

### "I need a file upload component that sends to S3"

```typescript
// components/FileUpload.tsx
'use client';
import { useState } from 'react';

export function FileUpload({ onUploadComplete }: { onUploadComplete: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    // Get presigned URL
    const { uploadUrl, fileUrl } = await fetch('/api/upload', {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    }).then(r => r.json());

    // Upload to S3
    await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });

    setUploading(false);
    onUploadComplete(fileUrl);
  };

  return (
    <div className="border-2 border-dashed rounded-lg p-8 text-center">
      <input
        type="file"
        onChange={handleUpload}
        disabled={uploading}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        {uploading ? `Uploading... ${progress}%` : 'Click to upload'}
      </label>
    </div>
  );
}
```

### "I need real-time notifications"

```typescript
// HACKATHON SHORTCUT: Use polling instead of WebSockets
// It's 90% as good with 10% of the complexity

'use client';
import { useEffect, useState } from 'react';

export function useNotifications(userId: string) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`/api/notifications?userId=${userId}`);
      const data = await res.json();
      setNotifications(data);
    };

    poll(); // Initial fetch
    const interval = setInterval(poll, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, [userId]);

  return notifications;
}

// For demo: This is indistinguishable from "real" real-time
// Judges won't know the difference in a 3-minute demo
```

## Speed Tips

1. **Don't build auth** - Use NextAuth or Clerk
2. **Don't build forms** - Use react-hook-form + zod
3. **Don't build UI** - Use shadcn/ui components
4. **Don't build file upload** - Use uploadthing or S3 presigned URLs
5. **Don't build payments** - Use Stripe Checkout
6. **Don't build email** - Use Resend or just console.log for demo

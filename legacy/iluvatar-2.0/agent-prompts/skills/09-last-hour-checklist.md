# Skill: Last Hour Checklist

The final countdown. What to do when you have 60 minutes until submission.

## How to Use
This is a pre-built checklist. Work through it systematically.

---

## THE LAST HOUR

### Minutes 0-10: Freeze Everything

**STOP CODING NEW FEATURES. NOW.**

- [ ] Git commit current state: `git commit -am "Pre-submission freeze"`
- [ ] Note what works vs what's broken
- [ ] Decide: Fix critical bugs OR polish what works

### Minutes 10-25: Demo Verification

**Test your exact demo flow:**

- [ ] Clear browser cache, test from scratch
- [ ] Does login/signup work? (Or skip and pre-authenticate)
- [ ] Does the main feature work?
- [ ] Does it look okay on the projector resolution (1280x720)?
- [ ] Prepare demo data (pre-uploaded files, sample users, etc.)
- [ ] Test on deployed URL, not localhost

**If something is broken:**
- Can you hardcode around it? (Yes → Do it)
- Can you hide the broken feature? (Yes → Do it)
- Is it core to the demo? (No → Cut it)

### Minutes 25-40: Submission Materials

**DevPost / Submission Form:**

- [ ] Project name (catchy, memorable)
- [ ] Tagline (one sentence, explains value)
- [ ] Description (use the template from pitch-crafter)
- [ ] Tech stack list
- [ ] Team member names
- [ ] GitHub repo link (make it public!)
- [ ] Demo URL (deployed and working)
- [ ] Screenshots (3-5, showing key features)

**Screenshots to capture:**
1. Landing/home page
2. Main feature in action
3. Results/output
4. (Optional) Before/after comparison

### Minutes 40-50: Video (If Required)

**No time for fancy editing:**

- [ ] Screen record with Loom (free, instant)
- [ ] Keep it under 3 minutes
- [ ] Script: Problem → Solution → Demo → Impact
- [ ] Don't obsess over quality, content matters more

**Emergency video option:**
- Record yourself walking through screenshots
- Use phone camera if screen recording is failing
- A shaky 2-minute video beats no video

### Minutes 50-55: Final Submission

- [ ] Re-read submission form - all fields filled?
- [ ] Click all links - do they work?
- [ ] GitHub README exists and is readable
- [ ] Demo URL loads (not localhost!)
- [ ] **SUBMIT BEFORE THE DEADLINE**

### Minutes 55-60: Backup

- [ ] Take screenshots of your submission confirmation
- [ ] Copy submission URL
- [ ] Save local copy of everything you submitted
- [ ] **Breathe.**

---

## EMERGENCY PROTOCOLS

### "Demo URL doesn't work!"
1. Check environment variables in Vercel/hosting
2. Check logs: `vercel logs` or hosting dashboard
3. If unfixable: Deploy to different service (Vercel → Netlify)
4. Last resort: Use localhost + ngrok for live demo

### "Core feature is broken!"
1. Can you hardcode the expected result? Do it.
2. Can you show a recording of it working earlier? Do it.
3. Can you explain "we had it working, encountered X bug at the last minute"? Judges understand.

### "We're way behind!"
1. What ONE thing works? Demo that.
2. Frame it as "MVP of a larger vision"
3. Focus pitch on the problem and why your approach is right
4. "Given more time, we would..." is valid

### "Submission form is glitching!"
1. Screenshot everything as you fill it out
2. Try different browser
3. Contact organizers via Discord/Slack immediately
4. Email backup submission to organizers

---

## POST-SUBMISSION

- [ ] Celebrate! You shipped something.
- [ ] Get sleep if demo is tomorrow
- [ ] Practice demo pitch (3x minimum)
- [ ] Prepare for judge Q&A
- [ ] Have team alignment on "who answers what"

---

## Final Reminder

**A submitted project beats a perfect unsubmitted project.**

Common mistakes in the last hour:
- ❌ Trying to add "one more feature"
- ❌ Major refactoring
- ❌ Switching core technologies
- ❌ Not testing the demo flow
- ❌ Submitting at 11:59pm (buffer for technical issues!)

**Submit early. Then improve if time allows.**

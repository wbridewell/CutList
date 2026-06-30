# CutList Demo Video Script

## Title

**CutList: Repairing a Verified Playlist Without Sanding Off the Weirdness**

## Goal

Show CutList as a desktop tool for **verified playlist repair** rather than a generic playlist chatbot.

The video should make three things clear:

1. The playlist is already real and already verified.
2. CutList can critique structure before it changes anything.
3. CutList turns that critique into concrete repair work without flattening the taste.

## Audience

Playlist nerds who care about flow, identity, track-level judgment, and not getting fake or sloppy suggestions.

## Target Length

2:30-3:00

## Demo Spine

This playlist already has taste. The songs are real. The problem is not authenticity. The problem is sequence discipline.

**CutList finds the stronger playlist hiding inside the verified one, then helps repair it in a controlled way.**

## Starting Playlist

Use the playlist already loaded in CutList:

1. Hole - Celebrity Skin
2. 386 DX - Smells Like Teen Spirit
3. Hedwig and the Angry Inch - Tear Me Down
4. Paul Newman - Popcorn
5. Eva Cassidy - Over the Rainbow
6. David Bowie - Life On Mars?
7. Flogging Molly - If I Ever Leave This World Alive
8. The Misfits - Skulls
9. Nick Cave and the Bad Seeds - Stagger Lee
10. Nick Cave and the Bad Seeds - The Curse of Millhaven
11. My Life With the Thrill Kill Kult - The Days of Swine and Roses
12. Diamanda Galas - Iron Lady
13. Leonard Cohen - Chelsea Hotel #2
14. Tenacious D - Dio
15. Buzzcocks - Orgasm Addict
16. The Cardigans - Lovefool
17. Flogging Molly - Drunken Lullabies
18. Jucifer - Amplifier
19. Skinny Puppy - Candle
20. Jefferson Airplane - White Rabbit

## Full Script

### 0:00-0:15 - Open on the Verified Playlist

#### On Screen

- Start in the CutList workspace with the playlist visible.
- Let the verified track list read onscreen for a beat.
- If verification badges or metadata are visible, leave them visible.

#### Voiceover

This playlist is already in CutList, and it is already verified. The songs are real, the taste is real, and the problem is not authenticity.

The problem is that the sequence still doesn’t quite work as a listening experience.

#### Purpose

Establish that CutList begins from a trustworthy playlist, not from vague recommendations or unverified guesses.

---

### 0:15-0:40 - Use Review Playlist

#### On Screen

- Move to the Curator Console.
- Click `Review playlist`.
- Do not type a giant instruction block first.

#### Voiceover

Instead of prompting the model like a consultant, I can ask CutList to review the playlist directly.

This is important because I want critique before intervention. I want to know what the app thinks is structurally weak before it starts rewriting anything.

#### What To Highlight In The Response

- The playlist identity.
- The emotional whiplash in the sequence.
- The fragmented industrial core.
- The specific `Skinny Puppy -> Jefferson Airplane` transition problem.

#### Optional Short Prompt

If the built-in review needs a little direction, use:

```text
Review this playlist with a focus on identity, weak links, and transition problems.
```

#### Ideal Read

The review should make the playlist feel like a **volatile, high-contrast collision between '90s industrial sleaze, theatrical punk, and canonical singer-songwriter melancholy**, while pointing out where the sequence loses nerve and fractures its own sonic weight.

---

### 0:40-1:10 - Show That Review Is Structured, Not Just Vibes

#### On Screen

- Scroll through the review result slowly.
- Pause anywhere the app names:
  - playlist identity,
  - track roles,
  - weak links,
  - transition issues,
  - or suggested follow-ups.

#### Voiceover

This is where CutList feels different from a generic LLM. It is not just telling me that the playlist is eclectic.

It is identifying what the playlist is trying to be, where the emotional whiplash is coming from, and where the sequence stops supporting its own industrial pressure.

#### Best Lines To Feature

If these are visible in the review, favor them in the edit:

- `volatile, high-contrast collision between '90s industrial sleaze, theatrical punk, and canonical singer-songwriter melancholy`
- `oscillating between aggressive dissonance and fragile, melodic narrative`
- `emotional whiplash`
- `solid industrial core ... fragmented by lighter tracks`

#### Editing Note

Do not read every line onscreen. Pull out one identity sentence and one structural problem sentence. Keep the pace moving.

---

### 1:10-1:45 - Open Issues and Pick One Repair

#### On Screen

- Open the Issues area after the review lands.
- Show that the critique produced actionable review work.
- Pick one concrete repair target.

#### Best Repair Target

Prefer one of these, in order:

1. The `Skinny Puppy - Candle -> Jefferson Airplane - White Rabbit` transition.
2. A weak transition elsewhere that suggests a bridge track.
3. A weak-link track that should be replaced or removed.
4. A local reorder of a short stretch.

#### Voiceover

This is the part I most want to show in the demo.

CutList does not stop at criticism. It turns review into repair work I can inspect and act on. That makes it feel like a curation tool, not just a machine with opinions.

Here, the most useful note is not a vague mood complaint. It is a specific transition diagnosis: Skinny Puppy's dense industrial pressure drops into Jefferson Airplane in a way that loses too much sonic weight too fast.

#### What To Emphasize

- The review created structured next steps.
- The repair is local and legible.
- We are not “fixing everything.” We are making one good decision at a time.

---

### 1:45-2:20 - Make One Surgical Move

#### On Screen

- Execute one repair request in natural language.
- Keep the prompt short and specific.
- If a suggestion can be applied directly from the review flow, prefer that over a long typed instruction.

#### Preferred Prompt Shapes

Use one of these:

```text
Repair this transition without losing the theatrical weirdness or industrial pressure.
```

```text
Bridge the jump from Skinny Puppy to Jefferson Airplane without making the ending feel polite.
```

```text
Tighten this stretch without making it more respectable.
```

#### Voiceover

I am not asking CutList to make this playlist normal. I am asking it to make the weirdness feel intentional.

The goal is not respectability. The goal is to preserve the pressure while making the arc feel earned.

#### Best Outcome

The app either:

- adds a bridge recommendation between `Skinny Puppy - Candle` and `Jefferson Airplane - White Rabbit`,
- replaces one weak fit near the ending with something that better preserves sonic weight,
- or makes a small reorder that preserves the core identity while improving pressure and arc.

---

### 2:20-2:45 - Show the Improved Playlist

#### On Screen

- Show the playlist after the repair.
- Scroll just enough to make the changed region visible in context.
- If the app surfaced accepted or rejected candidates along the way, leave that visible briefly.

#### Voiceover

Now the playlist is not cleaner in a boring way. It is just more convincing.

CutList preserved the volatile mix of industrial sleaze, theatrical punk, and melancholy, but made the sequence feel more deliberate and more earned.

#### What To Reinforce

- The app improved the playlist without flattening it.
- Any additions still flowed through verification.
- The repair is visible in the playlist itself, not just in chat.

---

### 2:45-3:00 - Close on Workflow, Not Just Output

#### On Screen

- Briefly show `Save current session` or export.
- If sessions look more visually legible in the build you are recording, prefer sessions.
- If export feels more concrete for the ending, use export instead.

#### Voiceover

This is why CutList works for obsessive playlist editing. It is local, iterative, and structured.

It helps you verify what is real, diagnose what is weak, and repair the sequence without sanding off the taste that made the playlist worth building in the first place.

## Recording Notes

- Keep prompts short. The app should look opinionated enough that it does not need prompt theater.
- Favor visible product affordances over narration about architecture.
- If discovery radius appears, show it once as a quick control, not as a settings tour.
- If the review produces a strong `add bridge` suggestion, use that. It is one of the clearest demonstrations of CutList's personality plus workflow.
- If a candidate is rejected or needs review, that is acceptable footage. It reinforces the verified-first design.

## What To Avoid

- Do not frame the playlist as “bad.” Frame it as under-shaped.
- Do not spend most of the video in giant text prompts.
- Do not imply that CutList dumps unverified songs straight into the list.
- Do not turn the demo into a taxonomy lecture about novelty tracks or genre bins.
- Do not let the app read as “ChatGPT for playlists.” The point is review, verification, and repair.
- Do not over-focus on metadata ambiguity now that this playlist is already verified. The stronger story is structural judgment.

## Success Criteria

A viewer should come away understanding:

1. This app works on real, verified playlist material.
2. It can critique a playlist before changing it.
3. It can turn critique into focused repair actions.
4. It preserves strong taste instead of washing it out.

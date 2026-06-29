# Parser Refactor Live Tests

Run these in the app against a disposable playlist draft after pulling the refactor.

## Add and Placement

1. Prompt: `Queue Army of Me after Firestarter.`
   - Expected: routed as an add request
   - Expected: track is inserted after `Firestarter`, not appended elsewhere

2. Prompt: `Put Bela Lugosi's Dead before Roads.`
   - Expected: routed as an add request
   - Expected: placement resolves `Roads` correctly

3. Prompt: `Drop in Black No. 1 at the beginning.`
   - Expected: prepends the verified track

## Canonical Replacement

4. Start with a playlist containing a non-canonical `Blue Monday` or other alternate version.
   - Prompt: `Replace the version of Blue Monday in the playlist with the album cut from Power, Corruption & Lies.`
   - Expected: same song stays in the slot
   - Expected: replacement target resolves the existing playlist track
   - Expected: verification query is constrained to the requested album

5. Start with a playlist containing a live `Stagger Lee`.
   - Prompt: `Replace the version of Stagger Lee in the playlist with the album cut from Murder Ballads.`
   - Expected: no unrelated Nick Cave track is substituted
   - Expected: `Stagger Lee` stays the target title and `Murder Ballads` is used as requested album evidence

6. Prompt: `Swap the live cut for the LP version on Murder Ballads.`
   - Expected: still treated as same-song canonical replacement

## Review and Mixed Intent

7. Prompt: `Focus on identity, then add two tracks that deepen it.`
   - Expected: mixed review plus curator handling stays stable
   - Expected: review intent is not dropped because of alternate phrasing

8. Prompt: `Do not modify the playlist. Focus on version risks.`
   - Expected: read-only review route
   - Expected: no mutating operators run

## Import and Text Parsing

9. Paste:

   ```text
   "Mack the Knife, Live",Ella Fitzgerald,"Mack the Knife"
   ```

   - Expected: parsed as one import row
   - Expected: embedded comma stays inside the title

10. Paste:

   ```text
   Find one verified bridge track for this transition: Erykah Badu - Phone Down into Cocteau Twins - Cherry-Coloured Funk.
   ```

   - Expected: not parsed as an import row

## Loose Matching

11. Prompt: `Add Days of Swine and Roses by My Life with the Thrill Kill Kult.`
   - Expected: provider match accepts `The Days of Swine & Roses` if that is the canonical catalog title

12. Prompt: `Replace the version of Days of Swine and Roses in the playlist with the album cut from Confessions of a Knife.`
   - Expected: playlist-local target resolution tolerates leading `The` and `&` vs `and`

## Regression Safety Checks

13. Prompt: `Hi`
   - Expected: conversational reply only

14. Prompt: `What songs are on Confessions of a Knife by My Life with the Thrill Kill Kult?`
   - Expected: not downgraded to greeting fallback

15. Prompt: `Name\tArtist\tAlbum\nPink Moon\tNick Drake\tPink Moon`
   - Expected: import flow still works

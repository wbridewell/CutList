# Visual QA Checklist

Use this after UI or CSS changes. The deterministic fixture is the default visual baseline.

## Fixture Route

- Open `http://localhost:3000/?fixture=playlist`.
- Check desktop at the default browser viewport.
- Check mobile around `390 x 844`.

## Desktop

- [ ] Header logo, brand text, and draft status align without overlap.
- [ ] Playlist and Curator panels render as two columns.
- [ ] Active rules, constraint issues, and unknown-evidence panels remain readable when present.
- [ ] Track rows keep stable columns for index, drag handle, details, and remove button.
- [ ] Flagged tracks use the constraint warning treatment.
- [ ] Drawer panels, history, export controls, and dialogs retain spacing and button affordances.

## Mobile

- [ ] Mobile switcher appears.
- [ ] Only the selected workspace view is visible.
- [ ] Header content fits without horizontal scroll.
- [ ] Track rows preserve remove controls and readable titles.
- [ ] Drawer panels fit the viewport without clipped controls.
- [ ] Buttons do not truncate meaningful text.

## Interaction Smoke

- [ ] Expand and collapse a track.
- [ ] Open Curator tools.
- [ ] Switch to History.
- [ ] Open Export.
- [ ] Trigger and cancel New session.
- [ ] Use browser console/log checks only if the UI appears broken.

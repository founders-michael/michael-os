# UX quality: motion, touch, themes, consistency

The rules that make the two apps feel like one careful product. Review checks these on every screen. Values that are numbers live in `tokens.json`; this file says how to use them.

## Motion

Motion explains what changed. If removing an animation loses no information, remove it.

| Use | Behaviour | Duration |
|---|---|---|
| Press feedback | Scale to 0.97 and dim slightly on touch down, spring back on release | 120 ms down, spring up |
| Check a task or habit | Circle fills from the centre, tick draws, row text fades to the done style | 220 ms |
| Progress bar | Width animates to the new value; never jumps | 400 ms, ease-out |
| List insert and remove | Item fades and moves into place; neighbours slide | 250 ms |
| Sheet | Platform default spring | Platform |
| Screen push and tab switch | Platform default. Tabs cross-fade, no slide | Platform |
| Skeleton to content | Cross-fade, no layout jump: the skeleton has the content's exact layout | 200 ms |
| Michael's orb, idle | Slow breathe (scale 1 to 1.045) | 4.5 s dark, 6 s light |
| Michael's orb, working | Rings pulse outward, breathe speeds up | 3.6 s ring |
| AI card border | Gradient drifts along the border | 7 s loop |
| Michael's reply | Text reveals word by word after the whole reply has arrived | About 30 words per second, capped at 3 s total |
| Saved, failed | Inline state change beside the control, held for 2 s | 200 ms in and out |

Rules:
- One easing family: ease-out for things entering, ease-in for leaving, springs for anything that follows a finger.
- Nothing animates on first render of a screen except the skeleton shimmer.
- Looping animation appears only on Michael's surfaces: the orb and AI cards. Nowhere else.
- The orb's state is derived from what is actually happening. It never "thinks" for effect.
- With Reduce Motion (iOS) or Remove animations (Android) on: loops stop, the reply appears at once, movement becomes a short fade. Every screen is checked in this mode.
- An animation never blocks input. The user can tap the next thing before the last one settles.
- 60 fps on a mid-range Android phone or the animation is simplified.

## Touch

- Minimum target 44×44 pt on iOS and 48×48 dp on Android, even when the visible control is smaller (the 24 pt check sits in a 44 pt target).
- At least 8 pt between adjacent targets.
- Primary actions sit in the lower half of the screen, within thumb reach. Destructive actions never sit next to the primary one.
- Every tap gives feedback within 100 ms: a press state, then the result.
- Haptics: light impact on check-in and task complete, success on save from a draft, warning on a refused or rolled-back action. Nothing else. Both platforms.
- Swipe actions on rows (complete, delete) always have a visible equivalent; a gesture is never the only way.
- Pull to refresh on every list.
- Forms: the right keyboard for each field, Next moves between fields, the primary button stays above the keyboard, and content scrolls so the focused field is visible.
- Sheets dismiss by swipe, and ask before discarding unsaved input.

## Day and night

Both themes are designed, not derived. Each screen is reviewed in both.

- Colours come only from the semantic tokens (`bg`, `surface`, `text`, `muted`, `accent`, `fill`, `danger` …). A token means the same thing in both themes; a feature never checks which theme is active.
- **Dark** is the signature look: near-black, mint and cyan glow on Michael's surfaces only, hairline borders instead of shadows.
- **Light** is calm: white cards on a cool grey ground, soft shadows instead of glow, a near-black primary button, emerald for accent text.
- Follows the system setting by default, with System, Light and Dark in Settings. Changing it applies at once with a cross-fade and no restart.
- Glow is a dark-theme effect. In light it becomes a shadow, never a coloured halo.
- Contrast: body text at least 4.5:1 and large text 3:1 in both themes, including muted labels and text on chips. Check `faint` on `raise` in particular.
- Status meaning never rests on colour alone: overdue has the word, done has the tick and strike-through.
- System bars match the theme; content goes edge to edge and respects safe areas.
- Launch screen and app icon work on both light and dark home screens. Android has a monochrome icon layer.

## Consistency

- One component per job, from the design system. A feature does not restyle a button.
- One place for each kind of action: create is the top-right button on a list, edit is in the detail's top bar, destructive actions are at the bottom of a detail or in a menu.
- The same word for the same thing everywhere, and the same words as the web app: Task, Habit, Check in, Goal, Milestone, Daily Review, Michael.
- Sentence case for every label and button. Buttons say what they do: "Save task", not "Submit".
- Dates read the way the user's locale writes them; times follow the device's 12 or 24 hour setting. Numbers and times use the mono face.
- Every list has the same four states with the same layouts: loading skeleton, content, empty with one action, failure with retry.
- Errors say what happened and what to do, in one sentence, beside the thing that failed.
- Michael's surfaces are always recognisable: the gradient border and the orb mean "this came from Michael and nothing is saved yet".
- Spacing is the 4 pt scale. Screen gutters are 16.

## Platform fit

Brand through colour, type, the orb and AI surfaces. Behaviour through the platform: iOS uses its navigation bars, sheets with detents, swipe back, system pickers and SF-style feedback; Android uses predictive back, Material bottom sheets and pickers, and edge-to-edge insets. Neither app should feel like a port of the other.

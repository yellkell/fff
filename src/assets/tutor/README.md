# EMBER's voice clips

FIRE FIGHT 2's recorded tutorial lines (ff2 `src/assets/tutor/`, recorded
per ff2 `docs/tutorial-ember.md`), one mp3 per line, named by the line's id
in `src/tutorial/script.ts`. Extra takes share the id with a `_N` suffix
(`e100_2.mp3`), and one is picked at random per play.

Only the lines that are true in Flux are here. FF2's lines about the
trigger (e020, e022, e032), the ball loadout (e070–e075) and the Sheriff
(e064) are left out. Three takes were cut at a pause between sentences
(mono, 96 kbps, as FF2's were made), so each keeps only what's true here:

| Clip | FF2's take | Kept |
| --- | --- | --- |
| `e030` | "See this rust bucket? Throw towards him, and release the trigger at the end of the swing. I'll mark the spot." | "See this rust bucket? I'll mark the spot." (0–1.70 s, then 5.42 s on) |
| `e040` | "Pull the trigger again to call it home. Littering is a crime." | "Littering is a crime." (2.07 s on) |
| `e084` | "Down goes the rust bucket. Well done, well done, well done. Go check out the locker and the store, get yourself some drip. Gasket's waiting for you, Clanker." | "Down goes the rust bucket. Well done, well done, well done." (0–4.31 s) |

`src/audio/tutorVoice.ts` decodes them when the tutorial starts. A line
whose clip is missing plays silently with its caption.

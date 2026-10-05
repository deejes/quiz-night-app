# Quiz Night App 🎉

A small collection of self-contained trivia games for playing with friends in one room. No build step, no server, no internet — every game is a single HTML file you open in a browser.

Built for 5 players, but easy to tweak.

## 🔔 Live Buzzer Mode (phones + auto-advance) — NEW

No moderator needed. Questions appear on a big screen and advance on their own; each player buzzes in from their **own phone** by scanning a QR code.

### How to run it (on game night)

1. **Double-click `start.command`** (first run installs dependencies — needs internet once, ~20s).
   - The big-screen page opens automatically at `http://localhost:3000/host`.
2. Everyone **scans the QR code** on screen with their phone camera and types their name.
   - *Everyone must be on the same Wi-Fi as the laptop.*
3. Once 2+ players have joined, click **Start Game** once. From there it's hands-off.

### How a round works
- A multiple-choice question appears on the big screen on a countdown.
- Phones show a big **BUZZ** button. First to buzz locks in and their phone reveals the 4 options.
- **Correct = +100**, **wrong = −50** (and it reopens for the others), **time-out = pass, no penalty**.
- The answer reveals, scores update, and the next question loads automatically.

Manual start (instead of double-clicking): `npm install` then `npm start`.

---

## Single-device games

Open **[`index.html`](index.html)** for a menu, or jump straight to one:

| Game | File | What it is |
|------|------|------------|
| **Head to Head** | [`head-to-head.html`](head-to-head.html) | **2 teams of 2.** Questions arrive as a random mix of topics and point values (no board). Miss your question and the other team can **steal** it for half points. Self-scoring — no moderator needed. |
| **Pick & Play** | [`quiz-pick.html`](quiz-pick.html) | Choose from 14 categories (140 questions), build a board from questions you haven't played yet, play **buzzer rounds** — players buzz in, the host taps them in order, each gets a 10-second timer. Right answer = full points; wrong answer = minus half; time-out = pass to the next buzzer. |
| **Trivia Board** | [`feud-board.html`](feud-board.html) | A fixed 5-category Jeopardy-style board ($10–$50). Host-judged: pick a tile, reveal the answer, award the points. |
| **Quick Trivia** | [`trivia.html`](trivia.html) | Classic multiple-choice, pass-the-device. Auto-scored, turn by turn. |

## How to play

Just **double-click any `.html` file** (or `index.html`) and it opens in your browser. Works offline.

## Editing the questions

All questions live in a `CATEGORIES` (or `BANK`) array inside each file's `<script>` block. Each entry looks like:

```js
{v:30, q:"Your question here?", a:"The answer"}
```

`v` is the point value. For the **Logos & Brands** category, an optional `logo:"🍎"` shows an emoji hint above the clue.

Add, edit, or delete entries freely — no other changes needed.

In **Pick & Play**, a category can hold any number of questions per value. Each board draws one per value.

### Saved games (Pick & Play)

A game in progress is saved as you play, so reloading or navigating back by mistake loses nothing. That includes scores, finished tiles, and an open clue. Only the **↺ Reset game** button, top right of the board, clears it.

### Used-questions ledger (Pick & Play)

Pick & Play remembers every question played on this device, and new boards draw unplayed ones first. Each category card shows how many of its questions are still fresh. The count turns pink when the next board would have to repeat one, and repeats come from the questions played longest ago. Click **Reset history** under the category picker to start over.

The history lives in the browser, so it's per device and per way of opening the page. Opening the file directly and opening it through a local server keep separate histories, so use the same one each time. It's keyed by question text, so rewording a question makes it fresh again.

### Difficulty

The question banks are deliberately pitched **hard** — a level we calibrated by playing. The rule of thumb: don't ask the fact everyone knows, ask the layer behind it. Not *"which brand is the leaping cat?"* but *"Puma's founder's brother started which rival brand?"* Keep that standard when adding questions.

## Roadmap / ideas

- Auto-advance mode (questions appear and run on a timer with no clicking)
- 3 rounds of rising difficulty
- Fact-checking pass on the question bank

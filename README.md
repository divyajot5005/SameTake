# SameTake

SameTake is a Chrome Extension MVP that collapses repeated LinkedIn-style feed posts after you have already seen enough semantically similar posts.

Core product: **Hide the 4th post saying the same thing.**

The project also includes a local demo page with fake LinkedIn-style posts so the clustering and collapse behavior can be tested without depending on LinkedIn's live DOM.

## What It Does

- Runs as a Manifest V3 Chrome extension.
- Scans LinkedIn pages for feed-style post containers.
- Watches dynamically inserted posts with `MutationObserver`.
- Extracts visible post text locally in the browser.
- Clusters posts with deterministic keyword similarity.
- Collapses posts after the allowed repeat count is exceeded.
- Lets the user show a hidden post or reset that topic.
- Shows popup counters for scanned posts, topics, and blocked posts.
- Persists topic memory in browser-local extension storage until reset.
- Makes no backend calls and uses no external APIs.

## Project Structure

```text
same-take/
  extension/
    manifest.json
    content.js
    background.js
    popup.html
    popup.js
    styles.css
  demo/
    index.html
    posts.js
    demo-content.js
    demo-styles.css
  README.md
```

## Run The Demo

Open this file directly in Chrome:

```text
demo/index.html
```

The demo includes repeated clusters for AI video launches, AI agents replacing SaaS, internship/career advice, and unique posts. With the default setting of 3 allowed repeats, the 4th and later similar posts collapse.

## Load The Chrome Extension

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension/` folder.
5. Open LinkedIn and browse the feed.
6. Use the SameTake popup to enable/disable filtering, change allowed repeats, view counters, or reset topic memory.

After changing extension files locally, click **Reload** for SameTake in `chrome://extensions`, then refresh LinkedIn.

## Similarity Approach

SameTake intentionally avoids API keys and remote inference. It uses a local deterministic algorithm:

- Lowercase text.
- Remove URLs and punctuation.
- Remove common stopwords.
- Apply simple suffix stemming for `ing`, `ed`, and `s`.
- Build keyword sets.
- Expand keyword sets with small topic dictionaries.
- Compute Jaccard similarity.
- Boost similarity when posts match the same topic dictionary.
- Assign a post to the best existing cluster when the score is at least `0.42`.

Current topic dictionaries cover:

- AI video model launch hype
- AI agents replacing SaaS
- Internship and career advice

## Popup Counters

- **Scanned**: feed-style post containers detected on the current LinkedIn page.
- **Topics**: semantic clusters currently remembered.
- **Blocked**: posts collapsed by SameTake.

## Known Limitations

- LinkedIn DOM may change, so selectors may need maintenance.
- Local keyword similarity is imperfect and can miss nuance.
- Topic memory is browser-local and persists until reset.
- A production version could use embeddings, but this MVP intentionally avoids API keys.
- The extension only modifies the local DOM and does not interact with LinkedIn servers.

## Future Improvements

- Add per-topic controls in the popup.
- Add import/export for local topic memory.
- Improve LinkedIn selector resilience.
- Add optional local embeddings or on-device semantic models.
- Share clustering code between demo and extension through a build-free common script.

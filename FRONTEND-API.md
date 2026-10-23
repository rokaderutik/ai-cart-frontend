# Frontend API guide

Base URL: `http://localhost:8080/api/v1` locally, or `https://<render-host>/api/v1` in production. Store it in the frontend's `VITE_API_BASE_URL`. Paths below are relative to this base.

## Shared rules

- Send `Content-Type: application/json` for JSON bodies. Protected endpoints require `X-Session-Id: SESSION_<UUID>`. No login, bearer token, or cookies are required.
- Store the issued session token in `sessionStorage`; never put it in a URL. Sessions expire **24 hours after creation**, without extending on activity.
- All app JSON responses use the envelope below. The endpoint examples show **only `data`**. HTTP 204 has no response body.

```json
{
  "timestamp": "2026-10-23T10:00:00Z",
  "data": { "status": "UP" },
  "error": null
}
```

On errors, `data` is null and `error` contains the details:

```json
{
  "timestamp": "2026-10-23T10:00:00Z",
  "data": null,
  "error": {
    "status": 401,
    "code": "SESSION_EXPIRED",
    "message": "Session has expired; create a new session",
    "errors": []
  }
}
```

Check HTTP status and `error`; display `error.message`. Validation `errors` entries have `field` and `message`. Prices are JSON numbers in INR; timestamps are UTC ISO strings. IDs/prices in examples are illustrative: use IDs returned by the backend.

## Endpoints

| Method + path | Session header | Frontend purpose | Success |
|---|---|---|---|
| `GET /health` | No | Existing readiness check | 200 |
| `POST /sessions` | No | Start an anonymous conversation and empty cart | 201 |
| `DELETE /sessions/current` | Yes | End the session and delete its cart/history | 204 |
| `GET /cart` | Yes | Restore or refresh the current cart | 200 |
| `PUT /cart/items/{itemId}` | Yes | Add, set quantity, or remove using UI controls | 200 |
| `POST /chat` | Yes | Ask questions, get recommendations, or change cart through chat | 200 |
| `GET /chat/messages` | Yes | Restore/paginate the conversation | 200 |

### Health

`GET /health` has no body. Data: `{"status":"UP"}`. Database unavailability returns **503** with `data: {"status":"DOWN"}` and `error: null`. Keep chat disabled until status is UP. This check confirms backend/database readiness; model availability is established by chat requests.

### Create/end session

`POST /sessions` has no body. Data:

```json
{"sessionId":"SESSION_85168729-6486-4aaa-932e-43af4349aa47","expiresAt":"2026-10-24T10:00:00Z"}
```

Save `data.sessionId`; subsequent requests for cart/chat/history use this token. Creation already makes an empty cart. `DELETE /sessions/current` has no body and returns an empty **204**: do not call `response.json()` on it. For **New Session**, delete the current session, clear local UI/token, and create another. If the old session is already invalid/expired, clear it and create a new one.

### Read/update cart

`GET /cart` has no body. Data:

```json
{
  "cartId": "CART_89d6591d-b5e4-42c9-9282-f44264b9df86",
  "items": [
    {"itemId":1,"name":"Paneer Butter Masala","quantity":2,"unitPrice":250,"lineTotal":500,"available":true}
  ],
  "total": 500,
  "currency": "INR"
}
```

An empty cart has `items: []` and `total: 0`. Use the server's prices, line totals, and total for display.

`PUT /cart/items/1` body:

```json
{"quantity":2}
```

This sets the **absolute total quantity** for menu item 1. Integers **0–20** only: `1` adds a missing line, `2` sets two units, and `0` removes it. A card's Add button should set its current cart quantity + 1. Response data is the complete Cart object above; replace frontend cart state with it. Repeating the same PUT is safe. Unavailable dishes cannot be added/increased/set to a positive quantity; removal is allowed.

### Chat

`POST /chat` body:

```json
{"requestId":"1990c8a4-cd80-46ca-a5a7-cabf64da8242","message":"Suggest mild vegetarian mains under 300 rupees."}
```

Generate `requestId` with `crypto.randomUUID()` **once per new message**. Required trimmed message length: **1–2000 characters**. Send only these two fields: the backend chooses MENU/GUIDE/BOTH and filters automatically. Keep the ID and identical message for retries after network/503 failures.

Example data (wording, sources, timings, and diagnostics vary):

```json
{
  "requestId": "1990c8a4-cd80-46ca-a5a7-cabf64da8242",
  "assistantMessageId": 102,
  "outcome": "ANSWERED",
  "reply": "Try Paneer Butter Masala.\n\nPaneer Butter Masala — INR 250.00; spice 1/5; currently available.",
  "sections": [
    {"text":"Try Paneer Butter Masala.","sourceIds":["menu:paneer-butter-masala"]},
    {"text":"Paneer Butter Masala — INR 250.00; spice 1/5; currently available.","sourceIds":["menu:paneer-butter-masala"]}
  ],
  "recommendations": [
    {"id":1,"name":"Paneer Butter Masala","description":"Paneer in a creamy tomato and butter gravy.","category":"MAIN","ingredients":["paneer","tomato","butter","cream"],"dietaryTags":["VEGETARIAN"],"spiceLevel":1,"price":250,"currency":"INR","available":true}
  ],
  "sources": [
    {"sourceId":"menu:paneer-butter-masala","title":"Paneer Butter Masala","sourceType":"MENU","content":"Full supporting menu text appears here.","snippet":"Short supporting excerpt appears here."}
  ],
  "cart": {"cartId":"CART_89d6591d-b5e4-42c9-9282-f44264b9df86","items":[],"total":0,"currency":"INR"},
  "actionResult": null,
  "timings": {"planningMillis":1200,"knowledgeMillis":1800,"totalMillis":3000},
  "diagnostics": {"intent":"KNOWLEDGE","target":"MENU","promptVersion":"v2","modelCalls":2,"embeddingCalls":1}
}
```

- Display `reply`, **or** render `sections` with source controls; rendering both duplicates the answer. Match `sections[].sourceIds` to `sources[].sourceId` to open evidence. Source IDs are identifiers, not web URLs; show title/snippet/content in a panel.
- Render recommendations in their returned order: “the first/second dish” depends on it. Card `id` is the cart endpoint's `{itemId}`. Spice is **0–5**. Disable Add when `available` is false. Cards and sources belong to their message; do not erase earlier messages' cards on later empty lists.
- Replace current cart state with `data.cart`. `timings` and `diagnostics` are informational maps with optional keys; normal UI behavior should not depend on them.
- Successful conversation outcomes include `ANSWERED`, `PARTIAL_EVIDENCE`, `INFORMATION_MISSING`, `NO_EVIDENCE`, `NO_ELIGIBLE_ITEMS`, `CLARIFICATION`, `RESTAURANT_CONFIRMATION_REQUIRED`, `GREETING`, `OUT_OF_SCOPE`, and `CART`. Missing evidence/clarification are normal replies, not HTTP failures.

Send follow-ups using the same payload shape, same session, and a new request ID:

| Message | Purpose |
|---|---|
| `Which of those is less spicy?` | Follow up on returned dishes |
| `Can I request less chilli?` | Restaurant guide question |
| `Suggest vegan mains and explain takeaway packaging.` | Combined menu/guide question |
| `Add the first dish.` | Add one recommended dish |
| `Make that two.` | Set its total quantity to two |
| `Add one more.` / `Remove one.` / `Remove it.` | Increment, decrease, or remove |
| `Show my cart.` | Read cart through chat |

Chat changes **one dish per message**. Ambiguous/unknown/multiple dishes ask for clarification; checkout is unsupported. Action replies also use the Chat response above, usually with empty recommendations/sources. A completed action includes:

```json
{"operation":"SET","itemId":1,"previousQuantity":1,"quantity":2,"outcome":"CART_UPDATED","reason":null}
```

`operation` is `ADD`, `SET`, `DECREASE`, or `REMOVE`. `actionResult` is nullable, including clarification/unsupported replies. Top-level `outcome` can be `CART_UPDATED`, `CART_UNCHANGED`, `CART_ACTION_REJECTED`, `CLARIFICATION`, or `CART_ACTION_UNAVAILABLE`. Rejection reasons include `INVALID_QUANTITY`, `CART_CHANGED`, `ITEM_NOT_FOUND`, and `ITEM_UNAVAILABLE`; `quantity` reflects the actual resulting quantity. These business outcomes return **200**; show the reply and returned cart.

The same completed request ID + text replays the original response without another cart change. That response contains its **original cart snapshot**: after replay, use `GET /cart` for the latest state if other changes may have occurred. Disable overlapping chat sends; disabling manual cart controls while chat is processing also avoids conflicting edits. No polling/WebSockets are needed for normal successful requests.

### Conversation history

`GET /chat/messages?limit=50` has no body. Data:

```json
{
  "messages": [
    {"id":101,"requestId":"1990c8a4-cd80-46ca-a5a7-cabf64da8242","role":"USER","content":"Suggest mild vegetarian mains under 300 rupees.","createdAt":"2026-10-23T10:00:00Z","requestStatus":"COMPLETED","metadata":{}},
    {"id":102,"requestId":"1990c8a4-cd80-46ca-a5a7-cabf64da8242","role":"ASSISTANT","content":"Try Paneer Butter Masala.","createdAt":"2026-10-23T10:00:03Z","requestStatus":"COMPLETED","metadata":{"outcome":"ANSWERED","recommendations":[],"sources":[],"sections":[],"cart":null,"actionResult":null}}
  ],
  "nextBefore": null
}
```

Each page is chronological. `limit` defaults to 50, allowed **1–100**. If `nextBefore` is non-null, request `/chat/messages?limit=50&before=<nextBefore>` and prepend that older page. Deduplicate using message `id`/request ID when reconciling optimistic messages. Assistant `metadata` holds the Chat response fields except `reply`; restore cards, sources, sections and action results from it, and use `content` as the reply. The example metadata is shortened; actual saved recommendations/sources contain their full objects. USER metadata is normally `{}`. `requestStatus` can be `IN_PROGRESS`, `COMPLETED`, or `FAILED`; mark failed/pending user messages appropriately. Restore the **current cart from `GET /cart`**, not historical metadata.

## Errors and retry behavior

| HTTP / code | Frontend action |
|---|---|
| 400 `INVALID_REQUEST`, `VALIDATION_ERROR`, `INVALID_QUANTITY`, `INVALID_ITEM_ID` | Correct input; do not loop retries |
| 401 `INVALID_SESSION`, `SESSION_EXPIRED` | Clear token and session UI; create a fresh session |
| 404 `ITEM_NOT_FOUND` | Explain missing dish and refresh cart |
| 409 `ITEM_UNAVAILABLE` | Explain availability and refresh cart |
| 409 `REQUEST_ID_CONFLICT` | Same ID was used for different text; generate IDs per message |
| 409 `CHAT_BUSY`, `CHAT_REQUEST_IN_PROGRESS` | Wait/reconcile history; avoid parallel sends or immediate retry loops |
| 409 `CHAT_ATTEMPT_EXPIRED` | Retry the same ID/text |
| 409 `CHAT_RETRY_STALE` | A newer turn exists; resubmit only if wanted, with a new ID |
| 503 `CHAT_MODEL_UNAVAILABLE`, `CHAT_INVALID_MODEL_OUTPUT`, `CHAT_UNAVAILABLE` | Offer retry with the same ID/text; provider quota can also appear as 503 |
| 503 `CHAT_CONTEXT_TOO_LARGE` | Ask for a narrower question/new session rather than immediate retries |
| 503 retrieval/embedding codes | Show temporary knowledge unavailability and offer retry |
| Network failure / 500 `INTERNAL_ERROR` | Show a recoverable error; reconcile history/cart and reuse the chat ID if retrying |

For slow Render startup show a “backend waking up” state and bounded readiness retries. Allow for model latency; a client timeout does not prove a cart action failed. Never automatically replay an uncertain cart instruction using a **new** request ID.

## Frontend startup flow

1. Wait for `/health` UP. If no token exists, create a session and save the token.
2. With that token, load `/chat/messages` and `/cart` (they can run in parallel). Restore history/cards and current cart; handle 401 as above.
3. Send chat sequentially. Append its reply/cards/sources and replace cart with the response. Manual cart controls replace cart with the PUT response.
4. New Session deletes the old session and starts another. Keep the token stable across refreshes in the same browser tab.

There is currently **no public menu-list or source-detail endpoint**: recommendation cards and source details come from chat/history. Production CORS permits the configured `FRONTEND_ORIGIN`; dev also permits `http://localhost:5173`.

## Development-only retrieval API

`POST /dev/retrieval` is available only with **dev active and prod inactive**. No session header. It is an inspection API; the normal frontend uses `/chat`.

```json
{"target":"MENU","query":"creamy vegetarian curry","filters":{"maxPrice":300,"dietaryTags":["VEGETARIAN"],"categories":["MAIN"],"minSpiceLevel":0,"maxSpiceLevel":1,"availableOnly":true}}
```

Required: `target` (`MENU`, `GUIDE`, `BOTH`) and `query` (1–1000 trimmed characters). Optional filters apply to MENU/BOTH only. For BOTH, optional `menuQuery`/`guideQuery` override the shared query per branch. Categories: `MAIN`, `RICE`, `BREAD`, `DESSERT`, `STARTER`, `SIDE`, `DRINK`; tags: `VEGETARIAN`, `VEGAN`, `NON_VEGETARIAN`. Spice bounds are 0–5, price is an inclusive nonnegative limit with up to two decimals, and `availableOnly` defaults to true. GUIDE rejects filters. Invalid input returns 400 `INVALID_REQUEST` or `INVALID_RETRIEVAL_REQUEST`.

Data includes `requestId`, `status` (`EVIDENCE_FOUND`, `PARTIAL_EVIDENCE`, `NO_EVIDENCE`), `appliedFilters`, `menu`, `guide`, `corpusRevision`, `embeddingFingerprint`, `embeddingCalls`, `embeddingMillis`, `databaseMillis`, `totalMillis`. An unrequested branch is null. Each requested branch has `{outcome,eligibleCount,threshold,documents}`; outcome is `EVIDENCE_FOUND`, `NO_ELIGIBLE_ITEMS`, or `NO_RELEVANT_EVIDENCE`. Each document has `{documentId,sourceId,sourceType,title,score,content,snippet,metadata,menuItem}`; `menuItem` uses the recommendation shape above for menu documents and is null for guide documents. This returns evidence, not a generated chat reply.

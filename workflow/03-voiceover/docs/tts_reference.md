> This page is for Model APIs.

> For clean Markdown of any page, append `.md` to the page URL.
> For a complete documentation index, see https://docs.sarvam.ai/llms.txt. For a section index, append `/llms.txt` to any section URL (for example https://docs.sarvam.ai/voice-agents/llms.txt).
> Building a voice agent for customers in India? Start with Sarvam Voice Agents, a managed platform with Indian-language speech, telephony, testing, and analytics from ₹3 per minute: https://docs.sarvam.ai/voice-agents/why-voice-agents.
> For AI client integration (Claude Code, Cursor, etc.), connect to the MCP server at https://docs.sarvam.ai/_mcp/server.

# Best Practice Guide for Bulbul v4 Flash

> Integration guide for Sarvam Bulbul v4 Flash — endpoints, parameters, input formatting, and expert voice picks by use case.

Bulbul **v4 Flash** is Sarvam's low-latency TTS tier for interactive workloads — voice agents, IVR, and anything where a listener is waiting for the first word.

This guide applies only to **`model="bulbul:v4-flash"`** with persona **`speaker`** IDs (`voice_language_style`). For the stable **`bulbul:v3`** model (short names like `shubh`, `priya`), see [Bulbul v3 best practices](/api/api-guides-tutorials/text-to-speech/bulbul-v3-best-practices).

> **Tip**
>
> **In a hurry?** POST to `/text-to-speech/stream`, set `language_code`, pick a persona `speaker`, and keep `enable_preprocessing: true`. Everything after the quick start is tuning.

> **Tip**
>
> Preview voices before you ship: [Voices](/api/api-guides-tutorials/text-to-speech/voices) lists every v4 Flash persona with audio samples.

> **Info**
>
> Already on `bulbul:v3`? Jump to [Migrating from Bulbul v3](#migrating-from-bulbul-v3). Most integrations need only a new `model` and `speaker`.

---

## What is Bulbul v4 Flash?

Flash is the interactive tier of the v4 family. It runs on production infrastructure and is available over **three transports** — HTTP streaming, single-response REST, and WebSocket — so you can match your pipeline instead of forcing one mode.

| Capability    | Detail                                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Languages     | Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, and English (Indian accent) — 11 codes, `en-US` is **not** accepted; use `en-IN`. |
| Code-mixing   | Hinglish, Tanglish, and similar mixes when each language is written in **its own script**.                                                                             |
| Indian names  | Strong on Indian names, places, and cultural terms that global TTS often misreads.                                                                                     |
| Preprocessing | `enable_preprocessing` normalises numbers, dates, currency, and mixed-script text before synthesis.                                                                    |
| Prosody       | Independent **`pace`**, **`pitch`**, and **`loudness`** (v3 offers pace and temperature only).                                                                         |
| Codecs        | WAV, MP3, FLAC, AAC; configurable MP3 bitrate on HTTP streaming.                                                                                                       |
| Telephony     | 8 kHz output for IVR and contact-centre legs.                                                                                                                          |
| Voice roster  | **83** named personas, **224** speaker IDs on the API today.                                                                                                           |

---

## Choosing the right endpoint

All three transports serve the same model. They differ in latency, max sample rate, and how audio is delivered — so pick by what your listener experiences, not by habit.

|                                | **HTTP streaming**                | **Single response (REST)**            | **WebSocket**                                      |
| ------------------------------ | --------------------------------- | ------------------------------------- | -------------------------------------------------- |
| **Path**                       | `POST /text-to-speech/stream`     | `POST /text-to-speech`                | `wss://api.sarvam.ai/text-to-speech/ws`            |
| **Returns**                    | Chunked audio bytes               | JSON with base64 in `audios[0]`       | `{"type":"audio"}` messages with base64 chunks     |
| **Max sample rate**            | 24 kHz                            | 48 kHz                                | 24 kHz                                             |
| **Playable before completion** | Yes                               | No                                    | Yes                                                |
| **Best for**                   | Voice agents, IVR, LLM read-aloud | Offline files, broadcast-grade 48 kHz | High-volume sequential synthesis on one connection |

> **Tip**
>
> If a person is waiting to hear the first word, use **HTTP streaming** or **WebSocket**. The single-response endpoint finishes the full clip before replying, which listeners experience as dead air. Reserve REST for offline generation and when you need **32 / 44.1 / 48 kHz**.

**Reuse connections:** each new HTTPS connection pays DNS, TCP, and TLS before any audio work. Enable keep-alive or pool clients so one connection serves many synthesis calls.

See also [Which API to Use](/api/api-guides-tutorials/text-to-speech/which-api-to-use).

---

## Quick start

Three transports, one model. Copy the block for the endpoint you picked — Python first, then JavaScript and cURL.

### HTTP streaming

Best for anything interactive. Audio starts flowing before the full clip is ready.

#### Python

```python
from sarvamai import SarvamAI

client = SarvamAI(api_subscription_key="YOUR_SARVAM_API_KEY")

with open("output.wav", "wb") as f:
    for chunk in client.text_to_speech.convert_stream(
        text="नमस्ते! आपका order 2 दिन में deliver हो जाएगा।",
        language_code="hi-IN",
        model="bulbul:v4-flash",
        speaker="aparna_hi_customer",
        speech_sample_rate=24000,
        output_audio_codec="wav",
        pace=1.0,
        enable_preprocessing=True,
    ):
        f.write(chunk)
```

#### JavaScript

```javascript
import { SarvamAIClient } from "sarvamai";
import fs from "fs";

const client = new SarvamAIClient({
  apiSubscriptionKey: "YOUR_SARVAM_API_KEY",
});

const response = await client.textToSpeech.convertStream({
  text: "नमस्ते! आपका order 2 दिन में deliver हो जाएगा।",
  language_code: "hi-IN",
  model: "bulbul:v4-flash",
  speaker: "aparna_hi_customer",
  speech_sample_rate: 24000,
  output_audio_codec: "wav",
  pace: 1.0,
  enable_preprocessing: true,
});

fs.writeFileSync("output.wav", Buffer.from(await response.arrayBuffer()));
```

#### cURL

```bash
curl -X POST https://api.sarvam.ai/text-to-speech/stream \
  -H "api-subscription-key: YOUR_SARVAM_API_KEY" \
  -H "Content-Type: application/json" \
  --output output.wav \
  -d '{
    "text": "नमस्ते! आपका order 2 दिन में deliver हो जाएगा।",
    "language_code": "hi-IN",
    "model": "bulbul:v4-flash",
    "speaker": "aparna_hi_customer",
    "speech_sample_rate": 24000,
    "output_audio_codec": "wav",
    "pace": 1.0,
    "enable_preprocessing": true
  }'
```

### Single response (REST)

Use this for offline files and when you need up to 48 kHz. The response is JSON, so **decode the base64** before writing to disk.

#### Python

```python
import base64
from sarvamai import SarvamAI

client = SarvamAI(api_subscription_key="YOUR_SARVAM_API_KEY")

audio = client.text_to_speech.convert(
    text="नमस्ते! आपका order 2 दिन में deliver हो जाएगा।",
    language_code="hi-IN",
    model="bulbul:v4-flash",
    speaker="aparna_hi_customer",
    speech_sample_rate=48000,
    output_audio_codec="wav",
    enable_preprocessing=True,
)

audio_bytes = base64.b64decode("".join(audio.audios))
with open("output.wav", "wb") as f:
    f.write(audio_bytes)
```

#### JavaScript

```javascript
import { SarvamAIClient } from "sarvamai";
import fs from "fs";

const client = new SarvamAIClient({
  apiSubscriptionKey: "YOUR_SARVAM_API_KEY",
});

const response = await client.textToSpeech.convert({
  text: "नमस्ते! आपका order 2 दिन में deliver हो जाएगा।",
  language_code: "hi-IN",
  model: "bulbul:v4-flash",
  speaker: "aparna_hi_customer",
  speech_sample_rate: 48000,
  output_audio_codec: "wav",
  enable_preprocessing: true,
});

fs.writeFileSync("output.wav", Buffer.from(response.audios.join(""), "base64"));
```

#### cURL

```bash
curl -X POST https://api.sarvam.ai/text-to-speech \
  -H "api-subscription-key: YOUR_SARVAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "नमस्ते! आपका order 2 दिन में deliver हो जाएगा।",
    "language_code": "hi-IN",
    "model": "bulbul:v4-flash",
    "speaker": "aparna_hi_customer",
    "speech_sample_rate": 48000,
    "output_audio_codec": "wav",
    "enable_preprocessing": true
  }'
# Response JSON contains base64 audio in "audios" — decode it before writing to a file.
```

### WebSocket

Best when one connection should carry many utterances — voice agents and multi-turn conversations. Connect once, then send **config → text → flush** per utterance.

The SDK example below uses `send_completion_event=True` so the server signals when the last chunk for an utterance has been sent.

#### Python

```python
import asyncio
import base64
from sarvamai import AsyncSarvamAI, AudioOutput, EventResponse

async def main():
    client = AsyncSarvamAI(api_subscription_key="YOUR_SARVAM_API_KEY")

    async with client.text_to_speech_streaming.connect(
        model="bulbul:v4-flash", send_completion_event=True
    ) as ws:
        await ws.configure(
            language_code="hi-IN",
            speaker="aparna_hi_customer",
            speech_sample_rate=24000,
            output_audio_codec="wav",
        )
        await ws.convert("नमस्ते! मैं आपकी कैसे मदद कर सकती हूँ?")
        await ws.flush()

        with open("output.wav", "wb") as f:
            async for message in ws:
                if isinstance(message, AudioOutput):
                    f.write(base64.b64decode(message.data.audio))
                elif isinstance(message, EventResponse) and message.data.event_type == "final":
                    break

asyncio.run(main())
```

#### JavaScript

```javascript
import { SarvamAIClient } from "sarvamai";
import fs from "fs";

const client = new SarvamAIClient({
  apiSubscriptionKey: "YOUR_SARVAM_API_KEY",
});

const socket = await client.textToSpeechStreaming.connect({
  model: "bulbul:v4-flash",
});
await socket.waitForOpen();

socket.configureConnection({
  type: "config",
  data: {
    language_code: "hi-IN",
    speaker: "aparna_hi_customer",
    speech_sample_rate: 24000,
    output_audio_codec: "wav",
  },
});

const output = fs.createWriteStream("output.wav");
socket.on("message", (message) => {
  if (message.type === "audio") {
    output.write(Buffer.from(message.data.audio, "base64"));
  }
});
socket.on("close", () => output.end());

socket.convert("नमस्ते! मैं आपकी कैसे मदद कर सकती हूँ?");
socket.flush();
```

Prefer the raw protocol? Connect to `wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4-flash` with `api-subscription-key` on the upgrade request, then send these frames **in order** per utterance:

```json
{
  "type": "config",
  "data": {
    "speaker": "aparna_hi_customer",
    "language_code": "hi-IN",
    "speech_sample_rate": 24000,
    "output_audio_codec": "wav",
    "pace": 1.0
  }
}
```

```json
{ "type": "text", "data": { "text": "नमस्ते! मैं आपकी कैसे मदद कर सकती हूँ?" } }
```

```json
{ "type": "flush" }
```

Audio arrives as `{"type":"audio"}` messages with base64 in `data.audio`. Hold the socket open across many calls; send `{"type":"ping"}` on idle links.

---

## Parameter reference (v4 Flash)

Every field the model accepts. Values outside the allowed ranges return **400** — validate in your client to avoid wasting round trips on live calls.

| Field                  | Values                                                                                            | Notes                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `text`                 | string                                                                                            | Required.                                                                                                                           |
| `language_code`        | `hi-IN`, `en-IN`, `bn-IN`, `gu-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `od-IN`, `pa-IN`, `ta-IN`, `te-IN` | Required on REST and HTTP streaming. WebSocket `config` uses the same field name.                                                   |
| `model`                | `bulbul:v4-flash`                                                                                 | Required for this guide.                                                                                                            |
| `speaker`              | Persona ID, e.g. `ritu_hi_customer`                                                               | Form `voice_language_style`. Unknown values return **400** with the live speaker list. If omitted, default is **`shubh_enhi_ads`**. |
| `speech_sample_rate`   | 8000, 16000, 22050, 24000 (+ 32000, 44100, 48000 on REST only)                                    | Streaming capped at 24 kHz. Default **22050** when omitted.                                                                         |
| `output_audio_codec`   | `wav`, `mp3`, `flac`, `aac` (`wav`, `mp3` on WebSocket)                                           | Set explicitly on streaming — default is not WAV.                                                                                   |
| `output_audio_bitrate` | 32k – 192k                                                                                        | MP3 on HTTP streaming only.                                                                                                         |
| `pace`                 | 0.5 – 2.0, default **1.0**                                                                        | Speaking rate.                                                                                                                      |
| `pitch`                | -0.5 – 0.5, default **0.0**                                                                       | Lower/higher while preserving identity.                                                                                             |
| `loudness`             | 0.1 – 2.5, default **1.0**                                                                        | Output gain — prefer over downstream amplification.                                                                                 |
| `enable_preprocessing` | boolean                                                                                           | Normalises numbers, dates, mixed script before synthesis.                                                                           |

### Tuning guidance

Start at the defaults, then move one dial at a time and listen.

| Setting            | Where it helps                                         |
| ------------------ | ------------------------------------------------------ |
| `pace` 0.8 – 0.9   | EdTech, wellness, accessibility, instructional content |
| `pace` 1.0         | Conversational agents — **start here**                 |
| `pace` 1.1 – 1.2   | Notifications, news, professional IVR                  |
| `pitch` ±0.1 – 0.2 | Small brand-tone tweaks; audition larger shifts        |
| `loudness` 1.0     | Default unless matching a fixed telephony level        |

#### Python

```python
audio = client.text_to_speech.convert(
    text="आपका payment कल तक पूरा हो जाएगा।",
    language_code="hi-IN",
    model="bulbul:v4-flash",
    speaker="shubh_en_recovery",
    pace=1.1,       # slightly brisk for a payment reminder
    pitch=0.0,      # keep the voice's identity
    loudness=1.0,   # match the platform, not the app
)
```

#### JavaScript

```javascript
const response = await client.textToSpeech.convert({
  text: "आपका payment कल तक पूरा हो जाएगा।",
  language_code: "hi-IN",
  model: "bulbul:v4-flash",
  speaker: "shubh_en_recovery",
  pace: 1.1, // slightly brisk for a payment reminder
  pitch: 0.0, // keep the voice's identity
  loudness: 1.0, // match the platform, not the app
});
```

---

## Writing text for natural speech

Input formatting affects perceived quality more than parameter tweaks. Most early issues trace back to this section.

### Punctuation for pauses

| Punctuation | Effect                                                        |
| ----------- | ------------------------------------------------------------- |
| `,`         | Short pause                                                   |
| `.` / `।`   | Sentence end (use `।` when the sentence ends in Indic script) |
| `!`         | Emphasis + pause                                              |
| `…`         | Hesitation — use sparingly                                    |
| Line break  | Pause between paragraphs                                      |

### Fillers and code-mixing

For conversational Hinglish, write **English in Latin script** and **Indic words in native script**, as a bilingual reader would:

- `"आपका order confirm हो गया है"`
- `"Aapka order confirm ho gaya hai"`

Use **`_enhi_`** personas (`simran_enhi_customer`, `ishita_enhi_customer`, `shubh_enhi_banking`, …) when copy is genuinely mixed English–Hindi in one utterance, not just a few loan words.

### Write each language in its own script

Romanised Hindi/Tamil/etc. degrades quality — the model was trained on native scripts.

| Language | Correct                        | Avoid                           |
| -------- | ------------------------------ | ------------------------------- |
| Hindi    | आपका order confirm हो गया है   | Aapka order confirm ho gaya hai |
| Tamil    | உங்கள் order deliver ஆகிவிடும் | Unga order deliver aayidum      |

### Let preprocessing handle numbers

With `enable_preprocessing: true`, do **not** hand-expand numbers, dates, or currency into words — you will usually get a worse reading than the model's language-specific rules.

```python
audio = client.text_to_speech.convert(
    text="आपका bill ₹5,00,000 है, due date 15/03/2026 है।",
    language_code="hi-IN",
    model="bulbul:v4-flash",
    speaker="shubh_enhi_banking",
    enable_preprocessing=True,  # let the model read the number and date
)
```

### Chunk on sentence boundaries

Split long or LLM-generated text at **sentence** boundaries. Mid-sentence splits strand intonation and sound like an audible seam. Buffer LLM tokens until you have a full sentence, then synthesise.

```python
import re

def sentences(text):
    # Split after ., !, ?, or the Indic danda — keep the punctuation.
    return [s.strip() for s in re.split(r"(?<=[.!?।])\s+", text) if s.strip()]

with open("output.wav", "wb") as f:
    for sentence in sentences(llm_output):
        for chunk in client.text_to_speech.convert_stream(
            text=sentence,
            language_code="hi-IN",
            model="bulbul:v4-flash",
            speaker="aparna_hi_customer",
            output_audio_codec="wav",
        ):
            f.write(chunk)
```

### Match voice to language

Personas are not equally strong in all eleven languages. Use the rankings below and audition cross-language use before production.

### Avoid

| Avoid                | Why                 | Fix                           |
| -------------------- | ------------------- | ----------------------------- |
| Transliterated Indic | Poor pronunciation  | Native script for Indic words |
| Very long sentences  | Unnatural breathing | Shorter sentences             |
| Overusing `…`        | Choppy delivery     | Commas or line breaks         |

---

## Target language code

`language_code` is **required**. It drives number, date, and entity reading rules.

| Language  | Code    |
| --------- | ------- |
| English   | `en-IN` |
| Hindi     | `hi-IN` |
| Bengali   | `bn-IN` |
| Tamil     | `ta-IN` |
| Telugu    | `te-IN` |
| Kannada   | `kn-IN` |
| Malayalam | `ml-IN` |
| Marathi   | `mr-IN` |
| Gujarati  | `gu-IN` |
| Punjabi   | `pa-IN` |
| Odia      | `od-IN` |

```python
audio = client.text_to_speech.convert(
    text="नमस्ते! Sarvam AI में आपका स्वागत है।",
    model="bulbul:v4-flash",
    language_code="hi-IN",
    speaker="aparna_hi_customer",
)
```

> **Note**
>
> For mixed copy, set the code to the language whose **number and entity** conventions you want in speech.

---

## Speaker ID format

Every v4 Flash ID follows **`voice_language_style`**:

| ID                     | Meaning                                           |
| ---------------------- | ------------------------------------------------- |
| `ritu_hi_customer`     | Ritu · Hindi · customer care                      |
| `shubh_en_recovery`    | Shubh · English · recovery                        |
| `simran_enhi_customer` | Simran · English+Hindi code-mixed · customer care |

The same voice can appear under multiple styles (`ritu_hi_customer` vs `ritu_hi_reels`) with different energy — switching **style** is often better than switching voice.

---

## Recommended voices by use case

Expert picks for **English (`en-IN`)** and **Hindi (`hi-IN`)**. Treat rank **1** as default; ranks 2–3 are A/B candidates. The full roster is browsable on [Voices](/api/api-guides-tutorials/text-to-speech/voices); the **style** segment (`customer`, `recovery`, `sales`, …) is a reliable guide when your use case is not listed.

### English (`en-IN`)

| Use case                           | Female                                                                       | Male                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Sales / lead conversion            | 1. `simran_en_sales` · 2. `aparna_hi_customer`                               | 1. `sunny_en_social` · 2. `rohan_en_recovery` · 3. `shubh_hi_ecomm` |
| Collections / payment reminder     | 1. `aparna_hi_kyc` · 2. `sanchita_en_recovery` · 3. `zarina_en_conversation` | 1. `shubh_en_recovery` · 2. `shubh_hi_ecomm`                        |
| Customer care & empathetic support | 1. `aparna_en_companion` · 2. `sanchita_en_companion`                        | 1. `shubh_hi_customer`                                              |
| Appointments / receptionist        | 1. `aparna_hi_customer` · 2. `sanchita_en_insurance`                         | —                                                                   |
| EdTech / tutor                     | 1. `aparna_en_edtech`                                                        | —                                                                   |

### Hindi (`hi-IN`)

| Use case                           | Female                                           | Male                                                    |
| ---------------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| Sales / lead conversion            | 1. `aparna_hi_customer`                          | 1. `shubh_hi_customer`                                  |
| Collections / payment reminder     | 1. `simran_hi_recovery`                          | 1. `shubh_hi_ecomm` · 2. `shubh_hi_customer`            |
| Customer care & empathetic support | 1. `aparna_hi_customer` · 2. `aarti_hi_customer` | —                                                       |
| Appointments / receptionist        | 1. `aparna_hi_customer`                          | 1. `shubh_hi_ecomm` · 2. `ratan_hi_customer_expressive` |

### Roster coverage by language

| Language                        | Voices | Speaker IDs | Notes                                                                                                                             |
| ------------------------------- | ------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Hindi `hi`                      | 48     | 116         | Deepest coverage                                                                                                                  |
| English `en`                    | 29     | 62          | Indian accent plus a few other accents                                                                                            |
| English + Hindi `enhi`          | 6      | 13          | Code-mixed copy                                                                                                                   |
| Marathi `mr`                    | 8      | 9           |                                                                                                                                   |
| Kannada, Punjabi, Tamil, Telugu | 3 each | 4 each      | Narrow — audition carefully                                                                                                       |
| Bengali, Gujarati               | 3 / 2  | 3 each      |                                                                                                                                   |
| Assamese `as`                   | 2      | 2           | Not in the accepted `language_code` list yet — contact Sarvam before building                                                     |
| Malayalam, Odia                 | —      | —           | `ml-IN` and `od-IN` are valid codes, but the roster has no `ml` / `od` personas yet — talk to Sarvam if these are on your roadmap |

---

## Decoding API audio (base64)

REST returns base64 in the `audios` array. **Decode before writing to disk.**

#### Python

```python
import base64
from sarvamai import SarvamAI

client = SarvamAI(api_subscription_key="YOUR_SARVAM_API_KEY")

audio = client.text_to_speech.convert(
    text="नमस्ते! Sarvam AI में आपका स्वागत है।",
    model="bulbul:v4-flash",
    language_code="hi-IN",
    speaker="aparna_hi_customer",
)

audio_bytes = base64.b64decode("".join(audio.audios))
with open("output.wav", "wb") as f:
    f.write(audio_bytes)
```

#### JavaScript

```javascript
import { SarvamAIClient } from "sarvamai";
import fs from "fs";

const client = new SarvamAIClient({
  apiSubscriptionKey: "YOUR_SARVAM_API_KEY",
});

const response = await client.textToSpeech.convert({
  text: "नमस्ते! Sarvam AI में आपका स्वागत है।",
  model: "bulbul:v4-flash",
  language_code: "hi-IN",
  speaker: "aparna_hi_customer",
});

fs.writeFileSync("output.wav", Buffer.from(response.audios.join(""), "base64"));
```

For WebSocket streaming, decode each chunk as it arrives. See [WebSocket streaming](/api/api-guides-tutorials/text-to-speech/streaming-api/web-socket).

> **Warning**
>
> Writing raw base64 to a file produces corrupted audio. Always decode first.

---

## Output formats and sample rates

Pick the codec by destination, then the lowest sample rate your pipeline actually plays.

| Codec  | Best for                          | Notes                                  |
| ------ | --------------------------------- | -------------------------------------- |
| `wav`  | Agents, post-processing, archival | Uncompressed                           |
| `mp3`  | Web, mobile, distribution         | Bitrate configurable on HTTP streaming |
| `aac`  | iOS, adaptive streaming           | Strong quality at moderate bitrates    |
| `flac` | High-fidelity archival            | Lossless, smaller than WAV             |

| Rate               | Available on | Use case                                |
| ------------------ | ------------ | --------------------------------------- |
| 8 kHz              | All          | Telephony, IVR, PSTN legs               |
| 16 kHz             | All          | Voice agents — common real-time default |
| 22.05 kHz          | All          | General playback                        |
| 24 kHz             | All          | Highest quality while **streaming**     |
| 32 / 44.1 / 48 kHz | REST only    | Broadcast, podcast, studio offline      |

> **Tip**
>
> **Defaults to start:** agents — `wav` @ **16 kHz**; telephony — `wav` @ **8 kHz**. Do not request 48 kHz if a gateway downsamples to 8 kHz — you only add transfer time.

---

## Handling errors

| Status | Meaning                                   | Action                                       |
| ------ | ----------------------------------------- | -------------------------------------------- |
| 200    | Success                                   | —                                            |
| 400    | Bad speaker, language, or parameter range | Fix request; 400 often lists valid speakers  |
| 403    | Missing/invalid API key                   | Check `api-subscription-key`                 |
| 429    | Throttled                                 | Back off with exponential backoff and jitter |

On WebSocket, errors often arrive as `{"type":"error"}` followed by a close — **reconnect** before retrying.

Log **`request_id`** from responses when debugging with support.

```python
import time
from sarvamai import SarvamAI
from sarvamai.core.api_error import ApiError

client = SarvamAI(api_subscription_key="YOUR_SARVAM_API_KEY")

for attempt in range(4):
    try:
        audio = client.text_to_speech.convert(
            text="Hello from Sarvam AI!",
            language_code="en-IN",
            model="bulbul:v4-flash",
            speaker="simran_en_customer",
        )
        break
    except ApiError as e:
        if e.status_code == 429 and attempt < 3:
            time.sleep(2 ** attempt)  # exponential backoff
            continue
        raise
```

---

## WebSocket connection management

- **Idle timeout:** connections close after prolonged inactivity — send **`ping`** well before that window.
- **Pronunciations:** use a [pronunciation dictionary](/api/api-guides-tutorials/text-to-speech/pronunciation-dictionary) for names and brands instead of phonetic spelling hacks.

---

## Key considerations

- For large numbers, use grouping that matches your locale (e.g. `10,000` or `5,00,000`) so preprocessing reads them correctly.
- v4 Flash does **not** support SSML — use `pace`, `pitch`, `loudness`, and sentence-boundary chunking for rhythm.
- Character limits apply per request/session (typically 2,500) — chunk at sentences.

---

## Migrating from Bulbul v3

v4 Flash uses the same endpoints, auth, and request/response shape as `bulbul:v3`. For most integrations, migrating means changing two fields and re-tuning a few prosody settings.

### What changes

|                      | `bulbul:v3`                                 | `bulbul:v4-flash`                                      | Action                                                                  |
| -------------------- | ------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `model`              | `bulbul:v3` (also the default when omitted) | `bulbul:v4-flash`                                      | **Set explicitly.** Omitting `model` still routes to v3.                |
| `speaker`            | Short names: `shubh`, `priya`, `ritu`       | Persona IDs: `ritu_hi_customer`                        | **Required change.** v4 Flash rejects v3 short names with **400**.      |
| Default speaker      | `shubh`                                     | `shubh_enhi_ads`                                       | Always pass `speaker` so the voice doesn't change without you noticing. |
| `temperature`        | 0.01–1.0, default 0.6                       | Silently ignored                                       | Remove it. Use `pace`, `pitch`, and the persona **style** instead.      |
| `pitch` / `loudness` | Accepted                                    | Accepted (-0.5–0.5 / 0.1–2.5)                          | Optional. Start at `0.0` / `1.0`.                                       |
| Languages            | All 11, including Malayalam and Odia        | All 11 codes accepted, but no `ml` / `od` personas yet | Keep Malayalam and Odia traffic on v3 for now.                          |
| WebSocket            | `?model=bulbul:v3`                          | `?model=bulbul:v4-flash`                               | `model` is a URL query parameter, not a `config` field.                 |

### What stays the same

- Endpoints: `POST /text-to-speech`, `POST /text-to-speech/stream`, and `wss://api.sarvam.ai/text-to-speech/ws`.
- Auth header (`api-subscription-key`), response shape (base64 `audios`), and WebSocket message sequence (`config` → `text` → `flush`).
- `pace` (0.5–2.0), `enable_preprocessing`, `dict_id` (pronunciation dictionaries), sample rates, codecs, and the 2,500-character limit.

### Before and after

#### Python

```python
# Before: Bulbul v3
audio = client.text_to_speech.convert(
    text="नमस्ते! आपका order 2 दिन में deliver हो जाएगा।",
    model="bulbul:v3",
    language_code="hi-IN",
    speaker="ritu",
    pace=1.0,
    temperature=0.6,
)

# After: Bulbul v4 Flash
audio = client.text_to_speech.convert(
    text="नमस्ते! आपका order 2 दिन में deliver हो जाएगा।",
    model="bulbul:v4-flash",
    language_code="hi-IN",
    speaker="ritu_hi_customer",
    pace=1.0,
)
```

#### WebSocket

```text
# Before
wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3
{"type": "config", "data": {"speaker": "ritu", "language_code": "hi-IN", "pace": 1.0}}

# After
wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4-flash
{"type": "config", "data": {"speaker": "ritu_hi_customer", "language_code": "hi-IN", "pace": 1.0}}
```

### Mapping v3 speakers to v4 personas

Every v3 voice exists in v4 Flash under one or more persona IDs. The table gives the closest **starting persona** for each one, matching the voice's v4 display name in [Speakers & voice](/conversations/build/voice-language#voice-name-changes-from-v3-to-v4). Voices with several personas (Shubh, Ritu, Simran, Ishita, Ratan) often have a style that fits your use case better. Browse them on [Voices](/api/api-guides-tutorials/text-to-speech/voices#bulbul-v4-flash-voices).

| v3 `speaker`                                                                      | Start with                                  | Other personas                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| `shubh`                                                                           | `shubh_enhi_ads`                            | `shubh_hi_customer`, `shubh_hi_ecomm`, `shubh_en_recovery`, …    |
| `ritu`                                                                            | `ritu_hi_customer`                          | `ritu_hi_sales`, `ritu_hi_banking`, `ritu_hi_customer_warm`, …   |
| `simran`                                                                          | `simran_enhi_customer`                      | `simran_en_customer`, `simran_en_sales`, `simran_hi_recovery`, … |
| `ishita`                                                                          | `ishita_enhi_customer`                      | `ishita_hi_banking`, `ishita_hi_edtech`, …                       |
| `priya`                                                                           | `priya_hi_recovery`                         | —                                                                |
| `rohan`                                                                           | `rohan_en_recovery`                         | —                                                                |
| `dev`                                                                             | `dev_en_recovery`                           | `dev_en_conversational`                                          |
| `sunny`                                                                           | `sunny_enhi_customer`                       | `sunny_en_social`, `sunny_hi_ads`, `sunny_hi_reels`              |
| `ratan`                                                                           | `ratan_hi_latenight`                        | `ratan_hi_customer_expressive`, `ratan_hi_documentary`, …        |
| `anand`                                                                           | `anand_hi_news`                             | `anand_hi_documentary`, `anand_pa_customer`, …                   |
| `roopa`                                                                           | `roopa_hi_narration`                        | `roopa_hi_companion`, `roopa_hi_recovery`, …                     |
| `varun`                                                                           | `varun_en_suspense`                         | `varun_en_ads`                                                   |
| `pooja`                                                                           | `pooja_gu_conversational`                   | `pooja_gu_customer`, `pooja_te_conversation`                     |
| `neha`                                                                            | `neha_en_customer`                          | `neha_en_latenight`, `neha_mr_narration`                         |
| `tarun`                                                                           | `tarun_hi_conversational`                   | `tarun_hi_sales`, `tarun_te_narration`                           |
| `aditya`                                                                          | `aditya_hi_conversational`                  | `aditya_hi_sales`                                                |
| `shreya`                                                                          | `shreya_hi_conversational`                  | `shreya_hi_news`                                                 |
| `mani`                                                                            | `mani_hi_conversational`                    | `mani_hi_devotional`                                             |
| `kavitha`                                                                         | `kavitha_te_narration`                      | `kavitha_te_conversation`                                        |
| `rahul`, `kavya`, `amit`, `manan`, `sumit`, `kabir`, `aayan`, `ashutosh`, `mohit` | `<name>_hi_conversational`                  | —                                                                |
| `shruti`                                                                          | `shruti_hi_edtech`                          | —                                                                |
| `suhani` / `rehan`                                                                | `suhani_hi_social` / `rehan_hi_social`      | —                                                                |
| `advait`                                                                          | `advait_hi_character`                       | —                                                                |
| `tanya`                                                                           | `tanya_hi_narration`                        | —                                                                |
| `gokul` / `vijay`                                                                 | `gokul_ta_narration` / `vijay_ta_narration` | —                                                                |
| `soham`                                                                           | `soham_mr_narration`                        | —                                                                |

> **Note**
>
> The same name doesn't guarantee an identical sound. v4 personas are re-recorded per style, so audition the new persona with your own production copy before you switch.

### Rollout checklist

1. **Find every call site.** Search for `bulbul:v3` and for calls that omit `model` (they default to v3).
2. **Swap `model` and `speaker`** using the table above. Remove `temperature`.
3. **Keep Malayalam (`ml-IN`) and Odia (`od-IN`) on v3** until v4 personas ship for them.
4. **Re-check your text.** v4 Flash is stricter about script: write Indic words in native script and English in Latin script (see [Writing text for natural speech](#writing-text-for-natural-speech)).
5. **A/B on real traffic.** Route a slice of requests to v4 Flash, then compare time-to-first-audio, listener feedback, and pronunciation of names and numbers.
6. **Keep v3 as a fallback.** Both models share the same request shape, so rolling back means changing `model` and `speaker` again.

---

## Quick reference

|                                  |                                                               |
| -------------------------------- | ------------------------------------------------------------- |
| **Model**                        | `bulbul:v4-flash`                                             |
| **Streaming**                    | `POST /text-to-speech/stream`                                 |
| **REST**                         | `POST /text-to-speech`                                        |
| **WebSocket**                    | `wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4-flash` |
| **Auth**                         | `api-subscription-key`                                        |
| **Default speaker (if omitted)** | `shubh_enhi_ads`                                              |
| **Pace / pitch / loudness**      | `1.0` / `0.0` / `1.0`                                         |
| **Preprocessing**                | `enable_preprocessing: true` recommended                      |

Need **`bulbul:v3`** short-name speakers or **temperature** tuning? See [Bulbul v3 best practices](/api/api-guides-tutorials/text-to-speech/bulbul-v3-best-practices).

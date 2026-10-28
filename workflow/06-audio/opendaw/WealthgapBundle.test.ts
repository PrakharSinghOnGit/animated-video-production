/**
 * Builds a WealthGap openDAW project bundle (.odb) from a spec file. NOT run by the repo's own tests: `bun run daw:setup`
 * copies it into the openDAW clone (packages/studio/scripting/src/test/) and `bun run daw` runs it there with vitest,
 * because openDAW's scripting fixture (createFixture) is what creates a valid project outside the browser.
 *
 *   WG_SPEC=<spec.json> npx vitest run src/test/WealthgapBundle.test.ts
 *
 * spec.json: { name, bpm, out, units: [{ label, hue?, lanes: [[{ file, name, t, gainDb, mute? }]] }] }
 *   - one Tape instrument unit per entry in `units`, lane i -> audio track i (regions on one track must not overlap)
 *   - identical files (same path) share one sample in the bundle
 *
 * Two openDAW quirks this works around (both found by loading a bundle in the real studio):
 *   1. every samples/<uuid>/ folder needs a peaks.bin (empty is fine, openDAW regenerates the waveform)
 *   2. audio.wav must be 32-bit float with the canonical 44-byte header: openDAW reads the data through a Float32Array,
 *      so the data must start at a multiple of 4 (ffmpeg's float header puts it at byte 58: "Sample not found").
 */
import {describe, it, expect} from "vitest"
import {readFileSync, writeFileSync} from "fs"
import {execFileSync} from "child_process"
import {createFixture} from "./Fixture"
import {AudioData, PPQN} from "@opendaw/lib-dsp"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {UUID} from "@opendaw/lib-std"
import JSZip from "jszip"

interface Region {file: string, name: string, t: number, gainDb?: number, mute?: boolean}
interface Unit {label: string, hue?: number, lanes: Region[][]}
interface Spec {name: string, bpm: number, out: string, units: Unit[]}

const SR = 48000

/** The canonical-header f32 WAV for a file: used as is when it already is one, else converted through ffmpeg. */
const canonicalWav = (path: string): {buf: Buffer, ch: number, duration: number} => {
    const head = readFileSync(path).subarray(0, 44)
    const isCanonical = head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 12, 16) === "fmt "
        && head.readUInt32LE(16) === 16 && head.readUInt16LE(20) === 3 && head.readUInt16LE(34) === 32
        && head.toString("ascii", 36, 40) === "data" && head.readUInt32LE(24) === SR
    if (isCanonical) {
        const buf = readFileSync(path)
        const ch = buf.readUInt16LE(22)
        return {buf, ch, duration: buf.readUInt32LE(40) / (SR * ch * 4)}
    }
    const ch = Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "csv=p=0", path]).toString())
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-ar", String(SR), "-f", "f32le", "-"], {maxBuffer: 1 << 30})
    const h = Buffer.alloc(44)
    h.write("RIFF", 0); h.writeUInt32LE(36 + raw.length, 4); h.write("WAVE", 8); h.write("fmt ", 12)
    h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(ch, 22); h.writeUInt32LE(SR, 24)
    h.writeUInt32LE(SR * ch * 4, 28); h.writeUInt16LE(ch * 4, 32); h.writeUInt16LE(32, 34); h.write("data", 36); h.writeUInt32LE(raw.length, 40)
    return {buf: Buffer.concat([h, raw]), ch, duration: raw.length / (SR * ch * 4)}
}

describe("wealthgap bundle", () => {
    it("builds the .odb", async () => {
        const spec: Spec = JSON.parse(readFileSync(process.env.WG_SPEC!, "utf8"))
        const {host, project} = createFixture()
        const zip = new JSZip()
        const samples = new Map<string, any>()
        const sampleFor = async (file: string, name: string) => {
            const known = samples.get(file)
            if (known) return known
            const {buf, duration} = canonicalWav(file)
            const s = await host.addSample(AudioData.create(SR, 1, 1), name)
            ;(s as any).duration = duration
            zip.file(`samples/${s.uuid}/audio.wav`, buf)
            zip.file(`samples/${s.uuid}/peaks.bin`, new Uint8Array(0))
            zip.file(`samples/${s.uuid}/meta.json`, JSON.stringify({name, bpm: 0, duration, sample_rate: SR, origin: "import"}))
            samples.set(file, s)
            return s
        }
        const ppqnPerSecond = (spec.bpm / 60) * PPQN.Quarter
        let regionCount = 0
        for (const unit of spec.units) {
            const u = project.addInstrumentUnit("Tape", {label: unit.label})
            for (let i = 0; i < unit.lanes.length; i++) {
                while (u.audioTracks.length <= i) u.addAudioTrack()
                for (const r of unit.lanes[i]) {
                    const s = await sampleFor(r.file, r.name)
                    const region = u.audioTracks[i].addRegion(s, {position: Math.round(r.t * ppqnPerSecond), playback: "no-sync", label: r.name, ...(unit.hue !== undefined ? {hue: unit.hue} : {})} as any)
                    if (r.gainDb !== undefined && r.gainDb !== 0) region.gain = r.gainDb
                    if (r.mute) (region as any).mute = true
                    regionCount++
                }
            }
        }
        ;(project as any).openInStudio()
        const od = ProjectSkeleton.encode(host.current!.graph) as ArrayBuffer
        zip.file("version", "1")
        zip.file("uuid", UUID.generate() as any, {binary: true})
        zip.file("project.od", od as ArrayBuffer, {binary: true})
        zip.file("meta.json", JSON.stringify({name: spec.name}))
        const out = await zip.generateAsync({type: "nodebuffer", compression: "STORE"})
        writeFileSync(spec.out, out)
        // read it back
        const sk = ProjectSkeleton.decode(od as ArrayBuffer)
        const regions = sk.boxGraph.boxes().filter(b => b.name === "AudioRegionBox")
        console.log(`WG_RESULT ${JSON.stringify({regions: regions.length, samples: samples.size, bytes: out.length})}`)
        expect(regions.length).toBe(regionCount)
    }, 600000)
})

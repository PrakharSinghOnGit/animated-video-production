/**
 * Reads a built .odb back the way openDAW does and checks it. Copied into the openDAW clone by `bun run daw:setup`
 * and run by `bun run daw` after every build:
 *   WG_ODB=<project.odb> WG_EXPECT_REGIONS=<n> npx vitest run src/test/WealthgapVerify.test.ts
 * Checks: region count, every AudioFileBox has samples/<uuid>/{audio.wav,peaks.bin,meta.json}, every audio.wav decodes with
 * WavFile.decodeFloats at the duration its meta.json states, and the 44-byte-header / 4-byte-alignment rule.
 */
import {describe, it, expect} from "vitest"
import {readFileSync} from "fs"
import {WavFile} from "@opendaw/lib-dsp"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {UUID} from "@opendaw/lib-std"
import JSZip from "jszip"

describe("wealthgap bundle verify", () => {
    it("decodes the .odb", async () => {
        const zip = await JSZip.loadAsync(readFileSync(process.env.WG_ODB!))
        const od = await zip.file("project.od")!.async("arraybuffer")
        const sk = ProjectSkeleton.decode(od)
        const boxes = sk.boxGraph.boxes()
        const regions = boxes.filter(b => b.name === "AudioRegionBox")
        const files = boxes.filter(b => b.name === "AudioFileBox")
        const units = boxes.filter(b => b.name === "AudioUnitBox")
        let decoded = 0, seconds = 0
        for (const file of files) {
            const folder = `samples/${UUID.toString(file.address.uuid)}`
            for (const name of ["audio.wav", "peaks.bin", "meta.json"]) {
                expect(zip.file(`${folder}/${name}`), `${folder}/${name} missing`).not.toBeNull()
            }
            const wav = await zip.file(`${folder}/audio.wav`)!.async("arraybuffer")
            expect(new DataView(wav).getUint32(36, false)).toBe(0x64617461) // "data" at offset 36: canonical 44-byte header
            const audio = WavFile.decodeFloats(wav)
            const meta = JSON.parse(await zip.file(`${folder}/meta.json`)!.async("string"))
            expect(Math.abs(audio.numberOfFrames / audio.sampleRate - meta.duration)).toBeLessThan(0.01)
            decoded++
            seconds += meta.duration
        }
        console.log(`WG_VERIFY ${JSON.stringify({regions: regions.length, fileBoxes: files.length, units: units.length, decoded, seconds: Math.round(seconds)})}`)
        expect(regions.length).toBe(Number(process.env.WG_EXPECT_REGIONS))
        expect(decoded).toBe(files.length)
    }, 600000)
})

// Reads the text in small images with the macOS text recogniser (Vision). Used by phone.ts (the phone-size check).
// Usage: wg-ocr <image>...   One JSON line per image, in order: {"words":[{"t": text, "c": confidence 0..1, "h": height / image height}]}
import Foundation
import Vision
import AppKit

for p in CommandLine.arguments.dropFirst() {
  var words: [[String: Any]] = []
  if let img = NSImage(contentsOfFile: p), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) {
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false   // read what is there, do not guess words
    req.minimumTextHeight = 0.02
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    for o in (req.results ?? []) {
      if let c = o.topCandidates(1).first { words.append(["t": c.string, "c": c.confidence, "h": o.boundingBox.height]) }
    }
  }
  let d = try! JSONSerialization.data(withJSONObject: ["words": words])
  print(String(data: d, encoding: .utf8)!)
}
